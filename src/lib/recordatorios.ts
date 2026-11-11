import { and, count, eq, gt, gte, inArray, isNotNull, lt, lte, ne, or, sql } from 'drizzle-orm'
import { claims, groupGiftMembers, groupGifts, items, listFollows, listMembers, lists, recordatoriosEnviados, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { afirmarReservas, FIRME_DIAS_ANTES, noEsDeRegaloGrupal, ocupaSql } from '@/lib/claims'
import { avisar, type Aviso, type Enviar } from '@/lib/codazos'
import { desdeElUltimoEvento, diasEntre, eventoDeLista, hoyLocal, proximaDeGrupo, proximaFecha } from '@/lib/events'
import { juntarNombres, relacionConLista, tituloDelGrupo } from '@/lib/groups'
import { plata } from '@/lib/pesos'
import { misCuentas } from '@/lib/regalos'
import { cupoDe } from '@/lib/serialize'

// Los recordatorios programados: lo que GiftR avisa sin que nadie toque nada, una vez por día (ver /api/cron/diario).
// Hasta acá todo aviso salía de la acción de otra persona, y "te vence la reserva" era un cartel que solo veía quien
// abría la app. Cada uno queda en la bandeja y llega al celular (ver avisar), una sola vez por persona y motivo (ver
// recordatorios_enviados).
// La regla de la sorpresa: al dueño de una lista ningún recordatorio le dice nada de lo que pasa con sus deseos. Los de
// reservas van solo a quien reservó, el del cumple que se acerca a quienes regalan, y el del dueño ("poné tu lista al
// día") sale igual haya o no reservas. Los invitados sin cuenta no tienen bandeja ni dispositivo: no se les avisa.

const DIA = 86400_000

/** Con cuántos días de anticipación se avisa que viene una fecha a quienes todavía no eligieron nada de esa lista. */
export const CUMPLE_CERCA_DIAS = 7
/** Y al que cumple, para que ponga su lista al día. */
export const TU_CUMPLE_DIAS = 30
/** Si el cron no pasó justo ese día, sale al siguiente o al otro: después ya no es el mismo aviso. */
const MARGEN_DIAS = 2
/** Las cuentas de un regalo grupal se recuerdan desde una semana después de la compra, cada una semana… */
export const CUENTAS_CADA_DIAS = 7
/** …y hasta los dos meses: después el recordatorio ya es ruido (la deuda sigue en Cuentas). */
export const CUENTAS_HASTA_DIAS = 60
/** Cuánto se guarda lo que ya salió: todas las claves llevan su fecha, así que pasado esto no vuelven a coincidir. */
const GUARDAR_DIAS = 90

export type Recordatorios = {
  /** Reservas que vencían en la víspera del evento de su lista y se estiraron hasta el día siguiente (ver afirmarReservas). */
  reservasFirmes: number
  /** "¿Ya compraste…?": a quien tiene algo reservado sin comprar en una lista cuyo evento es en 3 días o menos. */
  loCompraste: number
  /** "Tu reserva vence mañana": las que sí vencen (lejos de un evento, o al otro día de uno). */
  venceManana: number
  /** "El cumple de Euge es en 7 días": a quienes siguen su lista y todavía no eligieron nada. */
  cumpleCerca: number
  /** "Tu cumple es en 30 días": al que cumple. */
  tuCumple: number
  /** "Tenés cuentas pendientes": a quien debe su parte de un regalo grupal. */
  cuentas: number
  /** Los pasos que fallaron (los demás salieron igual). */
  fallaron: string[]
}

type Tipo = 'lo_compraste' | 'vence_manana' | 'cumple_cerca' | 'tu_cumple' | 'cuentas'
type Mandar = (userId: string, tipo: Tipo, clave: string, aviso: Aviso & { de?: string | null }) => Promise<number>

const dia = (d: Date) => d.toISOString().slice(0, 10)
const mas = (d: Date, dias: number) => new Date(d.getTime() + dias * DIA)
const primer = (nombre: string | null) => (nombre ?? 'Alguien').trim().split(/\s+/)[0]
const enDias = (dias: number) => (dias === 1 ? 'mañana' : `en ${dias} días`)

/** De a pocos a la vez: cada aviso espera a los servicios de push, y el cron tiene un minuto. */
async function deAPocos<T>(cosas: T[], hacer: (c: T) => Promise<number>): Promise<number> {
  let total = 0
  for (let i = 0; i < cosas.length; i += 8) total += (await Promise.all(cosas.slice(i, i + 8).map(hacer))).reduce((a, b) => a + b, 0)
  return total
}

/**
 * Los recordatorios del día. ahora: cuándo corre (en los tests, la fecha que se quiera); enviar: cómo sale el push (ver
 * codazos.ts). Se puede correr dos veces el mismo día: lo que ya salió no vuelve a salir. Si un paso falla, los demás
 * salen igual y queda anotado en fallaron.
 */
export async function mandarRecordatorios(db: Db, ahora = new Date(), enviar?: Enviar): Promise<Recordatorios> {
  const hoy = hoyLocal(ahora)
  const r: Recordatorios = { reservasFirmes: 0, loCompraste: 0, venceManana: 0, cumpleCerca: 0, tuCumple: 0, cuentas: 0, fallaron: [] }
  /**
   * Primero se anota y después se manda: si dos corridas se cruzan, o la de hoy se repite, la clave única deja pasar una
   * sola. Si el aviso no se pudo guardar, se desanota para que salga en la próxima.
   */
  const mandar: Mandar = async (userId, tipo, clave, aviso) => {
    const [nuevo] = await db.insert(recordatoriosEnviados).values({ userId, tipo, clave, createdAt: ahora }).onConflictDoNothing()
      .returning({ userId: recordatoriosEnviados.userId })
    if (!nuevo) return 0
    try {
      await avisar(db, userId, { ...aviso, tipo: null }, enviar)
      return 1
    } catch {
      await db.delete(recordatoriosEnviados)
        .where(and(eq(recordatoriosEnviados.userId, userId), eq(recordatoriosEnviados.tipo, tipo), eq(recordatoriosEnviados.clave, clave)))
      return 0
    }
  }
  const paso = async (nombre: string, hacer: () => Promise<void>) => {
    try {
      await hacer()
    } catch (e) {
      console.error(`Recordatorios: falló "${nombre}"`, e)
      r.fallaron.push(nombre)
    }
  }
  // antes que nada: lo que hoy se estira ya no "vence mañana"
  await paso('reservasFirmes', async () => { r.reservasFirmes = await afirmarReservas(db, ahora) })
  await paso('reservas', async () => {
    const { loCompraste, venceManana } = await recordarReservas(db, ahora, hoy, mandar)
    r.loCompraste = loCompraste
    r.venceManana = venceManana
  })
  await paso('cumpleCerca', async () => { r.cumpleCerca = await recordarFechasCerca(db, ahora, hoy, mandar) })
  await paso('tuCumple', async () => { r.tuCumple = await recordarTuCumple(db, hoy, mandar) })
  await paso('cuentas', async () => { r.cuentas = await recordarCuentas(db, ahora, hoy, mandar) })
  await paso('limpieza', async () => {
    await db.delete(recordatoriosEnviados).where(lt(recordatoriosEnviados.createdAt, mas(ahora, -GUARDAR_DIAS)))
  })
  return r
}

/** Cómo se nombra el evento de una lista en un aviso: "El cumple de Euge", "El cumple de Juancito", «"Casa nueva"». */
function elEvento(l: { tipo: string; nombre: string | null; dueno: string | null }, esCumple: boolean): string {
  if (l.tipo === 'personal') return `El cumple de ${primer(l.dueno)}`
  const titulo = tituloDelGrupo(l.nombre ?? 'la lista', esCumple)
  return esCumple ? `El ${titulo.charAt(0).toLowerCase()}${titulo.slice(1)}` : `"${titulo}"`
}

/**
 * A quien tiene una reserva suelta sin comprar:
 * - "¿Ya compraste…?" cuando el evento de la lista es en 3 días o menos, y otra vez la víspera si sigue sin marcarla.
 *   Cerca del evento la reserva ya no vence sola (ver vencimientoDeReserva): en vez de liberarla, se le pregunta, con el
 *   link al deseo, donde están "Ya lo compré" y liberar.
 * - "Tu reserva vence mañana" a las que sí vencen: las que están lejos de un evento (a los 14 días) y, pasado el evento,
 *   las que habían quedado firmes.
 * Solo de listas que no son ni fueron suyas (el que se sumó al grupo después de reservar, como en getMyClaimWarnings), y
 * con el link al deseo solo si reservó con el link para regalar de ahora; si no, a Mis regalos.
 */
async function recordarReservas(db: Db, ahora: Date, hoy: Date, mandar: Mandar): Promise<{ loCompraste: number; venceManana: number }> {
  const reservas = await db.select({
    claimId: claims.id, userId: claims.claimerUserId, creada: claims.createdAt, vence: claims.expiresAt,
    itemId: items.id, titulo: items.titulo, listId: lists.id, token: lists.shareToken, tokenAt: lists.shareTokenAt,
    tipo: lists.tipo, nombre: lists.nombre, dueno: users.nombre,
  }).from(claims)
    .innerJoin(items, eq(claims.itemId, items.id)).innerJoin(lists, eq(items.listId, lists.id)).leftJoin(users, eq(lists.ownerId, users.id))
    .where(and(
      eq(claims.estado, 'reservado'), isNotNull(claims.claimerUserId), gt(claims.expiresAt, ahora), noEsDeRegaloGrupal(),
      eq(items.estadoDueno, 'activo'), ne(lists.tipo, 'sorpresa'),
    ))
  const eventos = new Map<string, ReturnType<typeof eventoDeLista>>()
  const eventoDe = (listId: string) => {
    if (!eventos.has(listId)) eventos.set(listId, eventoDeLista(db, listId, hoy))
    return eventos.get(listId)!
  }
  let loCompraste = 0
  let venceManana = 0
  await deAPocos(reservas, async (x) => {
    const userId = x.userId!
    if ((await relacionConLista(db, x.listId, userId)) !== null) return 0
    const url = !x.tokenAt || x.creada > x.tokenAt ? `/l/${x.token}/item/${x.itemId}` : '/regalos'
    const evento = await eventoDe(x.listId)
    if (evento && evento.dias >= 1 && evento.dias <= FIRME_DIAS_ANTES) {
      const salio = await mandar(userId, 'lo_compraste', `${x.claimId}:${dia(evento.fecha)}:${evento.dias === 1 ? 'vispera' : 'antes'}`, {
        title: `🎁 ¿Ya compraste "${x.titulo}"?`,
        body: `${elEvento(x, evento.esCumple)} es ${enDias(evento.dias)}. Si ya lo tenés, marcá "Ya lo compré"; si no vas a llegar, liberalo así lo regala otra persona.`,
        url,
      })
      // sumar después de esperar: van varias a la vez, y "+= await" pisaría lo que sumó otra mientras tanto
      loCompraste += salio
    } else if (hoyLocal(x.vence!).getTime() === mas(hoy, 1).getTime()) {
      // también la que quedó firme, al otro día del evento: si lo regaló y no lo marca, mañana el deseo vuelve a estar libre
      const salio = await mandar(userId, 'vence_manana', `${x.claimId}:${dia(mas(hoy, 1))}`, {
        title: `⏳ Tu reserva de "${x.titulo}" vence mañana`,
        body: 'Si ya lo compraste, marcá "Ya lo compré". Si no, mañana queda libre para que lo regale otra persona.',
        url,
      })
      venceManana += salio
    }
    return 0
  })
  return { loCompraste, venceManana }
}

/** Los que cumplen dentro de entre desde y hasta días, con la fecha. El 29/2 cae el 28 en los años que no son bisiestos. */
async function quienesCumplen(db: Db, hoy: Date, desde: number, hasta: number) {
  const dias = Array.from({ length: hasta - desde + 1 }, (_, i) => mas(hoy, desde + i))
  const pares = dias.map((d) => ({ dia: d.getUTCDate(), mes: d.getUTCMonth() + 1 }))
  if (pares.some((p) => p.mes === 2 && p.dia === 28)) pares.push({ dia: 29, mes: 2 })
  const filas = await db.select({ id: users.id, nombre: users.nombre, cumpleDia: users.cumpleDia, cumpleMes: users.cumpleMes }).from(users)
    .where(or(...pares.map((p) => and(eq(users.cumpleMes, p.mes), eq(users.cumpleDia, p.dia)))))
  return filas.flatMap((u) => {
    const fecha = proximaFecha(u.cumpleDia!, u.cumpleMes!, hoy)
    const faltan = diasEntre(hoy, fecha)
    return faltan >= desde && faltan <= hasta ? [{ id: u.id, nombre: u.nombre, fecha, dias: faltan }] : []
  })
}

/**
 * "El cumple de Euge es en 7 días" (o la fecha de una lista en común): a quienes siguen esa lista (sus amigos la siguen:
 * ver amigos.ts) y todavía no se ocupan de nada de ella para esta fecha (ni reservaron, ni compraron, ni están en un
 * regalo grupal o una sorpresa), si a la lista le queda algo para reservar. Nunca a un dueño, ni a quien lo fue.
 */
async function recordarFechasCerca(db: Db, ahora: Date, hoy: Date, mandar: Mandar): Promise<number> {
  const [desde, hasta] = [CUMPLE_CERCA_DIAS - MARGEN_DIAS, CUMPLE_CERCA_DIAS]
  const cumplen = await quienesCumplen(db, hoy, desde, hasta)
  const [personales, grupos] = await Promise.all([
    cumplen.length ? db.select().from(lists).where(and(eq(lists.tipo, 'personal'), inArray(lists.ownerId, cumplen.map((u) => u.id)))) : [],
    db.select().from(lists).where(and(eq(lists.tipo, 'grupo'), isNotNull(lists.eventoFecha))),
  ])
  const listas = [
    ...personales.flatMap((l) => {
      const u = cumplen.find((c) => c.id === l.ownerId)
      return u ? [{ l, fecha: u.fecha, dias: u.dias, que: elEvento({ tipo: 'personal', nombre: null, dueno: u.nombre }, true) }] : []
    }),
    ...grupos.flatMap((l) => {
      const fecha = proximaDeGrupo(l.eventoFecha, l.eventoAnual, hoy)
      const dias = fecha ? diasEntre(hoy, fecha) : -1
      return fecha && dias >= desde && dias <= hasta
        ? [{ l, fecha, dias, que: elEvento({ tipo: 'grupo', nombre: l.nombre, dueno: null }, l.esCumple) }]
        : []
    }),
  ]
  let avisados = 0
  for (const { l, fecha, dias, que } of listas) {
    const [deseos, ocupados] = await Promise.all([
      db.select({ id: items.id, tipo: items.tipo, repetible: items.repetible, cantidad: items.cantidad }).from(items)
        .where(and(eq(items.listId, l.id), eq(items.estadoDueno, 'activo'))),
      db.select({ itemId: claims.itemId, n: count() }).from(claims).innerJoin(items, eq(claims.itemId, items.id))
        .where(and(eq(items.listId, l.id), ocupaSql(null))).groupBy(claims.itemId),
    ])
    if (!deseos.some((d) => cupoDe(d, ocupados.find((o) => o.itemId === d.id)?.n ?? 0).disponible)) continue
    const desdeElAnterior = await desdeElUltimoEvento(db, l.id, ahora)
    // lo comprado para un evento anterior ya se regaló: lo que cuenta es lo de este (ver desdeElUltimoEvento)
    const deEsteEvento = (estado: typeof claims.estado | typeof groupGifts.estado, abierto: 'reservado' | 'abierto') =>
      or(sql`${estado} = ${abierto}`, and(sql`${estado} = 'comprado'`, gte(claims.updatedAt, desdeElAnterior)))
    const [siguen, duenos, reservaron, enRegalos] = await Promise.all([
      db.select({ userId: listFollows.userId }).from(listFollows).where(eq(listFollows.listId, l.id)),
      // también los que salieron del grupo: cargaron esos deseos (ver esOFueDuenoSql)
      db.select({ userId: listMembers.userId }).from(listMembers).where(eq(listMembers.listId, l.id)),
      db.select({ userId: claims.claimerUserId }).from(claims).innerJoin(items, eq(claims.itemId, items.id))
        .where(and(eq(items.listId, l.id), isNotNull(claims.claimerUserId), deEsteEvento(claims.estado, 'reservado'))),
      // los regalos grupales de sus deseos y las sorpresas para esa persona (o para esa lista en común), no solo el encargado
      db.select({ userId: groupGiftMembers.userId }).from(groupGiftMembers)
        .innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id))
        .innerJoin(claims, eq(groupGifts.claimId, claims.id))
        .innerJoin(items, eq(groupGifts.itemId, items.id))
        .innerJoin(lists, eq(items.listId, lists.id))
        .where(and(
          or(eq(lists.id, l.id), l.ownerId ? eq(lists.paraUserId, l.ownerId) : undefined, eq(lists.paraListId, l.id)),
          deEsteEvento(groupGifts.estado, 'abierto'),
        )),
    ])
    const no = new Set([l.ownerId, ...duenos.map((d) => d.userId), ...reservaron.map((x) => x.userId), ...enRegalos.map((x) => x.userId)])
    avisados += await deAPocos(siguen.filter((s) => !no.has(s.userId)), (s) => mandar(s.userId, 'cumple_cerca', `${l.id}:${dia(fecha)}`, {
      de: l.ownerId,
      title: `${l.tipo === 'personal' || l.esCumple ? '🎂' : '📅'} ${que} es ${enDias(dias)}`,
      body: 'Todavía no elegiste qué regalar. Mirá la lista y reservá algo, así nadie lo repite.',
      url: `/l/${l.shareToken}`,
    }))
  }
  return avisados
}

