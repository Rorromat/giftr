import { and, asc, eq, inArray, notInArray } from 'drizzle-orm'
import { claims, items, listFollows, listMembers, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { esDuenoSql, esUuid } from '@/lib/groups'
import { expireStaleClaims } from '@/lib/claims'
import { ultimosRegalos } from '@/lib/regalos'

// Eventos: los cumples de la gente cuyas listas abriste (las que "seguís") y las fechas de tus grupos,
// más los tuyos. Las fechas se manejan como Date UTC a medianoche para que no se corran con la hora.

export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'

/** Hoy, sin hora, en la zona de la app. */
export function hoyLocal(ahora = new Date()): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(ahora).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
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

export const diasEntre = (desde: Date, hasta: Date) => Math.round((hasta.getTime() - desde.getTime()) / 86400_000)

const SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "Sábado 22 de agosto" */
export const fechaLarga = (f: Date) => `${SEMANA[f.getUTCDay()]} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}`
/** "22 ago" */
export const fechaCorta = (f: Date) => `${f.getUTCDate()} ${MESES[f.getUTCMonth()].slice(0, 3)}`
/** "12/10" */
export const diaMes = (f: Date) => `${f.getUTCDate()}/${f.getUTCMonth() + 1}`

/** Fecha de un grupo ('YYYY-MM-DD') vista desde hoy: la próxima si es anual, o la única si todavía no pasó. */
export function proximaDeGrupo(eventoFecha: string | null, anual: boolean, hoy: Date): Date | null {
  if (!eventoFecha) return null
  const [y, m, d] = eventoFecha.split('-').map(Number)
  if (anual) return proximaFecha(d, m, hoy)
  const unica = new Date(Date.UTC(y, m - 1, d))
  return unica >= hoy ? unica : null
}

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0]

export type Evento = {
  listId: string
  titulo: string
  fecha: Date
  dias: number
  anual: boolean
  propio: boolean
  href: string
  personas: string[]
  contexto: string | null
  /** Hasta 3 fotos de los deseos que más quiere. Si sos regalador, solo los que nadie reservó. */
  fotos: string[]
  /** Solo para el regalador: cuántos deseos de esa lista reservaste vos. Nunca está en eventos propios. */
  misReservas?: number
  /** Solo para el regalador: el último regalo comprado de esa lista y quién se ocupó. */
  ultimo?: { encargado: string; titulo: string; fecha: Date }
}

type ListaRow = typeof lists.$inferSelect
const PESO = { mucho: 0, gustaria: 1, suelta: 2 } as const

