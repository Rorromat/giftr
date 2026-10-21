import { and, asc, desc, eq, gt, gte, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { claims, groupGiftMembers, groupGifts, groupGiftSacados, guestIdentities, items, listFollows, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { desdeQueOcupa, loQueYaTiene, RESERVA_DIAS, reserveItem, vencimientoDeReserva, type ReserveResult } from '@/lib/claims'
import { desdeElUltimoEvento, eventoDeLista, hoyLocal, inicioDelDia } from '@/lib/events'
import { esOFueDuenoDeLista, esUuid, noEsNiFueDuenoSql } from '@/lib/groups'
import { dividir } from '@/lib/pesos'
import { accesoALista } from '@/lib/acceso'
import { dejarAviso } from '@/lib/notifications'

export { dividir, parsePesos, pesos } from '@/lib/pesos'

// Regalo grupal, a lo Splitwise: un encargado reserva el deseo y los demás se suman.
// El encargado lo compra, pone cuánto salió y lo reparte; cada uno le debe su parte hasta que le paga.
// Regla de la sorpresa: los dueños de la lista (también uno que salió del grupo) no pueden armarlo ni sumarse, y nada de
// esto llega a sus vistas.

export const MONTO_MAXIMO = 100_000_000

const DIA = 86400_000

type Persona = { id: string; nombre: string }

export type MiembroView = {
  userId: string
  nombre: string
  esEncargado: boolean
  esYo: boolean
  /** Solo para los que están en el regalo: los montos son cosa de ellos. */
  monto: number | null
  pagado: boolean
}

export type RegaloView = {
  id: string
  estado: 'abierto' | 'comprado'
  encargado: Persona
  miembros: MiembroView[] // el encargado primero, después por orden de llegada
  soyParte: boolean
  soyEncargado: boolean
  montoTotal: number | null
  /** El encargado todavía puede corregir la compra (ver corregirCompra). */
  corregible: boolean
  /** Solo para el encargado y mientras está abierto: a quiénes sacó (los puede dejar volver). */
  sacados: Persona[]
  /** Al que mira lo sacó el encargado de este regalo, que sigue abierto: no se le ofrece "Me sumo". */
  meSacaron: boolean
}

export type IniciarResult = { ok: true; giftId: string } | Exclude<ReserveResult, { ok: true }> | { ok: false; reason: 'ya_comprado' }

/**
 * Arma un regalo grupal sobre un deseo: el usuario queda de encargado.
 * Si ya lo tenía reservado solo, convierte esa reserva (y deja de vencer: mientras no se sume nadie, se le recuerda cerrarlo
 * cuando la reserva habría vencido, ver cuandoRecordar); si no, lo reserva.
 * Si ya está en un regalo abierto de este deseo (un doble toque, la lista y el detalle abiertos a la vez), es ese.
 */
export async function iniciarRegaloGrupal(db: Db, itemId: string, userId: string): Promise<IniciarResult> {
  return db.transaction(async (tx): Promise<IniciarResult> => {
    const t = tx as unknown as Db
    // lock del deseo (como reserveItem): si a la vez se une al grupo, uno de los dos espera al otro
    const [item] = await t.select({ id: items.id, listId: items.listId, tipo: items.tipo, repetible: items.repetible, estado: items.estadoDueno })
      .from(items).where(eq(items.id, itemId)).for('update')
    if (!item) return { ok: false, reason: 'no_existe' }
    if (await esOFueDuenoDeLista(t, item.listId, userId)) return { ok: false, reason: 'propio' }
    if (item.estado !== 'activo') return { ok: false, reason: 'archivado' }
    // Una persona, una reserva por deseo (lo mismo que mira reserveItem): si ya lo compró (suelto o en otro regalo), no
    // arma otro encima.
    const ya = await loQueYaTiene(t, item, { userId })
    if (ya?.giftId) return ya.estado === 'reservado' ? { ok: true, giftId: ya.giftId } : { ok: false, reason: 'ya_comprado' }
    if (ya && ya.estado !== 'reservado') return { ok: false, reason: 'ya_comprado' }
    let claimId = ya?.claimId
    if (claimId) {
      await t.update(claims).set({ expiresAt: null, updatedAt: new Date() }).where(eq(claims.id, claimId))
    } else {
      const r = await reserveItem(t, itemId, { userId }, { sinVencimiento: true })
      if (!r.ok) return r
      claimId = r.claimId
    }
    const [gift] = await t.insert(groupGifts).values({ itemId, claimId, organizerUserId: userId }).returning({ id: groupGifts.id })
    await t.insert(groupGiftMembers).values({ giftId: gift.id, userId })
    return { ok: true, giftId: gift.id }
  })
}

/**
 * "Me sumo", mientras está abierto. Una persona, una reserva por deseo (como reserveItem e iniciarRegaloGrupal): el que ya
 * lo reservó o compró suelto, o está en otro regalo de este deseo, no se suma (la pantalla no se lo ofrece: le dice por qué).
 * Al que sacó el encargado tampoco, hasta que lo deje volver (ver sacarDeRegalo).
 */
export async function sumarseARegalo(db: Db, giftId: string, userId: string): Promise<boolean> {
  if (!esUuid(giftId)) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [regalo] = await t.select({ itemId: groupGifts.itemId }).from(groupGifts).where(eq(groupGifts.id, giftId))
    if (!regalo) return false
    // Lock del deseo y después del regalo, en el mismo orden que unirseAGrupo: si a la vez se une al grupo, uno espera al
    // otro. El del regalo solo no alcanza: unirseAGrupo encuentra los regalos por sus miembros y no vería esta fila sin
    // confirmar, así que no esperaría. El del regalo hace esperar a una compra que llega a la vez (o a la compra).
    const [item] = await t.select({ id: items.id, listId: items.listId, tipo: items.tipo, repetible: items.repetible, estado: items.estadoDueno })
      .from(items).where(eq(items.id, regalo.itemId)).for('update')
    const [g] = await t.select({ estado: groupGifts.estado }).from(groupGifts).where(eq(groupGifts.id, giftId)).for('update')
    // con "Ya lo tengo" el regalo sigue abierto para terminarlo, pero desde una pantalla vieja nadie se suma a algo que salió
    if (item?.estado !== 'activo' || g?.estado !== 'abierto') return false
    if (await esOFueDuenoDeLista(t, item.listId, userId)) return false
    const [sacado] = await t.select({ userId: groupGiftSacados.userId }).from(groupGiftSacados)
      .where(and(eq(groupGiftSacados.giftId, giftId), eq(groupGiftSacados.userId, userId)))
    if (sacado) return false
    const ya = await loQueYaTiene(t, item, { userId })
    if (ya && ya.giftId !== giftId) return false
    await t.insert(groupGiftMembers).values({ giftId, userId }).onConflictDoNothing()
    return true
  })
}

