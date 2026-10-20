import { and, count, eq, inArray, lt, notInArray, sql } from 'drizzle-orm'
import { claims, groupGifts, items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { esDuenoDeLista } from '@/lib/groups'

export async function expireStaleClaims(db: Db, itemId?: string) {
  const vencida = and(eq(claims.estado, 'reservado'), lt(claims.expiresAt, new Date()))
  await db.update(claims)
    .set({ estado: 'expirado', updatedAt: new Date() })
    .where(itemId ? and(vencida, eq(claims.itemId, itemId)) : vencida)
}

export const RESERVA_DIAS = 14

export type ReserveResult =
  | { ok: true; claimId: string }
  | { ok: false; reason: 'propio' | 'sin_stock' | 'archivado' | 'no_existe' | 'sin_identidad' }

// sinVencimiento: la reserva de un regalo grupal no vence (la maneja el encargado).
export async function reserveItem(db: Db, itemId: string, viewer: Viewer, opts: { sinVencimiento?: boolean } = {}): Promise<ReserveResult> {
  if (!viewer.userId && !viewer.guestId) return { ok: false, reason: 'sin_identidad' }
  return await db.transaction(async (tx): Promise<ReserveResult> => {
    // lock del item: serializa reservas concurrentes sobre el mismo item
    const [row] = await tx.select({ item: items, listId: lists.id })
      .from(items).innerJoin(lists, eq(items.listId, lists.id))
      .where(eq(items.id, itemId))
      .for('update', { of: items })
    if (!row) return { ok: false, reason: 'no_existe' }
    // Ningún dueño (tampoco un co-dueño del grupo) reserva en su propia lista.
    if (viewer.userId && await esDuenoDeLista(tx as unknown as Db, row.listId, viewer.userId)) return { ok: false, reason: 'propio' }
    if (row.item.estadoDueno !== 'activo') return { ok: false, reason: 'archivado' }

    await expireStaleClaims(tx as unknown as Db, itemId)

    if (!row.item.repetible) {
      const [{ n }] = await tx.select({ n: count() }).from(claims)
        .where(and(eq(claims.itemId, itemId), inArray(claims.estado, ['reservado', 'comprado'])))
      if (n >= row.item.cantidad) return { ok: false, reason: 'sin_stock' }
    }

    const [claim] = await tx.insert(claims).values({
      itemId,
      claimerUserId: viewer.userId ?? null,
      claimerGuestId: viewer.guestId ?? null,
      expiresAt: opts.sinVencimiento ? null : new Date(Date.now() + RESERVA_DIAS * 86400_000),
    }).returning()
    return { ok: true, claimId: claim.id }
  })
}

// La reserva de un regalo grupal se compra o se cancela desde el regalo, no como reserva suelta.
const noEsDeRegaloGrupal = () => notInArray(claims.id, sql`(select ${groupGifts.claimId} from ${groupGifts})`)

function claimEsDe(viewer: Viewer) {
  return viewer.userId
    ? eq(claims.claimerUserId, viewer.userId)
    : viewer.guestId
      ? eq(claims.claimerGuestId, viewer.guestId)
      : sql`false`
}

export async function markBought(db: Db, claimId: string, viewer: Viewer, notaQueCompre?: string): Promise<boolean> {
  const updated = await db.update(claims)
    .set({ estado: 'comprado', notaQueCompre: notaQueCompre ?? null, updatedAt: new Date() })
    .where(and(eq(claims.id, claimId), eq(claims.estado, 'reservado'), claimEsDe(viewer), noEsDeRegaloGrupal()))
    .returning({ id: claims.id })
  return updated.length > 0
}

export async function releaseClaim(db: Db, claimId: string, viewer: Viewer): Promise<boolean> {
  const updated = await db.update(claims)
    .set({ estado: 'liberado', updatedAt: new Date() })
    .where(and(eq(claims.id, claimId), eq(claims.estado, 'reservado'), claimEsDe(viewer), noEsDeRegaloGrupal()))
    .returning({ id: claims.id })
  return updated.length > 0
}

export async function getMyClaimWarnings(db: Db, viewer: Viewer) {
  if (!viewer.userId && !viewer.guestId) return []
  await expireStaleClaims(db)
  const rows = await db.select({
    claimId: claims.id, itemTitulo: items.titulo,
    createdAt: claims.createdAt, expiresAt: claims.expiresAt,
  }).from(claims).innerJoin(items, eq(claims.itemId, items.id))
    .where(and(eq(claims.estado, 'reservado'), claimEsDe(viewer)))
  const ahora = Date.now()
  return rows
    .filter((r) => r.expiresAt && ahora > (r.createdAt.getTime() + r.expiresAt.getTime()) / 2)
    .map((r) => ({
      claimId: r.claimId,
      itemTitulo: r.itemTitulo,
      diasRestantes: Math.ceil((r.expiresAt!.getTime() - ahora) / 86400_000),
    }))
}
