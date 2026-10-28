import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { claims, groupGiftMembers, groupGifts, items, listFollows, listMembers, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { esDuenoSql, esUuid, fechaDeGrupoValida, noEsNiFueDuenoSql, relacionDeLista, tituloDelGrupo, tuParentesco } from '@/lib/groups'
import { expireStaleClaims, ocupaSql } from '@/lib/claims'
import { ultimosRegalos } from '@/lib/regalos'
import { cupoDe } from '@/lib/serialize'
import { urlFoto } from '@/lib/users'

// Eventos: los cumples de la gente cuyas listas abriste (las que "seguís") y las fechas de tus grupos,
// más los tuyos. Las fechas se manejan como Date UTC a medianoche para que no se corran con la hora.

export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'

/** Hoy, sin hora, en la zona de la app. */
export function hoyLocal(ahora = new Date()): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(ahora).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** El momento en que empieza, en la zona de la app, un día de los de acá (Date UTC a medianoche). */
export function inicioDelDia(dia: Date): Date {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(dia).map((x) => [x.type, Number(x.value)]))
  // cuánto le lleva la zona a UTC en ese momento (Argentina: 3 horas)
  const diferencia = dia.getTime() - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  return new Date(dia.getTime() + diferencia)
}

const esBisiesto = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** El día/mes en un año dado; el 29/2 cae el 28/2 en los años que no son bisiestos. */
export function enAnio(dia: number, mes: number, anio: number): Date {
  return new Date(Date.UTC(anio, mes - 1, mes === 2 && dia === 29 && !esBisiesto(anio) ? 28 : dia))
}

/** La próxima vez (hoy incluido) que cae un día/mes. */
export function proximaFecha(dia: number, mes: number, hoy: Date): Date {
  const esteAnio = enAnio(dia, mes, hoy.getUTCFullYear())
  return esteAnio >= hoy ? esteAnio : enAnio(dia, mes, hoy.getUTCFullYear() + 1)
}

const DIA = 86400_000
export const diasEntre = (desde: Date, hasta: Date) => Math.round((hasta.getTime() - desde.getTime()) / DIA)

export const SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** A más de esto, una fecha del año que viene es una que este año pasó hace poco (ver anioSiEstaLejos). */
const CASI_UN_ANIO = 300

/**
 * El año de una fecha, si sin él se lee mal; si no, null. Va cuando no es la próxima vez que cae ese día (está a más de un
 * año, como un casamiento a 13 meses: sin el año, "20 de noviembre" se lee como el que viene) y cuando es del año que viene
 * pero este año pasó hace poco (el 26 de octubre, un cumple del 2 de octubre es el de 2027: sin el año parece que ya pasó).
 * Una del año que viene que está más cerca ("5 de enero" en octubre, "29 de febrero" en junio) se entiende sin él.
 */
export function anioSiEstaLejos(f: Date, hoy: Date): number | null {
  const esLaProxima = f.getTime() === proximaFecha(f.getUTCDate(), f.getUTCMonth() + 1, hoy).getTime()
  const pasoHacePoco = f.getUTCFullYear() > hoy.getUTCFullYear() && diasEntre(hoy, f) > CASI_UN_ANIO
  return esLaProxima && !pasoHacePoco ? null : f.getUTCFullYear()
}

/** Hasta cuántos días adelante va un evento en el carrusel de Próximos (lo de después, en Todo el año). */
export const HORIZONTE_PROXIMOS = 90

/** Cuántos van en el carrusel de Próximos, en Inicio: más, satura (el resto, en Todo el año). */
export const PROXIMOS_EN_INICIO = 5

/**
 * Lo que va en el carrusel de Próximos (todo junto y ordenado por cercanía: eventos y fechas especiales): los primeros 5
 * de los próximos tres meses, y cuántos más hay (para "Todo el año"). Un cumple que pasó hace unos días es el del año que
 * viene: no va como próximo.
 */
export function repartirProximos<T extends { dias: number }>(eventos: T[]): { primeros: T[]; quedan: number } {
  const primeros = eventos.filter((e) => e.dias <= HORIZONTE_PROXIMOS).slice(0, PROXIMOS_EN_INICIO)
  return { primeros, quedan: eventos.length - primeros.length }
}

