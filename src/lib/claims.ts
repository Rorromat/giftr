import { and, asc, count, desc, eq, gt, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm'
import { claims, groupGifts, items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { abrirListaAInvitado, accesoALista, listasAjenasSql } from '@/lib/acceso'
import { esRepetible } from '@/lib/serialize'
import { esUuid } from '@/lib/groups'
import { eventoDeLista, hoyLocal, inicioDelDia } from '@/lib/events'

export async function expireStaleClaims(db: Db, itemId?: string) {
  const vencida = and(eq(claims.estado, 'reservado'), lt(claims.expiresAt, new Date()))
  await db.update(claims)
    .set({ estado: 'expirado', updatedAt: new Date() })
    .where(itemId ? and(vencida, eq(claims.itemId, itemId)) : vencida)
}

export const RESERVA_DIAS = 14
const DIA = 86400_000

/**
 * Hasta cuándo dura una reserva suelta: 14 días, o hasta 3 días antes del próximo evento de la lista (el cumple del dueño
 * o la fecha del grupo) si cae antes, así otro llega a comprarlo a tiempo. Nunca menos de 24 horas: el que reserva
 * tiene que poder ir a comprarlo.
 */
export async function vencimientoDeReserva(db: Db, listId: string, ahora = new Date()): Promise<Date> {
  const evento = await eventoDeLista(db, listId, hoyLocal(ahora))
  const antesDelEvento = evento ? inicioDelDia(evento.fecha).getTime() - 3 * DIA : Infinity
  return new Date(Math.max(ahora.getTime() + DIA, Math.min(ahora.getTime() + RESERVA_DIAS * DIA, antesDelEvento)))
}

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
    const t = tx as unknown as Db
    // Ningún dueño (tampoco un co-dueño del grupo, ni uno que salió) reserva en su propia lista. Un invitado tampoco en las
    // de una cuenta que tuvo sesión en este navegador: puede ser ese dueño sin su sesión (ver accesoALista).
    const acceso = await accesoALista(t, row.listId, viewer)
    if (acceso === 'dueno' || acceso === 'ex_dueno' || acceso === 'otra_cuenta') return { ok: false, reason: 'propio' }
    // reservar es decir que la lista no es suya: desde ahora ve lo que reservaron los demás (también si no sale)
    if (viewer.guestId) await abrirListaAInvitado(t, viewer.guestId, row.listId)
    if (row.item.estadoDueno !== 'activo') return { ok: false, reason: 'archivado' }

    await expireStaleClaims(t, itemId)

    // Una persona, una reserva por deseo: un doble toque, o la lista y el detalle abiertos a la vez, devuelve la que ya
    // tiene (reservada o comprada) en vez de comerse otro lugar. Bajo el lock del deseo, así que no hay carrera.
    const [ya] = await tx.select({ id: claims.id }).from(claims)
      .where(and(eq(claims.itemId, itemId), claimEsDe(viewer), inArray(claims.estado, ['reservado', 'comprado'])))
      .orderBy(asc(claims.createdAt)).limit(1)
    if (ya) return { ok: true, claimId: ya.id }

    if (!esRepetible(row.item)) {
      const [{ n }] = await tx.select({ n: count() }).from(claims)
        .where(and(eq(claims.itemId, itemId), inArray(claims.estado, ['reservado', 'comprado'])))
      if (n >= row.item.cantidad) return { ok: false, reason: 'sin_stock' }
    }

    const [claim] = await tx.insert(claims).values({
      itemId,
      claimerUserId: viewer.userId ?? null,
      claimerGuestId: viewer.guestId ?? null,
      expiresAt: opts.sinVencimiento ? null : await vencimientoDeReserva(t, row.listId),
    }).returning()
    return { ok: true, claimId: claim.id }
  })
}

/** La reserva de un regalo grupal se compra o se cancela desde el regalo, no como reserva suelta. */
export const noEsDeRegaloGrupal = () => notInArray(claims.id, sql`(select ${groupGifts.claimId} from ${groupGifts})`)

function claimEsDe(viewer: Viewer) {
  return viewer.userId
    ? eq(claims.claimerUserId, viewer.userId)
    : viewer.guestId
      ? eq(claims.claimerGuestId, viewer.guestId)
      : sql`false`
}

/**
 * "Ya lo compré". Sobre una reserva suelta propia, también una que venció sin que la marcara (lo compró a tiempo y se
 * olvidó): esa vuelve a reservarse con los mismos controles que una nueva (el deseo sigue en la lista y con lugar) y se
 * marca la nueva. Devuelve false si no se pudo.
 */
