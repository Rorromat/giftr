/**
 * Reglas de negocio de reservas como funciones puras.
 *
 * Cada función devuelve un "plan": qué escribir y bajo qué condiciones
 * atómicas. La capa de store ejecuta los planes con TransactWriteItems;
 * las ConditionExpression del plan son la garantía real de atomicidad
 * (el equivalente DynamoDB del SELECT ... FOR UPDATE del diseño anterior).
 */
import {
  Claim,
  Item,
  Notification,
  RESERVA_DIAS,
  Viewer,
  claimVencido,
  viewerKey,
} from './types.js';

export type BusinessError =
  | 'auto_regalo_prohibido'
  | 'item_no_disponible'
  | 'item_archivado'
  | 'claim_ajeno'
  | 'claim_no_activo'
  | 'identidad_requerida';

export type Plan<T> = { ok: true; value: T } | { ok: false; error: BusinessError };

export interface ReservePlan {
  claim: Claim;
  /**
   * Condición sobre el item al incrementar claimCount. Para items no
   * repetibles exige cupo; el que llega segundo falla la transacción y
   * recibe "recién lo reservó otra persona".
   */
  itemCondition: 'cupo_y_activo' | 'solo_activo';
}

export function planReserve(
  item: Item,
  viewer: Viewer | null,
  now: Date,
  claimId: string,
): Plan<ReservePlan> {
  if (!viewer) return { ok: false, error: 'identidad_requerida' };
  if (viewer.kind === 'user' && viewer.id === item.ownerId) {
    return { ok: false, error: 'auto_regalo_prohibido' };
  }
  if (item.estadoDueno !== 'activo') return { ok: false, error: 'item_archivado' };
  // Chequeo optimista con el contador local; la garantía es la condición.
  if (!item.repetible && item.claimCount >= item.cantidad) {
    return { ok: false, error: 'item_no_disponible' };
  }
  const expiresAt = new Date(now.getTime() + RESERVA_DIAS * 86_400_000).toISOString();
  return {
    ok: true,
    value: {
      claim: {
        claimId,
        itemId: item.itemId,
        listId: item.listId,
        claimerKey: viewerKey(viewer),
        claimerNombre: viewer.nombre ?? 'Alguien',
        estado: 'reservado',
        expiresAt,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      itemCondition: item.repetible ? 'solo_activo' : 'cupo_y_activo',
    },
  };
}

export interface ClaimTransition {
  claimId: string;
  itemId: string;
  nuevoEstado: 'comprado' | 'liberado';
  /** liberar devuelve el cupo; comprar lo mantiene ocupado */
  decrementaContador: boolean;
  notaQueCompre?: string;
}

function transicion(
  claim: Claim,
  viewer: Viewer | null,
  now: Date,
  nuevoEstado: 'comprado' | 'liberado',
  notaQueCompre?: string,
): Plan<ClaimTransition> {
  if (!viewer) return { ok: false, error: 'identidad_requerida' };
  if (claim.claimerKey !== viewerKey(viewer)) return { ok: false, error: 'claim_ajeno' };
  if (claim.estado !== 'reservado' || claimVencido(claim, now)) {
    return { ok: false, error: 'claim_no_activo' };
  }
  return {
    ok: true,
    value: {
      claimId: claim.claimId,
      itemId: claim.itemId,
      nuevoEstado,
      decrementaContador: nuevoEstado === 'liberado',
      notaQueCompre,
    },
  };
}

export function planPurchase(
  claim: Claim,
  viewer: Viewer | null,
  now: Date,
  notaQueCompre?: string,
): Plan<ClaimTransition> {
  return transicion(claim, viewer, now, 'comprado', notaQueCompre);
}

export function planRelease(claim: Claim, viewer: Viewer | null, now: Date): Plan<ClaimTransition> {
  return transicion(claim, viewer, now, 'liberado');
}

/**
 * Expiración lazy: toda lectura de claims pasa por acá y devuelve cuáles
 * marcar `expirado`. La escritura es idempotente por condición
 * (claim aún `reservado`, claimCount > 0), así lecturas concurrentes no
 * descuentan dos veces.
 */
export function findExpired(claims: Claim[], now: Date): Claim[] {
  return claims.filter((c) => claimVencido(c, now));
}

/** Aplica la expiración en memoria para servir la lectura actual sin releer. */
export function applyExpiration(claims: Claim[], now: Date): Claim[] {
  return claims.map((c) =>
    claimVencido(c, now) ? { ...c, estado: 'expirado' as const, updatedAt: now.toISOString() } : c,
  );
}

/**
 * Notificaciones a regaladores afectados cuando el dueño edita o archiva
 * un item con claims activos. Al dueño no se le dice nada, nunca.
 */
export function planClaimerNotifications(
  item: Item,
  claims: Claim[],
  tipo: 'item_editado' | 'item_archivado',
  now: Date,
  notifId: (claimerKey: string) => string,
): Notification[] {
  const afectados = new Set(
    claims
      .filter((c) => (c.estado === 'reservado' && !claimVencido(c, now)) || c.estado === 'comprado')
      .map((c) => c.claimerKey),
  );
  return [...afectados].map((recipientKey) => ({
    notifId: notifId(recipientKey),
    recipientKey,
    tipo,
    itemId: item.itemId,
    itemTitulo: item.titulo,
    leida: false,
    createdAt: now.toISOString(),
  }));
}