/** "Sábado 22 de agosto"; con hoy, "Sábado 20 de noviembre de 2027" si está a más de un año. */
export function fechaLarga(f: Date, hoy?: Date) {
  const anio = hoy && anioSiEstaLejos(f, hoy)
  return `${SEMANA[f.getUTCDay()]} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}${anio ? ` de ${anio}` : ''}`
}
/** "22 ago"; con hoy, "20 nov 2027" si está a más de un año. */
export function fechaCorta(f: Date, hoy?: Date) {
  const anio = hoy && anioSiEstaLejos(f, hoy)
  return `${f.getUTCDate()} ${MESES[f.getUTCMonth()].slice(0, 3)}${anio ? ` ${anio}` : ''}`
}
/** "12/10" */
export const diaMes = (f: Date) => `${f.getUTCDate()}/${f.getUTCMonth() + 1}`

/**
 * Cuándo cae un evento: el cumple del dueño (todos los años, sin año: anio null) o la fecha de un grupo, que es la de la
 * primera vez (anual o una sola).
 */
export type FechaEvento = { dia: number; mes: number; anio: number | null; anual: boolean }

export function fechaDeGrupo(eventoFecha: string, anual: boolean): FechaEvento {
  const [anio, mes, dia] = eventoFecha.split('-').map(Number)
  return { dia, mes, anio, anual }
}

const primeraVez = (f: FechaEvento) => (f.anio === null ? null : new Date(Date.UTC(f.anio, f.mes - 1, f.dia)))

/**
 * La próxima vez (hoy incluido) que cae, o null si era una sola y ya pasó. Uno anual nunca antes de la primera: un
 * casamiento cargado para dentro de un año y medio (con "Se repite todos los años" tildado) no es dentro de un mes.
 */
export function proximaVez(f: FechaEvento, hoy: Date): Date | null {
  const primera = primeraVez(f)
  if (primera && primera >= hoy) return primera
  return f.anual ? proximaFecha(f.dia, f.mes, hoy) : null
}

/** La última vez que cayó antes de hoy, o null si todavía no cayó nunca. */
export function vezAnterior(f: FechaEvento, hoy: Date): Date | null {
  const primera = primeraVez(f)
  if (!f.anual) return primera && primera < hoy ? primera : null
  const esteAnio = enAnio(f.dia, f.mes, hoy.getUTCFullYear())
  const anterior = esteAnio < hoy ? esteAnio : enAnio(f.dia, f.mes, hoy.getUTCFullYear() - 1)
  return primera && anterior < primera ? null : anterior
}

/** Fecha de un grupo ('YYYY-MM-DD') vista desde hoy: la próxima si es anual, o la única si todavía no pasó. */
export function proximaDeGrupo(eventoFecha: string | null, anual: boolean, hoy: Date): Date | null {
  return eventoFecha ? proximaVez(fechaDeGrupo(eventoFecha, anual), hoy) : null
}

/**
 * La fecha en la pantalla del grupo: la próxima ("Sábado 22 de agosto · en 10 días"; la de un cumple, "Cumple el sábado
 * 22 de agosto · en 10 días"), una única que ya pasó (sigue guardada: "Fue el 1 de marzo de 2026 · cambiar") o ninguna
 * ("Agregar una fecha", "Agregar su cumple").
 */
export function rotuloFechaGrupo(eventoFecha: string | null, anual: boolean, hoy: Date, esCumple = false): string {
  const fecha = proximaDeGrupo(eventoFecha, anual, hoy)
  if (fecha) {
    const dias = diasEntre(hoy, fecha)
    const larga = fechaLarga(fecha, hoy)
    return `${esCumple ? `Cumple el ${larga.charAt(0).toLowerCase()}${larga.slice(1)}` : larga} · ${dias === 0 ? '¡hoy!' : dias === 1 ? 'mañana' : `en ${dias} días`}`
  }
  if (!eventoFecha) return esCumple ? 'Agregar su cumple' : 'Agregar una fecha'
  const [y, m, d] = eventoFecha.split('-').map(Number)
  return `Fue el ${d} de ${MESES[m - 1]} de ${y} · cambiar`
}

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0]