/** Los eventos del usuario ordenados por cercanía: los suyos y los de las listas que sigue. */
export async function misEventos(db: Db, userId: string, hoy = hoyLocal()): Promise<Evento[]> {
  const propias = await db.select().from(lists).where(esDuenoSql(db, userId))
  const propiasIds = propias.map((l) => l.id)
  const seguidas = await db.select({ list: lists }).from(listFollows)
    .innerJoin(lists, eq(listFollows.listId, lists.id))
    .where(propiasIds.length
      ? and(eq(listFollows.userId, userId), notInArray(lists.id, propiasIds))
      : eq(listFollows.userId, userId))
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
        .where(inArray(listMembers.listId, grupoIds)).orderBy(asc(listMembers.createdAt))
      : [],
  ])

  const conFecha: Omit<Evento, 'fotos' | 'misReservas' | 'ultimo'>[] = []
  for (const { list, propio } of todas) {
    if (list.tipo === 'personal') {
      const owner = owners.find((o) => o.id === list.ownerId)
      if (!owner?.cumpleDia || !owner.cumpleMes) continue
      const fecha = proximaFecha(owner.cumpleDia, owner.cumpleMes, hoy)
      conFecha.push({
        listId: list.id, fecha, dias: diasEntre(hoy, fecha), anual: true, propio,
        titulo: propio ? 'Tu cumple' : `Cumple de ${primerNombre(owner.nombre)}`,
        href: propio ? '/mi-lista' : `/l/${list.shareToken}`,
        personas: [owner.nombre],
        contexto: propio ? 'Tu lista' : null,
      })
    } else {
      const fecha = proximaDeGrupo(list.eventoFecha, list.eventoAnual, hoy)
      if (!fecha) continue
      conFecha.push({
        listId: list.id, fecha, dias: diasEntre(hoy, fecha), anual: list.eventoAnual, propio,
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
  const [deseos, ocupados, ultimos] = await Promise.all([
    db.select({ id: items.id, listId: items.listId, fotoUrl: items.fotoUrl, prioridad: items.prioridad, createdAt: items.createdAt })
      .from(items).where(and(inArray(items.listId, ids), eq(items.estadoDueno, 'activo'))),
    // reservas solo de listas ajenas: el dueño nunca recibe información de reservas
    ajenas.length
      ? db.select({ itemId: claims.itemId, claimerUserId: claims.claimerUserId, listId: items.listId })
        .from(claims).innerJoin(items, eq(claims.itemId, items.id))
        .where(and(inArray(items.listId, ajenas), inArray(claims.estado, ['reservado', 'comprado'])))
      : [],
    ultimosRegalos(db, userId, ajenas),
  ])
  const reservados = new Set(ocupados.map((c) => c.itemId))

  return conFecha.map((e) => {
    const fotos = deseos
      .filter((d) => d.listId === e.listId && d.fotoUrl && (e.propio || !reservados.has(d.id)))
      .sort((a, b) => PESO[a.prioridad] - PESO[b.prioridad] || a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, 3).map((d) => d.fotoUrl!)
    if (e.propio) return { ...e, fotos }
    const misReservas = new Set(ocupados.filter((c) => c.listId === e.listId && c.claimerUserId === userId).map((c) => c.itemId)).size
    const u = ultimos.get(e.listId)
    return { ...e, fotos, misReservas, ...(u && { ultimo: { encargado: u.encargado, titulo: u.titulo, fecha: u.fecha } }) }
  }).sort((a, b) => a.dias - b.dias || a.titulo.localeCompare(b.titulo))
}

/** Guarda la lista entre las que sigue el usuario (al abrirla como regalador). */
export async function seguirLista(db: Db, userId: string, listId: string) {
  await db.insert(listFollows).values({ userId, listId }).onConflictDoNothing()
}

/** El próximo evento de una lista (cumple del dueño o fecha del grupo), para la cuenta regresiva. */
export async function eventoDeLista(db: Db, listId: string, hoy = hoyLocal()) {
  if (!esUuid(listId)) return null
  const [row] = await db.select({ list: lists, cumpleDia: users.cumpleDia, cumpleMes: users.cumpleMes })
    .from(lists).leftJoin(users, eq(lists.ownerId, users.id)).where(eq(lists.id, listId))
  if (!row) return null
  const fecha = row.list.tipo === 'grupo'
    ? proximaDeGrupo(row.list.eventoFecha, row.list.eventoAnual, hoy)
    : row.cumpleDia && row.cumpleMes ? proximaFecha(row.cumpleDia, row.cumpleMes, hoy) : null
  if (!fecha) return null
  return { esCumple: row.list.tipo === 'personal', fecha, dias: diasEntre(hoy, fecha) }
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

/** Fecha del grupo: 'YYYY-MM-DD' o null para quitarla. Solo un dueño del grupo puede cambiarla. */
export async function guardarFechaGrupo(db: Db, listId: string, userId: string, fecha: string | null, anual: boolean): Promise<boolean> {
  if (!esUuid(listId)) return false
  if (fecha !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha)))) return false
  const updated = await db.update(lists).set({ eventoFecha: fecha, eventoAnual: anual })
    .where(and(eq(lists.id, listId), eq(lists.tipo, 'grupo'), esDuenoSql(db, userId)))
    .returning({ id: lists.id })
  return updated.length === 1
}

export type MesCalendario = { nombre: string; dias: number; eventos: number[]; hoy: number | null; actual: boolean }

/** Los 12 meses del año de hoy con los días que tienen eventos (anuales en su día; únicos solo si caen este año). */
export function calendarioDelAnio(eventos: Pick<Evento, 'fecha' | 'anual'>[], hoy: Date): MesCalendario[] {
  const anio = hoy.getUTCFullYear()
  return MESES.map((nombre, m) => ({
    nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1, 3),
    dias: new Date(Date.UTC(anio, m + 1, 0)).getUTCDate(),
    eventos: [...new Set(eventos
      .filter((e) => e.fecha.getUTCMonth() === m && (e.anual || e.fecha.getUTCFullYear() === anio))
      .map((e) => e.fecha.getUTCDate()))],
    hoy: hoy.getUTCMonth() === m ? hoy.getUTCDate() : null,
    actual: hoy.getUTCMonth() === m,
  }))
}
