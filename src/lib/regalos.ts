import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { claims, groupGiftMembers, groupGifts, groupGiftSacados, guestIdentities, items, listFollows, lists, notifications, users } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import {
  desdeQueOcupa, expireStaleClaims, loQueYaTiene, noEsDeRegaloGrupal, ocupaSql, RESERVA_DIAS, reserveItem, vencimientoDeReserva, type ReserveResult,
} from '@/lib/claims'
import { desdeElUltimoEvento, eventoDeLista, hoyLocal, inicioDelDia } from '@/lib/events'
import { esOFueDuenoDeLista, esUuid, noEsNiFueDuenoSql } from '@/lib/groups'
import { dividir, type Moneda } from '@/lib/pesos'
import { notaDeCompra } from '@/lib/limites'
import { accesoALista } from '@/lib/acceso'
import { dejarAviso } from '@/lib/notifications'

export { dividir, parsePesos, pesos } from '@/lib/pesos'

// Regalo grupal, a lo Splitwise: un encargado reserva el deseo y los demás se suman.
// El encargado lo compra, pone cuánto salió y lo reparte; cada uno le debe su parte hasta que le paga.
// Ya comprado se puede seguir sumando (o bajando) gente: se vuelve a dividir (ver redividir), y lo que cada uno ya puso
// queda anotado, así que al que ahora le toca menos el encargado le devuelve la diferencia.
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
  /** Saldado: ni le debe al encargado ni el encargado le devuelve. */
  pagado: boolean
  /**
   * Para los que están: lo que le falta darle al encargado (positivo) o lo que el encargado le devuelve (negativo: pagó y
   * después se volvió a dividir entre más). El del encargado, 0.
   */
  saldo: number | null
  /** Para los que están: ya puso algo (no se baja ni lo sacan sin deshacer eso antes). */
  puso: boolean
}

export type RegaloView = {
  id: string
  estado: 'abierto' | 'comprado'
  encargado: Persona
  miembros: MiembroView[] // el encargado primero, después por orden de llegada
  soyParte: boolean
  soyEncargado: boolean
  montoTotal: number | null
  /** en qué se cuenta, si no son pesos (lo elige el encargado al comprarlo) */
  moneda?: Moneda
  /** El encargado todavía puede corregir la compra (ver corregirCompra). */
  corregible: boolean
  /** Solo para el encargado: a quiénes sacó (los puede dejar volver). */
  sacados: Persona[]
  /** Al que mira lo sacó el encargado de este regalo: no se le ofrece "Me sumo". */
  meSacaron: boolean
  /** Ya comprado, para el que no está: cuánto le tocaría si se suma (partes iguales); null si lo dividieron a mano. */
  parteSiTeSumas: number | null
}

/** La moneda de un regalo para lo que se muestra: nada si son pesos (lo de siempre), USD si son dólares. */
const enSuMoneda = (m: Moneda): Moneda | undefined => (m === 'ARS' ? undefined : m)

export type IniciarResult = { ok: true; giftId: string } | Exclude<ReserveResult, { ok: true }> | { ok: false; reason: 'ya_comprado' }

/**
 * Arma un regalo grupal sobre un deseo: el usuario queda de encargado.
 * Si ya lo tenía reservado solo, convierte esa reserva (y deja de vencer: mientras no se sume nadie, se le recuerda cerrarlo
 * cuando la reserva habría vencido, ver cuandoRecordar); si no, lo reserva.
 * Si ya está en un regalo abierto de este deseo (un doble toque, la lista y el detalle abiertos a la vez), es ese.
 */