/**
 * Lock del deseo de un regalo, antes que el del regalo: el mismo orden que reserveItem, sumarseARegalo, unirseAGrupo y
 * archiveItem. Lo que deja un aviso también toca el deseo (la FK de notifications lo bloquea para compartir), y en el orden
 * inverso se trabaría con uno de esos que llega a la vez. Devuelve el id del deseo, o null si el regalo no existe.
 */
async function lockDeseoDelRegalo(t: Db, giftId: string): Promise<string | null> {
  const [regalo] = await t.select({ itemId: groupGifts.itemId }).from(groupGifts).where(eq(groupGifts.id, giftId))
  if (!regalo) return null
  await t.select({ id: items.id }).from(items).where(eq(items.id, regalo.itemId)).for('update')
  return regalo.itemId
}

/** Bajarse mientras está abierto. El encargado no se baja: cancela. */
export async function salirDeRegalo(db: Db, giftId: string, userId: string): Promise<boolean> {
  if (!esUuid(giftId)) return false
  return db.transaction(async (tx) => {
    // lock del regalo: si a la vez le pasan el encargo (unirseAGrupo), o espera y ya es encargado, o se baja antes y el
    // encargo pasa a otro; nunca queda de encargado sin estar en el regalo
    const [g] = await tx.select({ id: groupGifts.id }).from(groupGifts)
      .where(and(eq(groupGifts.id, giftId), eq(groupGifts.estado, 'abierto'), ne(groupGifts.organizerUserId, userId)))
      .for('update')
    if (!g) return false
    const borrados = await tx.delete(groupGiftMembers)
      .where(and(eq(groupGiftMembers.giftId, giftId), eq(groupGiftMembers.userId, userId)))
      .returning({ userId: groupGiftMembers.userId })
    return borrados.length > 0
  })
}

/**
 * El encargado saca a alguien mientras está abierto (se sumó por error, o no lo conoce): sumarse es un toque y sin
 * aprobación, así que esto lo corrige. Al que sacan se le avisa, y no se vuelve a sumar solo: si no, el que se sumó por
 * curiosidad vuelve con otro toque y ve los montos al comprarse. Ya comprado, no: tiene su parte (se corrige la compra).
 */
export async function sacarDeRegalo(db: Db, giftId: string, miembroId: string, encargadoId: string): Promise<boolean> {
  if (!esUuid(giftId) || !esUuid(miembroId) || miembroId === encargadoId) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const itemId = await lockDeseoDelRegalo(t, giftId)
    if (!itemId) return false
    // lock del regalo, como salirDeRegalo: una compra a la vez divide sin él, o espera y ya no está abierto
    const [g] = await t.select({ id: groupGifts.id }).from(groupGifts)
      .where(and(eq(groupGifts.id, giftId), eq(groupGifts.organizerUserId, encargadoId), eq(groupGifts.estado, 'abierto')))
      .for('update')
    if (!g) return false
    const sacados = await t.delete(groupGiftMembers)
      .where(and(eq(groupGiftMembers.giftId, giftId), eq(groupGiftMembers.userId, miembroId)))
      .returning({ userId: groupGiftMembers.userId })
    if (!sacados.length) return false
    await t.insert(groupGiftSacados).values({ giftId, userId: miembroId }).onConflictDoNothing()
    await dejarAviso(t, itemId, 'regalo_sacado', [{ userId: miembroId, guestId: null }])
    return true
  })
}

/** El encargado deja volver a alguien que sacó (fue sin querer, o ya lo hablaron): vuelve a poder tocar "Me sumo". */
export async function dejarVolverARegalo(db: Db, giftId: string, miembroId: string, encargadoId: string): Promise<boolean> {
  if (!esUuid(giftId) || !esUuid(miembroId)) return false
  const suyo = db.select({ id: groupGifts.id }).from(groupGifts)
    .where(and(eq(groupGifts.id, giftId), eq(groupGifts.organizerUserId, encargadoId), eq(groupGifts.estado, 'abierto')))
  const borrados = await db.delete(groupGiftSacados)
    .where(and(eq(groupGiftSacados.giftId, giftId), eq(groupGiftSacados.userId, miembroId), inArray(groupGiftSacados.giftId, suyo)))
    .returning({ userId: groupGiftSacados.userId })
  return borrados.length > 0
}

/**
 * Solo el encargado y mientras está abierto: libera el deseo para que lo reserve otro (también si antes era su reserva).
 * A los que se habían sumado se les avisa: si no, el regalo les desaparece de "En curso" sin explicación.
 */
export async function cancelarRegalo(db: Db, giftId: string, userId: string): Promise<boolean> {
  if (!esUuid(giftId)) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // el aviso de abajo toca el deseo: primero su lock, como comprarRegalo (si no, con el encargado en dos pestañas se traban)
    if (!(await lockDeseoDelRegalo(t, giftId))) return false
    const [g] = await t.update(groupGifts).set({ estado: 'cancelado' })
      .where(and(eq(groupGifts.id, giftId), eq(groupGifts.organizerUserId, userId), eq(groupGifts.estado, 'abierto')))
      .returning({ claimId: groupGifts.claimId, itemId: groupGifts.itemId })
    if (!g) return false
    await t.update(claims).set({ estado: 'liberado', updatedAt: new Date() }).where(eq(claims.id, g.claimId))
    const estaban = await t.select({ userId: groupGiftMembers.userId }).from(groupGiftMembers)
      .where(and(eq(groupGiftMembers.giftId, giftId), ne(groupGiftMembers.userId, userId)))
    await dejarAviso(t, g.itemId, 'regalo_cancelado', estaban.map((m) => ({ userId: m.userId, guestId: null })))
    return true
  })
}

/**
 * cambiaron: se sumó o se bajó alguien desde que el encargado vio la división. ya_pagaron, nada_que_corregir, de_la_lista:
 * ver corregirCompra.
 */
export type CompraResult =
  | { ok: true }
  | { ok: false; reason: 'no_permitido' | 'monto_invalido' | 'no_suma' | 'cambiaron' | 'ya_pagaron' | 'nada_que_corregir' }
  | { ok: false; reason: 'de_la_lista'; nombre: string; monto: number }

/**
 * Lo que cargó el encargado. miembros: con quiénes vio la división (los ids de la pantalla). partes: "A mano"; si no,
 * partes iguales.
 */
export type DatosCompra = { total: number; miembros?: string[]; partes?: Record<string, number>; nota?: string }

const montoValido = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= MONTO_MAXIMO

