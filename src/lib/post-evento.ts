import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql, type AnyColumn } from 'drizzle-orm'
import { claims, groupGiftMembers, groupGifts, items, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { noEsDeRegaloGrupal } from '@/lib/claims'
import { avisar, type Enviar } from '@/lib/codazos'
import { desdeElUltimoEvento, eventoAnteriorDeLista, hoyLocal, inicioDelDia } from '@/lib/events'
import { esUuid, noEsNiFueDuenoSql } from '@/lib/groups'
import { sacarDeLaLista, seDeshaceRecibido } from '@/lib/items'

// Después del cumple. Hasta acá GiftR no hacía nada cuando pasaba el evento: lo que le regalaron al dueño seguía
// figurando como deseo, nadie cerraba el ciclo y no había motivo para volver hasta el año siguiente. Ahora:
// - El dueño marca lo que le regalaron ("¿Qué te regalaron?") y eso pasa a "Recibidos" (ver marcarRecibidos).
// - Quien lo compró puede contarle que fue suyo, si quiere y regalo por regalo (ver revelarRegalo), y el dueño le puede
//   mandar las gracias (ver agradecer).
// La regla de la sorpresa sigue igual después del evento: el dueño marca lo que ÉL sabe que recibió. Nada de acá le
// sugiere, le ordena ni le cuenta nada en base a reservas o compras, y de quien regaló solo le llega el nombre de quien
// eligió contárselo (revelado_at puesto), nunca antes del día siguiente al evento.
// Por ahora, solo en la lista personal (el evento es el cumple del dueño).

const DIA = 86400_000

/** Cuántos días después del cumple sigue la tarjeta "¿Cómo te fue en tu cumple?" en Mi lista (desde el día siguiente). */
export const POST_EVENTO_DIAS = 30

export type UltimoEvento = {
  /** el día del evento que ya pasó */
  fecha: Date
  /** 'YYYY-MM-DD' */
  iso: string
  /** hace cuántos días fue (1: ayer) */
  hace: number
  /** cuándo empezó ese día y cuándo terminó: lo reservado antes de que termine era para ese evento */
  empezo: Date
  corte: Date
}

/** El último evento de la lista que ya pasó (desde el día siguiente); null si no tiene fecha. */
export async function ultimoEvento(db: Db, listId: string, ahora = new Date()): Promise<UltimoEvento | null> {
  const e = await eventoAnteriorDeLista(db, listId, hoyLocal(ahora))
  if (!e) return null
  return {
    fecha: e.fecha, iso: e.fecha.toISOString().slice(0, 10), hace: e.hace,
    empezo: inicioDelDia(e.fecha), corte: inicioDelDia(new Date(e.fecha.getTime() + DIA)),
  }
}

async function listaPersonal(db: Db, userId: string) {
  if (!esUuid(userId)) return null
  const [lista] = await db.select({ id: lists.id, hecho: lists.postEventoHecho }).from(lists)
    .where(and(eq(lists.ownerId, userId), eq(lists.tipo, 'personal')))
  return lista ?? null
}

export type PostEvento = {
  /** el cumple que pasó */
  fecha: Date
  hace: number
  /** dentro de los 30 días: todavía se le ofrece marcar lo que le regalaron */
  enVentana: boolean
  /** en la ventana y sin cerrar: va la tarjeta (si tiene deseos para marcar) */
  pendiente: boolean
}

/**
 * Lo de después del cumple para el dueño, en Mi lista; null si no cargó su cumple. Sale solo de la fecha y de lo que él
 * hizo (si ya lo cerró): nada de reservas.
 */
export async function postEvento(db: Db, userId: string, ahora = new Date()): Promise<PostEvento | null> {
  const lista = await listaPersonal(db, userId)
  const ev = lista && await ultimoEvento(db, lista.id, ahora)
  if (!lista || !ev) return null
  const enVentana = ev.hace <= POST_EVENTO_DIAS
  return { fecha: ev.fecha, hace: ev.hace, enVentana, pendiente: enVentana && lista.hecho !== ev.iso }
}

/**
 * "¿Qué te regalaron?": el dueño marca, de sus deseos activos, los que recibió, todos de una vez. Cada uno sale de la
 * lista con el mismo mecanismo que "Ya lo tengo" (ver sacarDeLaLista) y queda en "Recibidos", con el cumple para el que
 * fue. Solo los de su lista personal que siguen activos: un id de otra lista, o uno que ya había sacado, no cuenta.
 * Con esto el evento queda cerrado (la tarjeta no vuelve), también si no marcó ninguno; con cerrar en false, no (marcó
 * uno solo desde "Recibidos": quizás le falta repasar el resto). Devuelve cuántos marcó ahora; null si no hay un cumple
 * que ya pasó. Lo que devuelve y lo que ve después es lo mismo haya o no reservas.
 */
export async function marcarRecibidos(
  db: Db, userId: string, itemIds: string[], ahora = new Date(), { cerrar = true } = {},
): Promise<number | null> {
  const lista = await listaPersonal(db, userId)
  const ev = lista && await ultimoEvento(db, lista.id, ahora)
  if (!lista || !ev) return null
  // en orden: dos envíos a la vez bloquean los deseos en el mismo orden
  const ids = [...new Set(itemIds.filter(esUuid))].sort().slice(0, 500)
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const suyos = ids.length
      ? await t.select({ id: items.id }).from(items).where(and(eq(items.listId, lista.id), inArray(items.id, ids), eq(items.estadoDueno, 'activo'))).orderBy(asc(items.id))
      : []
    let marcados = 0
    for (const { id } of suyos) {
      if (await sacarDeLaLista(t, id, 'me_lo_regalaron', { recibido: { ahora, evento: ev.iso, empezo: ev.empezo } })) marcados++
    }
    if (cerrar) await t.update(lists).set({ postEventoHecho: ev.iso }).where(eq(lists.id, lista.id))
    return marcados
  })
}