export async function iniciarRegaloGrupal(db: Db, itemId: string, userId: string): Promise<IniciarResult> {
  if (!esUuid(itemId)) return { ok: false, reason: 'no_existe' }
  return db.transaction(async (tx): Promise<IniciarResult> => {
    const t = tx as unknown as Db
    // lock del deseo (como reserveItem): si a la vez se une al grupo, uno de los dos espera al otro
    const [item] = await t.select({ id: items.id, listId: items.listId, tipo: items.tipo, repetible: items.repetible, estado: items.estadoDueno })
      .from(items).where(eq(items.id, itemId)).for('update')
    if (!item) return { ok: false, reason: 'no_existe' }
    if (await esOFueDuenoDeLista(t, item.listId, userId)) return { ok: false, reason: 'propio' }
    if (item.estado !== 'activo') return { ok: false, reason: 'archivado' }
    // Una reserva propia que ya venció no se convierte (dejaría de vencer sin pasar por el tope de reservas): se reserva de
    // nuevo, como en reserveItem
    await expireStaleClaims(t, itemId)
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
 * "Me sumo": mientras está abierto, o ya comprado si es para el evento que viene ("sumame, después te pago": se vuelve a
 * dividir, ver redividir). Una persona, una reserva por deseo (como reserveItem e iniciarRegaloGrupal): el que ya lo
 * reservó o compró suelto, o está en otro regalo de este deseo, no se suma (la pantalla no se lo ofrece: le dice por qué).
 * Al que sacó el encargado tampoco, hasta que lo deje volver (ver sacarDeRegalo).
 * itemId: el deseo del link para regalar con el que llegó (ver joinGroupGiftAction); el regalo tiene que ser de ese deseo.
 */
export async function sumarseARegalo(db: Db, giftId: string, userId: string, itemId?: string): Promise<boolean> {
  if (!esUuid(giftId)) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [regalo] = await t.select({ itemId: groupGifts.itemId }).from(groupGifts).where(eq(groupGifts.id, giftId))
    if (!regalo || (itemId !== undefined && regalo.itemId !== itemId)) return false
    // Lock del deseo y después del regalo, en el mismo orden que unirseAGrupo: si a la vez se une al grupo, uno espera al
    // otro. El del regalo solo no alcanza: unirseAGrupo encuentra los regalos por sus miembros y no vería esta fila sin
    // confirmar, así que no esperaría. El del regalo hace esperar a una compra que llega a la vez (o a la compra).
    const [item] = await t.select({ id: items.id, listId: items.listId, tipo: items.tipo, repetible: items.repetible, estado: items.estadoDueno })
      .from(items).where(eq(items.id, regalo.itemId)).for('update')
    const [g] = await t.select().from(groupGifts).where(eq(groupGifts.id, giftId)).for('update')
    // con "Ya lo tengo" el regalo sigue abierto para terminarlo, pero desde una pantalla vieja nadie se suma a algo que salió
    if (item?.estado !== 'activo' || !g || !(await admiteGente(t, g))) return false
    if (await esOFueDuenoDeLista(t, item.listId, userId)) return false
    const [sacado] = await t.select({ userId: groupGiftSacados.userId }).from(groupGiftSacados)
      .where(and(eq(groupGiftSacados.giftId, giftId), eq(groupGiftSacados.userId, userId)))
    if (sacado) return false
    const ya = await loQueYaTiene(t, item, { userId })
    if (ya && ya.giftId !== giftId) return false
    if (g.estado === 'abierto') {
      await t.insert(groupGiftMembers).values({ giftId, userId }).onConflictDoNothing()
      return true
    }
    // ya está (un doble toque): no hay nada que volver a dividir
    if (ya) return true
    if (!(await sePuedeRedividir(t, g, item.listId))) return false
    const antes = await genteDelRegalo(t, giftId, g.organizerUserId)
    await t.insert(groupGiftMembers).values({ giftId, userId })
    await redividir(t, g, item.listId, antes, userId)
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

/**
 * Lo que se les dijo a los de un regalo que dejó de ser de ellos (se canceló, se bajaron, los sacaron) y ya no vale: que
 * seguía en Cuentas para dividirlo ("Ya lo tengo") o que ahora lo organizan ellos. Por persona y deseo: cada uno está en
 * un solo regalo por deseo (ver loQueYaTiene).
 */
const avisosDelRegaloSinLeer = (itemId: string) => and(eq(notifications.itemId, itemId), eq(notifications.leida, false),
  inArray(notifications.tipo, ['regalo_lo_tiene', 'regalo_encargo']))

/**
 * Alguien deja el regalo (se baja, o lo saca el encargado): abierto, sale y listo; ya comprado, si todavía no puso nada, y
 * se vuelve a dividir entre los que quedan (ver redividir). Al que ya puso algo primero se le devuelve: se deshace su pago
 * y después sale. Con los locks del deseo y del regalo tomados.
 */
async function sacarMiembro(t: Db, g: typeof groupGifts.$inferSelect, userId: string, actor: string): Promise<boolean> {
  if (g.estado === 'comprado') {
    const [item] = await t.select({ listId: items.listId }).from(items).where(eq(items.id, g.itemId))
    if (!(await admiteGente(t, g)) || !(await sePuedeRedividir(t, g, item.listId))) return false
    const antes = await genteDelRegalo(t, g.id, g.organizerUserId)
    const suyo = antes.find((f) => f.userId === userId)
    if (!suyo || suyo.pagadoMonto > 0) return false
    await t.delete(groupGiftMembers).where(and(eq(groupGiftMembers.giftId, g.id), eq(groupGiftMembers.userId, userId)))
    await redividir(t, g, item.listId, antes, actor)
  } else {
    const borrados = await t.delete(groupGiftMembers)
      .where(and(eq(groupGiftMembers.giftId, g.id), eq(groupGiftMembers.userId, userId)))
      .returning({ userId: groupGiftMembers.userId })
    if (!borrados.length) return false
  }
  await t.update(notifications).set({ leida: true }).where(and(avisosDelRegaloSinLeer(g.itemId), eq(notifications.userId, userId)))
  return true
}

/** Bajarse, abierto o ya comprado (ver sacarMiembro). El encargado no se baja: cancela. */
export async function salirDeRegalo(db: Db, giftId: string, userId: string): Promise<boolean> {
  if (!esUuid(giftId)) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // ya comprado deja avisos (que tocan el deseo): primero su lock, como comprarRegalo
    if (!(await lockDeseoDelRegalo(t, giftId))) return false
    // lock del regalo: si a la vez le pasan el encargo (unirseAGrupo), o espera y ya es encargado, o se baja antes y el
    // encargo pasa a otro; nunca queda de encargado sin estar en el regalo
    const [g] = await t.select().from(groupGifts)
      .where(and(eq(groupGifts.id, giftId), inArray(groupGifts.estado, ['abierto', 'comprado']), ne(groupGifts.organizerUserId, userId)))
      .for('update')
    return !!g && sacarMiembro(t, g, userId, userId)
  })
}

/**
 * El encargado saca a alguien (se sumó por error, o no lo conoce): sumarse es un toque y sin aprobación, así que esto lo
 * corrige. Al que sacan se le avisa, y no se vuelve a sumar solo: si no, el que se sumó por curiosidad vuelve con otro
 * toque y ve los montos. Ya comprado, como bajarse (ver sacarMiembro): al que ya le pagó, primero se deshace ese pago.
 */
export async function sacarDeRegalo(db: Db, giftId: string, miembroId: string, encargadoId: string): Promise<boolean> {
  if (!esUuid(giftId) || !esUuid(miembroId) || miembroId === encargadoId) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const itemId = await lockDeseoDelRegalo(t, giftId)
    if (!itemId) return false
    // lock del regalo, como salirDeRegalo: una compra a la vez divide sin él, o espera y divide sin él
    const [g] = await t.select().from(groupGifts)
      .where(and(eq(groupGifts.id, giftId), eq(groupGifts.organizerUserId, encargadoId), inArray(groupGifts.estado, ['abierto', 'comprado'])))
      .for('update')
    if (!g || !(await sacarMiembro(t, g, miembroId, encargadoId))) return false
    await t.insert(groupGiftSacados).values({ giftId, userId: miembroId }).onConflictDoNothing()
    await dejarAviso(t, itemId, 'regalo_sacado', [{ userId: miembroId, guestId: null }])
    return true
  })
}