type Parte = { userId: string; monto: number | null; pagado: boolean }

/** Alguien que no es el encargado ya figura como pago. Las partes en 0 no cuentan: quedan pagas solas al comprar. */
const alguienPago = (filas: Parte[], encargado: string) => filas.some((f) => f.userId !== encargado && f.pagado && (f.monto ?? 0) > 0)

/** Cuántos días después de comprarlo se corrige un regalo en el que los demás quedaron en 0 (ver sePuedeCorregir). */
const CORREGIR_EN_CERO_DIAS = 30

/**
 * Lo que se puede corregir (ver corregirCompra): con alguien más en el regalo y nadie que le haya pagado, mientras alguien
 * le debe, o en el primer mes si los demás quedaron en 0. Ese mes es para el error al cargarla (borrar la parte de otro),
 * que si no quedaría fijo para siempre. Después, sin deudas no hay qué corregir: "Lo que compraste" no se queda para
 * siempre en Cuentas, y una parte en 0 que figuraba saldada no se vuelve deuda meses después. Si lo compró solo, no: no
 * hay división que arreglar.
 */
function sePuedeCorregir(filas: Parte[], encargado: string, compradoAt: Date | null) {
  const otros = filas.filter((f) => f.userId !== encargado)
  if (!otros.length || alguienPago(filas, encargado)) return false
  const reciente = !!compradoAt && Date.now() - compradoAt.getTime() < CORREGIR_EN_CERO_DIAS * DIA
  return reciente || otros.some((f) => !f.pagado && (f.monto ?? 0) > 0)
}

/**
 * Cuánto pone cada uno (ids: el encargado primero y después por orden de llegada, como en la pantalla). Si la gente no es
 * la que vio el encargado, que revise la división: en partes iguales se cobraría una parte que nadie confirmó.
 */
function repartir(ids: string[], p: DatosCompra): { ok: true; montos: number[] } | Exclude<CompraResult, { ok: true }> {
  if (p.miembros && (p.miembros.length !== ids.length || !ids.every((id) => p.miembros!.includes(id)))) return { ok: false, reason: 'cambiaron' }
  if (!p.partes) return { ok: true, montos: dividir(p.total, ids.length) }
  const partes = p.partes
  if (Object.keys(partes).length !== ids.length || !ids.every((id) => Object.hasOwn(partes, id))) return { ok: false, reason: 'no_permitido' }
  const montos = ids.map((id) => partes[id])
  if (montos.some((m) => !Number.isSafeInteger(m) || m < 0)) return { ok: false, reason: 'monto_invalido' }
  if (montos.reduce((a, b) => a + b, 0) !== p.total) return { ok: false, reason: 'no_suma' }
  return { ok: true, montos }
}

/** La parte de cada uno. La del encargado ya está paga (la puso él) y una en 0 no se debe. */
async function fijarPartes(t: Db, giftId: string, encargado: string, ids: string[], montos: number[]) {
  const ahora = new Date()
  for (const [i, id] of ids.entries()) {
    const saldado = id === encargado || montos[i] === 0
    await t.update(groupGiftMembers).set({ monto: montos[i], pagado: saldado, pagadoAt: saldado ? ahora : null })
      .where(and(eq(groupGiftMembers.giftId, giftId), eq(groupGiftMembers.userId, id)))
  }
}

const encargadoPrimero = (filas: { userId: string }[], encargado: string) =>
  [encargado, ...filas.map((f) => f.userId).filter((id) => id !== encargado)]

/**
 * El encargado lo compró: fija el total y la parte de cada uno (por defecto, partes iguales), entre los que vio en la
 * pantalla. Las partes tienen que sumar el total.
 */
export async function comprarRegalo(db: Db, giftId: string, userId: string, p: DatosCompra): Promise<CompraResult> {
  if (!montoValido(p.total)) return { ok: false, reason: 'monto_invalido' }
  if (!esUuid(giftId)) return { ok: false, reason: 'no_permitido' }
  return db.transaction(async (tx): Promise<CompraResult> => {
    const t = tx as unknown as Db
    // Lock del deseo y después del regalo, como sumarseARegalo. El del regalo: sumarse, bajarse o que lo saquen esperan a
    // la compra (y ya no está abierto), o la compra a ellos y divide entre los que quedaron. El del deseo: si a la vez lo
    // sacan de la lista, archivar ve el regalo comprado y no lo cancela.
    if (!(await lockDeseoDelRegalo(t, giftId))) return { ok: false, reason: 'no_permitido' }
    const [g] = await t.select().from(groupGifts)
      .where(and(eq(groupGifts.id, giftId), eq(groupGifts.organizerUserId, userId), eq(groupGifts.estado, 'abierto')))
      .for('update')
    if (!g) return { ok: false, reason: 'no_permitido' }
    const filas = await t.select({ userId: groupGiftMembers.userId }).from(groupGiftMembers)
      .where(eq(groupGiftMembers.giftId, giftId)).orderBy(asc(groupGiftMembers.createdAt))
    const ids = encargadoPrimero(filas, userId)
    const r = repartir(ids, p)
    if (!r.ok) return r

    const ahora = new Date()
    await fijarPartes(t, giftId, userId, ids, r.montos)
    await t.update(groupGifts).set({ estado: 'comprado', montoTotal: p.total, compradoAt: ahora }).where(eq(groupGifts.id, giftId))
    await t.update(claims).set({ estado: 'comprado', notaQueCompre: p.nota ?? null, updatedAt: ahora }).where(eq(claims.id, g.claimId))
    return { ok: true }
  })
}

/**
 * "Corregir la compra": el encargado cambia el total o las partes de un regalo ya comprado (un cero de más, el precio de
 * la lista que no era el que pagó), mientras nadie más que él figura como pago (ver sePuedeCorregir). Si alguien ya pagó,
 * cambiarle la parte pisaría eso: primero se deshace el pago. Al que le cambia la parte se le avisa: es su deuda. Al que
 * después se sumó a la lista (el grupo) no se le cambia: ya no ve el regalo, ni el aviso, ni Cuentas, y sería armarle una
 * deuda en silencio (de_la_lista, con su nombre y su parte para dejársela). La fecha de la compra queda (la usan Cuentas,
 * el historial y el deseo).
 */