export type Evento = {
  listId: string
  /** El cumple de alguien (o el tuyo), la fecha de un grupo o una sorpresa para alguien que no usa GiftR. */
  tipo: 'cumple' | 'grupo' | 'sorpresa'
  titulo: string
  /** La próxima vez que cae. */
  fecha: Date
  dias: number
  anual: boolean
  /** Cuándo cae (para la grilla del año: el día de cada año, no el de la próxima vez). */
  cae: FechaEvento
  propio: boolean
  href: string
  personas: string[]
  /** La foto de cada una de personas, en el mismo orden (la suya o la de Google; null, sus iniciales). */
  caras: (string | null)[]
  contexto: string | null
  /** Hasta 3 fotos de los deseos que más quiere. Si sos regalador, solo los que todavía se pueden reservar. */
  fotos: string[]
  /**
   * Solo para el regalador: de cuántos deseos de esa lista te ocupás para este evento (ver misEventos): lo que reservaste
   * o compraste y los regalos grupales en los que estás. Nunca está en eventos propios.
   */
  misReservas?: number
  /** Solo para el regalador: de esos, en cuántos estás en un regalo grupal. */
  misGrupales?: number
  /** Solo para el regalador: y en cuántas sorpresas para esa persona (regalos que no están en su lista, ver sorpresas.ts). */
  misSorpresas?: number
  /** Solo para el regalador: el último regalo comprado de esa lista y quién se ocupó. */
  ultimo?: { encargado: string; titulo: string; fecha: Date }
}

type ListaRow = typeof lists.$inferSelect
const PESO = { mucho: 0, gustaria: 1, suelta: 2 } as const

/**
 * Las sorpresas en las que está (como encargado o sumado) que siguen en pie: el regalo abierto o comprado. Las de alguien
 * de GiftR van en su cumple (misSorpresas); las de alguien sin GiftR con fecha, como un evento propio de esa sorpresa.
 */
async function sorpresasEnLasQueEsta(db: Db, userId: string) {
  return db.select({ list: lists, estado: groupGifts.estado, compradoEl: claims.updatedAt }).from(groupGiftMembers)
    .innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id))
    .innerJoin(claims, eq(groupGifts.claimId, claims.id))
    .innerJoin(items, eq(groupGifts.itemId, items.id))
    .innerJoin(lists, eq(items.listId, lists.id))
    .where(and(
      eq(groupGiftMembers.userId, userId), inArray(groupGifts.estado, ['abierto', 'comprado']), eq(lists.tipo, 'sorpresa'),
      eq(items.estadoDueno, 'activo'), noEsNiFueDuenoSql(db, userId),
    ))
}

