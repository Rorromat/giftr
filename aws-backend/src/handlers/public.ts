/**
 * Rutas públicas: acceso por link compartido (/l/{token}) e identidades guest.
 *
 * La regla de la sorpresa se aplica acá por identidad, no por URL: si el JWT
 * corresponde al dueño de la lista, recibe la vista dueño; los endpoints de
 * detalle/claims/comments le devuelven 404 (un 403 ya sería una señal).
 */
import { randomUUID } from 'node:crypto';
import {
  applyExpiration,
  findExpired,
  planPurchase,
  planRelease,
  planReserve,
} from '../domain/claims.js';
import { esDueno, serializeForGiver, serializeForOwner } from '../domain/serialize.js';
import type { Comment, Item, List, Viewer } from '../domain/types.js';
import {
  ApiEvent,
  ApiResult,
  badRequest,
  conflict,
  json,
  notFound,
  parseBody,
  resolveViewer,
  unauthorized,
} from '../http/http.js';
import * as db from '../store/dynamo.js';

export async function handler(event: ApiEvent): Promise<ApiResult> {
  switch (event.routeKey) {
    case 'POST /guests': {
      const input = parseBody<{ nombre?: string; email?: string }>(event);
      if (!input?.nombre?.trim()) return badRequest('nombre_requerido');
      const guest = await db.createGuest(input.nombre.trim(), input.email);
      return json(201, { guestId: guest.guestId, secret: guest.secret, nombre: guest.nombre });
    }

    case 'GET /guests/me/notifications': {
      const viewer = await resolveViewer(event);
      if (!viewer || viewer.kind !== 'guest') return unauthorized();
      const notifs = await db.getNotifications(`guest#${viewer.id}`);
      return json(200, { notifications: notifs });
    }
  }

  // Todo lo demás vive bajo /l/{token}
  const token = event.pathParameters?.token;
  if (!token) return notFound();
  const list = await db.getListByToken(token);
  if (!list) return notFound();
  const viewer = await resolveViewer(event);
  const now = new Date();

  switch (event.routeKey) {
    case 'GET /l/{token}': {
      const items = await db.getItems(list.listId);
      if (esDueno({ ownerId: list.ownerId }, viewer)) {
        // El dueño abrió su propio link: vista dueño, ciega y sin señales.
        return json(200, {
          vista: 'dueno',
          listId: list.listId,
          items: items.map(serializeForOwner),
        });
      }
      const ownerNombre = (await db.getUserNombre(list.ownerId)) ?? 'el dueño de la lista';
      const serialized = await Promise.all(
        items.map(async (item) => {
          const claims = await lazyExpire(item, now);
          return serializeForGiver(item, claims, [], viewer, now);
        }),
      );
      return json(200, { vista: 'regalador', ownerNombre, items: serialized });
    }

    case 'GET /l/{token}/items/{itemId}': {
      const item = await loadItem(list, event);
      if (!item) return notFound();
      if (esDueno(item, viewer)) return notFound(); // el dueño no tiene detalle regalador
      const claims = await lazyExpire(item, now);
      const comments = await db.getComments(item.itemId);
      const ownerNombre = (await db.getUserNombre(list.ownerId)) ?? 'el dueño de la lista';
      return json(200, { ownerNombre, item: serializeForGiver(item, claims, comments, viewer, now) });
    }

    case 'POST /l/{token}/items/{itemId}/claims': {
      let item = await loadItem(list, event);
      if (!item) return notFound();
      if (esDueno(item, viewer)) return notFound();
      // Expirar reservas vencidas primero para que el cupo se libere.
      await lazyExpire(item, now);
      item = (await loadItem(list, event))!;
      const plan = planReserve(item, viewer, now, randomUUID());
      if (!plan.ok) return planError(plan.error);
      try {
        await db.executeReserve(item, plan.value);
      } catch (err) {
        if (err instanceof db.ConflictError) return conflict('recien_lo_reservo_otra_persona');
        throw err;
      }
      return json(201, { claimId: plan.value.claim.claimId, expiresAt: plan.value.claim.expiresAt });
    }

    case 'POST /l/{token}/items/{itemId}/claims/{claimId}/purchase':
    case 'POST /l/{token}/items/{itemId}/claims/{claimId}/release': {
      const item = await loadItem(list, event);
      const claimId = event.pathParameters?.claimId;
      if (!item || !claimId) return notFound();
      if (esDueno(item, viewer)) return notFound();
      const claim = await db.getClaim(item.itemId, claimId);
      if (!claim) return notFound();
      const esCompra = event.routeKey.endsWith('/purchase');
      const input = parseBody<{ notaQueCompre?: string }>(event);
      const plan = esCompra
        ? planPurchase(claim, viewer, now, input?.notaQueCompre)
        : planRelease(claim, viewer, now);
      if (!plan.ok) return planError(plan.error);
      try {
        await db.executeClaimTransition(list.listId, plan.value);
      } catch (err) {
        if (err instanceof db.ConflictError) return conflict('reserva_no_activa');
        throw err;
      }
      return json(200, { ok: true });
    }

    case 'POST /l/{token}/items/{itemId}/comments': {
      const item = await loadItem(list, event);
      if (!item) return notFound();
      if (esDueno(item, viewer)) return notFound(); // capa oculta: el dueño no entra ni por URL directa
      if (!viewer) return unauthorized();
      const input = parseBody<{ texto?: string }>(event);
      if (!input?.texto?.trim()) return badRequest('texto_requerido');
      const comment: Comment = {
        commentId: randomUUID(),
        itemId: item.itemId,
        authorKey: `${viewer.kind}#${viewer.id}`,
        authorNombre: viewer.nombre ?? 'Alguien',
        texto: input.texto.trim(),
        createdAt: now.toISOString(),
      };
      await db.putComment(comment);
      return json(201, { commentId: comment.commentId });
    }

    default:
      return notFound();
  }
}

async function loadItem(list: List, event: ApiEvent): Promise<Item | null> {
  const itemId = event.pathParameters?.itemId;
  if (!itemId) return null;
  return db.getItem(list.listId, itemId);
}

/** Expiración lazy: marca vencidos en la tabla y devuelve los claims al día. */
async function lazyExpire(item: Item, now: Date) {
  const claims = await db.getClaims(item.itemId);
  const vencidos = findExpired(claims, now);
  if (vencidos.length > 0) await db.expireClaims(item.listId, vencidos);
  return applyExpiration(claims, now);
}

function planError(error: string): ApiResult {
  switch (error) {
    case 'auto_regalo_prohibido':
      return notFound(); // al dueño ni siquiera se le confirma que había algo que reservar
    case 'identidad_requerida':
      return unauthorized();
    case 'item_no_disponible':
    case 'claim_no_activo':
      return conflict(error);
    default:
      return badRequest(error);
  }
}