export async function corregirCompra(db: Db, giftId: string, userId: string, p: DatosCompra): Promise<CompraResult> {
  if (!montoValido(p.total)) return { ok: false, reason: 'monto_invalido' }
  if (!esUuid(giftId)) return { ok: false, reason: 'no_permitido' }
  return db.transaction(async (tx): Promise<CompraResult> => {
    const t = tx as unknown as Db
    // el aviso de abajo toca el deseo: primero su lock, como comprarRegalo
    const itemId = await lockDeseoDelRegalo(t, giftId)
    if (!itemId) return { ok: false, reason: 'no_permitido' }
    const [g] = await t.select({ claimId: groupGifts.claimId, listId: items.listId, compradoAt: groupGifts.compradoAt }).from(groupGifts)
      .innerJoin(items, eq(groupGifts.itemId, items.id))
      .where(and(eq(groupGifts.id, giftId), eq(groupGifts.organizerUserId, userId), eq(groupGifts.estado, 'comprado')))
      .for('update', { of: groupGifts })
    // si después se sumó al grupo de esa lista ya no ve el regalo (ver enCuentasDe): tampoco lo toca
    if (!g || (await esOFueDuenoDeLista(t, g.listId, userId))) return { ok: false, reason: 'no_permitido' }
    // Con lock: un "Ya le pagué" a la vez, o se ve acá, o espera y no marca una parte que cambió (ver marcarPagado)
    const filas = await t.select({ userId: groupGiftMembers.userId, monto: groupGiftMembers.monto, pagado: groupGiftMembers.pagado })
      .from(groupGiftMembers).where(eq(groupGiftMembers.giftId, giftId)).orderBy(asc(groupGiftMembers.createdAt))
      .for('update')
    if (alguienPago(filas, userId)) return { ok: false, reason: 'ya_pagaron' }
    if (!sePuedeCorregir(filas, userId, g.compradoAt)) return { ok: false, reason: 'nada_que_corregir' }
    const ids = encargadoPrimero(filas, userId)
    const r = repartir(ids, p)
    if (!r.ok) return r
    const antes = new Map(filas.map((f) => [f.userId, f.monto ?? 0]))
    const cambiaron = ids.filter((id, i) => id !== userId && antes.get(id) !== r.montos[i])
    for (const id of cambiaron) {
      if (!(await esOFueDuenoDeLista(t, g.listId, id))) continue
      const [u] = await t.select({ nombre: users.nombre }).from(users).where(eq(users.id, id))
      return { ok: false, reason: 'de_la_lista', nombre: u?.nombre ?? 'Alguien', monto: antes.get(id) ?? 0 }
    }

    await fijarPartes(t, giftId, userId, ids, r.montos)
    await t.update(groupGifts).set({ montoTotal: p.total }).where(eq(groupGifts.id, giftId))
    await t.update(claims).set({ notaQueCompre: p.nota ?? null }).where(eq(claims.id, g.claimId))
    await dejarAviso(t, itemId, 'compra_corregida', cambiaron.map((id) => ({ userId: id, guestId: null })))
    return { ok: true }
  })
}

/**
 * "Ya le pagué" (lo marca quien debe) o "Me pagó" (lo marca el encargado). Se puede deshacer. visto: la parte que mostraba
 * la pantalla. Si justo el encargado la corrigió, el UPDATE espera a la corrección y no marca paga una parte que el que
 * paga no vio (la pantalla vuelve con la nueva).
 */
export async function marcarPagado(db: Db, giftId: string, deudorId: string, actorId: string, pagado = true, visto?: number): Promise<boolean> {
  if (!esUuid(giftId) || !esUuid(deudorId)) return false
  // visto viene del formulario: una parte es un entero entre 0 y MONTO_MAXIMO, y otro número (fuera de lo que entra en la
  // columna) haría fallar la consulta
  if (visto !== undefined && !(Number.isSafeInteger(visto) && visto >= 0 && visto <= MONTO_MAXIMO)) return false
  const [g] = await db.select({ encargado: groupGifts.organizerUserId }).from(groupGifts)
    .where(and(eq(groupGifts.id, giftId), eq(groupGifts.estado, 'comprado')))
  if (!g || deudorId === g.encargado || (actorId !== g.encargado && actorId !== deudorId)) return false
  const filas = await db.update(groupGiftMembers).set({ pagado, pagadoAt: pagado ? new Date() : null })
    .where(and(eq(groupGiftMembers.giftId, giftId), eq(groupGiftMembers.userId, deudorId),
      pagado && visto !== undefined ? eq(groupGiftMembers.monto, visto) : undefined))
    .returning({ userId: groupGiftMembers.userId })
  return filas.length > 0
}

/**
 * Los regalos comprados que entran en Cuentas de userId (en una consulta con join a items y lists): los de listas de las
 * que no es ni fue dueño. Si te sumaste a un grupo después, no te enterás. Saldar usa exactamente lo mismo.
 */
const enCuentasDe = (db: Db, userId: string) => and(eq(groupGifts.estado, 'comprado'), noEsNiFueDuenoSql(db, userId))

/**
 * Saldar todo con alguien: marca pagadas las deudas pendientes entre los dos, en las dos direcciones. Solo las que Cuentas
 * le muestra al que toca el botón (el monto del botón): nunca una que no ve, como la de un regalo de un grupo al que se
 * sumó después. Esa la sigue viendo el otro, que la puede saldar desde su lado.
 * visto: el neto del botón (positivo, te debe). Si cambió (justo corrigieron una compra), no salda nada: la pantalla
 * vuelve con el de ahora. Si es el mismo, saldar las partes nuevas da lo mismo que lo que se pagó.
 */
export async function saldarCon(db: Db, userId: string, otroId: string, visto?: number): Promise<number> {
  if (userId === otroId || !esUuid(otroId)) return 0
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const deEncargado = (encargado: string) => t.select({ id: groupGifts.id }).from(groupGifts)
      .innerJoin(items, eq(groupGifts.itemId, items.id))
      .innerJoin(lists, eq(items.listId, lists.id))
      .where(and(eq(groupGifts.organizerUserId, encargado), enCuentasDe(t, userId)))
    // Con lock y en orden: una corrección a la vez (corregirCompra) o espera, o ya se ve acá con las partes nuevas.
    const filas = await t.select({ giftId: groupGiftMembers.giftId, userId: groupGiftMembers.userId, monto: groupGiftMembers.monto })
      .from(groupGiftMembers)
      // las partes en 0 no se muestran (ya quedan pagas al comprar)
      .where(and(eq(groupGiftMembers.pagado, false), gt(groupGiftMembers.monto, 0), or(
        and(eq(groupGiftMembers.userId, userId), inArray(groupGiftMembers.giftId, deEncargado(otroId))),
        and(eq(groupGiftMembers.userId, otroId), inArray(groupGiftMembers.giftId, deEncargado(userId))),
      )))
      .orderBy(asc(groupGiftMembers.giftId), asc(groupGiftMembers.userId))
      .for('update')
    const neto = filas.reduce((s, f) => s + (f.userId === otroId ? 1 : -1) * (f.monto ?? 0), 0)
    if (!filas.length || (visto !== undefined && neto !== visto)) return 0
    // estas filas y no las que cumplan el filtro ahora: una compra que se cerró recién no estaba en el botón
    await t.update(groupGiftMembers).set({ pagado: true, pagadoAt: new Date() })
      .where(or(...filas.map((f) => and(eq(groupGiftMembers.giftId, f.giftId), eq(groupGiftMembers.userId, f.userId)))))
    return filas.length
  })
}

