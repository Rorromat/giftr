import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { claims, groupGiftMembers, groupGifts, items, listFollows, listMembers, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { esDuenoSql, esUuid, fechaDeGrupoValida, noEsNiFueDuenoSql } from '@/lib/groups'
import { expireStaleClaims } from '@/lib/claims'
import { ultimosRegalos } from '@/lib/regalos'
import { cupoDe } from '@/lib/serialize'

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

const SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "Sábado 22 de agosto" */
export const fechaLarga = (f: Date) => `${SEMANA[f.getUTCDay()]} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}`
/** "22 ago" */
export const fechaCorta = (f: Date) => `${f.getUTCDate()} ${MESES[f.getUTCMonth()].slice(0, 3)}`
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
 * La fecha en la pantalla del grupo: la próxima ("Sábado 22 de agosto · en 10 días"), una única que ya pasó (sigue
 * guardada: "Fue el 1 de marzo de 2026 · cambiar") o ninguna ("Agregar una fecha").
 */
export function rotuloFechaGrupo(eventoFecha: string | null, anual: boolean, hoy: Date): string {
  const fecha = proximaDeGrupo(eventoFecha, anual, hoy)
  if (fecha) {
    const dias = diasEntre(hoy, fecha)
    return `${fechaLarga(fecha)} · ${dias === 0 ? '¡hoy!' : dias === 1 ? 'mañana' : `en ${dias} días`}`
  }
  if (!eventoFecha) return 'Agregar una fecha'
  const [y, m, d] = eventoFecha.split('-').map(Number)
  return `Fue el ${d} de ${MESES[m - 1]} de ${y} · cambiar`
}

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0]

export type Evento = {
  listId: string
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
  /** Solo para el regalador: el último regalo comprado de esa lista y quién se ocupó. */
  ultimo?: { encargado: string; titulo: string; fecha: Date }
}

type ListaRow = typeof lists.$inferSelect
const PESO = { mucho: 0, gustaria: 1, suelta: 2 } as const