/** "Ahora no": la tarjeta no vuelve para este cumple (lo puede marcar igual desde "Recibidos", abajo en Mi lista). */
export async function cerrarPostEvento(db: Db, userId: string, ahora = new Date()): Promise<boolean> {
  const lista = await listaPersonal(db, userId)
  const ev = lista && await ultimoEvento(db, lista.id, ahora)
  if (!lista || !ev) return false
  await db.update(lists).set({ postEventoHecho: ev.iso }).where(eq(lists.id, lista.id))
  return true
}

/** Quién le contó al dueño que un regalo fue suyo. tipo e id: el claim (suelto) o el regalo grupal, para mandarle gracias. */
export type DeParte = { tipo: 'suelto' | 'grupal'; id: string; de: string; nombre: string; agradecido: boolean }

type Revelado = DeParte & { itemId: string; titulo: string; fotoUrl: string | null; estado: (typeof items.$inferSelect)['estadoDueno'] }

/**
 * Un revelado vale desde la última vez que el deseo volvió a la lista: si lo volvió a pedir (ver restoreItem), "De parte
 * de Rodri" era del que ya le regalaron, no del que pide ahora.
 */
const vigente = (reveladoAt: AnyColumn) => sql`${reveladoAt} >= coalesce(${items.ocupaDesde}, '-infinity')`

/**
 * Lo único de quien regaló que le llega al dueño: de los deseos de su lista (o de uno), los regalos comprados cuyo dueño
 * ELIGIÓ contarle que fueron suyos. El filtro está en la consulta (revelado_at puesto): de una reserva o una compra sin
 * revelar no sale de la base ni el nombre. En un regalo grupal, cada uno de los que se reveló y nadie más.
 */