/** Los regalos grupales vigentes de un deseo, para quien regala. Al dueño y a quien no ve la capa oculta (ver accesoALista) les devuelve []. */
export async function regalosDeItem(db: Db, itemId: string, viewer: Viewer): Promise<RegaloView[]> {
  const [item] = await db.select({ listId: items.listId, tipo: items.tipo, repetible: items.repetible }).from(items).where(eq(items.id, itemId))
  if (!item || (await accesoALista(db, item.listId, viewer)) !== 'regalador') return []
  // En una idea que se puede repetir, uno comprado para un evento anterior ya se regaló: no se muestra, como en la lista
  // y al reservar (ver ocupaSql). Lo comprado se anota en su reserva.
  const desde = await desdeQueOcupa(db, item)
  const regalos = await db.select({ gift: groupGifts, nombre: users.nombre })
    .from(groupGifts).innerJoin(users, eq(groupGifts.organizerUserId, users.id))
    .innerJoin(claims, eq(groupGifts.claimId, claims.id))
    .where(and(
      eq(groupGifts.itemId, itemId), inArray(groupGifts.estado, ['abierto', 'comprado']),
      desde ? or(eq(groupGifts.estado, 'abierto'), gte(claims.updatedAt, desde)) : undefined,
    ))
    .orderBy(asc(groupGifts.createdAt))
  if (!regalos.length) return []
  const ids = regalos.map((r) => r.gift.id)
  const miembros = await db.select({ m: groupGiftMembers, nombre: users.nombre })
    .from(groupGiftMembers).innerJoin(users, eq(groupGiftMembers.userId, users.id))
    .where(inArray(groupGiftMembers.giftId, ids))
    .orderBy(asc(groupGiftMembers.createdAt))
  const sacados = await db.select({ giftId: groupGiftSacados.giftId, id: users.id, nombre: users.nombre })
    .from(groupGiftSacados).innerJoin(users, eq(groupGiftSacados.userId, users.id))
    .where(inArray(groupGiftSacados.giftId, ids))
    .orderBy(asc(groupGiftSacados.createdAt))

  return regalos.map(({ gift, nombre }) => {
    const suyos = miembros.filter((x) => x.m.giftId === gift.id)
      .sort((a, b) => Number(b.m.userId === gift.organizerUserId) - Number(a.m.userId === gift.organizerUserId))
    const soyParte = !!viewer.userId && suyos.some((x) => x.m.userId === viewer.userId)
    const soyEncargado = viewer.userId === gift.organizerUserId
    const abierto = gift.estado === 'abierto'
    const fuera = abierto ? sacados.filter((x) => x.giftId === gift.id) : []
    return {
      id: gift.id,
      estado: gift.estado as 'abierto' | 'comprado',
      encargado: { id: gift.organizerUserId, nombre },
      soyParte,
      soyEncargado,
      montoTotal: soyParte ? gift.montoTotal : null,
      corregible: soyEncargado && gift.estado === 'comprado' && sePuedeCorregir(suyos.map((x) => x.m), gift.organizerUserId, gift.compradoAt),
      sacados: soyEncargado ? fuera.map(({ id, nombre }) => ({ id, nombre })) : [],
      meSacaron: !!viewer.userId && fuera.some((x) => x.id === viewer.userId),
      miembros: suyos.map((x) => ({
        userId: x.m.userId, nombre: x.nombre,
        esEncargado: x.m.userId === gift.organizerUserId,
        esYo: x.m.userId === viewer.userId,
        monto: soyParte ? x.m.monto : null,
        pagado: soyParte && x.m.pagado,
      })),
    }
  })
}

// ---------- Cuentas: a quién le debés y quién te debe ----------

export type LineaCuenta = {
  giftId: string
  itemTitulo: string
  para: string
  /** null: cambiaron el link para regalar y no lo tiene (ver columnasDestino). */
  href: string | null
  monto: number
  /** debes: vos le debés al encargado. te_deben: sos el encargado y el otro te debe. */
  tipo: 'debes' | 'te_deben'
  deudorId: string
  fecha: Date
}

export type CuentaPersona = Persona & {
  /** Positivo: te debe. Negativo: le debés. */
  neto: number
  lineas: LineaCuenta[]
}

export type RegaloEnCurso = {
  giftId: string; itemTitulo: string; para: string; href: string | null; encargado: string; soyEncargado: boolean; personas: string[]
  /** false si el dueño lo sacó de su lista ("Ya lo tengo"): el encargado lo compra o lo cancela desde Cuentas. */
  sigueEnLaLista: boolean
  /**
   * Solo para el encargado que no lo puede terminar en el deseo (salió de la lista, o cambiaron el link y no lo tiene):
   * con quiénes dividir la compra, que hace desde Cuentas. El encargado primero y después por orden de llegada, como en
   * comprarRegalo.
   */
  dividirCon: { userId: string; nombre: string; esYo: boolean }[] | null
  /** Con dividirCon: a quiénes sacó (los puede dejar volver, como en el deseo). */
  sacados: Persona[]
}

export type Cuentas = {
  debes: number
  teDeben: number
  personas: CuentaPersona[]
  enCurso: RegaloEnCurso[]
  saldadas: (LineaCuenta & { con: string })[]
}

const encargados = alias(users, 'encargados')
const deudores = alias(users, 'deudores')
const duenosPersonales = alias(users, 'duenos_personales')

type Destino = {
  tipo: 'personal' | 'grupo'; listaNombre: string | null; duenoNombre: string | null; shareToken: string; itemId: string
  activo: boolean; tieneElLink: boolean
}

function destino(r: Destino, conLink = r.tieneElLink) {
  return {
    para: r.tipo === 'grupo' ? r.listaNombre ?? 'Grupo' : r.duenoNombre ?? 'Alguien',
    href: !conLink ? null : r.activo ? `/l/${r.shareToken}/item/${r.itemId}` : `/l/${r.shareToken}`,
  }
}

/**
 * Para qué deseo y lista es cada línea. Si cambiaron el link para regalar, el nuevo solo va en las líneas de quien sigue
 * la lista (la abrió con ese link): un regalo de antes no se lo pasa a alguien al que justo se lo quisieron sacar.
 */