/** Los eventos del usuario ordenados por cercanía: los suyos y los de las listas que sigue. */
export async function misEventos(db: Db, userId: string, hoy = hoyLocal()): Promise<Evento[]> {
  const propias = await db.select().from(lists).where(esDuenoSql(db, userId))
  // de las que sigue, ni las suyas ni las de un grupo del que salió: de esas no ve reservas ni regalos (ver acceso.ts)
  const seguidas = await db.select({ list: lists }).from(listFollows)
    .innerJoin(lists, eq(listFollows.listId, lists.id))
    .where(and(eq(listFollows.userId, userId), noEsNiFueDuenoSql(db, userId)))
    .then((rows) => rows.map((r) => r.list))
  const sorpresas = await sorpresasEnLasQueEsta(db, userId)

  const todas: { list: ListaRow; propio: boolean }[] = [
    ...propias.map((list) => ({ list, propio: true })),
    ...seguidas.filter((list) => list.tipo !== 'sorpresa').map((list) => ({ list, propio: false })),
    // las de alguien sin GiftR, que tienen su propia fecha
    ...sorpresas.filter((r) => !r.list.paraUserId && r.list.eventoFecha).map(({ list }) => ({ list, propio: false })),
  ]
  if (!todas.length) return []

  // Dueños: el de cada lista personal (con su cumple) y los miembros de cada grupo.
  const ownerIds = todas.flatMap(({ list }) => (list.ownerId ? [list.ownerId] : []))
  const grupoIds = todas.filter(({ list }) => list.tipo === 'grupo').map(({ list }) => list.id)
  const [owners, miembros] = await Promise.all([
    ownerIds.length ? db.select().from(users).where(inArray(users.id, ownerIds)) : [],
    grupoIds.length
      ? db.select({
        listId: listMembers.listId, nombre: users.nombre, id: users.id, fotoAt: users.fotoAt, avatarUrl: users.avatarUrl,
        parentesco: listMembers.parentesco,
      })
        .from(listMembers).innerJoin(users, eq(listMembers.userId, users.id))
        .where(and(inArray(listMembers.listId, grupoIds), isNull(listMembers.salioAt))).orderBy(asc(listMembers.createdAt))
      : [],
  ])

  const conFecha: Omit<Evento, 'fotos' | 'misReservas' | 'misGrupales' | 'ultimo'>[] = []
  for (const { list, propio } of todas) {
    if (list.tipo === 'personal') {
      const owner = owners.find((o) => o.id === list.ownerId)
      if (!owner?.cumpleDia || !owner.cumpleMes) continue
      const cae: FechaEvento = { dia: owner.cumpleDia, mes: owner.cumpleMes, anio: null, anual: true }
      const fecha = proximaFecha(cae.dia, cae.mes, hoy)
      conFecha.push({
        listId: list.id, tipo: 'cumple', fecha, dias: diasEntre(hoy, fecha), anual: true, cae, propio,
        titulo: propio ? 'Tu cumple' : `Cumple de ${primerNombre(owner.nombre)}`,
        href: propio ? '/mi-lista' : `/l/${list.shareToken}`,
        personas: [owner.nombre],
        caras: [urlFoto(owner)],
        contexto: propio ? 'Tu lista' : null,
      })
    } else {
      if (!list.eventoFecha) continue
      const cae = fechaDeGrupo(list.eventoFecha, list.eventoAnual)
      const fecha = proximaVez(cae, hoy)
      if (!fecha) continue
      const sorpresa = list.tipo === 'sorpresa'
      const delGrupo = miembros.filter((m) => m.listId === list.id)
      // qué es para él (si es uno de los dueños) o para los dueños ("Hijo de Rodri y Euge")
      const suyo = delGrupo.find((m) => m.id === userId)?.parentesco
      const relacion = propio ? suyo && tuParentesco(suyo) : relacionDeLista(delGrupo)
      // con foto, la del grupo (la cara de Juancito); si no, la de cada dueño
      const conFoto = !sorpresa && list.fotoUrl
      conFecha.push({
        listId: list.id, tipo: sorpresa ? 'sorpresa' : 'grupo', fecha, dias: diasEntre(hoy, fecha), anual: list.eventoAnual, cae, propio,
        titulo: sorpresa ? `Sorpresa para ${list.nombre ?? 'alguien'}` : tituloDelGrupo(list.nombre ?? 'Grupo', list.esCumple),
        href: sorpresa ? `/sorpresa/${list.shareToken}` : propio ? `/grupos/${list.id}` : `/l/${list.shareToken}`,
        personas: sorpresa || conFoto ? [list.nombre ?? 'Alguien'] : delGrupo.map((m) => m.nombre),
        caras: sorpresa ? [null] : conFoto ? [list.fotoUrl] : delGrupo.map(urlFoto),
        contexto: sorpresa ? 'No usa GiftR' : relacion || (propio ? 'Tu grupo' : 'Grupo'),
      })
    }
  }
  if (!conFecha.length) return []

  const ids = conFecha.map((e) => e.listId)
  const ajenas = conFecha.filter((e) => !e.propio).map((e) => e.listId)
  if (ajenas.length) await expireStaleClaims(db)
  const [deseos, ocupados, enGrupales, ultimos] = await Promise.all([
    db.select({
      id: items.id, listId: items.listId, fotoUrl: items.fotoUrl, prioridad: items.prioridad, createdAt: items.createdAt,
      tipo: items.tipo, repetible: items.repetible, cantidad: items.cantidad,
    }).from(items).where(and(inArray(items.listId, ids), eq(items.estadoDueno, 'activo'))),
    // reservas solo de listas ajenas, y de deseos que siguen en la lista: el dueño nunca recibe información de reservas
    ajenas.length
      ? db.select({
        id: claims.id, itemId: claims.itemId, claimerUserId: claims.claimerUserId, listId: items.listId,
        estado: claims.estado, updatedAt: claims.updatedAt,
      })
        .from(claims).innerJoin(items, eq(claims.itemId, items.id))
        .where(and(inArray(items.listId, ajenas), eq(items.estadoDueno, 'activo'), ocupaSql(null)))
      : [],
    // los regalos grupales en los que está (como encargado o sumado): su reserva es una sola, a nombre del encargado
    ajenas.length
      ? db.select({ claimId: groupGifts.claimId }).from(groupGiftMembers)
        .innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id))
        .innerJoin(items, eq(groupGifts.itemId, items.id))
        .where(and(eq(groupGiftMembers.userId, userId), inArray(groupGifts.estado, ['abierto', 'comprado']), inArray(items.listId, ajenas)))
        .then((rows) => new Set(rows.map((r) => r.claimId)))
      : new Set<string>(),
    ultimosRegalos(db, userId, ajenas),
  ])
  const porDeseo = new Map<string, number>()
  for (const c of ocupados) porDeseo.set(c.itemId, (porDeseo.get(c.itemId) ?? 0) + 1)
  const cortes = new Map(todas.map(({ list }) => [list.id, list.corteEvento]))

  const esSorpresa = new Set(sorpresas.map((r) => r.list.id))
  return conFecha.map((e) => {
    // para el regalador, como en su lista: lo que ya no tiene lugar no se muestra (una idea que se puede repetir, sí). De
    // una sorpresa, lo que le regalan.
    const fotos = deseos
      .filter((d) => d.listId === e.listId && d.fotoUrl && (e.propio || esSorpresa.has(e.listId) || cupoDe(d, porDeseo.get(d.id) ?? 0).disponible))
      .sort((a, b) => PESO[a.prioridad] - PESO[b.prioridad] || a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, 3).map((d) => d.fotoUrl!)
    if (e.propio) return { ...e, fotos }
    // De qué se ocupa para el evento que viene: lo reservado (vence, o es un regalo grupal abierto) y lo comprado para
    // este (desde el día siguiente al anterior, ver desdeElUltimoEvento): lo que regaló el año pasado ya se regaló.
    // Un regalo grupal abierto cuenta mientras siga abierto, aunque lo hayan armado para el anterior: hasta que lo
    // cierren es lo pendiente de este, como en la lista ("Estás en el regalo grupal", el deseo sigue ocupado y
    // reserveItem devuelve ese). Al encargado se le recuerda que lo cierre (ver regalosParaCerrar).
    const desde = desdeDe(e.cae, cortes.get(e.listId) ?? null, hoy, inicioDelDia(hoy))
    const suyos = ocupados.filter((c) => c.listId === e.listId && (c.claimerUserId === userId || enGrupales.has(c.id)) &&
      (c.estado === 'reservado' || c.updatedAt >= desde))
    const grupales = new Set(suyos.filter((c) => enGrupales.has(c.id)).map((c) => c.itemId))
    const u = ultimos.get(e.listId)
    // una sorpresa es un regalo grupal; en el cumple de alguien, también las sorpresas para él de este evento
    const enSorpresa = esSorpresa.has(e.listId)
    const paraEl = enSorpresa ? 0 : sorpresas.filter((r) => {
      const l = todas.find((t) => t.list.id === e.listId)?.list
      return !!l?.ownerId && r.list.paraUserId === l.ownerId && (r.estado === 'abierto' || r.compradoEl >= desde)
    }).length
    return {
      ...e, fotos, misReservas: new Set(suyos.map((c) => c.itemId)).size + paraEl,
      misGrupales: enSorpresa ? 0 : grupales.size, misSorpresas: enSorpresa ? grupales.size : paraEl,
      ...(u && !enSorpresa && { ultimo: { encargado: u.encargado, titulo: u.titulo, fecha: u.fecha } }),
    }
  }).sort((a, b) => a.dias - b.dias || a.titulo.localeCompare(b.titulo))
}

