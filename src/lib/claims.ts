import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { claims, groupGiftMembers, groupGifts, items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { RESERVAS_POR_LISTA, type Viewer } from '@/lib/types'
import { abrirListaAInvitado, accesoALista, listasAjenasSql } from '@/lib/acceso'
import { esRepetible } from '@/lib/serialize'
import { esUuid } from '@/lib/groups'
import { notaDeCompra } from '@/lib/limites'
import { desdeElUltimoEvento, eventoDeLista, hoyLocal, inicioDelDia } from '@/lib/events'

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

/**
 * Lo que ocupa un deseo: lo reservado y lo comprado. En una idea que se puede repetir (desde: ver desdeElUltimoEvento),
 * de lo comprado solo lo de este evento: las medias del cumple pasado no le quitan a nadie volver a regalarle medias. Lo
 * comprado se anota en updated_at (al marcarlo, también en un regalo grupal).
 */
export function ocupaSql(desde: Date | null) {
  return or(eq(claims.estado, 'reservado'), and(eq(claims.estado, 'comprado'), desde ? gte(claims.updatedAt, desde) : undefined))
}

type Deseo = { id: string; listId: string; tipo: 'exacto' | 'idea'; repetible: boolean }

/** El desde de ocupaSql para un deseo: en una idea que se puede repetir, el último evento; si no, null (todo ocupa). */
export async function desdeQueOcupa(db: Db, deseo: Omit<Deseo, 'id'>): Promise<Date | null> {
  return esRepetible(deseo) ? desdeElUltimoEvento(db, deseo.listId) : null
}

/**
 * Lo que el que mira ya tiene de un deseo (una persona, una reserva por deseo): su reserva o compra suelta, o la del
 * regalo grupal en el que está, como encargado o sumado. Si por datos de antes hay más de una: primero la de un regalo
 * (uno abierto antes que uno comprado), después lo reservado y lo más viejo.
 */
export async function loQueYaTiene(db: Db, deseo: Deseo, viewer: Viewer) {
  const desde = await desdeQueOcupa(db, deseo)
  const enUnRegalo = viewer.userId
    ? inArray(groupGifts.id, db.select({ id: groupGiftMembers.giftId }).from(groupGiftMembers).where(eq(groupGiftMembers.userId, viewer.userId)))
    : undefined
  const [ya] = await db.select({ claimId: claims.id, estado: claims.estado, giftId: groupGifts.id }).from(claims)
    .leftJoin(groupGifts, eq(groupGifts.claimId, claims.id))
    .where(and(eq(claims.itemId, deseo.id), ocupaSql(desde), or(claimEsDe(viewer), enUnRegalo)))
    .orderBy(sql`${groupGifts.id} is null`, desc(claims.estado), asc(claims.createdAt)).limit(1)
  return ya ?? null
}

export type ReserveResult =
  | { ok: true; claimId: string }
  | { ok: false; reason: 'propio' | 'sin_stock' | 'archivado' | 'no_existe' | 'sin_identidad' | 'muchas' }

// sinVencimiento: la reserva de un regalo grupal no vence (la maneja el encargado). comprada: se marca comprada enseguida
// (una vencida que ya había comprado): no queda tomada, así que no la frena el tope. Un regalo grupal recién armado sí.
export async function reserveItem(
  db: Db, itemId: string, viewer: Viewer, opts: { sinVencimiento?: boolean; comprada?: boolean } = {},
): Promise<ReserveResult> {
  if (!viewer.userId && !viewer.guestId) return { ok: false, reason: 'sin_identidad' }
  if (!esUuid(itemId)) return { ok: false, reason: 'no_existe' }
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
    // tiene (reservada o comprada, suelta o la del regalo grupal en el que está) en vez de comerse otro lugar. Bajo el
    // lock del deseo, así que no hay carrera.
    const ya = await loQueYaTiene(t, row.item, viewer)
    if (ya) return { ok: true, claimId: ya.claimId }

    if (!esRepetible(row.item)) {
      const [{ n }] = await tx.select({ n: count() }).from(claims)
        .where(and(eq(claims.itemId, itemId), inArray(claims.estado, ['reservado', 'comprado'])))
      if (n >= row.item.cantidad) return { ok: false, reason: 'sin_stock' }
    }

    // Nadie más puede soltar una reserva ajena: sin tope, una sola persona dejaba la lista entera tomada (ver RESERVAS_POR_LISTA)
    if (!opts.comprada && (await tomadasEnLista(t, row.listId, viewer)) >= RESERVAS_POR_LISTA) return { ok: false, reason: 'muchas' }

    const [claim] = await tx.insert(claims).values({
      itemId,
      claimerUserId: viewer.userId ?? null,
      claimerGuestId: viewer.guestId ?? null,
      expiresAt: opts.sinVencimiento ? null : await vencimientoDeReserva(t, row.listId),
    }).returning()
    return { ok: true, claimId: claim.id }
  })
}