/** El encargado deja volver a alguien que sacó (fue sin querer, o ya lo hablaron): vuelve a poder tocar "Me sumo". */
export async function dejarVolverARegalo(db: Db, giftId: string, miembroId: string, encargadoId: string): Promise<boolean> {
  if (!esUuid(giftId) || !esUuid(miembroId)) return false
  const suyo = db.select({ id: groupGifts.id }).from(groupGifts)
    .where(and(eq(groupGifts.id, giftId), eq(groupGifts.organizerUserId, encargadoId), inArray(groupGifts.estado, ['abierto', 'comprado'])))
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
    // una sorpresa es su regalo: cancelado, se va (no queda un deseo suelto para regalarle a alguien, ver sorpresas.ts)
    await t.update(items).set({ estadoDueno: 'no_lo_quiero' })
      .where(and(eq(items.id, g.itemId), inArray(items.listId, t.select({ id: lists.id }).from(lists).where(eq(lists.tipo, 'sorpresa')))))
    // a todos los del regalo, también al encargado
    await t.update(notifications).set({ leida: true }).where(and(avisosDelRegaloSinLeer(g.itemId),
      inArray(notifications.userId, t.select({ id: groupGiftMembers.userId }).from(groupGiftMembers).where(eq(groupGiftMembers.giftId, giftId)))))
    const estaban = await t.select({ userId: groupGiftMembers.userId }).from(groupGiftMembers)
      .where(and(eq(groupGiftMembers.giftId, giftId), ne(groupGiftMembers.userId, userId)))
    await dejarAviso(t, g.itemId, 'regalo_cancelado', estaban.map((m) => ({ userId: m.userId, guestId: null })))
    return true
  })
}

/**
 * cambiaron: se sumó o se bajó alguien desde que el encargado vio la división. moneda_pagada, nada_que_corregir,
 * de_la_lista: ver corregirCompra.
 */
export type CompraResult =
  | { ok: true }
  | { ok: false; reason: 'no_permitido' | 'monto_invalido' | 'no_suma' | 'cambiaron' | 'moneda_pagada' | 'nada_que_corregir' }
  | { ok: false; reason: 'de_la_lista'; nombre: string; monto: number }

/**
 * Lo que cargó el encargado. miembros: con quiénes vio la división (los ids de la pantalla). partes: "A mano"; si no,
 * partes iguales. moneda: pesos (si no viene) o dólares; el total y las partes son enteros en esa moneda.
 */
export type DatosCompra = { total: number; miembros?: string[]; partes?: Record<string, number>; nota?: string; moneda?: Moneda }

const montoValido = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= MONTO_MAXIMO

/** Una parte, con lo que ya puso (ver pagadoMonto en el schema). pagado: saldada. */
type Parte = { userId: string; monto: number | null; pagadoMonto: number; pagado: boolean; pagadoAt: Date | null }

/** Lo que le falta poner (positivo) o lo que el encargado le devuelve (negativo). */
const saldoDe = (f: { monto: number | null; pagadoMonto: number }) => (f.monto ?? 0) - f.pagadoMonto

/** Cuántos días después de comprarlo se corrige un regalo en el que nadie debe nada (ver sePuedeCorregir). */
const CORREGIR_EN_CERO_DIAS = 30

/**
 * Lo que se puede corregir (ver corregirCompra): con alguien más en el regalo, mientras quede algo por saldar (alguien le
 * debe, o él le devuelve a alguien), o en el primer mes. Ese mes es para el error al cargarla (borrar la parte de otro),
 * que si no quedaría fijo para siempre. Después, con todo saldado no hay qué corregir: "Lo que compraste" no se queda para
 * siempre en Cuentas, y una parte en 0 que figuraba saldada no se vuelve deuda meses después. Si lo compró solo, no: no
 * hay división que arreglar.
 */