export async function markBought(db: Db, claimId: string, viewer: Viewer, notaQueCompre?: string): Promise<boolean> {
  if (!esUuid(claimId)) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [mia] = await t.select({ itemId: claims.itemId }).from(claims)
      .where(and(eq(claims.id, claimId), inArray(claims.estado, ['reservado', 'expirado']), claimEsDe(viewer), noEsDeRegaloGrupal()))
    if (!mia) return false
    // si sigue vigente, es la misma (una persona, una reserva por deseo); si venció, una nueva si hay lugar
    const r = await reserveItem(t, mia.itemId, viewer)
    if (!r.ok) return false
    // nunca la de un regalo grupal ni una ya comprada que devolvió reserveItem
    const updated = await t.update(claims)
      .set({ estado: 'comprado', notaQueCompre: notaQueCompre ?? null, updatedAt: new Date() })
      .where(and(eq(claims.id, r.claimId), eq(claims.estado, 'reservado'), noEsDeRegaloGrupal()))
      .returning({ id: claims.id })
    return updated.length > 0
  })
}

/**
 * "Me equivoqué, no lo compré": la compra suelta propia vuelve a estar reservada, con un vencimiento nuevo (el de antes
 * puede haber pasado). Las de un regalo grupal no: tienen montos y deudas. Solo mientras el deseo sigue en la lista.
 */
export async function desmarcarComprado(db: Db, claimId: string, viewer: Viewer): Promise<boolean> {
  if (!esUuid(claimId)) return false
  const [c] = await db.select({ listId: items.listId }).from(claims).innerJoin(items, eq(claims.itemId, items.id))
    .where(and(eq(claims.id, claimId), eq(claims.estado, 'comprado'), eq(items.estadoDueno, 'activo'), claimEsDe(viewer), noEsDeRegaloGrupal()))
  if (!c) return false
  const updated = await db.update(claims)
    .set({ estado: 'reservado', notaQueCompre: null, expiresAt: await vencimientoDeReserva(db, c.listId), updatedAt: new Date() })
    .where(and(eq(claims.id, claimId), eq(claims.estado, 'comprado')))
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

/** Cuántos días después de vencer se le sigue ofreciendo "Reservar de nuevo" o "Ya lo compré" en el deseo. */
const VENCIDA_VISIBLE_DIAS = 30

/**
 * La última reserva suelta propia de un deseo que venció hace poco, para no dejarlo trabado: si lo había comprado, lo
 * marca; si no, lo reserva de nuevo. Solo se mira si no tiene otra activa.
 */
export async function miReservaVencida(db: Db, itemId: string, viewer: Viewer): Promise<{ claimId: string; vencio: Date } | null> {
  if (!viewer.userId && !viewer.guestId) return null
  const [c] = await db.select({ id: claims.id, expiresAt: claims.expiresAt }).from(claims)
    .where(and(eq(claims.itemId, itemId), eq(claims.estado, 'expirado'), claimEsDe(viewer), noEsDeRegaloGrupal(),
      gt(claims.expiresAt, new Date(Date.now() - VENCIDA_VISIBLE_DIAS * DIA))))
    .orderBy(desc(claims.expiresAt)).limit(1)
  return c?.expiresAt ? { claimId: c.id, vencio: c.expiresAt } : null
}

export async function getMyClaimWarnings(db: Db, viewer: Viewer) {
  if (!viewer.userId && !viewer.guestId) return []
  await expireStaleClaims(db)
  const rows = await db.select({
    claimId: claims.id, itemId: items.id, itemTitulo: items.titulo, token: lists.shareToken,
    createdAt: claims.createdAt, expiresAt: claims.expiresAt,
    // Si cambiaron el link para regalar después de que reservó, el cartel no le pasa el nuevo (puede ser justo a quien
    // se lo quisieron sacar): queda sin link, como en Cuentas.
    conLink: sql<boolean>`${or(isNull(lists.shareTokenAt), gt(claims.createdAt, lists.shareTokenAt))}`,
  }).from(claims).innerJoin(items, eq(claims.itemId, items.id)).innerJoin(lists, eq(items.listId, lists.id))
    // por si una reserva quedó sobre una lista propia (venga de donde venga): ese cartel le contaría la sorpresa.
    // Y de un deseo que ya no está, no: al archivarlo se libera, pero puede haber quedado alguna de antes.
    .where(and(eq(claims.estado, 'reservado'), eq(items.estadoDueno, 'activo'), claimEsDe(viewer), listasAjenasSql(db, viewer)))
  const ahora = Date.now()
  return rows
    .filter((r) => r.expiresAt && ahora > (r.createdAt.getTime() + r.expiresAt.getTime()) / 2)
    .map((r) => ({
      claimId: r.claimId,
      itemTitulo: r.itemTitulo,
      diasRestantes: Math.ceil((r.expiresAt!.getTime() - ahora) / DIA),
      // al deseo, para marcarlo comprado o liberarlo antes de que venza
      href: r.conLink ? `/l/${r.token}/item/${r.itemId}` : null,
    }))
}