/**
 * La reserva de un regalo grupal se compra o se cancela desde el regalo, no como reserva suelta. Con not exists, por el
 * único de group_gifts.claim_id: un not in recorría todos los regalos de la base en cada consulta.
 */
export const noEsDeRegaloGrupal = () => sql`not exists (select 1 from ${groupGifts} where ${groupGifts.claimId} = ${claims.id})`

/**
 * Lo que una persona tiene tomado sin comprar en una lista, para el tope (RESERVAS_POR_LISTA): sus reservas sueltas sin
 * vencer y los regalos grupales abiertos que encarga sin nadie más. Esos se arman con un toque, no vencen y solo los
 * cancela el encargado: sin contarlos, "Regalo grupal" en cada deseo dejaba la lista tomada para siempre. Uno al que se
 * sumó alguien ya no cuenta (si después se baja, vuelve a contar, pero no se deshace).
 * Antes de contar toma un lock por persona y lista hasta el fin de la transacción: dos reservas a la vez sobre deseos
 * distintos (dos pestañas, un script) no cuentan las dos lo mismo y se pasan. Se toma después del lock del deseo.
 */
export async function tomadasEnLista(t: Db, listId: string, viewer: Viewer): Promise<number> {
  const quien = viewer.userId ? `u:${viewer.userId}` : `g:${viewer.guestId}`
  await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`reservas:${listId}:${quien}`}))`)
  const regaloSolo = sql`exists (select 1 from ${groupGifts} where ${groupGifts.claimId} = ${claims.id} and ${groupGifts.estado} = 'abierto'
    and not exists (select 1 from ${groupGiftMembers} where ${groupGiftMembers.giftId} = ${groupGifts.id} and ${groupGiftMembers.userId} <> ${groupGifts.organizerUserId}))`
  const [{ tomadas }] = await t.select({ tomadas: count() }).from(claims).innerJoin(items, eq(claims.itemId, items.id))
    .where(and(
      eq(items.listId, listId), eq(items.estadoDueno, 'activo'), claimEsDe(viewer), eq(claims.estado, 'reservado'),
      or(and(noEsDeRegaloGrupal(), or(isNull(claims.expiresAt), gt(claims.expiresAt, new Date()))), regaloSolo),
    ))
  return tomadas
}

function claimEsDe(viewer: Viewer) {
  return viewer.userId
    ? eq(claims.claimerUserId, viewer.userId)
    : viewer.guestId
      ? eq(claims.claimerGuestId, viewer.guestId)
      : sql`false`
}

/** Cuántos días después de vencer se le sigue ofreciendo "Reservar de nuevo" o "Ya lo compré" en el deseo. */
const VENCIDA_VISIBLE_DIAS = 30

export type CompraSueltaResult = { ok: true } | { ok: false; reason: 'sin_lugar' | 'no_permitido' }

/**
 * "Ya lo compré", sobre una reserva suelta propia: la que pidió (aunque por datos de antes tenga otra, es la que ve en la
 * pantalla). Si ya estaba comprada (un doble toque, otra pestaña), listo.
 * Si venció sin que la marcara (lo compró a tiempo y se olvidó), se vuelve a reservar con los mismos controles que una
 * nueva y se marca esa ('sin_lugar' si ya no queda), pero solo hasta 30 días después de vencer y con el link para
 * regalar de ahora: conLink es el deseo, si el que lo pide llegó con el token vigente (lo mismo que pide reservar). Una
 * reserva nueva cuenta como que tiene ese link (ver cambiarLinkParaRegalar): sin esto, a quien se lo sacaron lo recuperaría.
 */
export async function markBought(db: Db, claimId: string, viewer: Viewer, notaQueCompre?: string, conLink?: string): Promise<CompraSueltaResult> {
  const no = { ok: false, reason: 'no_permitido' } as const
  if (!esUuid(claimId)) return no
  return db.transaction(async (tx): Promise<CompraSueltaResult> => {
    const t = tx as unknown as Db
    const suya = and(eq(claims.id, claimId), claimEsDe(viewer), noEsDeRegaloGrupal())
    const [antes] = await t.select({ itemId: claims.itemId }).from(claims).where(suya)
    if (!antes) return no
    // lock del deseo, como reserveItem y archiveItem: si a la vez lo archivan, uno espera al otro
    const [item] = await t.select({ listId: items.listId, estado: items.estadoDueno }).from(items)
      .where(eq(items.id, antes.itemId)).for('update')
    const [c] = await t.select({ estado: claims.estado, expiresAt: claims.expiresAt }).from(claims).where(suya)
    if (!item || !c) return no
    if (c.estado === 'comprado') return { ok: true }
    const marcar = async (id: string): Promise<CompraSueltaResult> => {
      const filas = await t.update(claims).set({ estado: 'comprado', notaQueCompre: notaDeCompra(notaQueCompre), updatedAt: new Date() })
        .where(and(eq(claims.id, id), eq(claims.estado, 'reservado')))
        .returning({ id: claims.id })
      return filas.length ? { ok: true } : no
    }
    if (c.estado === 'reservado') {
      // sin ver la coordinación (un co-dueño desde una pestaña vieja) no se toca: como en la pantalla
      if (item.estado !== 'activo' || (await accesoALista(t, item.listId, viewer)) !== 'regalador') return no
      return marcar(claimId)
    }
    const hace = c.expiresAt ? Date.now() - c.expiresAt.getTime() : Infinity
    if (c.estado !== 'expirado' || conLink !== antes.itemId || hace > VENCIDA_VISIBLE_DIAS * DIA) return no
    const r = await reserveItem(t, antes.itemId, viewer, { comprada: true })
    if (!r.ok) return r.reason === 'sin_stock' ? { ok: false, reason: 'sin_lugar' } : no
    // una nueva, o la que ya tenía: la volvió a reservar, o ya la marcó (un doble toque sobre la vencida)
    const [nueva] = await t.select({ estado: claims.estado }).from(claims).where(and(eq(claims.id, r.claimId), noEsDeRegaloGrupal()))
    if (nueva?.estado === 'comprado') return { ok: true }
    // la de un regalo grupal en el que está se compra desde el regalo
    return nueva?.estado === 'reservado' ? marcar(r.claimId) : no
  })
}

export type DeshacerCompraResult = { ok: true } | { ok: false; reason: 'muchas' | 'no_permitido' }

/**
 * "Me equivoqué, no lo compré": la compra suelta propia vuelve a estar reservada, con un vencimiento nuevo (el de antes
 * puede haber pasado). Solo la de este evento (ver desdeElUltimoEvento): la de un cumple pasado ya se regaló, y deshacerla
 * borraría el historial. Las de un regalo grupal no: tienen montos y deudas. Solo mientras el deseo sigue en la lista y el
 * que lo pide ve la coordinación: un co-dueño que lo compró antes de sumarse no la vuelve una reserva de un dueño.
 * Vuelve a ser una reserva sin comprar, así que pasa por el mismo tope que reservar ('muchas'): si no, marcar compradas
 * 10, reservar otras 10 y deshacer las compras lo salteaba.
 */
export async function desmarcarComprado(db: Db, claimId: string, viewer: Viewer): Promise<DeshacerCompraResult> {
  const no = { ok: false, reason: 'no_permitido' } as const
  if (!esUuid(claimId)) return no
  return db.transaction(async (tx): Promise<DeshacerCompraResult> => {
    const t = tx as unknown as Db
    const suya = and(eq(claims.id, claimId), eq(claims.estado, 'comprado'), claimEsDe(viewer), noEsDeRegaloGrupal())
    const [c] = await t.select({ itemId: claims.itemId, createdAt: claims.createdAt }).from(claims).where(suya)
    if (!c) return no
    // lock del deseo: si a la vez lo archivan, o esto lo ve archivado, o termina antes y archivar libera la reserva (y avisa)
    const [item] = await t.select({ listId: items.listId, estado: items.estadoDueno, linkAt: lists.shareTokenAt })
      .from(items).innerJoin(lists, eq(items.listId, lists.id))
      .where(eq(items.id, c.itemId)).for('update', { of: items })
    if (item?.estado !== 'activo' || (await accesoALista(t, item.listId, viewer)) !== 'regalador') return no
    const deEsteEvento = and(suya, gte(claims.updatedAt, await desdeElUltimoEvento(t, item.listId)))
    if (!(await t.select({ id: claims.id }).from(claims).where(deEsteEvento)).length) return no
    if ((await tomadasEnLista(t, item.listId, viewer)) >= RESERVAS_POR_LISTA) return { ok: false, reason: 'muchas' }
    // El plazo nuevo cuenta desde ahora (si no, "¿Conseguiste…?" sale enseguida), salvo que eso lo haga parecer de después
    // de un cambio del link para regalar: le pasaría el nuevo a quien reservó antes (ver cambiarLinkParaRegalar).
    const desdeAhora = !item.linkAt || c.createdAt > item.linkAt
    const updated = await t.update(claims)
      .set({
        estado: 'reservado', notaQueCompre: null, expiresAt: await vencimientoDeReserva(t, item.listId), updatedAt: new Date(),
        createdAt: desdeAhora ? sql`greatest(now(), ${claims.createdAt})` : undefined,
      })
      .where(deEsteEvento)
      .returning({ id: claims.id })
    return updated.length ? { ok: true } : no
  })
}

export async function releaseClaim(db: Db, claimId: string, viewer: Viewer): Promise<boolean> {
  if (!esUuid(claimId)) return false
  const updated = await db.update(claims)
    .set({ estado: 'liberado', updatedAt: new Date() })
    .where(and(eq(claims.id, claimId), eq(claims.estado, 'reservado'), claimEsDe(viewer), noEsDeRegaloGrupal()))
    .returning({ id: claims.id })
  return updated.length > 0
}

/**
 * La última reserva suelta propia de un deseo que venció hace poco, para no dejarlo trabado: si lo había comprado, lo
 * marca; si no, lo reserva de nuevo. Solo se mira si no tiene otra activa. Si después reservó de nuevo (o armó un regalo),
 * ya pasó: aunque la haya liberado, fue a propósito.
 */
export async function miReservaVencida(db: Db, itemId: string, viewer: Viewer): Promise<{ claimId: string; vencio: Date } | null> {
  if (!viewer.userId && !viewer.guestId) return null
  const [c] = await db.select({ id: claims.id, expiresAt: claims.expiresAt, createdAt: claims.createdAt }).from(claims)
    .where(and(eq(claims.itemId, itemId), eq(claims.estado, 'expirado'), claimEsDe(viewer), noEsDeRegaloGrupal(),
      gt(claims.expiresAt, new Date(Date.now() - VENCIDA_VISIBLE_DIAS * DIA))))
    .orderBy(desc(claims.expiresAt)).limit(1)
  if (!c?.expiresAt) return null
  const [despues] = await db.select({ id: claims.id }).from(claims)
    .where(and(eq(claims.itemId, itemId), claimEsDe(viewer), gt(claims.createdAt, c.createdAt))).limit(1)
  return despues ? null : { claimId: c.id, vencio: c.expiresAt }
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