async function reveladosDe(db: Db, listId: string, itemId?: string): Promise<Revelado[]> {
  const delDeseo = and(eq(items.listId, listId), isNull(items.borradoAt), itemId ? eq(items.id, itemId) : undefined)
  const deseo = { itemId: items.id, titulo: items.titulo, fotoUrl: items.fotoUrl, estado: items.estadoDueno }
  const [sueltos, grupales] = await Promise.all([
    db.select({ id: claims.id, de: users.id, nombre: users.nombre, agradecidoAt: claims.agradecidoAt, cuando: claims.reveladoAt, ...deseo })
      .from(claims).innerJoin(items, eq(claims.itemId, items.id)).innerJoin(users, eq(claims.claimerUserId, users.id))
      .where(and(delDeseo, isNotNull(claims.reveladoAt), eq(claims.estado, 'comprado'), noEsDeRegaloGrupal(), vigente(claims.reveladoAt))),
    db.select({ id: groupGifts.id, de: users.id, nombre: users.nombre, agradecidoAt: groupGiftMembers.agradecidoAt, cuando: groupGiftMembers.reveladoAt, ...deseo })
      .from(groupGiftMembers).innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id))
      .innerJoin(items, eq(groupGifts.itemId, items.id)).innerJoin(users, eq(groupGiftMembers.userId, users.id))
      .where(and(delDeseo, isNotNull(groupGiftMembers.reveladoAt), eq(groupGifts.estado, 'comprado'), vigente(groupGiftMembers.reveladoAt))),
  ])
  return [
    ...sueltos.map((r) => ({ ...r, tipo: 'suelto' as const })),
    ...grupales.map((r) => ({ ...r, tipo: 'grupal' as const })),
  ].sort((a, b) => a.cuando!.getTime() - b.cuando!.getTime())
    .map((r) => ({
      tipo: r.tipo, id: r.id, de: r.de, nombre: r.nombre, agradecido: !!r.agradecidoAt,
      itemId: r.itemId, titulo: r.titulo, fotoUrl: r.fotoUrl, estado: r.estado,
    }))
}

const soloDeParte = ({ tipo, id, de, nombre, agradecido }: Revelado): DeParte => ({ tipo, id, de, nombre, agradecido })

export type Recibido = {
  id: string
  titulo: string
  fotoUrl: string | null
  /** el año del cumple para el que fue ("Cumple 2026") */
  anio: number | null
  /** todavía es "Me equivoqué"; pasado el mes, "Volver a pedir" (ver restoreItem) */
  seDeshace: boolean
  dePartede: DeParte[]
}
/** Un deseo que no marcó recibido, pero alguien le contó que se lo regaló. activo: sigue en su lista (lo puede marcar). */
export type Contado = { id: string; titulo: string; fotoUrl: string | null; activo: boolean; dePartede: DeParte[] }

/**
 * "Recibidos", en Mi lista: lo que el dueño marcó que le regalaron, lo último primero (los de un mismo envío, en el
 * orden de su lista), cada uno con quien le contó que fue suyo, si alguien lo hizo. Y aparte, lo que le contaron de
 * deseos que él no marcó. Sin ningún revelado, de acá no sale nada de quien regaló: ni nombres ni cuántos.
 */
export async function recibidosDe(db: Db, userId: string, ahora = new Date()): Promise<{ recibidos: Recibido[]; contados: Contado[] }> {
  const lista = await listaPersonal(db, userId)
  if (!lista) return { recibidos: [], contados: [] }
  const [filas, revelados] = await Promise.all([
    db.select({ id: items.id, titulo: items.titulo, fotoUrl: items.fotoUrl, evento: items.recibidoEvento, recibidoAt: items.recibidoAt }).from(items)
      .where(and(eq(items.listId, lista.id), eq(items.estadoDueno, 'me_lo_regalaron'), isNull(items.borradoAt)))
      .orderBy(desc(items.recibidoAt), asc(items.createdAt)),
    reveladosDe(db, lista.id),
  ])
  const recibidos = filas.map((i): Recibido => ({
    id: i.id, titulo: i.titulo, fotoUrl: i.fotoUrl, anio: i.evento ? Number(i.evento.slice(0, 4)) : null,
    seDeshace: seDeshaceRecibido(i.recibidoAt, ahora),
    dePartede: revelados.filter((r) => r.itemId === i.id).map(soloDeParte),
  }))
  const contados = new Map<string, Contado>()
  for (const r of revelados) {
    if (r.estado === 'me_lo_regalaron') continue
    const c = contados.get(r.itemId) ?? { id: r.itemId, titulo: r.titulo, fotoUrl: r.fotoUrl, activo: r.estado === 'activo', dePartede: [] }
    c.dePartede.push(soloDeParte(r))
    contados.set(r.itemId, c)
  }
  return { recibidos, contados: [...contados.values()] }
}