const columnasDestino = (db: Db, userId: string) => ({
  tipo: lists.tipo, listaNombre: lists.nombre, duenoNombre: duenosPersonales.nombre, shareToken: lists.shareToken,
  itemId: items.id, itemTitulo: items.titulo, activo: sql<boolean>`${items.estadoDueno} = 'activo'`,
  tieneElLink: sql<boolean>`${or(isNull(lists.shareTokenAt),
    inArray(lists.id, db.select({ id: listFollows.listId }).from(listFollows).where(eq(listFollows.userId, userId))))}`,
})

/**
 * Todo junto: cuánto debés, cuánto te deben, el neto con cada persona y los regalos en curso.
 * Deja afuera los regalos de listas de las que sos (o fuiste) dueño (ver enCuentasDe).
 */
export async function misCuentas(db: Db, userId: string): Promise<Cuentas> {
  const partes = await db.select({
    giftId: groupGifts.id, encargadoId: groupGifts.organizerUserId, encargadoNombre: encargados.nombre,
    deudorId: groupGiftMembers.userId, deudorNombre: deudores.nombre,
    monto: groupGiftMembers.monto, pagado: groupGiftMembers.pagado, pagadoAt: groupGiftMembers.pagadoAt,
    compradoAt: groupGifts.compradoAt, ...columnasDestino(db, userId),
  }).from(groupGiftMembers)
    .innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id))
    .innerJoin(encargados, eq(groupGifts.organizerUserId, encargados.id))
    .innerJoin(deudores, eq(groupGiftMembers.userId, deudores.id))
    .innerJoin(items, eq(groupGifts.itemId, items.id))
    .innerJoin(lists, eq(items.listId, lists.id))
    .leftJoin(duenosPersonales, eq(lists.ownerId, duenosPersonales.id))
    .where(and(
      enCuentasDe(db, userId),
      ne(groupGiftMembers.userId, groupGifts.organizerUserId),
      or(eq(groupGiftMembers.userId, userId), eq(groupGifts.organizerUserId, userId)),
    ))
    .orderBy(desc(groupGifts.compradoAt))

  const porPersona = new Map<string, CuentaPersona>()
  const saldadas: Cuentas['saldadas'] = []
  for (const r of partes) {
    const monto = r.monto ?? 0
    if (monto <= 0) continue
    const debo = r.deudorId === userId
    const otro = debo ? { id: r.encargadoId, nombre: r.encargadoNombre } : { id: r.deudorId, nombre: r.deudorNombre }
    const linea: LineaCuenta = {
      giftId: r.giftId, itemTitulo: r.itemTitulo, ...destino(r), monto,
      tipo: debo ? 'debes' : 'te_deben', deudorId: r.deudorId, fecha: r.compradoAt ?? new Date(0),
    }
    if (r.pagado) {
      saldadas.push({ ...linea, con: otro.nombre, fecha: r.pagadoAt ?? linea.fecha })
      continue
    }
    const persona = porPersona.get(otro.id) ?? { ...otro, neto: 0, lineas: [] }
    persona.neto += debo ? -monto : monto
    persona.lineas.push(linea)
    porPersona.set(otro.id, persona)
  }

  const abiertos = await db.select({
    giftId: groupGifts.id, encargadoId: groupGifts.organizerUserId, encargadoNombre: encargados.nombre, ...columnasDestino(db, userId),
  }).from(groupGiftMembers)
    .innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id))
    .innerJoin(encargados, eq(groupGifts.organizerUserId, encargados.id))
    .innerJoin(items, eq(groupGifts.itemId, items.id))
    .innerJoin(lists, eq(items.listId, lists.id))
    .leftJoin(duenosPersonales, eq(lists.ownerId, duenosPersonales.id))
    .where(and(eq(groupGiftMembers.userId, userId), eq(groupGifts.estado, 'abierto'), noEsNiFueDuenoSql(db, userId)))
    .orderBy(desc(groupGifts.createdAt))
  const nombres = abiertos.length
    ? await db.select({ giftId: groupGiftMembers.giftId, userId: users.id, nombre: users.nombre }).from(groupGiftMembers)
      .innerJoin(users, eq(groupGiftMembers.userId, users.id))
      .where(inArray(groupGiftMembers.giftId, abiertos.map((a) => a.giftId)))
      .orderBy(asc(groupGiftMembers.createdAt))
    : []
  const organizo = abiertos.filter((a) => a.encargadoId === userId).map((a) => a.giftId)
  const sacados = organizo.length
    ? await db.select({ giftId: groupGiftSacados.giftId, id: users.id, nombre: users.nombre }).from(groupGiftSacados)
      .innerJoin(users, eq(groupGiftSacados.userId, users.id))
      .where(inArray(groupGiftSacados.giftId, organizo))
      .orderBy(asc(groupGiftSacados.createdAt))
    : []

  // Los totales salen del neto con cada uno, como las tarjetas ("ya está descontado lo que se deben entre los dos"): si
  // Sofi te debe 30.000 y vos le debés 10.000, arriba no dice "Debés $10.000".
  const personas = [...porPersona.values()]
  return {
    debes: personas.reduce((s, p) => s + Math.max(0, -p.neto), 0),
    teDeben: personas.reduce((s, p) => s + Math.max(0, p.neto), 0),
    // primero a quien más le debés, después quien más te debe
    personas: personas.sort((a, b) => a.neto - b.neto),
    enCurso: abiertos.map((a) => {
      const miembros = nombres.filter((n) => n.giftId === a.giftId)
      // Sin el link tampoco para el encargado: con el nuevo volvería a abrir (y seguir) la lista que le quisieron cerrar.
      // Y si salió de la lista, el deseo ya no se abre. Lo compra o lo cancela desde Cuentas, así el regalo no queda trabado.
      const desdeCuentas = a.encargadoId === userId && (!a.activo || !a.tieneElLink)
      return {
        giftId: a.giftId, itemTitulo: a.itemTitulo, ...destino(a),
        encargado: a.encargadoNombre, soyEncargado: a.encargadoId === userId, sigueEnLaLista: a.activo,
        personas: miembros.map((n) => n.nombre),
        dividirCon: desdeCuentas
          ? [...miembros.filter((m) => m.userId === userId), ...miembros.filter((m) => m.userId !== userId)]
            .map((m) => ({ userId: m.userId, nombre: m.nombre, esYo: m.userId === userId }))
          : null,
        sacados: desdeCuentas ? sacados.filter((x) => x.giftId === a.giftId).map(({ id, nombre }) => ({ id, nombre })) : [],
      }
    }),
    saldadas: saldadas.sort((a, b) => b.fecha.getTime() - a.fecha.getTime()).slice(0, 10),
  }
}