/**
 * Guarda la lista entre las que sigue el usuario: al abrir con sesión cualquier página de una lista ajena (la lista, un
 * deseo, el perfil de un dueño), también al volver de entrar con Google desde ahí. Solo si el link con el que la abrió
 * (shareToken) sigue siendo el de la lista: si lo cambiaron mientras cargaba la página, no la sigue con el nuevo (ver
 * cambiarLinkParaRegalar). El FOR SHARE espera a un cambio en curso y, si no, lo hace esperar hasta después de anotarla,
 * así su DELETE también se lleva esta.
 */
export async function seguirLista(db: Db, userId: string, listId: string, shareToken: string) {
  const fila = { userId: sql<string>`${userId}::uuid`.as('user_id'), listId: lists.id, createdAt: sql<Date>`now()`.as('created_at') }
  await db.insert(listFollows)
    .select(db.select(fila).from(lists).where(and(eq(lists.id, listId), eq(lists.shareToken, shareToken))).for('share'))
    .onConflictDoNothing()
}

/** La saca de las que sigue: deja de estar en Tu gente y en Eventos (vuelve si abre la lista de nuevo). */
export async function dejarDeSeguir(db: Db, userId: string, listId: string) {
  if (!esUuid(listId)) return
  await db.delete(listFollows).where(and(eq(listFollows.userId, userId), eq(listFollows.listId, listId)))
}