function sePuedeCorregir(filas: Parte[], encargado: string, compradoAt: Date | null) {
  const otros = filas.filter((f) => f.userId !== encargado)
  if (!otros.length) return false
  const reciente = !!compradoAt && Date.now() - compradoAt.getTime() < CORREGIR_EN_CERO_DIAS * DIA
  return reciente || otros.some((f) => !f.pagado)
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

/**
 * La parte de cada uno (ids y montos en el mismo orden). La del encargado ya está puesta (la pagó él) y una en 0 no se
 * debe. Lo que los demás ya pusieron queda: si ahora les toca más, les falta la diferencia; si menos, el encargado se la
 * devuelve.
 */
async function fijarPartes(t: Db, giftId: string, encargado: string, ids: string[], montos: number[]) {
  const ahora = new Date()
  const antes = new Map((await t.select({ userId: groupGiftMembers.userId, pagadoMonto: groupGiftMembers.pagadoMonto, pagado: groupGiftMembers.pagado,
    pagadoAt: groupGiftMembers.pagadoAt }).from(groupGiftMembers).where(eq(groupGiftMembers.giftId, giftId))).map((f) => [f.userId, f]))
  for (const [i, id] of ids.entries()) {
    const f = antes.get(id)
    const puso = id === encargado ? montos[i] : f?.pagadoMonto ?? 0
    const saldado = montos[i] === puso
    await t.update(groupGiftMembers)
      .set({ monto: montos[i], pagadoMonto: puso, pagado: saldado, pagadoAt: saldado ? (f?.pagado && f.pagadoAt) || ahora : null })
      .where(and(eq(groupGiftMembers.giftId, giftId), eq(groupGiftMembers.userId, id)))
  }
}

const encargadoPrimero = (filas: { userId: string }[], encargado: string) =>
  [encargado, ...filas.map((f) => f.userId).filter((id) => id !== encargado)]

/** Las partes (en el orden de la pantalla) están en partes iguales, como las deja comprarRegalo si no se reparten a mano. */
const sonIguales = (montos: number[], total: number) => dividir(total, montos.length).every((m, i) => m === montos[i])

/**
 * Ya comprado, lo que le tocaría a uno más si se suma (va último): en partes iguales entre todos. Null si lo dividieron a
 * mano: ahí la parte del que llega la pone el encargado (ver redividir).
 */
export function parteParaUnoMas(total: number | null, montos: (number | null)[]): number | null {
  if (!total || !sonIguales(montos.map((m) => m ?? 0), total)) return null
  return dividir(total, montos.length + 1)[montos.length]
}

/**
 * Si se puede sumar (o bajar) gente: abierto, o ya comprado para el evento que viene, el que todavía se ve en el deseo (ver
 * regalosDeItem). Uno comprado para un evento que ya pasó ya se regaló: queda como está.
 */
export async function admiteGente(db: Db, g: { estado: string; claimId: string; itemId: string }): Promise<boolean> {
  if (g.estado === 'abierto') return true
  if (g.estado !== 'comprado') return false
  const [item] = await db.select({ listId: items.listId, tipo: items.tipo, repetible: items.repetible }).from(items).where(eq(items.id, g.itemId))
  if (!item) return false
  const desde = await desdeQueOcupa(db, item)
  const [c] = await db.select({ id: claims.id }).from(claims).where(and(eq(claims.id, g.claimId), ocupaSql(desde)))
  return !!c
}

/**
 * Ya comprado, la gente solo cambia si el encargado ve el regalo: si después se sumó a la lista (el grupo), ya no lo ve
 * (ver enCuentasDe) y no se le cambia la parte en silencio, como en corregirCompra.
 */
const sePuedeRedividir = async (t: Db, g: { organizerUserId: string }, listId: string) => !(await esOFueDuenoDeLista(t, listId, g.organizerUserId))

/** Los de un regalo con su parte, el encargado primero y después por orden de llegada (como la pantalla). Con lock. */
async function genteDelRegalo(t: Db, giftId: string, encargado: string): Promise<Parte[]> {
  const filas = await t.select({
    userId: groupGiftMembers.userId, monto: groupGiftMembers.monto, pagadoMonto: groupGiftMembers.pagadoMonto, pagado: groupGiftMembers.pagado,
    pagadoAt: groupGiftMembers.pagadoAt,
  }).from(groupGiftMembers).where(eq(groupGiftMembers.giftId, giftId)).orderBy(asc(groupGiftMembers.createdAt)).for('update')
  return [...filas.filter((f) => f.userId === encargado), ...filas.filter((f) => f.userId !== encargado)]
}

/**
 * Ya comprado, cambió quiénes están (se sumó alguien, se bajó o lo sacaron): se vuelve a dividir el total.
 * - En partes iguales (lo de siempre): en partes iguales entre los que están ahora.
 * - "A mano": el que llega entra sin parte y la del que se va queda para el encargado; los demás, como estaban. Se le
 *   avisa al encargado, que la corrige (ver corregirCompra).
 * Lo que cada uno ya puso queda (ver fijarPartes): al que ahora le toca menos, el encargado le devuelve la diferencia. Al
 * que después de la compra se sumó a la lista (el grupo) no se le cambia la parte (ya no ve el regalo, como en
 * corregirCompra): se reparte el resto. A los que les cambió la parte se les avisa, menos al que hizo el cambio.
 * antes: las partes de antes del cambio (ver genteDelRegalo). En la transacción del cambio, con los locks del deseo y del
 * regalo tomados.
 */
async function redividir(t: Db, g: typeof groupGifts.$inferSelect, listId: string, antes: Parte[], actor: string) {
  const total = g.montoTotal ?? 0
  const ahora = await genteDelRegalo(t, g.id, g.organizerUserId)
  const previo = new Map(antes.map((a) => [a.userId, a.monto ?? 0]))
  const iguales = sonIguales(antes.map((a) => a.monto ?? 0), total)
  let montos: number[]
  if (iguales) {
    const fijos = new Set<string>()
    for (const f of ahora) {
      if (f.userId !== g.organizerUserId && previo.has(f.userId) && (await esOFueDuenoDeLista(t, listId, f.userId))) fijos.add(f.userId)
    }
    const libres = ahora.filter((f) => !fijos.has(f.userId))
    const partes = dividir(total - [...fijos].reduce((s, id) => s + previo.get(id)!, 0), libres.length)
    const deLibre = new Map(libres.map((f, i) => [f.userId, partes[i]]))
    montos = ahora.map((f) => (fijos.has(f.userId) ? previo.get(f.userId)! : deLibre.get(f.userId)!))
  } else {
    const seFueron = antes.filter((a) => !ahora.some((f) => f.userId === a.userId)).reduce((s, a) => s + (a.monto ?? 0), 0)
    montos = ahora.map((f) => (previo.get(f.userId) ?? 0) + (f.userId === g.organizerUserId ? seFueron : 0))
  }
  await fijarPartes(t, g.id, g.organizerUserId, ahora.map((f) => f.userId), montos)
  if (!iguales) {
    if (actor !== g.organizerUserId) await dejarAviso(t, g.itemId, 'regalo_a_mano', [{ userId: g.organizerUserId, guestId: null }])
    return
  }
  const cambiaron = ahora.filter((f, i) => f.userId !== actor && previo.has(f.userId) && previo.get(f.userId) !== montos[i])
  await dejarAviso(t, g.itemId, 'regalo_redividido', cambiaron.map((f) => ({ userId: f.userId, guestId: null })))
}

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
    await t.update(groupGifts).set({ estado: 'comprado', montoTotal: p.total, moneda: p.moneda ?? 'ARS', compradoAt: ahora }).where(eq(groupGifts.id, giftId))
    await t.update(claims).set({ estado: 'comprado', notaQueCompre: notaDeCompra(p.nota), updatedAt: ahora }).where(eq(claims.id, g.claimId))
    return { ok: true }
  })
}

