/**
 * Capa de acceso a DynamoDB (tabla única `wishy`).
 *
 * No contiene reglas de negocio: ejecuta los planes que devuelven las
 * funciones puras de src/domain. Las ConditionExpression de las
 * transacciones son la garantía de atomicidad de las reservas.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID, randomBytes } from 'node:crypto';
import type { ClaimTransition, ReservePlan } from '../domain/claims.js';
import type {
  Claim,
  Comment,
  GuestIdentity,
  Item,
  List,
  Notification,
} from '../domain/types.js';
import { gsi, keys } from './keys.js';

const TABLE = process.env.WISHY_TABLE ?? 'wishy';

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export class ConflictError extends Error {}

function isConditionFailure(err: unknown): boolean {
  const name = (err as { name?: string }).name;
  return name === 'TransactionCanceledException' || name === 'ConditionalCheckFailedException';
}

// ---------- users & lists ----------

export async function ensureUserAndList(sub: string, nombre: string, email?: string, avatarUrl?: string): Promise<List> {
  const now = new Date().toISOString();
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { ...keys.user(sub), entity: 'user', sub, nombre, email, avatarUrl, createdAt: now },
    }),
  );
  const existing = await getListByOwner(sub);
  if (existing) return existing;
  const list: List = {
    listId: randomUUID(),
    ownerId: sub,
    shareToken: randomBytes(9).toString('base64url'),
    createdAt: now,
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        ...keys.list(list.listId),
        ...gsi.listByToken(list.shareToken),
        ...gsi.listByOwner(sub),
        entity: 'list',
        ...list,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
  return list;
}

export async function getUserNombre(sub: string): Promise<string | null> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: keys.user(sub) }));
  return (r.Item?.nombre as string | undefined) ?? null;
}

export async function getListByOwner(ownerId: string): Promise<List | null> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: { ':pk': `OWNER#${ownerId}` },
      Limit: 1,
    }),
  );
  return (r.Items?.[0] as List | undefined) ?? null;
}

export async function getListByToken(shareToken: string): Promise<List | null> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': `TOKEN#${shareToken}` },
      Limit: 1,
    }),
  );
  return (r.Items?.[0] as List | undefined) ?? null;
}

// ---------- items ----------

export async function putItem(item: Item): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { ...keys.item(item.listId, item.itemId), entity: 'item', ...item },
    }),
  );
}

export async function getItem(listId: string, itemId: string): Promise<Item | null> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: keys.item(listId, itemId) }));
  return (r.Item as Item | undefined) ?? null;
}

export async function getItems(listId: string): Promise<Item[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `LIST#${listId}`, ':sk': 'ITEM#' },
    }),
  );
  return (r.Items ?? []) as Item[];
}

export async function deleteItem(listId: string, itemId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: keys.item(listId, itemId) }));
}

// ---------- claims ----------

export async function getClaims(itemId: string): Promise<Claim[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `ITEM#${itemId}`, ':sk': 'CLAIM#' },
    }),
  );
  return (r.Items ?? []) as Claim[];
}

export async function getClaim(itemId: string, claimId: string): Promise<Claim | null> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: keys.claim(itemId, claimId) }));
  return (r.Item as Claim | undefined) ?? null;
}

export async function getClaimsByClaimer(claimerKey: string): Promise<Claim[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': `CLAIMER#${claimerKey}` },
    }),
  );
  return (r.Items ?? []) as Claim[];
}

/** Reserva atómica: incrementa claimCount con condición + Put del claim. */
export async function executeReserve(item: Item, plan: ReservePlan): Promise<void> {
  const cond =
    plan.itemCondition === 'cupo_y_activo'
      ? 'claimCount < cantidad AND estadoDueno = :activo'
      : 'estadoDueno = :activo';
  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE,
              Key: keys.item(item.listId, item.itemId),
              UpdateExpression: 'ADD claimCount :one',
              ConditionExpression: cond,
              ExpressionAttributeValues: { ':one': 1, ':activo': 'activo' },
            },
          },
          {
            Put: {
              TableName: TABLE,
              Item: {
                ...keys.claim(plan.claim.itemId, plan.claim.claimId),
                ...gsi.claimByClaimer(plan.claim.claimerKey, plan.claim.claimId),
                entity: 'claim',
                ...plan.claim,
              },
            },
          },
        ],
      }),
    );
  } catch (err) {
    if (isConditionFailure(err)) throw new ConflictError('recién lo reservó otra persona');
    throw err;
  }
}