export type CompraParaCorregir = {
  giftId: string; itemTitulo: string; para: string; total: number; nota: string | null
  /** El encargado primero y después por orden de llegada, como en comprarRegalo. */
  miembros: { userId: string; nombre: string; esYo: boolean; monto: number }[]
}

/**
 * Lo que compró en un regalo grupal y todavía puede corregir (ver sePuedeCorregir), cuando no lo puede hacer en el deseo:
 * lo sacaron de la lista (se lo dieron en el cumple y dijo "Ya lo tengo"), cambiaron el link y no lo tiene, o el deseo ya
 * no lo muestra (en una idea que se puede repetir, lo comprado para un evento anterior; ver regalosDeItem). Como dividirCon.
 */
export async function comprasParaCorregir(db: Db, userId: string): Promise<CompraParaCorregir[]> {
  const compras = await db.select({
    giftId: groupGifts.id, total: groupGifts.montoTotal, nota: claims.notaQueCompre, compradoEl: claims.updatedAt, compradoAt: groupGifts.compradoAt,
    listId: lists.id, tipoDeseo: items.tipo, repetible: items.repetible, ...columnasDestino(db, userId),
  }).from(groupGifts)
    .innerJoin(claims, eq(groupGifts.claimId, claims.id))
    .innerJoin(items, eq(groupGifts.itemId, items.id))
    .innerJoin(lists, eq(items.listId, lists.id))
    .leftJoin(duenosPersonales, eq(lists.ownerId, duenosPersonales.id))
    .where(and(
      eq(groupGifts.organizerUserId, userId), enCuentasDe(db, userId),
      // de entrada, solo las que alguien todavía le debe (la parte del encargado queda paga al comprar) o las del último mes
      or(
        inArray(groupGifts.id, db.select({ id: groupGiftMembers.giftId }).from(groupGiftMembers)
          .where(and(eq(groupGiftMembers.pagado, false), gt(groupGiftMembers.monto, 0)))),
        gt(groupGifts.compradoAt, new Date(Date.now() - CORREGIR_EN_CERO_DIAS * DIA)),
      ),
    ))
    .orderBy(desc(groupGifts.compradoAt))
  const lejos: typeof compras = []
  for (const c of compras) {
    const desde = c.activo && c.tieneElLink ? await desdeQueOcupa(db, { listId: c.listId, tipo: c.tipoDeseo, repetible: c.repetible }) : null
    if (!c.activo || !c.tieneElLink || (desde && c.compradoEl < desde)) lejos.push(c)
  }
  if (!lejos.length) return []
  const filas = await db.select({ m: groupGiftMembers, nombre: users.nombre }).from(groupGiftMembers)
    .innerJoin(users, eq(groupGiftMembers.userId, users.id))
    .where(inArray(groupGiftMembers.giftId, lejos.map((c) => c.giftId)))
    .orderBy(asc(groupGiftMembers.createdAt))
  return lejos.flatMap((c) => {
    const suyos = filas.filter((f) => f.m.giftId === c.giftId)
    if (!sePuedeCorregir(suyos.map((f) => f.m), userId, c.compradoAt)) return []
    return [{
      giftId: c.giftId, itemTitulo: c.itemTitulo, para: destino(c).para, total: c.total ?? 0, nota: c.nota,
      miembros: [...suyos.filter((f) => f.m.userId === userId), ...suyos.filter((f) => f.m.userId !== userId)]
        .map((f) => ({ userId: f.m.userId, nombre: f.nombre, esYo: f.m.userId === userId, monto: f.m.monto ?? 0 })),
    }]
  })
}

/** Lo más que espera el recordatorio a un evento lejano: después, "Sigue en pie" cada 2 semanas. */
const ESPERA_MAXIMA_DIAS = 6 * 7

/**
 * Cuándo recordarle al encargado que cierre un regalo abierto. Si dijo "Sigue en pie", a las 2 semanas de eso.
 * - Si no se sumó nadie, cuando una reserva suelta habría vencido (ver vencimientoDeReserva): es una reserva con otro
 *   nombre, y si no tendría el deseo meses sin que nadie le pregunte.
 * - Con gente, cerca del evento que viene después de armarlo (3 días antes, o ya, si pasó), pero no más de 6 semanas: uno
 *   armado en octubre para un casamiento en enero no lo molesta enseguida, y uno armado en marzo para el cumple de
 *   febrero no espera un año.
 * - Si se armó al poco de pasar el evento ("se nos pasó, armemos algo"), es de ese: a las 2 semanas, como sin fecha.
 * Nunca antes de 24 horas.
 */
async function cuandoRecordar(db: Db, listId: string, armado: Date, sigueEnPie: Date | null, conGente: boolean): Promise<Date> {
  if (sigueEnPie) return new Date(sigueEnPie.getTime() + RESERVA_DIAS * DIA)
  if (!conGente) return vencimientoDeReserva(db, listId, armado)
  const atrasado = armado.getTime() - (await desdeElUltimoEvento(db, listId, armado)).getTime() < RESERVA_DIAS * DIA
  const evento = atrasado ? null : await eventoDeLista(db, listId, hoyLocal(armado))
  const cuando = evento
    ? Math.min(inicioDelDia(evento.fecha).getTime() - 3 * DIA, armado.getTime() + ESPERA_MAXIMA_DIAS * DIA)
    : armado.getTime() + RESERVA_DIAS * DIA
  return new Date(Math.max(armado.getTime() + DIA, cuando))
}

/**
 * Los regalos grupales que organiza y siguen abiertos cuando ya toca recordárselo (ver cuandoRecordar): un cartel para que
 * lo compre y lo divida, lo cancele o diga que sigue en pie. No vencen solos: quizás ya lo compró y le falta cargarlo, y si
 * tienen gente adentro se perdería la coordinación. Al deseo; a Cuentas si desde ahí no se puede.
 */