/**
 * La fecha de una lista (el cumple del dueño, todos los años, o la del grupo; null si no tiene) y su corteEvento. La de
 * una sorpresa: el cumple de quien la recibe o, si no usa GiftR, la que cargaron (una sola vez).
 */
async function fechaDeLista(db: Db, listId: string): Promise<{ f: (FechaEvento & { esCumple: boolean }) | null; corte: Date | null }> {
  if (!esUuid(listId)) return { f: null, corte: null }
  const [row] = await db.select({ list: lists, cumpleDia: users.cumpleDia, cumpleMes: users.cumpleMes })
    .from(lists).leftJoin(users, eq(sql`coalesce(${lists.ownerId}, ${lists.paraUserId})`, users.id)).where(eq(lists.id, listId))
  if (!row) return { f: null, corte: null }
  const corte = row.list.corteEvento
  if (row.list.tipo === 'personal' || row.list.paraUserId) {
    return { corte, f: row.cumpleDia && row.cumpleMes ? { esCumple: true, dia: row.cumpleDia, mes: row.cumpleMes, anio: null, anual: true } : null }
  }
  return { corte, f: row.list.eventoFecha ? { esCumple: row.list.esCumple, ...fechaDeGrupo(row.list.eventoFecha, row.list.eventoAnual) } : null }
}

/** El próximo evento de una lista (cumple del dueño o fecha del grupo), para la cuenta regresiva. */
export async function eventoDeLista(db: Db, listId: string, hoy = hoyLocal()) {
  const { f } = await fechaDeLista(db, listId)
  const fecha = f && proximaVez(f, hoy)
  if (!f || !fecha) return null
  return { esCumple: f.esCumple, fecha, dias: diasEntre(hoy, fecha) }
}

/**
 * desdeElUltimoEvento con la fecha (null: la lista no tiene) y el corteEvento ya leídos. El corte es del momento en que
 * cambiaron la fecha: mirado desde antes (ver cuandoRecordar), todavía no valía.
 */
function desdeDe(f: FechaEvento | null, corte: Date | null, hoy: Date, ahora: Date): Date {
  const anterior = f && vezAnterior(f, hoy)
  // una fecha que todavía no cayó nunca: todo lo comprado es para esa, aunque falte más de un año (el casamiento a 13 meses)
  const deLaFecha = anterior ? inicioDelDia(new Date(anterior.getTime() + DIA)) : f ? new Date(0) : new Date(ahora.getTime() - 365 * DIA)
  return corte && corte <= ahora && corte > deLaFecha ? corte : deLaFecha
}