/**
 * "Corregir la compra": el encargado cambia el total o las partes de un regalo ya comprado (un cero de más, el precio de
 * la lista que no era el que pagó, la parte del que se sumó a uno dividido a mano), mientras haya algo por saldar o en el
 * primer mes (ver sePuedeCorregir). Lo que cada uno ya le dio queda: si le toca menos, se lo devuelve (ver fijarPartes).
 * La moneda no cambia si alguien ya le dio algo (moneda_pagada): eso fue en la de antes. Al que le cambia la parte se le
 * avisa: es su deuda. Al que después se sumó a la lista (el grupo) no se le cambia: ya no ve el regalo, ni el aviso, ni
 * Cuentas, y sería armarle una deuda en silencio (de_la_lista, con su nombre y su parte para dejársela). La fecha de la
 * compra queda (la usan Cuentas, el historial y el deseo).
 */
export async function corregirCompra(db: Db, giftId: string, userId: string, p: DatosCompra): Promise<CompraResult> {
  if (!montoValido(p.total)) return { ok: false, reason: 'monto_invalido' }
  if (!esUuid(giftId)) return { ok: false, reason: 'no_permitido' }
  return db.transaction(async (tx): Promise<CompraResult> => {
    const t = tx as unknown as Db
    // el aviso de abajo toca el deseo: primero su lock, como comprarRegalo
    const itemId = await lockDeseoDelRegalo(t, giftId)
    if (!itemId) return { ok: false, reason: 'no_permitido' }
    const [g] = await t.select({ claimId: groupGifts.claimId, listId: items.listId, compradoAt: groupGifts.compradoAt, moneda: groupGifts.moneda })
      .from(groupGifts)
      .innerJoin(items, eq(groupGifts.itemId, items.id))
      .where(and(eq(groupGifts.id, giftId), eq(groupGifts.organizerUserId, userId), eq(groupGifts.estado, 'comprado')))
      .for('update', { of: groupGifts })
    // si después se sumó al grupo de esa lista ya no ve el regalo (ver enCuentasDe): tampoco lo toca
    if (!g || (await esOFueDuenoDeLista(t, g.listId, userId))) return { ok: false, reason: 'no_permitido' }
    // Con lock: un "Ya le pagué" a la vez, o se ve acá, o espera y no marca una parte que cambió (ver marcarPagado)
    const filas = await genteDelRegalo(t, giftId, userId)
    if (!sePuedeCorregir(filas, userId, g.compradoAt)) return { ok: false, reason: 'nada_que_corregir' }
    if (p.moneda && p.moneda !== g.moneda && filas.some((f) => f.userId !== userId && f.pagadoMonto > 0)) return { ok: false, reason: 'moneda_pagada' }
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
    await t.update(groupGifts).set({ montoTotal: p.total, ...(p.moneda && { moneda: p.moneda }) }).where(eq(groupGifts.id, giftId))
    await t.update(claims).set({ notaQueCompre: notaDeCompra(p.nota) }).where(eq(claims.id, g.claimId))
    await dejarAviso(t, itemId, 'compra_corregida', cambiaron.map((id) => ({ userId: id, guestId: null })))
    return { ok: true }
  })
}

/**
 * Saldar la parte de uno: "Ya le pagué" (lo marca quien debe) o "Me pagó" (lo marca el encargado), y al revés si el
 * encargado le devuelve ("Ya le devolví" / "Me devolvió"). Queda como que puso justo su parte. visto: la parte que mostraba
 * la pantalla. Si justo el encargado la corrigió o se volvió a dividir, el UPDATE espera a eso y no salda una parte que el
 * que paga no vio (la pantalla vuelve con la nueva).
 * pagado = false, "Deshacer": vuelve a lo que había puesto antes de saldarla (sin eso, a nada).
 * Si después se sumó al grupo de esa lista (aunque haya salido) ya no ve el regalo (ver enCuentasDe): tampoco lo marca
 * desde una pestaña vieja, como corregirCompra y saldarCon. El otro lo sigue viendo y lo marca desde su lado.
 */
export async function marcarPagado(db: Db, giftId: string, deudorId: string, actorId: string, pagado = true, visto?: number): Promise<boolean> {
  if (!esUuid(giftId) || !esUuid(deudorId)) return false
  // visto viene del formulario: una parte es un entero entre 0 y MONTO_MAXIMO, y otro número (fuera de lo que entra en la
  // columna) haría fallar la consulta
  if (visto !== undefined && !(Number.isSafeInteger(visto) && visto >= 0 && visto <= MONTO_MAXIMO)) return false
  const [g] = await db.select({ encargado: groupGifts.organizerUserId, listId: items.listId }).from(groupGifts)
    .innerJoin(items, eq(groupGifts.itemId, items.id))
    .where(and(eq(groupGifts.id, giftId), eq(groupGifts.estado, 'comprado')))
  if (!g || deudorId === g.encargado || (actorId !== g.encargado && actorId !== deudorId)) return false
  if (await esOFueDuenoDeLista(db, g.listId, actorId)) return false
  const m = groupGiftMembers
  const suya = and(eq(m.giftId, giftId), eq(m.userId, deudorId))
  const antes = sql`coalesce(${m.pagadoAntes}, 0)`
  const filas = pagado
    ? await db.update(m).set({ pagadoAntes: sql`${m.pagadoMonto}`, pagadoMonto: sql`${m.monto}`, pagado: true, pagadoAt: new Date() })
      .where(and(suya, eq(m.pagado, false), visto !== undefined ? eq(m.monto, visto) : undefined))
      .returning({ userId: m.userId })
    : await db.update(m).set({
      pagadoMonto: antes, pagadoAntes: null, pagado: sql`${m.monto} = ${antes}`, pagadoAt: sql`case when ${m.monto} = ${antes} then ${m.pagadoAt} end`,
    }).where(and(suya, gt(m.pagadoMonto, 0))).returning({ userId: m.userId })
  return filas.length > 0
}