export async function regalosParaCerrar(db: Db, userId: string): Promise<{ giftId: string; itemTitulo: string; href: string }[]> {
  const abiertos = await db.select({
    giftId: groupGifts.id, createdAt: groupGifts.createdAt, recordatorioAt: groupGifts.recordatorioAt, listId: lists.id,
    ...columnasDestino(db, userId),
  })
    .from(groupGifts)
    .innerJoin(items, eq(groupGifts.itemId, items.id))
    .innerJoin(lists, eq(items.listId, lists.id))
    .leftJoin(duenosPersonales, eq(lists.ownerId, duenosPersonales.id))
    .where(and(eq(groupGifts.organizerUserId, userId), eq(groupGifts.estado, 'abierto'), noEsNiFueDuenoSql(db, userId)))
    .orderBy(asc(groupGifts.createdAt))
  if (!abiertos.length) return []
  // en cuáles se sumó alguien más
  const conGente = new Set((await db.select({ giftId: groupGiftMembers.giftId }).from(groupGiftMembers)
    .where(and(inArray(groupGiftMembers.giftId, abiertos.map((a) => a.giftId)), ne(groupGiftMembers.userId, userId))))
    .map((m) => m.giftId))
  const ahora = new Date()
  const viejos: typeof abiertos = []
  for (const a of abiertos) {
    if (ahora >= (await cuandoRecordar(db, a.listId, a.createdAt, a.recordatorioAt, conGente.has(a.giftId)))) viejos.push(a)
  }
  return viejos.map((a) => ({
    giftId: a.giftId, itemTitulo: a.itemTitulo,
    href: a.activo && a.tieneElLink ? `/l/${a.shareToken}/item/${a.itemId}` : '/cuentas',
  }))
}

/** "Sigue en pie" en el recordatorio: el encargado no se olvidó, se lo vuelve a recordar en 2 semanas. */
export async function posponerRecordatorio(db: Db, giftId: string, userId: string): Promise<boolean> {
  if (!esUuid(giftId)) return false
  const filas = await db.update(groupGifts).set({ recordatorioAt: new Date() })
    .where(and(eq(groupGifts.id, giftId), eq(groupGifts.organizerUserId, userId), eq(groupGifts.estado, 'abierto')))
    .returning({ id: groupGifts.id })
  return filas.length > 0
}

// ---------- Historial: quién se ocupó de los regalos de una lista ----------

export type EntradaHistorial = {
  id: string
  listId: string
  titulo: string
  /** Quien lo compró (en un regalo grupal, el encargado). */
  encargado: string
  con: string[]
  grupal: boolean
  nota: string | null
  fecha: Date
}

export type Historial = {
  entradas: EntradaHistorial[]
  /** Cuántos regalos compró cada uno, de más a menos. */
  ranking: { nombre: string; cantidad: number; esYo: boolean }[]
}

// quien: con qué agrupar el ranking ("u:<id>" o "g:<id>"). Queda del lado del servidor: el id de un invitado
// es parte de su credencial y no puede llegar a la página (ni como key de React, que viaja en el HTML).
type Compra = { entrada: EntradaHistorial; quien: string }

async function comprasDeListas(db: Db, listIds: string[]): Promise<Compra[]> {
  if (!listIds.length) return []
  const sueltas = await db.select({
    id: claims.id, listId: items.listId, titulo: items.titulo, nota: claims.notaQueCompre, fecha: claims.updatedAt,
    userId: claims.claimerUserId, guestId: claims.claimerGuestId, userNombre: users.nombre, guestNombre: guestIdentities.nombre,
  }).from(claims)
    .innerJoin(items, eq(claims.itemId, items.id))
    .leftJoin(users, eq(claims.claimerUserId, users.id))
    .leftJoin(guestIdentities, eq(claims.claimerGuestId, guestIdentities.id))
    .where(and(inArray(items.listId, listIds), eq(claims.estado, 'comprado'),
      notInArray(claims.id, db.select({ id: groupGifts.claimId }).from(groupGifts))))

  const grupales = await db.select({
    id: groupGifts.id, listId: items.listId, titulo: items.titulo, nota: claims.notaQueCompre,
    fecha: groupGifts.compradoAt, encargadoId: groupGifts.organizerUserId, encargado: users.nombre,
  }).from(groupGifts)
    .innerJoin(items, eq(groupGifts.itemId, items.id))
    .innerJoin(claims, eq(groupGifts.claimId, claims.id))
    .innerJoin(users, eq(groupGifts.organizerUserId, users.id))
    .where(and(inArray(items.listId, listIds), eq(groupGifts.estado, 'comprado')))
  const miembros = grupales.length
    ? await db.select({ giftId: groupGiftMembers.giftId, userId: groupGiftMembers.userId, nombre: users.nombre })
      .from(groupGiftMembers).innerJoin(users, eq(groupGiftMembers.userId, users.id))
      .where(inArray(groupGiftMembers.giftId, grupales.map((g) => g.id)))
      .orderBy(asc(groupGiftMembers.createdAt))
    : []

  return [
    ...sueltas.map((s) => ({
      quien: s.userId ? `u:${s.userId}` : `g:${s.guestId}`,
      entrada: {
        id: s.id, listId: s.listId, titulo: s.titulo, nota: s.nota, fecha: s.fecha, grupal: false, con: [],
        encargado: s.userNombre ?? s.guestNombre ?? 'Alguien',
      },
    })),
    ...grupales.map((g) => ({
      quien: `u:${g.encargadoId}`,
      entrada: {
        id: g.id, listId: g.listId, titulo: g.titulo, nota: g.nota, fecha: g.fecha ?? new Date(0), grupal: true,
        encargado: g.encargado,
        con: miembros.filter((m) => m.giftId === g.id && m.userId !== g.encargadoId).map((m) => m.nombre),
      },
    })),
  ].sort((a, b) => b.entrada.fecha.getTime() - a.entrada.fecha.getTime())
}

/** Historial de regalos comprados de una lista, para quien regala con nombre. Null para sus dueños y para quien no ve la capa oculta. */
export async function historialDeLista(db: Db, listId: string, viewer: Viewer): Promise<Historial | null> {
  if ((await accesoALista(db, listId, viewer)) !== 'regalador') return null
  const compras = await comprasDeListas(db, [listId])
  const yo = viewer.userId ? `u:${viewer.userId}` : `g:${viewer.guestId}`
  const conteo = new Map<string, Historial['ranking'][number]>()
  for (const { entrada, quien } of compras) {
    const fila = conteo.get(quien) ?? { nombre: entrada.encargado, cantidad: 0, esYo: quien === yo }
    fila.cantidad++
    conteo.set(quien, fila)
  }
  return {
    entradas: compras.map((c) => c.entrada),
    ranking: [...conteo.values()].sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre)),
  }
}

/** El último regalo comprado de cada lista ajena ("El último lo compró Sofi"). Ignora las que son o fueron del usuario. */
export async function ultimosRegalos(db: Db, userId: string, listIds: string[]): Promise<Map<string, EntradaHistorial>> {
  const ajenas = listIds.length
    ? (await db.select({ id: lists.id }).from(lists).where(and(inArray(lists.id, listIds), noEsNiFueDuenoSql(db, userId)))).map((l) => l.id)
    : []
  const ultimos = new Map<string, EntradaHistorial>()
  for (const { entrada: e } of await comprasDeListas(db, ajenas)) if (!ultimos.has(e.listId)) ultimos.set(e.listId, e)
  return ultimos
}