/** "De parte de…" en un deseo propio: quiénes le contaron que se lo regalaron (ver reveladosDe). */
export async function dePartede(db: Db, itemId: string, userId: string): Promise<DeParte[]> {
  const lista = await listaPersonal(db, userId)
  if (!lista || !esUuid(itemId)) return []
  return (await reveladosDe(db, lista.id, itemId)).map(soloDeParte)
}

/**
 * Si una compra ya se regaló: el evento de esa lista pasó (desde el día siguiente) y era para ese. Lo era si se reservó
 * antes de que terminara el día del evento, aunque se haya marcado comprada después (Rodri tocó "Ya lo compré" al otro
 * día, cuando se lo recordamos), o si el dueño ya marcó que se lo regalaron. Lo reservado después del evento es para el
 * que viene: hasta que pase, no.
 */
export function yaSeRegalo(c: { reservada: Date; recibido: boolean }, ev: Pick<UltimoEvento, 'corte'> | null): boolean {
  return !!ev && (c.recibido || c.reservada < ev.corte)
}

const primer = (nombre: string | null) => (nombre ?? 'Alguien').trim().split(/\s+/)[0]

/**
 * "Contarle a Euge que fue tuyo", en Tus regalos: quien compró un regalo elige que el dueño vea "De parte de Rodri". Solo:
 * - si lo elige, regalo por regalo (nada global ni por defecto), y con cuenta (un invitado no tiene Tus regalos);
 * - sobre algo comprado: una reserva sin comprar no se revela;
 * - después del evento para el que era (ver yaSeRegalo): antes sería contarle la sorpresa;
 * - en un regalo grupal (id: el regalo), cada uno por su cuenta: se revela su nombre y el de nadie más.
 * No se deshace: al dueño le llega el aviso en el momento. Devuelve si lo reveló ahora (un doble toque no avisa dos veces).
 */