/**
 * Los regalos comprados que entran en Cuentas de userId (en una consulta con join a items y lists): los de listas de las
 * que no es ni fue dueño. Si te sumaste a un grupo después, no te enterás. Saldar usa exactamente lo mismo.
 */
const enCuentasDe = (db: Db, userId: string) => and(eq(groupGifts.estado, 'comprado'), noEsNiFueDuenoSql(db, userId))

/**
 * Saldar todo con alguien, en una moneda: salda lo pendiente entre los dos, en las dos direcciones (deudas y lo que el
 * encargado devuelve; las de la otra moneda, no: son otra tarjeta en Cuentas). Solo las que Cuentas
 * le muestra al que toca el botón (el monto del botón): nunca una que no ve, como la de un regalo de un grupo al que se
 * sumó después. Esa la sigue viendo el otro, que la puede saldar desde su lado.
 * visto: el neto del botón (positivo, te debe). Si cambió (justo corrigieron una compra), no salda nada: la pantalla
 * vuelve con el de ahora. Si es el mismo, saldar las partes nuevas da lo mismo que lo que se pagó.
 */
export async function saldarCon(db: Db, userId: string, otroId: string, visto?: number, moneda: Moneda = 'ARS'): Promise<number> {
  if (userId === otroId || !esUuid(otroId)) return 0
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const deEncargado = (encargado: string) => t.select({ id: groupGifts.id }).from(groupGifts)
      .innerJoin(items, eq(groupGifts.itemId, items.id))
      .innerJoin(lists, eq(items.listId, lists.id))
      .where(and(eq(groupGifts.organizerUserId, encargado), eq(groupGifts.moneda, moneda), enCuentasDe(t, userId)))
    // Con lock y en orden: una corrección a la vez (corregirCompra) o espera, o ya se ve acá con las partes nuevas.
    const filas = await t.select({ giftId: groupGiftMembers.giftId, userId: groupGiftMembers.userId, monto: groupGiftMembers.monto,
      pagadoMonto: groupGiftMembers.pagadoMonto })
      .from(groupGiftMembers)
      // lo que queda por saldar, en las dos direcciones (las partes en 0 ya quedan saldadas al comprar)
      .where(and(eq(groupGiftMembers.pagado, false), or(
        and(eq(groupGiftMembers.userId, userId), inArray(groupGiftMembers.giftId, deEncargado(otroId))),
        and(eq(groupGiftMembers.userId, otroId), inArray(groupGiftMembers.giftId, deEncargado(userId))),
      )))
      .orderBy(asc(groupGiftMembers.giftId), asc(groupGiftMembers.userId))
      .for('update')
    // lo que el otro le debe a userId: su saldo si el encargado es userId, el de userId al revés
    const neto = filas.reduce((s, f) => s + (f.userId === otroId ? 1 : -1) * saldoDe(f), 0)
    if (!filas.length || (visto !== undefined && neto !== visto)) return 0
    // estas filas y no las que cumplan el filtro ahora: una compra que se cerró recién no estaba en el botón
    await t.update(groupGiftMembers)
      .set({ pagadoAntes: sql`${groupGiftMembers.pagadoMonto}`, pagadoMonto: sql`${groupGiftMembers.monto}`, pagado: true, pagadoAt: new Date() })
      .where(or(...filas.map((f) => and(eq(groupGiftMembers.giftId, f.giftId), eq(groupGiftMembers.userId, f.userId)))))
    return filas.length
  })
}