/**
 * "Tu cumple es en 30 días": al que cumple, para que ponga su lista al día antes de que su gente salga a comprar. Sale
 * igual para todos, tenga o no reservas su lista: no le dice nada de lo que pasa con sus deseos.
 */
async function recordarTuCumple(db: Db, hoy: Date, mandar: Mandar): Promise<number> {
  const cumplen = await quienesCumplen(db, hoy, TU_CUMPLE_DIAS - MARGEN_DIAS, TU_CUMPLE_DIAS)
  return deAPocos(cumplen, (u) => mandar(u.id, 'tu_cumple', dia(u.fecha), {
    title: `🎂 Tu cumple es ${enDias(u.dias)}`,
    body: 'Poné tu lista al día: sumá lo que querés y sacá lo que ya no, así tu gente sabe qué regalarte.',
    url: '/mi-lista',
  }))
}

/**
 * "Tenés cuentas pendientes": a quien debe plata de un regalo grupal comprado hace una semana o más (y hasta los dos
 * meses), como mucho una vez por semana. A quién y cuánto sale de Cuentas (ver misCuentas), con lo que se deben entre los
 * dos ya descontado y lo que se simplificó: el aviso dice lo mismo que va a ver al abrirla. Como Cuentas, deja afuera los
 * regalos de listas de las que es o fue dueño, y solo nombra personas y montos, no deseos.
 */
