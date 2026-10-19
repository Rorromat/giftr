/**
 * Rutas autenticadas /me/* — protegidas por el JWT authorizer de Cognito.
 * Toda respuesta con items pasa por la serialización allowlist del dueño:
 * acá no entran claims, comments ni contadores, por ningún camino.
 */
import { randomUUID } from 'node:crypto';
import { planClaimerNotifications } from '../domain/claims.js';
import { serializeForOwner } from '../domain/serialize.js';
import type { EstadoDueno, Item, ItemTipo, Prioridad } from '../domain/types.js';
import {
  ApiEvent,
  ApiResult,
  badRequest,
  json,
  jwtIdentity,
  notFound,
  parseBody,
  unauthorized,
} from '../http/http.js';
import * as db from '../store/dynamo.js';

interface ItemInput {
  tipo?: ItemTipo;
  titulo?: string;
  descripcion?: string;
  fotoUrl?: string;
  precio?: string;
  rangoPrecio?: string;
  categoria?: string;
  prioridad?: Prioridad;
  cantidad?: number;
  repetible?: boolean;
  linkTienda?: string;
}

const PRIORIDADES: Prioridad[] = ['mucho', 'gustaria', 'suelta'];

export async function handler(event: ApiEvent): Promise<ApiResult> {
  const identity = jwtIdentity(event);
  if (!identity) return unauthorized();
  const { sub } = identity;
  const itemId = event.pathParameters?.itemId;

  switch (event.routeKey) {
    case 'POST /me/bootstrap': {
      const list = await db.ensureUserAndList(sub, identity.nombre, identity.email);
      let promoted = false;
      if (identity.email && identity.emailVerified) {
        const guest = await db.findGuestByEmail(identity.email);
        if (guest && !guest.promotedToUserId) {
          await db.promoteGuest(guest, sub);
          promoted = true;
        }
      }
      return json(200, { listId: list.listId, shareToken: list.shareToken, promoted });
    }

    case 'GET /me/list': {
      const list = await db.getListByOwner(sub);
      if (!list) return notFound();
      const items = await db.getItems(list.listId);
      return json(200, {
        listId: list.listId,
        shareToken: list.shareToken,
        items: items.map(serializeForOwner),
      });
    }

    case 'POST /me/items': {
      const list = await db.getListByOwner(sub);
      if (!list) return notFound();
      const input = parseBody<ItemInput>(event);
      if (!input?.titulo?.trim()) return badRequest('titulo_requerido');
      const tipo: ItemTipo = input.tipo === 'idea' ? 'idea' : 'exacto';
      const now = new Date().toISOString();
      const item: Item = {
        itemId: randomUUID(),
        listId: list.listId,
        ownerId: sub,
        tipo,
        titulo: input.titulo.trim(),
        descripcion: input.descripcion,
        fotoUrl: input.fotoUrl,
        precio: input.precio,
        rangoPrecio: tipo === 'idea' ? input.rangoPrecio : undefined,
        categoria: input.categoria,
        prioridad: PRIORIDADES.includes(input.prioridad as Prioridad)
          ? (input.prioridad as Prioridad)
          : 'gustaria',
        cantidad: Math.max(1, Math.floor(input.cantidad ?? 1)),
        repetible: tipo === 'idea' && input.repetible === true,
        estadoDueno: 'activo',
        linkTienda: input.linkTienda,
        claimCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await db.putItem(item);
      return json(201, serializeForOwner(item));
    }

    case 'PATCH /me/items/{itemId}':
    case 'POST /me/items/{itemId}/status':
    case 'DELETE /me/items/{itemId}': {
      const list = await db.getListByOwner(sub);
      if (!list || !itemId) return notFound();
      const item = await db.getItem(list.listId, itemId);
      if (!item || item.ownerId !== sub) return notFound();
      const now = new Date();

      if (event.routeKey === 'DELETE /me/items/{itemId}') {
        await notifyClaimers(item, 'item_archivado', now);
        await db.deleteItem(list.listId, itemId);
        return json(200, { ok: true });
      }

      if (event.routeKey === 'POST /me/items/{itemId}/status') {
        const input = parseBody<{ estado?: EstadoDueno }>(event);
        if (input?.estado !== 'lo_tengo' && input?.estado !== 'no_lo_quiero') {
          return badRequest('estado_invalido');
        }
        const updated: Item = { ...item, estadoDueno: input.estado, updatedAt: now.toISOString() };
        await db.putItem(updated);
        await notifyClaimers(updated, 'item_archivado', now);
        return json(200, serializeForOwner(updated));
      }

      const input = parseBody<ItemInput>(event);
      if (!input) return badRequest('body_invalido');
      const updated: Item = {
        ...item,
        titulo: input.titulo?.trim() || item.titulo,
        descripcion: input.descripcion ?? item.descripcion,
        fotoUrl: input.fotoUrl ?? item.fotoUrl,
        precio: input.precio ?? item.precio,
        rangoPrecio: input.rangoPrecio ?? item.rangoPrecio,
        categoria: input.categoria ?? item.categoria,
        prioridad: PRIORIDADES.includes(input.prioridad as Prioridad)
          ? (input.prioridad as Prioridad)
          : item.prioridad,
        cantidad: input.cantidad ? Math.max(1, Math.floor(input.cantidad)) : item.cantidad,
        repetible: item.tipo === 'idea' ? input.repetible ?? item.repetible : false,
        linkTienda: input.linkTienda ?? item.linkTienda,
        updatedAt: now.toISOString(),
      };
      await db.putItem(updated);
      await notifyClaimers(updated, 'item_editado', now);
      return json(200, serializeForOwner(updated));
    }

    case 'GET /me/claims': {
      const claims = await db.getClaimsByClaimer(`user#${sub}`);
      const detallados = await Promise.all(
        claims.map(async (c) => {
          const item = await db.getItem(c.listId, c.itemId);
          return {
            claimId: c.claimId,
            itemId: c.itemId,
            itemTitulo: item?.titulo ?? '(item eliminado)',
            estado: c.estado,
            expiresAt: c.expiresAt,
            notaQueCompre: c.notaQueCompre,
          };
        }),
      );
      return json(200, { claims: detallados });
    }

    case 'GET /me/notifications': {
      const notifs = await db.getNotifications(`user#${sub}`);
      return json(200, { notifications: notifs });
    }

    case 'POST /me/notifications/read': {
      const input = parseBody<{ sks?: string[] }>(event);
      if (!Array.isArray(input?.sks)) return badRequest('sks_requerido');
      await db.markNotificationsRead(`user#${sub}`, input.sks.slice(0, 50));
      return json(200, { ok: true });
    }

    default:
      return notFound();
  }
}

async function notifyClaimers(item: Item, tipo: 'item_editado' | 'item_archivado', now: Date) {
  const claims = await db.getClaims(item.itemId);
  const notifs = planClaimerNotifications(item, claims, tipo, now, () => randomUUID());
  await db.putNotifications(notifs);
}