/** Los eventos del usuario ordenados por cercanía: los suyos y los de las listas que sigue. */
export async function misEventos(db: Db, userId: string, hoy = hoyLocal()): Promise<Evento[]> {
  const propias = await db.select().from(lists).where(esDuenoSql(db, userId))
  // de las que sigue, ni las suyas ni las de un grupo del que salió: de esas no ve reservas ni regalos (ver acceso.ts)
  const seguidas = await db.select({ list: lists }).from(listFollows)
    .innerJoin(lists, eq(listFollows.listId, lists.id))
    .where(and(eq(listFollows.userId, userId), noEsNiFueDuenoSql(db, userId)))
    .then((rows) => rows.map((r) => r.list))

  const todas: { list: ListaRow; propio: boolean }[] = [
    ...propias.map((list) => ({ list, propio: true })),
    ...seguidas.map((list) => ({ list, propio: false })),
  ]
  if (!todas.length) return []

  // Dueños: el de cada lista personal (con su cumple) y los miembros de cada grupo.
  const ownerIds = todas.flatMap(({ list }) => (list.ownerId ? [list.ownerId] : []))
  const grupoIds = todas.filter(({ list }) => list.tipo === 'grupo').map(({ list }) => list.id)
  const [owners, miembros] = await Promise.all([
    ownerIds.length ? db.select().from(users).where(inArray(users.id, ownerIds)) : [],
    grupoIds.length
      ? db.select({ listId: listMembers.listId, nombre: users.nombre })
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
        listId: list.id, fecha, dias: diasEntre(hoy, fecha), anual: true, cae, propio,
        titulo: propio ? 'Tu cumple' : `Cumple de ${primerNombre(owner.nombre)}`,
        href: propio ? '/mi-lista' : `/l/${list.shareToken}`,
        personas: [owner.nombre],
        contexto: propio ? 'Tu lista' : null,
      })
    } else {
      if (!list.eventoFecha) continue
      const cae = fechaDeGrupo(list.eventoFecha, list.eventoAnual)
      const fecha = proximaVez(cae, hoy)
      if (!fecha) continue
      conFecha.push({
        listId: list.id, fecha, dias: diasEntre(hoy, fecha), anual: list.eventoAnual, cae, propio,
        titulo: list.nombre ?? 'Grupo',
        href: propio ? `/grupos/${list.id}` : `/l/${list.shareToken}`,
        personas: miembros.filter((m) => m.listId === list.id).map((m) => m.nombre),
        contexto: propio ? 'Tu grupo' : 'Grupo',
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
        .where(and(inArray(items.listId, ajenas), eq(items.estadoDueno, 'activo'), inArray(claims.estado, ['reservado', 'comprado'])))
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

  return conFecha.map((e) => {
    // para el regalador, como en su lista: lo que ya no tiene lugar no se muestra (una idea que se puede repetir, sí)
    const fotos = deseos
      .filter((d) => d.listId === e.listId && d.fotoUrl && (e.propio || cupoDe(d, porDeseo.get(d.id) ?? 0).disponible))
      .sort((a, b) => PESO[a.prioridad] - PESO[b.prioridad] || a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, 3).map((d) => d.fotoUrl!)
    if (e.propio) return { ...e, fotos }
    // De qué se ocupa para el evento que viene: lo reservado (vence, o es un regalo grupal abierto) y lo comprado para
    // este (desde el día siguiente al anterior, ver desdeElUltimoEvento): lo que regaló el año pasado ya se regaló.
    // Un regalo grupal abierto cuenta mientras siga abierto, aunque lo hayan armado para el anterior: hasta que lo
    // cierren es lo pendiente de este, como en la lista ("Estás en el regalo grupal", el deseo sigue ocupado y
    // reserveItem devuelve ese). Al encargado se le recuerda que lo cierre (ver regalosParaCerrar).
    const desde = desdeDe(e.cae, hoy, inicioDelDia(hoy))
    const suyos = ocupados.filter((c) => c.listId === e.listId && (c.claimerUserId === userId || enGrupales.has(c.id)) &&
      (c.estado === 'reservado' || c.updatedAt >= desde))
    const grupales = new Set(suyos.filter((c) => enGrupales.has(c.id)).map((c) => c.itemId))
    const u = ultimos.get(e.listId)
    return {
      ...e, fotos, misReservas: new Set(suyos.map((c) => c.itemId)).size, misGrupales: grupales.size,
      ...(u && { ultimo: { encargado: u.encargado, titulo: u.titulo, fecha: u.fecha } }),
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

/** La fecha de una lista: el cumple del dueño (todos los años) o la del grupo. */
async function fechaDeLista(db: Db, listId: string): Promise<(FechaEvento & { esCumple: boolean }) | null> {
  if (!esUuid(listId)) return null
  const [row] = await db.select({ list: lists, cumpleDia: users.cumpleDia, cumpleMes: users.cumpleMes })
    .from(lists).leftJoin(users, eq(lists.ownerId, users.id)).where(eq(lists.id, listId))
  if (!row) return null
  if (row.list.tipo === 'personal') {
    return row.cumpleDia && row.cumpleMes ? { esCumple: true, dia: row.cumpleDia, mes: row.cumpleMes, anio: null, anual: true } : null
  }
  if (!row.list.eventoFecha) return null
  return { esCumple: false, ...fechaDeGrupo(row.list.eventoFecha, row.list.eventoAnual) }
}

/** El próximo evento de una lista (cumple del dueño o fecha del grupo), para la cuenta regresiva. */
export async function eventoDeLista(db: Db, listId: string, hoy = hoyLocal()) {
  const f = await fechaDeLista(db, listId)
  const fecha = f && proximaVez(f, hoy)
  if (!f || !fecha) return null
  return { esCumple: f.esCumple, fecha, dias: diasEntre(hoy, fecha) }
}

/** desdeElUltimoEvento con la fecha ya leída (null: la lista no tiene). */
function desdeDe(f: FechaEvento | null, hoy: Date, ahora: Date): Date {
  const anterior = f && vezAnterior(f, hoy)
  return anterior ? inicioDelDia(new Date(anterior.getTime() + DIA)) : new Date(ahora.getTime() - 365 * DIA)
}

/**
 * Desde cuándo algo es "para el evento que viene" en una lista: desde el día siguiente al último que ya pasó (el cumple
 * del dueño o la fecha del grupo; el día del evento todavía es de ese). Sin uno anterior (sin fecha, o una que todavía
 * no cayó nunca), un año para atrás. Lo de antes ya se regaló: es historial.
 */
export async function desdeElUltimoEvento(db: Db, listId: string, ahora = new Date()): Promise<Date> {
  return desdeDe(await fechaDeLista(db, listId), hoyLocal(ahora), ahora)
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

/** Una fecha anual ('YYYY-MM-DD') que ya cayó alguna vez: tal cual, o con el último año en que cayó (el 29/2, el último bisiesto). */
function conUnaVezQueYaCayo(fecha: string, hoy: Date): string {
  const f = fechaDeGrupo(fecha, true)
  if (vezAnterior(f, hoy)) return fecha
  let anio = hoy.getUTCFullYear()
  while ((f.mes === 2 && f.dia === 29 && !esBisiesto(anio)) || new Date(Date.UTC(anio, f.mes - 1, f.dia)) >= hoy) anio--
  return `${anio}${fecha.slice(4)}`
}

/** La fecha de un grupo para el formulario: si es anual, la próxima vez (el año guardado es el de la primera). */
export function fechaParaEditar(eventoFecha: string | null, anual: boolean, hoy: Date): string {
  const proxima = anual ? proximaDeGrupo(eventoFecha, true, hoy) : null
  return proxima ? proxima.toISOString().slice(0, 10) : eventoFecha ?? ''
}

/**
 * Fecha del grupo: 'YYYY-MM-DD' o null para quitarla. Solo un dueño del grupo puede cambiarla. Una que no existe, no.
 * Un grupo que ya tuvo su evento no vuelve a empezar: una anual que todavía no cayó nunca (le corrigen el día poniendo el
 * del año que viene) se guarda con el último año en que ya cayó. Si no, vezAnterior no lo encontraría y lo comprado para
 * el que pasó volvería a ser de este (ver desdeElUltimoEvento). Sin uno que ya pasó (el casamiento a futuro), tal cual.
 */
export async function guardarFechaGrupo(
  db: Db, listId: string, userId: string, fecha: string | null, anual: boolean, hoy = hoyLocal(),
): Promise<boolean> {
  if (!esUuid(listId)) return false
  if (fecha !== null && !fechaDeGrupoValida(fecha)) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [antes] = await t.select({ eventoFecha: lists.eventoFecha, eventoAnual: lists.eventoAnual }).from(lists)
      .where(and(eq(lists.id, listId), eq(lists.tipo, 'grupo'), esDuenoSql(t, userId))).for('update')
    if (!antes) return false
    const yaFue = antes.eventoFecha && vezAnterior(fechaDeGrupo(antes.eventoFecha, antes.eventoAnual), hoy)
    await t.update(lists).set({ eventoFecha: fecha && anual && yaFue ? conUnaVezQueYaCayo(fecha, hoy) : fecha, eventoAnual: anual })
      .where(eq(lists.id, listId))
    return true
  })
}

export type MesCalendario = { nombre: string; dias: number; eventos: number[]; hoy: number | null; actual: boolean }

/**
 * Los 12 meses del año de hoy con los días que tienen eventos: los anuales en el día en que caen este año (el 29/2, el
 * 28 si este no es bisiesto, como en proximaFecha), si ya había sido la primera vez; los únicos, solo si son de este año.
 */
export function calendarioDelAnio(eventos: Pick<Evento, 'cae'>[], hoy: Date): MesCalendario[] {
  const anio = hoy.getUTCFullYear()
  const enEsteAnio = eventos.flatMap(({ cae: f }) => {
    if (!f.anual) return f.anio === anio ? [new Date(Date.UTC(anio, f.mes - 1, f.dia))] : []
    const dia = enAnio(f.dia, f.mes, anio)
    const primera = primeraVez(f)
    return primera && dia < primera ? [] : [dia]
  })
  return MESES.map((nombre, m) => ({
    nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1, 3),
    dias: new Date(Date.UTC(anio, m + 1, 0)).getUTCDate(),
    eventos: [...new Set(enEsteAnio.filter((f) => f.getUTCMonth() === m).map((f) => f.getUTCDate()))],
    hoy: hoy.getUTCMonth() === m ? hoy.getUTCDate() : null,
    actual: hoy.getUTCMonth() === m,
  }))
}