/** Comprar o liberar. Liberar devuelve el cupo del contador. */
export async function executeClaimTransition(listId: string, plan: ClaimTransition): Promise<void> {
  const now = new Date().toISOString();
  const claimUpdate = {
    Update: {
      TableName: TABLE,
      Key: keys.claim(plan.itemId, plan.claimId),
      UpdateExpression:
        'SET estado = :nuevo, updatedAt = :now' +
        (plan.notaQueCompre !== undefined ? ', notaQueCompre = :nota' : '') +
        ' REMOVE expiresAt',
      ConditionExpression: 'estado = :reservado',
      ExpressionAttributeValues: {
        ':nuevo': plan.nuevoEstado,
        ':now': now,
        ':reservado': 'reservado',
        ...(plan.notaQueCompre !== undefined ? { ':nota': plan.notaQueCompre } : {}),
      },
    },
  };
  try {
    if (!plan.decrementaContador) {
      await ddb.send(new TransactWriteCommand({ TransactItems: [claimUpdate] }));
      return;
    }
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          claimUpdate,
          {
            Update: {
              TableName: TABLE,
              Key: keys.item(listId, plan.itemId),
              UpdateExpression: 'ADD claimCount :minus',
              ConditionExpression: 'claimCount > :zero',
              ExpressionAttributeValues: { ':minus': -1, ':zero': 0 },
            },
          },
        ],
      }),
    );
  } catch (err) {
    if (isConditionFailure(err)) throw new ConflictError('la reserva ya no está activa');
    throw err;
  }
}

/**
 * Expiración lazy e idempotente: cada claim vencido se marca `expirado` y
 * devuelve su cupo. Si otra lectura concurrente ya lo expiró, la condición
 * falla y se ignora (no se descuenta dos veces).
 */
export async function expireClaims(listId: string, vencidos: Claim[]): Promise<void> {
  const now = new Date().toISOString();
  for (const c of vencidos) {
    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: TABLE,
                Key: keys.claim(c.itemId, c.claimId),
                UpdateExpression: 'SET estado = :exp, updatedAt = :now',
                ConditionExpression: 'estado = :reservado',
                ExpressionAttributeValues: { ':exp': 'expirado', ':now': now, ':reservado': 'reservado' },
              },
            },
            {
              Update: {
                TableName: TABLE,
                Key: keys.item(listId, c.itemId),
                UpdateExpression: 'ADD claimCount :minus',
                ConditionExpression: 'claimCount > :zero',
                ExpressionAttributeValues: { ':minus': -1, ':zero': 0 },
              },
            },
          ],
        }),
      );
    } catch (err) {
      if (!isConditionFailure(err)) throw err;
    }
  }
}

// ---------- comments ----------

export async function putComment(comment: Comment): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        ...keys.comment(comment.itemId, comment.createdAt, comment.commentId),
        entity: 'comment',
        ...comment,
      },
    }),
  );
}

export async function getComments(itemId: string): Promise<Comment[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `ITEM#${itemId}`, ':sk': 'COMMENT#' },
    }),
  );
  return (r.Items ?? []) as Comment[];
}

// ---------- notifications ----------

export async function putNotifications(notifs: Notification[]): Promise<void> {
  for (const n of notifs) {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: { ...keys.notification(n.recipientKey, n.createdAt, n.notifId), entity: 'notification', ...n },
      }),
    );
  }
}

export async function getNotifications(recipientKey: string): Promise<Notification[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `RECIP#${recipientKey}` },
      ScanIndexForward: false,
      Limit: 50,
    }),
  );
  return (r.Items ?? []) as Notification[];
}

export async function markNotificationsRead(recipientKey: string, sks: string[]): Promise<void> {
  for (const sk of sks) {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: `RECIP#${recipientKey}`, SK: sk },
        UpdateExpression: 'SET leida = :t',
        ExpressionAttributeValues: { ':t': true },
      }),
    );
  }
}

// ---------- guests ----------

export async function createGuest(nombre: string, email?: string): Promise<GuestIdentity> {
  const guest: GuestIdentity = {
    guestId: randomUUID(),
    secret: randomBytes(24).toString('base64url'),
    nombre,
    email: email?.trim().toLowerCase() || undefined,
    createdAt: new Date().toISOString(),
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        ...keys.guest(guest.guestId),
        ...(guest.email ? gsi.guestByEmail(guest.email) : {}),
        entity: 'guest',
        ...guest,
      },
    }),
  );
  return guest;
}

export async function getGuest(guestId: string): Promise<GuestIdentity | null> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: keys.guest(guestId) }));
  return (r.Item as GuestIdentity | undefined) ?? null;
}

export async function findGuestByEmail(email: string): Promise<GuestIdentity | null> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': `GEMAIL#${email.trim().toLowerCase()}` },
      Limit: 1,
    }),
  );
  return (r.Items?.[0] as GuestIdentity | undefined) ?? null;
}

/**
 * Herencia guest → usuario: reasigna claims (y su GSI de claimer) al nuevo
 * user y marca la identidad como promovida.
 */
export async function promoteGuest(guest: GuestIdentity, userSub: string): Promise<void> {
  const claims = await getClaimsByClaimer(`guest#${guest.guestId}`);
  for (const c of claims) {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: keys.claim(c.itemId, c.claimId),
        UpdateExpression: 'SET claimerKey = :ck, GSI1PK = :gpk',
        ExpressionAttributeValues: {
          ':ck': `user#${userSub}`,
          ':gpk': `CLAIMER#user#${userSub}`,
        },
      }),
    );
  }
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: keys.guest(guest.guestId),
      UpdateExpression: 'SET promotedToUserId = :u',
      ExpressionAttributeValues: { ':u': userSub },
    }),
  );
}