/** Los regalos grupales vigentes de un deseo, para quien regala. Al dueño y a quien no ve la capa oculta (ver accesoALista) les devuelve []. */
export async function regalosDeItem(db: Db, itemId: string, viewer: Viewer): Promise<RegaloView[]> {
  const [item] = await db.select({ listId: items.listId, tipo: items.tipo, repetible: items.repetible }).from(items).where(eq(items.id, itemId))
  if (!item || (await accesoALista(db, item.listId, viewer)) !== 'regalador') return []
  // En una idea que se puede repetir (o en un deseo que volvió a la lista), uno comprado para un evento anterior ya se
  // regaló: no se muestra, como en la lista y al reservar (ver ocupaSql). Lo comprado se anota en su reserva.
  const desde = await desdeQueOcupa(db, item)
  const regalos = await db.select({ gift: groupGifts, nombre: users.nombre })
    .from(groupGifts).innerJoin(users, eq(groupGifts.organizerUserId, users.id))
    .innerJoin(claims, eq(groupGifts.claimId, claims.id))
    .where(and(
      eq(groupGifts.itemId, itemId), inArray(groupGifts.estado, ['abierto', 'comprado']),
      or(eq(groupGifts.estado, 'abierto'), ocupaSql(desde)),
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
    const comprado = gift.estado === 'comprado'
    const fuera = sacados.filter((x) => x.giftId === gift.id)
    return {
      id: gift.id,
      estado: gift.estado as 'abierto' | 'comprado',
      encargado: { id: gift.organizerUserId, nombre },
      soyParte,
      soyEncargado,
      montoTotal: soyParte ? gift.montoTotal : null,
      moneda: enSuMoneda(gift.moneda),
      corregible: soyEncargado && comprado && sePuedeCorregir(suyos.map((x) => x.m), gift.organizerUserId, gift.compradoAt),
      sacados: soyEncargado ? fuera.map(({ id, nombre }) => ({ id, nombre })) : [],
      meSacaron: !!viewer.userId && fuera.some((x) => x.id === viewer.userId),
      // para el que se suma después: cuánto le toca, antes de tocar "Me sumo"
      parteSiTeSumas: comprado && !soyParte ? parteParaUnoMas(gift.montoTotal, suyos.map((x) => x.m.monto)) : null,
      miembros: suyos.map((x) => {
        const esEncargado = x.m.userId === gift.organizerUserId
        return {
          userId: x.m.userId, nombre: x.nombre, esEncargado,
          esYo: x.m.userId === viewer.userId,
          monto: soyParte ? x.m.monto : null,
          pagado: soyParte && x.m.pagado,
          saldo: soyParte ? (esEncargado ? 0 : saldoDe(x.m)) : null,
          puso: soyParte && !esEncargado && x.m.pagadoMonto > 0,
        }
      }),
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
  /** lo que falta saldar (en las saldadas, la parte) */
  monto: number
  /** la parte entera, la que dice la pantalla al marcarla (ver marcarPagado) */
  parte: number
  /** si no son pesos */
  moneda?: Moneda
  /** debes: vos le debés al otro. te_deben: el otro te debe. */
  tipo: 'debes' | 'te_deben'
  /** El encargado le devuelve al que se sumó (pagó y después se volvió a dividir entre más); si no, el que se sumó le paga. */
  devolucion: boolean
  /** el que se sumó: la parte es suya (con el encargado, se marca con su id) */
  deudorId: string
  fecha: Date
}

/** Con alguien, en una moneda: con quien hay cuentas en pesos y en dólares, hay dos (no se mezclan). */
export type CuentaPersona = Persona & {
  /** si no son pesos */
  moneda?: Moneda
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
  /** Con dividirCon y el deseo en la lista: a quiénes sacó (los puede dejar volver, como en el deseo). */
  sacados: Persona[]
}

export type Cuentas = {
  /** en pesos */
  debes: number
  teDeben: number
  /** lo mismo en dólares, si hay algo en dólares */
  dolares?: { debes: number; teDeben: number }
  personas: CuentaPersona[]
  enCurso: RegaloEnCurso[]
  saldadas: (LineaCuenta & { con: string })[]
}

const encargados = alias(users, 'encargados')
const deudores = alias(users, 'deudores')
const duenosPersonales = alias(users, 'duenos_personales')

type Destino = {
  tipo: 'personal' | 'grupo' | 'sorpresa'; listaNombre: string | null; duenoNombre: string | null; shareToken: string; itemId: string
  activo: boolean; tieneElLink: boolean
}

/**
 * Para quién y adónde lleva. duenoNombre es el del dueño de la lista personal o el de quien recibe la sorpresa (ver
 * duenoOParaSql); una sorpresa para alguien sin GiftR lleva su nombre en el de la lista.
 */
function destino(r: Destino, conLink = r.tieneElLink) {
  return {
    para: r.tipo === 'grupo' ? r.listaNombre ?? 'Grupo' : r.duenoNombre ?? r.listaNombre ?? 'Alguien',
    href: !conLink ? null : r.tipo === 'sorpresa' ? `/sorpresa/${r.shareToken}` : r.activo ? `/l/${r.shareToken}/item/${r.itemId}` : `/l/${r.shareToken}`,
  }
}

/** Para el join con el dueño de una lista: el de la personal, o el que recibe una sorpresa (solo uno de los dos está). */
export const duenoOParaSql = sql`coalesce(${lists.ownerId}, ${lists.paraUserId})`

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
    monto: groupGiftMembers.monto, pagadoMonto: groupGiftMembers.pagadoMonto, pagado: groupGiftMembers.pagado, pagadoAt: groupGiftMembers.pagadoAt,
    compradoAt: groupGifts.compradoAt, moneda: groupGifts.moneda, ...columnasDestino(db, userId),
  }).from(groupGiftMembers)
    .innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id))
    .innerJoin(encargados, eq(groupGifts.organizerUserId, encargados.id))
    .innerJoin(deudores, eq(groupGiftMembers.userId, deudores.id))
    .innerJoin(items, eq(groupGifts.itemId, items.id))
    .innerJoin(lists, eq(items.listId, lists.id))
    .leftJoin(duenosPersonales, eq(duenoOParaSql, duenosPersonales.id))
    .where(and(
      enCuentasDe(db, userId),
      ne(groupGiftMembers.userId, groupGifts.organizerUserId),
      or(eq(groupGiftMembers.userId, userId), eq(groupGifts.organizerUserId, userId)),
    ))
    .orderBy(desc(groupGifts.compradoAt))

  const porPersona = new Map<string, CuentaPersona>()
  const saldadas: Cuentas['saldadas'] = []
  for (const r of partes) {
    const parte = r.monto ?? 0
    const saldo = r.pagado ? 0 : saldoDe(r)
    // una parte en 0 saldada no es nada que contar
    if (!saldo && parte <= 0) continue
    const soyElQueSeSumo = r.deudorId === userId
    const otro = soyElQueSeSumo ? { id: r.encargadoId, nombre: r.encargadoNombre } : { id: r.deudorId, nombre: r.deudorNombre }
    // el que se sumó le debe al encargado; si el saldo es negativo, al revés
    const debo = soyElQueSeSumo === (saldo >= 0)
    const linea: LineaCuenta = {
      giftId: r.giftId, itemTitulo: r.itemTitulo, ...destino(r), monto: saldo ? Math.abs(saldo) : parte, parte, moneda: enSuMoneda(r.moneda),
      tipo: debo ? 'debes' : 'te_deben', devolucion: saldo < 0, deudorId: r.deudorId, fecha: r.compradoAt ?? new Date(0),
    }
    if (!saldo) {
      saldadas.push({ ...linea, con: otro.nombre, fecha: r.pagadoAt ?? linea.fecha })
      continue
    }
    const clave = `${otro.id}|${r.moneda}`
    const persona = porPersona.get(clave) ?? { ...otro, moneda: enSuMoneda(r.moneda), neto: 0, lineas: [] }
    persona.neto += debo ? -linea.monto : linea.monto
    persona.lineas.push(linea)
    porPersona.set(clave, persona)
  }

  const abiertos = await db.select({
    giftId: groupGifts.id, encargadoId: groupGifts.organizerUserId, encargadoNombre: encargados.nombre, ...columnasDestino(db, userId),
  }).from(groupGiftMembers)
    .innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id))
    .innerJoin(encargados, eq(groupGifts.organizerUserId, encargados.id))
    .innerJoin(items, eq(groupGifts.itemId, items.id))
    .innerJoin(lists, eq(items.listId, lists.id))
    .leftJoin(duenosPersonales, eq(duenoOParaSql, duenosPersonales.id))
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
  const total = (moneda: Moneda | undefined, signo: 1 | -1) =>
    personas.filter((p) => p.moneda === moneda).reduce((s, p) => s + Math.max(0, signo * p.neto), 0)
  const hayDolares = personas.some((p) => p.moneda === 'USD')
  return {
    debes: total(undefined, -1),
    teDeben: total(undefined, 1),
    ...(hayDolares && { dolares: { debes: total('USD', -1), teDeben: total('USD', 1) } }),
    // los pesos antes que los dólares; primero a quien más le debés, después quien más te debe
    personas: personas.sort((a, b) => Number(!!a.moneda) - Number(!!b.moneda) || a.neto - b.neto),
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
        // con el deseo fuera de la lista no se puede volver a sumar (ver sumarseARegalo): si vuelve, lo deja volver desde el deseo
        sacados: desdeCuentas && a.activo ? sacados.filter((x) => x.giftId === a.giftId).map(({ id, nombre }) => ({ id, nombre })) : [],
      }
    }),
    saldadas: saldadas.sort((a, b) => b.fecha.getTime() - a.fecha.getTime()).slice(0, 10),
  }
}