/**
 * Desde cuándo algo es "para el evento que viene" en una lista: desde el día siguiente al último que ya pasó (el cumple
 * del dueño o la fecha del grupo; el día del evento todavía es de ese). Con una fecha que todavía no cayó nunca, todo; sin
 * fecha, un año para atrás. Si le cambiaron la fecha, nunca antes que con la que tenía (corteEvento, ver
 * guardarFechaGrupo). Lo de antes ya se regaló: es historial.
 */
export async function desdeElUltimoEvento(db: Db, listId: string, ahora = new Date()): Promise<Date> {
  const { f, corte } = await fechaDeLista(db, listId)
  return desdeDe(f, corte, hoyLocal(ahora), ahora)
}

export async function miCumple(db: Db, userId: string): Promise<{ dia: number; mes: number } | null> {
  const [u] = await db.select({ dia: users.cumpleDia, mes: users.cumpleMes }).from(users).where(eq(users.id, userId))
  return u?.dia && u.mes ? { dia: u.dia, mes: u.mes } : null
}

export async function guardarCumple(db: Db, userId: string, dia: number | null, mes: number | null): Promise<boolean> {
  // 2024 es bisiesto: acepta el 29/2.
  const borrar = dia === null && mes === null
  const valido = dia !== null && mes !== null && mes >= 1 && mes <= 12 && dia >= 1 && dia <= new Date(Date.UTC(2024, mes, 0)).getUTCDate()
  if (!borrar && !valido) return false
  await db.update(users).set({ cumpleDia: dia, cumpleMes: mes }).where(eq(users.id, userId))
  return true
}

/** La fecha de un grupo para el formulario: si es anual, la próxima vez (el año guardado es el de la primera). */
export function fechaParaEditar(eventoFecha: string | null, anual: boolean, hoy: Date): string {
  const proxima = anual ? proximaDeGrupo(eventoFecha, true, hoy) : null
  return proxima ? proxima.toISOString().slice(0, 10) : eventoFecha ?? ''
}

/**
 * Fecha del grupo: 'YYYY-MM-DD' o null para quitarla. Solo un dueño del grupo puede cambiarla. Una que no existe, no.
 * esCumple: el grupo es el cumple de alguien (la fecha viene de fechaDeCumple y se repite todos los años); si no, deja de
 * serlo. El cumple que ya tenía, guardado de nuevo, queda como estaba.
 * Se guarda como la cargaron: en una anual, el año es el de la primera vez (un casamiento a más de un año no es este
 * noviembre). Lo del evento que ya pasó no vuelve a ser de este: en corteEvento queda desde cuándo lo comprado era para
 * el que venía con la fecha de antes (ver desdeElUltimoEvento), aunque la nueva no lo encuentre (una única que ya fue y
 * se cambia por otra, una anual que pasa a única o cambia de día, quitarla y volver a ponerla).
 * La próxima vez de la anual que ya tenía (la que muestra el formulario, ver fechaParaEditar) no la cambia: guardar sin
 * tocar la fecha no corre la primera vez. Y si esa próxima es del año que viene, cambiarle solo el día no la manda a ese.
 */