async function recordarCuentas(db: Db, ahora: Date, hoy: Date, mandar: Mandar): Promise<number> {
  const saldo = sql<number>`coalesce(${groupGiftMembers.monto}, 0) - ${groupGiftMembers.pagadoMonto}`
  // de cada parte sin saldar, el que debe: quien se sumó o, si pagó de más y se volvió a dividir, el encargado
  const partes = await db.select({ userId: groupGiftMembers.userId, encargadoId: groupGifts.organizerUserId, saldo }).from(groupGiftMembers)
    .innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id))
    .where(and(
      eq(groupGifts.estado, 'comprado'), eq(groupGiftMembers.pagado, false), ne(groupGiftMembers.userId, groupGifts.organizerUserId),
      lte(groupGifts.compradoAt, mas(ahora, -CUENTAS_CADA_DIAS)), gte(groupGifts.compradoAt, mas(ahora, -CUENTAS_HASTA_DIAS)), ne(saldo, 0),
    ))
  const deben = [...new Set(partes.map((p) => (Number(p.saldo) > 0 ? p.userId : p.encargadoId)))]
  if (!deben.length) return 0
  const hace = dia(mas(hoy, -CUENTAS_CADA_DIAS))
  const yaAvisados = new Set((await db.select({ userId: recordatoriosEnviados.userId }).from(recordatoriosEnviados)
    .where(and(inArray(recordatoriosEnviados.userId, deben), eq(recordatoriosEnviados.tipo, 'cuentas'), gt(recordatoriosEnviados.clave, hace))))
    .map((x) => x.userId))
  return deAPocos(deben.filter((id) => !yaAvisados.has(id)), async (userId) => {
    const aQuienes = (await misCuentas(db, userId)).personas.filter((p) => p.neto < 0)
    if (!aQuienes.length) return 0
    const [uno] = aQuienes
    return mandar(userId, 'cuentas', dia(hoy), {
      title: '💸 Tenés cuentas pendientes',
      body: aQuienes.length === 1
        ? `Le debés ${plata(-uno.neto, uno.moneda ?? 'ARS')} a ${primer(uno.nombre)} de los regalos grupales. Cuando le pagues, marcalo en Cuentas.`
        : `Les debés a ${juntarNombres([...new Set(aQuienes.map((p) => primer(p.nombre)))])} de los regalos grupales. Fijate cuánto en Cuentas y marcá lo que ya pagaste.`,
      url: '/cuentas',
    })
  })
}