export type CompraParaCorregir = {
  giftId: string; itemTitulo: string; para: string; total: number; moneda?: Moneda; nota: string | null
  /** El encargado primero y después por orden de llegada, como en comprarRegalo. */
  miembros: { userId: string; nombre: string; esYo: boolean; monto: number }[]
}

/**
 * Lo que compró en un regalo grupal y todavía puede corregir (ver sePuedeCorregir), cuando no lo puede hacer en el deseo:
 * lo sacaron de la lista (se lo dieron en el cumple y dijo "Ya lo tengo"), cambiaron el link y no lo tiene, o el deseo ya
 * no lo muestra (en una idea que se puede repetir o en un deseo que volvió a la lista, lo comprado para un evento anterior;
 * ver regalosDeItem). Como dividirCon.
 */
export async function comprasParaCorregir(db: Db, userId: string): Promise<CompraParaCorregir[]> {
  const compras = await db.select({
    giftId: groupGifts.id, total: groupGifts.montoTotal, moneda: groupGifts.moneda, nota: claims.notaQueCompre, compradoEl: claims.updatedAt, compradoAt: groupGifts.compradoAt,
    listId: lists.id, tipoDeseo: items.tipo, repetible: items.repetible, ocupaDesde: items.ocupaDesde, ...columnasDestino(db, userId),
  }).from(groupGifts)
    .innerJoin(claims, eq(groupGifts.claimId, claims.id))
    .innerJoin(items, eq(groupGifts.itemId, items.id))
    .innerJoin(lists, eq(items.listId, lists.id))
    .leftJoin(duenosPersonales, eq(duenoOParaSql, duenosPersonales.id))
    .where(and(
      eq(groupGifts.organizerUserId, userId), enCuentasDe(db, userId),
      // de entrada, solo las que tienen algo por saldar (la parte del encargado queda puesta al comprar) o las del último mes
      or(
        inArray(groupGifts.id, db.select({ id: groupGiftMembers.giftId }).from(groupGiftMembers).where(eq(groupGiftMembers.pagado, false))),
        gt(groupGifts.compradoAt, new Date(Date.now() - CORREGIR_EN_CERO_DIAS * DIA)),
      ),
    ))
    .orderBy(desc(groupGifts.compradoAt))
  const lejos: typeof compras = []
  for (const c of compras) {
    const desde = c.activo && c.tieneElLink ? await desdeQueOcupa(db, { listId: c.listId, tipo: c.tipoDeseo, repetible: c.repetible }) : null
    const yaNoOcupa = (desde && c.compradoEl < desde) || (c.ocupaDesde && c.compradoEl < c.ocupaDesde)
    if (!c.activo || !c.tieneElLink || yaNoOcupa) lejos.push(c)
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
      giftId: c.giftId, itemTitulo: c.itemTitulo, para: destino(c).para, total: c.total ?? 0, moneda: enSuMoneda(c.moneda), nota: c.nota,
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
    .leftJoin(duenosPersonales, eq(duenoOParaSql, duenosPersonales.id))
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
      noEsDeRegaloGrupal()))

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