export async function guardarFechaGrupo(
  db: Db, listId: string, userId: string, fecha: string | null, anual: boolean, ahora = new Date(), esCumple = false,
): Promise<boolean> {
  if (esCumple) anual = true
  if (!esUuid(listId)) return false
  if (fecha !== null && !fechaDeGrupoValida(fecha)) return false
  const hoy = hoyLocal(ahora)
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [antes] = await t.select({ eventoFecha: lists.eventoFecha, eventoAnual: lists.eventoAnual, corte: lists.corteEvento })
      .from(lists).where(and(eq(lists.id, listId), eq(lists.tipo, 'grupo'), esDuenoSql(t, userId))).for('update')
    if (!antes) return false
    const hoyIso = hoy.toISOString().slice(0, 10)
    const mostrada = antes.eventoFecha && antes.eventoAnual ? fechaParaEditar(antes.eventoFecha, true, hoy) : null
    // el cumple se edita con el día y el mes de siempre (ver fechaDeCumple), no con la próxima vez
    const sigueIgual = esCumple ? fecha === antes.eventoFecha && antes.eventoAnual : anual && !!mostrada && fecha === mostrada
    // En una anual que ya cayó, el formulario muestra la próxima, que puede ser del año que viene: si dejan ese año y
    // cambian el día por uno que todavía no llegó en este, es en este (el 21/10, corregir el 12/10 por el 25 es en 4 días,
    // no en 2027). El servidor no lo distingue de quien quería ese año, y se ve en el rótulo: volver a guardar con el año
    // que viene se respeta (ya no es el que muestra el formulario). Así se saltea una vez, o se corrige una fecha cargada
    // con un año pasado (el casamiento de 2025 que es el 20/11/2027 queda el 20/11 de este año hasta que lo vuelven a
    // guardar); y por lo mismo un doble envío, o dos co-dueños que corrigen lo mismo, la mandan al año que viene.
    // El 29/2 de un año que no es bisiesto no existe: se guarda el de cuatro años antes, que este año cae el 28/2 (enAnio).
    const anio = fecha ? Number(fecha.slice(0, 4)) : 0
    const unAnioAntes = fecha ? `${anio - 1}${fecha.slice(4)}` : null // '2027-02-29' no existe, pero se compara bien con hoy
    const esDeEsteAnio = !esCumple && anual && !!mostrada && !!fecha && !!unAnioAntes && antes.eventoFecha! < hoyIso
      && fecha.slice(0, 4) === mostrada.slice(0, 4) && unAnioAntes >= hoyIso
    const deEsteAnio = unAnioAntes && fechaDeGrupoValida(unAnioAntes) ? unAnioAntes : `${anio - 4}${fecha?.slice(4)}`
    const corte = desdeDe(antes.eventoFecha ? fechaDeGrupo(antes.eventoFecha, antes.eventoAnual) : null, antes.corte, hoy, ahora)
    await t.update(lists).set({
      eventoFecha: sigueIgual ? antes.eventoFecha : esDeEsteAnio ? deEsteAnio : fecha, eventoAnual: anual, esCumple,
      // la de antes todavía no había caído nunca: no hay corte. La misma de antes, el que tenía.
      corteEvento: sigueIgual && esCumple ? antes.corte : corte.getTime() > 0 ? corte : null,
    }).where(eq(lists.id, listId))
    return true
  })
}

export type MesCalendario = {
  /** "Oct" */
  nombre: string
  /** "Octubre" */
  largo: string
  dias: number
  /** El día de la semana del 1, con la semana de lunes a domingo (0 lunes … 6 domingo): dónde arranca la grilla del mes. */
  empiezaEn: number
  eventos: number[]
  hoy: number | null
  actual: boolean
}

/**
 * El día en que cae en un año, o null si ese año no cae: los anuales, en el día de ese año (el 29/2, el 28 si no es
 * bisiesto, como en proximaFecha) si ya había sido la primera vez; los únicos, solo si son de ese año.
 */
export function diaEnElAnio(f: FechaEvento, anio: number): Date | null {
  if (!f.anual) return f.anio === anio ? new Date(Date.UTC(anio, f.mes - 1, f.dia)) : null
  const dia = enAnio(f.dia, f.mes, anio)
  const primera = primeraVez(f)
  return primera && dia < primera ? null : dia
}

/** Los 12 meses del año de hoy con los días que tienen eventos (ver diaEnElAnio). */
export function calendarioDelAnio(eventos: Pick<Evento, 'cae'>[], hoy: Date): MesCalendario[] {
  const anio = hoy.getUTCFullYear()
  const enEsteAnio = eventos.flatMap(({ cae }) => diaEnElAnio(cae, anio) ?? [])
  return MESES.map((nombre, m) => ({
    nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1, 3),
    largo: nombre.charAt(0).toUpperCase() + nombre.slice(1),
    dias: new Date(Date.UTC(anio, m + 1, 0)).getUTCDate(),
    empiezaEn: (new Date(Date.UTC(anio, m, 1)).getUTCDay() + 6) % 7,
    eventos: [...new Set(enEsteAnio.filter((f) => f.getUTCMonth() === m).map((f) => f.getUTCDate()))],
    hoy: hoy.getUTCMonth() === m ? hoy.getUTCDate() : null,
    actual: hoy.getUTCMonth() === m,
  }))
}