export async function revelarRegalo(
  db: Db, userId: string, tipo: 'suelto' | 'grupal', id: string, ahora = new Date(), enviar?: Enviar,
): Promise<boolean> {
  if (!esUuid(userId) || !esUuid(id)) return false
  // solo de una lista personal ajena (ni suya ni de un grupo suyo), y de un deseo que el dueño no eliminó
  const ajena = and(eq(lists.tipo, 'personal'), noEsNiFueDuenoSql(db, userId), isNull(items.borradoAt))
  const deseo = {
    listId: lists.id, ownerId: lists.ownerId, titulo: items.titulo, recibido: sql<boolean>`${items.estadoDueno} = 'me_lo_regalaron'`,
  }
  const [r] = tipo === 'suelto'
    ? await db.select({ reservada: claims.createdAt, ...deseo }).from(claims)
      .innerJoin(items, eq(claims.itemId, items.id)).innerJoin(lists, eq(items.listId, lists.id))
      .where(and(eq(claims.id, id), eq(claims.claimerUserId, userId), eq(claims.estado, 'comprado'), noEsDeRegaloGrupal(), ajena))
    : await db.select({ reservada: groupGifts.createdAt, ...deseo }).from(groupGiftMembers)
      .innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id))
      .innerJoin(items, eq(groupGifts.itemId, items.id)).innerJoin(lists, eq(items.listId, lists.id))
      .where(and(eq(groupGifts.id, id), eq(groupGiftMembers.userId, userId), eq(groupGifts.estado, 'comprado'), ajena))
  if (!r?.ownerId || !yaSeRegalo(r, await ultimoEvento(db, r.listId, ahora))) return false
  const revelado = tipo === 'suelto'
    ? await db.update(claims).set({ reveladoAt: ahora })
      .where(and(eq(claims.id, id), eq(claims.claimerUserId, userId), eq(claims.estado, 'comprado'), isNull(claims.reveladoAt)))
      .returning({ id: claims.id })
    : await db.update(groupGiftMembers).set({ reveladoAt: ahora })
      .where(and(eq(groupGiftMembers.giftId, id), eq(groupGiftMembers.userId, userId), isNull(groupGiftMembers.reveladoAt)))
      .returning({ id: groupGiftMembers.giftId })
  if (!revelado.length) return false
  const [yo] = await db.select({ nombre: users.nombre }).from(users).where(eq(users.id, userId))
  // el revelado ya quedó: si el aviso falla, lo ve igual en su lista
  await avisar(db, r.ownerId, {
    de: userId, tipo: null,
    title: `🎁 ${primer(yo?.nombre)} te cuenta que fue de su parte`,
    body: `Te regaló "${r.titulo}". Si querés, mandale las gracias desde tu lista.`,
    url: '/mi-lista#recibidos',
  }, enviar).catch(() => 0)
  return true
}

/**
 * "Mandarle gracias": el dueño le deja un aviso a quien le contó que un regalo fue suyo (de: esa persona; tipo e id, como
 * en DeParte). Una sola vez por regalo y persona, y solo sobre uno revelado de su propia lista: sin revelado no hay a
 * quién (ni se puede probar con ids a ver quién reservó). Devuelve si las mandó ahora.
 */
export async function agradecer(
  db: Db, userId: string, tipo: 'suelto' | 'grupal', id: string, de: string, ahora = new Date(), enviar?: Enviar,
): Promise<boolean> {
  if (!esUuid(userId) || !esUuid(id) || !esUuid(de)) return false
  const lista = await listaPersonal(db, userId)
  if (!lista) return false
  const deMiLista = db.select({ id: items.id }).from(items).where(eq(items.listId, lista.id))
  // se anota primero: dos toques a la vez mandan uno solo
  const [hecho] = tipo === 'suelto'
    ? await db.update(claims).set({ agradecidoAt: ahora })
      .where(and(
        eq(claims.id, id), eq(claims.claimerUserId, de), eq(claims.estado, 'comprado'), isNotNull(claims.reveladoAt), isNull(claims.agradecidoAt),
        inArray(claims.itemId, deMiLista), noEsDeRegaloGrupal(),
      )).returning({ id: claims.id })
    : await db.update(groupGiftMembers).set({ agradecidoAt: ahora })
      .where(and(
        eq(groupGiftMembers.giftId, id), eq(groupGiftMembers.userId, de), isNotNull(groupGiftMembers.reveladoAt), isNull(groupGiftMembers.agradecidoAt),
        inArray(groupGiftMembers.giftId, db.select({ id: groupGifts.id }).from(groupGifts)
          .where(and(eq(groupGifts.estado, 'comprado'), inArray(groupGifts.itemId, deMiLista)))),
      )).returning({ id: groupGiftMembers.giftId })
  if (!hecho) return false
  const delRegalo = tipo === 'suelto'
    ? db.select({ id: claims.itemId }).from(claims).where(eq(claims.id, id))
    : db.select({ id: groupGifts.itemId }).from(groupGifts).where(eq(groupGifts.id, id))
  const [[deseo], [yo]] = await Promise.all([
    db.select({ titulo: items.titulo }).from(items).where(inArray(items.id, delRegalo)),
    db.select({ nombre: users.nombre }).from(users).where(eq(users.id, userId)),
  ])
  try {
    await avisar(db, de, {
      de: userId, tipo: null,
      title: `💛 ${primer(yo?.nombre)} te da las gracias`,
      body: `Por "${deseo?.titulo ?? 'tu regalo'}", que le regalaste.`,
      url: '/regalos',
    }, enviar)
    return true
  } catch {
    // no le llegó: que lo pueda volver a mandar
    if (tipo === 'suelto') await db.update(claims).set({ agradecidoAt: null }).where(eq(claims.id, id))
    else await db.update(groupGiftMembers).set({ agradecidoAt: null }).where(and(eq(groupGiftMembers.giftId, id), eq(groupGiftMembers.userId, de)))
    return false
  }
}

/** Lo que va por WhatsApp con "Agradecer por WhatsApp", sin destinatario: la persona elige a quién (o a qué grupo). */
export function textoGracias() {
  return '¡Gracias por el regalo de cumple! Me encantó 🎁💛'
}

// ---------- para los recordatorios del día siguiente (ver recordatorios.ts) ----------

/**
 * Si al dueño le falta marcar lo que le regalaron en el cumple de esa fecha ('YYYY-MM-DD'): no lo cerró y tiene deseos
 * para marcar. Solo cosas suyas: da lo mismo con la lista llena de reservas que sin ninguna.
 */
export async function faltaMarcar(db: Db, userId: string, evento: string): Promise<boolean> {
  const lista = await listaPersonal(db, userId)
  if (!lista || lista.hecho === evento) return false
  const [deseo] = await db.select({ id: items.id }).from(items).where(and(eq(items.listId, lista.id), eq(items.estadoDueno, 'activo'))).limit(1)
  return !!deseo
}

/**
 * Los regalos del cumple que acaba de pasar que todavía se pueden contar ("¿Le contás a Euge que fue tuyo?"): lo comprado
 * para ese cumple (ver yaSeRegalo; lo de cumples anteriores, no) por alguien con cuenta que todavía no se reveló, suelto o
 * en un regalo grupal (ahí, cada uno de los que están). De la lista personal de ese dueño; null si no tiene o no hay evento.
 */
export async function regalosPorContar(db: Db, ownerId: string, ahora = new Date()): Promise<{ listId: string; evento: UltimoEvento; regalos: { userId: string; titulo: string }[] } | null> {
  const lista = await listaPersonal(db, ownerId)
  const evento = lista && await ultimoEvento(db, lista.id, ahora)
  if (!lista || !evento) return null
  // desde el día siguiente al cumple anterior: lo de antes es de otro año
  const desde = await desdeElUltimoEvento(db, lista.id, evento.empezo)
  const recibido = eq(items.estadoDueno, 'me_lo_regalaron')
  const delDeseo = and(eq(items.listId, lista.id), isNull(items.borradoAt), gte(claims.updatedAt, desde))
  const [sueltos, grupales] = await Promise.all([
    db.select({ userId: claims.claimerUserId, titulo: items.titulo }).from(claims).innerJoin(items, eq(claims.itemId, items.id))
      .where(and(
        delDeseo, eq(claims.estado, 'comprado'), isNotNull(claims.claimerUserId), isNull(claims.reveladoAt), noEsDeRegaloGrupal(),
        or(lt(claims.createdAt, evento.corte), recibido),
      )),
    db.select({ userId: groupGiftMembers.userId, titulo: items.titulo }).from(groupGiftMembers)
      .innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id)).innerJoin(claims, eq(groupGifts.claimId, claims.id))
      .innerJoin(items, eq(groupGifts.itemId, items.id))
      .where(and(
        delDeseo, eq(groupGifts.estado, 'comprado'), isNull(groupGiftMembers.reveladoAt),
        or(lt(groupGifts.createdAt, evento.corte), recibido),
      )),
  ])
  const regalos = [...sueltos, ...grupales].flatMap((r) => (r.userId && r.userId !== ownerId ? [{ userId: r.userId, titulo: r.titulo }] : []))
  return { listId: lista.id, evento, regalos }
}
