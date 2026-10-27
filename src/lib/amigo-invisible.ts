import { randomInt } from 'node:crypto'
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { amigoInvisibleExcluidos, amigoInvisibleGente, amigoInvisiblePreguntas, amigosInvisibles, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { misAmigos, personas, type Persona } from '@/lib/amigos'
import { avisar, type Enviar } from '@/lib/codazos'
import { diasEntre, fechaLarga, hoyLocal } from '@/lib/events'
import { esFechaEspecial, FECHAS_ESPECIALES, proximaEspecial, type FechaEspecial } from '@/lib/fechas-especiales'
import { esUuid, fechaDeGrupoValida } from '@/lib/groups'
import { LARGO, recortar } from '@/lib/limites'
import { recienHecho } from '@/lib/repetido'

// Amigo invisible: el que lo arma (el que organiza) le pone nombre, temática, presupuesto y la fecha en que se dan los
// regalos, e invita amigos suyos (tienen que estar en GiftR). Cada uno acepta o no. Cuando están, lo sortea: a cada uno le
// toca alguien (nunca él mismo, ni alguien con quien "no se toca"), y a cada uno le llega el aviso.
// La regla: a quién le regala cada uno lo sabe solo él. Nadie más, tampoco el que organiza: ninguna vista devuelve el
// regalaA de otro. Las preguntas anónimas van del que regala al que le toca sin decir de quién son, y quién te regaló lo
// sabés solo si lo pedís, después de la fecha.

export const MIN_JUGADORES = 3
export const MAX_JUGADORES = 40
export const PRESUPUESTO_MAXIMO = 100_000_000
const PREGUNTAS_POR_JUEGO = 20

const primerNombre = (n: string) => n.split(' ')[0]
const hoyIso = () => hoyLocal().toISOString().slice(0, 10)

export type DatosJuego = {
  nombre: string
  descripcion?: string | null
  presupuesto?: number | null
  /** 'YYYY-MM-DD': cuándo se dan los regalos */
  fecha: string
  fechaEspecial?: FechaEspecial | null
}

/** Lo cargado, acotado; null si falta el nombre o la fecha no sirve (una que no existe o que ya pasó). */
function limpiar(d: DatosJuego) {
  const nombre = recortar(d.nombre ?? '', LARGO.nombreGrupo)
  if (!nombre || !fechaDeGrupoValida(d.fecha) || d.fecha < hoyIso()) return null
  const p = d.presupuesto
  return {
    nombre,
    descripcion: recortar(d.descripcion ?? '', LARGO.temaInvisible) || null,
    presupuesto: p && Number.isSafeInteger(p) && p > 0 && p <= PRESUPUESTO_MAXIMO ? p : null,
    fecha: d.fecha,
    fechaEspecial: d.fechaEspecial && esFechaEspecial(d.fechaEspecial) ? d.fechaEspecial : null,
  }
}

const url = (id: string) => `/invisible/${id}`

/** A los amigos nuevos del que organiza (no él, no los que ya están), hasta el tope; les llega el aviso. */
async function sumarInvitados(db: Db, juego: { id: string; nombre: string }, organizadorId: string, ids: string[], enviar?: Enviar) {
  const amigos = await misAmigos(db, organizadorId)
  const ya = new Set((await db.select({ id: amigoInvisibleGente.userId }).from(amigoInvisibleGente)
    .where(eq(amigoInvisibleGente.amigoInvisibleId, juego.id))).map((r) => r.id))
  const lugar = Math.max(0, MAX_JUGADORES - ya.size)
  const nuevos = [...new Set(ids)].filter((id) => esUuid(id) && amigos.has(id) && !ya.has(id)).slice(0, lugar)
  if (!nuevos.length) return 0
  const insertados = await db.insert(amigoInvisibleGente).values(nuevos.map((userId) => ({ amigoInvisibleId: juego.id, userId })))
    .onConflictDoNothing().returning({ id: amigoInvisibleGente.userId })
  const [org] = await personas(db, [organizadorId])
  await Promise.all(insertados.map((i) => avisar(db, i.id, {
    de: organizadorId,
    title: `🎅 ${primerNombre(org?.nombre ?? 'Alguien')} te invita a un amigo invisible`,
    body: `"${juego.nombre}". ¿Jugás?`,
    url: url(juego.id),
  }, enviar).catch(() => 0)))
  return insertados.length
}

export type Creado = { ok: true; id: string } | { ok: false; reason: 'datos' }

/** Arma el juego con el que organiza adentro y les manda la invitación a los amigos elegidos. Un doble toque no arma dos. */
export async function crearAmigoInvisible(db: Db, organizadorId: string, datos: DatosJuego, invitados: string[], enviar?: Enviar): Promise<Creado> {
  const d = limpiar(datos)
  if (!d || !esUuid(organizadorId)) return { ok: false, reason: 'datos' }
  const r = await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    await t.select({ id: users.id }).from(users).where(eq(users.id, organizadorId)).for('update')
    const [repetido] = await t.select({ id: amigosInvisibles.id }).from(amigosInvisibles)
      .where(and(eq(amigosInvisibles.organizadorId, organizadorId), eq(amigosInvisibles.nombre, d.nombre), recienHecho(amigosInvisibles.createdAt)))
    if (repetido) return { id: repetido.id, nuevo: false }
    const [juego] = await t.insert(amigosInvisibles).values({ ...d, organizadorId }).returning({ id: amigosInvisibles.id })
    await t.insert(amigoInvisibleGente).values({ amigoInvisibleId: juego.id, userId: organizadorId, estado: 'juega' })
    return { id: juego.id, nuevo: true }
  })
  if (r.nuevo) await sumarInvitados(db, { id: r.id, nombre: d.nombre }, organizadorId, invitados, enviar)
  return { ok: true, id: r.id }
}

/** El juego del que organiza: el suyo, y (sinSortear) todavía sin sortear. */
async function delOrganizador(db: Db, id: string, organizadorId: string, sinSortear = false) {
  if (!esUuid(id)) return null
  const [j] = await db.select().from(amigosInvisibles).where(and(eq(amigosInvisibles.id, id), eq(amigosInvisibles.organizadorId, organizadorId)))
  return j && (!sinSortear || !j.sorteadoAt) ? j : null
}

/** Invitar a más amigos, mientras no se sorteó. Devuelve a cuántos. */
export async function invitarAlJuego(db: Db, id: string, organizadorId: string, ids: string[], enviar?: Enviar): Promise<number> {
  const j = await delOrganizador(db, id, organizadorId, true)
  return j ? sumarInvitados(db, j, organizadorId, ids, enviar) : 0
}

/** Cambiar el nombre, la temática, el presupuesto o la fecha (también después del sorteo). */
export async function editarAmigoInvisible(db: Db, id: string, organizadorId: string, datos: DatosJuego): Promise<boolean> {
  const j = await delOrganizador(db, id, organizadorId)
  const d = limpiar(datos)
  if (!j || !d) return false
  await db.update(amigosInvisibles).set(d).where(eq(amigosInvisibles.id, id))
  return true
}

/** El que organiza lo borra (con todo lo que tiene). */
export async function borrarAmigoInvisible(db: Db, id: string, organizadorId: string): Promise<boolean> {
  const j = await delOrganizador(db, id, organizadorId)
  if (!j) return false
  await db.delete(amigosInvisibles).where(eq(amigosInvisibles.id, id))
  return true
}

/**
 * "Juego" o "No juego", mientras no se sorteó (también el que había dicho que sí y se baja). El que organiza juega
 * siempre: si no, que lo borre.
 */
export async function responderJuego(db: Db, id: string, userId: string, juega: boolean): Promise<boolean> {
  if (!esUuid(id)) return false
  const [j] = await db.select().from(amigosInvisibles).where(eq(amigosInvisibles.id, id))
  if (!j || j.sorteadoAt || j.organizadorId === userId) return false
  const filas = await db.update(amigoInvisibleGente).set({ estado: juega ? 'juega' : 'no_juega' })
    .where(and(eq(amigoInvisibleGente.amigoInvisibleId, id), eq(amigoInvisibleGente.userId, userId)))
    .returning({ id: amigoInvisibleGente.userId })
  return filas.length > 0
}

const par = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string]

/** "Que no se toquen" (o que sí, otra vez), entre dos que están en el juego, mientras no se sorteó. */
export async function cambiarExcluidos(db: Db, id: string, organizadorId: string, x: string, y: string, excluir: boolean): Promise<boolean> {
  const j = await delOrganizador(db, id, organizadorId, true)
  if (!j || !esUuid(x) || !esUuid(y) || x === y) return false
  const estan = await db.select({ id: amigoInvisibleGente.userId }).from(amigoInvisibleGente)
    .where(and(eq(amigoInvisibleGente.amigoInvisibleId, id), inArray(amigoInvisibleGente.userId, [x, y])))
  if (estan.length !== 2) return false
  const [a, b] = par(x, y)
  if (excluir) await db.insert(amigoInvisibleExcluidos).values({ amigoInvisibleId: id, a, b }).onConflictDoNothing()
  else await db.delete(amigoInvisibleExcluidos).where(and(eq(amigoInvisibleExcluidos.amigoInvisibleId, id), eq(amigoInvisibleExcluidos.a, a), eq(amigoInvisibleExcluidos.b, b)))
  return true
}

/** Mezcla al azar (con el generador del sistema: nadie puede adivinar el sorteo). */
function mezclar<T>(xs: T[], azar: (n: number) => number): T[] {
  const r = [...xs]
  for (let i = r.length - 1; i > 0; i--) {
    const k = azar(i + 1)
    ;[r[i], r[k]] = [r[k], r[i]]
  }
  return r
}

/**
 * El sorteo: a cada uno, alguien que no es él ni alguien con quien no se toca, y cada uno recibe de uno solo. Primero
 * busca uno sin parejas que se regalen entre sí (A a B y B a A); si no hay, cualquiera. Null si no hay forma.
 */
export function asignar(ids: string[], excluidos: [string, string][], azar: (n: number) => number = randomInt): Map<string, string> | null {
  const prohibido = new Set(excluidos.map(([a, b]) => par(a, b).join('|')))
  const puede = (de: string, para: string) => de !== para && !prohibido.has(par(de, para).join('|'))
  const intentar = (sinParejas: boolean) => {
    const orden = mezclar(ids, azar)
    const asignado = new Map<string, string>()
    const usados = new Set<string>()
    const paso = (i: number): boolean => {
      if (i === orden.length) return true
      const de = orden[i]
      for (const para of mezclar(ids, azar)) {
        if (usados.has(para) || !puede(de, para) || (sinParejas && asignado.get(para) === de)) continue
        asignado.set(de, para)
        usados.add(para)
        if (paso(i + 1)) return true
        asignado.delete(de)
        usados.delete(para)
      }
      return false
    }
    return paso(0) ? asignado : null
  }
  return intentar(ids.length > 3) ?? intentar(false)
}

export type Sorteo = { ok: true } | { ok: false; reason: 'no_permitido' | 'pocos' | 'imposible' }

/**
 * El que organiza sortea entre los que juegan (los que no contestaron quedan afuera). Una sola vez: a cada uno le llega
 * el aviso y desde ahí ve a quién le regala.
 */
export async function sortear(db: Db, id: string, organizadorId: string, enviar?: Enviar, azar?: (n: number) => number): Promise<Sorteo> {
  if (!esUuid(id)) return { ok: false, reason: 'no_permitido' }
  const r = await db.transaction(async (tx): Promise<Sorteo & { juegan?: string[]; nombre?: string }> => {
    const t = tx as unknown as Db
    const [j] = await t.select().from(amigosInvisibles)
      .where(and(eq(amigosInvisibles.id, id), eq(amigosInvisibles.organizadorId, organizadorId))).for('update')
    if (!j || j.sorteadoAt) return { ok: false, reason: 'no_permitido' }
    const juegan = (await t.select({ id: amigoInvisibleGente.userId }).from(amigoInvisibleGente)
      .where(and(eq(amigoInvisibleGente.amigoInvisibleId, id), eq(amigoInvisibleGente.estado, 'juega')))).map((g) => g.id)
    if (juegan.length < MIN_JUGADORES) return { ok: false, reason: 'pocos' }
    const excluidos = (await t.select({ a: amigoInvisibleExcluidos.a, b: amigoInvisibleExcluidos.b }).from(amigoInvisibleExcluidos)
      .where(eq(amigoInvisibleExcluidos.amigoInvisibleId, id))).map((e) => [e.a, e.b] as [string, string])
    const asignado = asignar(juegan, excluidos, azar)
    if (!asignado) return { ok: false, reason: 'imposible' }
    for (const [de, para] of asignado) {
      await t.update(amigoInvisibleGente).set({ regalaA: para })
        .where(and(eq(amigoInvisibleGente.amigoInvisibleId, id), eq(amigoInvisibleGente.userId, de)))
    }
    await t.update(amigoInvisibleGente).set({ estado: 'no_juega' })
      .where(and(eq(amigoInvisibleGente.amigoInvisibleId, id), eq(amigoInvisibleGente.estado, 'invitado')))
    await t.update(amigosInvisibles).set({ sorteadoAt: new Date() }).where(eq(amigosInvisibles.id, id))
    return { ok: true, juegan, nombre: j.nombre }
  })
  if (!r.ok) return r
  await Promise.all(r.juegan!.map((u) => avisar(db, u, {
    title: `🎁 Ya se sorteó "${r.nombre}"`, body: 'Entrá a ver a quién le regalás (solo lo sabés vos).', url: url(id),
  }, enviar).catch(() => 0)))
  return { ok: true }
}

export type Pregunta = { id: string; texto: string; respuesta: string | null }

export type VistaJuego = {
  id: string
  nombre: string
  descripcion: string | null
  presupuesto: number | null
  /** 'YYYY-MM-DD' */
  fecha: string
  fechaEspecial: FechaEspecial | null
  /** "Jueves 25 de diciembre" y cuántos días faltan (negativo si ya pasó) */
  cuando: string
  dias: number
  organizador: Persona
  soyOrganizador: boolean
  /** cómo estoy yo: invitado (todavía no contesté), juega o no juega */
  miEstado: 'invitado' | 'juega' | 'no_juega'
  sorteado: boolean
  /** todos, con cómo están y si ya vieron a quién les toca (nunca a quién) */
  gente: { persona: Persona; estado: 'invitado' | 'juega' | 'no_juega'; vio: boolean }[]
  /** solo para el que organiza y antes del sorteo: los que no se tocan */
  excluidos: [Persona, Persona][]
  /** desde el sorteo, si juego: a quién le regalo (y el link de su lista); null hasta que toco "Ver" */
  meToca: { persona: Persona; token: string | null } | null
  /** ya toqué "Ver a quién le regalo" */
  vi: boolean
  /** las que le hice a quien le regalo, y las que me hizo mi amigo invisible (sin de quién) */
  preguntasMias: Pregunta[]
  preguntasParaMi: Pregunta[]
  /** después de la fecha, si juego: puedo pedir saber quién me regaló */
  puedoRevelar: boolean
  /** quién me regaló, si lo pedí */
  meRegalo: Persona | null
  /** marqué "Ya tengo el regalo" */
  yaLoTengo: boolean
}

/** El juego para uno que está (también un invitado que no contestó) o el que organiza; null para cualquier otro. */
export async function amigoInvisibleParaViewer(db: Db, id: string, userId: string): Promise<VistaJuego | null> {
  if (!esUuid(id)) return null
  const [j] = await db.select().from(amigosInvisibles).where(eq(amigosInvisibles.id, id))
  if (!j) return null
  const filas = await db.select().from(amigoInvisibleGente).where(eq(amigoInvisibleGente.amigoInvisibleId, id)).orderBy(asc(amigoInvisibleGente.createdAt))
  const mia = filas.find((f) => f.userId === userId)
  if (!mia) return null
  const gente = new Map((await personas(db, [...new Set([j.organizadorId, ...filas.map((f) => f.userId)])])).map((p) => [p.id, p]))
  const soyOrganizador = j.organizadorId === userId
  const juego = mia.estado === 'juega'
  const quienMeRegala = j.sorteadoAt && juego ? filas.find((f) => f.regalaA === userId)?.userId : undefined
  const [excluidos, preguntas, token] = await Promise.all([
    soyOrganizador && !j.sorteadoAt
      ? db.select().from(amigoInvisibleExcluidos).where(eq(amigoInvisibleExcluidos.amigoInvisibleId, id))
      : [],
    j.sorteadoAt && juego
      ? db.select().from(amigoInvisiblePreguntas).where(eq(amigoInvisiblePreguntas.amigoInvisibleId, id)).orderBy(asc(amigoInvisiblePreguntas.createdAt))
      : [],
    mia.regalaA && mia.vioAt
      ? db.select({ token: lists.shareToken }).from(lists).where(eq(lists.ownerId, mia.regalaA)).then((r) => r[0]?.token ?? null)
      : null,
  ])
  const hoy = hoyLocal()
  const fechaD = new Date(`${j.fecha}T00:00:00Z`)
  const anon = (p: typeof preguntas[number]): Pregunta => ({ id: p.id, texto: p.texto, respuesta: p.respuesta })
  return {
    id, nombre: j.nombre, descripcion: j.descripcion, presupuesto: j.presupuesto, fecha: j.fecha,
    fechaEspecial: esFechaEspecial(j.fechaEspecial) ? j.fechaEspecial : null,
    cuando: fechaLarga(fechaD, hoy), dias: diasEntre(hoy, fechaD),
    organizador: gente.get(j.organizadorId)!, soyOrganizador, miEstado: mia.estado, sorteado: !!j.sorteadoAt,
    gente: filas.flatMap((f) => {
      const persona = gente.get(f.userId)
      return persona ? [{ persona, estado: f.estado, vio: !!f.vioAt }] : []
    }),
    excluidos: excluidos.flatMap((e) => {
      const a = gente.get(e.a)
      const b = gente.get(e.b)
      return a && b ? [[a, b] as [Persona, Persona]] : []
    }),
    meToca: mia.regalaA && mia.vioAt && gente.get(mia.regalaA) ? { persona: gente.get(mia.regalaA)!, token } : null,
    vi: !!mia.vioAt,
    // las mías: las que le hice a quien le regalo; para mí: las de quien me regala (nunca se dice quién)
    preguntasMias: preguntas.filter((p) => p.deUserId === userId).map(anon),
    preguntasParaMi: preguntas.filter((p) => p.paraUserId === userId).map(anon),
    puedoRevelar: !!j.sorteadoAt && juego && hoyIso() > j.fecha && !mia.reveladoAt,
    meRegalo: mia.reveladoAt && quienMeRegala ? gente.get(quienMeRegala) ?? null : null,
    yaLoTengo: !!mia.yaLoTengoAt,
  }
}

/** "Ver a quién le regalo": desde ahora lo ve (y el que organiza sabe que ya lo vio). */
export async function verAQuienLeRegalo(db: Db, id: string, userId: string): Promise<boolean> {
  if (!esUuid(id)) return false
  const filas = await db.update(amigoInvisibleGente).set({ vioAt: sql`coalesce(${amigoInvisibleGente.vioAt}, now())` })
    .where(and(eq(amigoInvisibleGente.amigoInvisibleId, id), eq(amigoInvisibleGente.userId, userId), eq(amigoInvisibleGente.estado, 'juega'),
      sql`${amigoInvisibleGente.regalaA} is not null`))
    .returning({ id: amigoInvisibleGente.userId })
  return filas.length > 0
}

/** "¿Quién me regaló?": solo después de la fecha y solo si lo pide. */
export async function revelarQuienMeRegalo(db: Db, id: string, userId: string): Promise<boolean> {
  if (!esUuid(id)) return false
  const [j] = await db.select().from(amigosInvisibles).where(eq(amigosInvisibles.id, id))
  if (!j?.sorteadoAt || !(hoyIso() > j.fecha)) return false
  const filas = await db.update(amigoInvisibleGente).set({ reveladoAt: new Date() })
    .where(and(eq(amigoInvisibleGente.amigoInvisibleId, id), eq(amigoInvisibleGente.userId, userId), eq(amigoInvisibleGente.estado, 'juega')))
    .returning({ id: amigoInvisibleGente.userId })
  return filas.length > 0
}

/** "Ya tengo el regalo" (o todavía no): desde que vio a quién le regala. Lo ve solo él. */
export async function marcarYaLoTengo(db: Db, id: string, userId: string, tengo: boolean): Promise<boolean> {
  if (!esUuid(id)) return false
  const filas = await db.update(amigoInvisibleGente).set({ yaLoTengoAt: tengo ? new Date() : null })
    .where(and(eq(amigoInvisibleGente.amigoInvisibleId, id), eq(amigoInvisibleGente.userId, userId), eq(amigoInvisibleGente.estado, 'juega'),
      sql`${amigoInvisibleGente.vioAt} is not null`))
    .returning({ id: amigoInvisibleGente.userId })
  return filas.length > 0
}

/** Una pregunta anónima a quien le regalo: le llega de "tu amigo invisible". Hasta 20 por juego. */
export async function preguntar(db: Db, id: string, userId: string, escrito: string, enviar?: Enviar): Promise<boolean> {
  const texto = recortar(escrito ?? '', LARGO.comentario)
  if (!texto || !esUuid(id)) return false
  const [mia] = await db.select().from(amigoInvisibleGente)
    .where(and(eq(amigoInvisibleGente.amigoInvisibleId, id), eq(amigoInvisibleGente.userId, userId), eq(amigoInvisibleGente.estado, 'juega')))
  if (!mia?.regalaA || !mia.vioAt) return false
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(amigoInvisiblePreguntas)
    .where(and(eq(amigoInvisiblePreguntas.amigoInvisibleId, id), eq(amigoInvisiblePreguntas.deUserId, userId)))
  if (n >= PREGUNTAS_POR_JUEGO) return false
  await db.insert(amigoInvisiblePreguntas).values({ amigoInvisibleId: id, deUserId: userId, paraUserId: mia.regalaA, texto })
  const [j] = await db.select({ nombre: amigosInvisibles.nombre }).from(amigosInvisibles).where(eq(amigosInvisibles.id, id))
  await avisar(db, mia.regalaA, {
    title: '🤫 Tu amigo invisible te hizo una pregunta', body: `En "${j?.nombre ?? 'el amigo invisible'}": ${texto}`, url: `${url(id)}#preguntas`,
  }, enviar).catch(() => 0)
  return true
}

/** Contestarle a tu amigo invisible (solo las que te hicieron a vos). */
export async function responderPregunta(db: Db, preguntaId: string, userId: string, escrito: string, enviar?: Enviar): Promise<string | null> {
  const respuesta = recortar(escrito ?? '', LARGO.comentario)
  if (!respuesta || !esUuid(preguntaId)) return null
  const [p] = await db.update(amigoInvisiblePreguntas).set({ respuesta, respondidaAt: new Date() })
    .where(and(eq(amigoInvisiblePreguntas.id, preguntaId), eq(amigoInvisiblePreguntas.paraUserId, userId)))
    .returning()
  if (!p) return null
  const [j] = await db.select({ nombre: amigosInvisibles.nombre }).from(amigosInvisibles).where(eq(amigosInvisibles.id, p.amigoInvisibleId))
  await avisar(db, p.deUserId, {
    title: '💬 Te contestaron', body: `En "${j?.nombre ?? 'el amigo invisible'}": ${respuesta}`, url: `${url(p.amigoInvisibleId)}#preguntas`,
  }, enviar).catch(() => 0)
  return p.amigoInvisibleId
}

export type MiJuego = {
  id: string
  nombre: string
  fecha: string
  fechaEspecial: FechaEspecial | null
  presupuesto: number | null
  /** cuántos días faltan (negativo si ya pasó) */
  dias: number
  miEstado: 'invitado' | 'juega'
  sorteado: boolean
  vi: boolean
  /** ya pidió saber quién le regaló */
  revelado: boolean
  organizador: string
  soyOrganizador: boolean
  /** los invitados (con el que organiza) y cuántos ya contestaron (antes del sorteo: cuántos faltan) */
  invitados: number
  contestaron: number
  /** a quién le regalo: solo si ya lo vi (en pantalla va tapado hasta tocar "Ver") */
  meToca: Persona | null
  /** marqué "Ya tengo el regalo" */
  yaLoTengo: boolean
  /** las que me hizo mi amigo invisible y todavía no contesté */
  preguntasSinContestar: number
}

/**
 * Los juegos en los que estoy (o me invitaron) que todavía no pasaron: para Regalos, Inicio y la pantalla de cada fecha.
 * Con pasados, también los de esos últimos días (para "¿Quién me regaló?"). De los demás solo se cuenta cuántos hay y
 * cuántos contestaron: a quién le regala cada uno no se lee.
 */
export async function misAmigosInvisibles(db: Db, userId: string, hoy = hoyLocal(), pasados = 0): Promise<MiJuego[]> {
  const desde = new Date(hoy.getTime() - pasados * 86400_000).toISOString().slice(0, 10)
  const filas = await db.select({ j: amigosInvisibles, mia: amigoInvisibleGente, org: users.nombre })
    .from(amigoInvisibleGente)
    .innerJoin(amigosInvisibles, eq(amigoInvisibleGente.amigoInvisibleId, amigosInvisibles.id))
    .innerJoin(users, eq(amigosInvisibles.organizadorId, users.id))
    .where(and(eq(amigoInvisibleGente.userId, userId), inArray(amigoInvisibleGente.estado, ['invitado', 'juega']), gte(amigosInvisibles.fecha, desde)))
    .orderBy(asc(amigosInvisibles.fecha), desc(amigosInvisibles.createdAt))
  if (!filas.length) return []
  const ids = filas.map((f) => f.j.id)
  const [estados, sinContestar, tocan] = await Promise.all([
    db.select({ id: amigoInvisibleGente.amigoInvisibleId, estado: amigoInvisibleGente.estado, n: sql<number>`count(*)::int` })
      .from(amigoInvisibleGente).where(inArray(amigoInvisibleGente.amigoInvisibleId, ids))
      .groupBy(amigoInvisibleGente.amigoInvisibleId, amigoInvisibleGente.estado),
    db.select({ id: amigoInvisiblePreguntas.amigoInvisibleId, n: sql<number>`count(*)::int` }).from(amigoInvisiblePreguntas)
      .where(and(inArray(amigoInvisiblePreguntas.amigoInvisibleId, ids), eq(amigoInvisiblePreguntas.paraUserId, userId), isNull(amigoInvisiblePreguntas.respuesta)))
      .groupBy(amigoInvisiblePreguntas.amigoInvisibleId),
    personas(db, [...new Set(filas.flatMap((f) => (f.mia.regalaA && f.mia.vioAt ? [f.mia.regalaA] : [])))]),
  ])
  const persona = new Map(tocan.map((p) => [p.id, p]))
  const cuenta = (id: string, cuales: string[]) => estados.filter((e) => e.id === id && cuales.includes(e.estado)).reduce((t, e) => t + e.n, 0)
  return filas.map(({ j, mia, org }) => ({
    id: j.id, nombre: j.nombre, fecha: j.fecha, fechaEspecial: esFechaEspecial(j.fechaEspecial) ? j.fechaEspecial : null, presupuesto: j.presupuesto,
    dias: diasEntre(hoy, new Date(`${j.fecha}T00:00:00Z`)), miEstado: mia.estado as 'invitado' | 'juega', sorteado: !!j.sorteadoAt,
    vi: !!mia.vioAt, revelado: !!mia.reveladoAt, organizador: org, soyOrganizador: j.organizadorId === userId,
    invitados: cuenta(j.id, ['invitado', 'juega', 'no_juega']), contestaron: cuenta(j.id, ['juega', 'no_juega']),
    meToca: mia.regalaA && mia.vioAt ? persona.get(mia.regalaA) ?? null : null,
    yaLoTengo: !!mia.yaLoTengoAt, preguntasSinContestar: sinContestar.find((p) => p.id === j.id)?.n ?? 0,
  }))
}

/**
 * Lo que dice la tarjeta de Lo que viene de unos juegos, sin nombres (la pantalla de Inicio la puede ver cualquiera que
 * mire el teléfono): de uno, lo más urgente; de varios, cuántos son y cuántos te esperan.
 */
export function estadoDeJuegos(juegos: Pick<MiJuego, 'miEstado' | 'sorteado' | 'vi'>[]): string | null {
  if (!juegos.length) return null
  if (juegos.length > 1) {
    const esperan = juegos.filter((j) => j.miEstado === 'invitado' || (j.sorteado && !j.vi)).length
    return `${juegos.length} amigos invisibles${esperan ? ` · ${esperan} te ${esperan === 1 ? 'espera' : 'esperan'}` : ''}`
  }
  const [j] = juegos
  if (j.miEstado === 'invitado') return 'Te invitaron a un amigo invisible'
  if (j.sorteado && !j.vi) return 'Ya se sorteó: mirá a quién le regalás'
  if (!j.sorteado) return 'Amigo invisible: falta sortear'
  return 'Amigo invisible: ya sabés a quién'
}

/** Si en dos juegos que vienen te toca la misma persona: de cada juego, los otros donde también te tocó. */
export function tambienTeToco(juegos: Pick<MiJuego, 'id' | 'nombre' | 'dias' | 'meToca'>[]): Map<string, string[]> {
  const vienen = juegos.filter((j) => j.meToca && j.dias >= 0)
  return new Map(vienen.flatMap((j) => {
    const otros = vienen.filter((o) => o.id !== j.id && o.meToca!.id === j.meToca!.id).map((o) => o.nombre)
    return otros.length ? [[j.id, otros] as [string, string[]]] : []
  }))
}

/** La fecha de entrega que se propone para un juego de una fecha especial: la próxima vez que cae. */
export const fechaPropuesta = (f: FechaEspecial | null, hoy = hoyLocal()) => (f ? proximaEspecial(f, hoy).toISOString().slice(0, 10) : '')

/** El día que se propone para cada fecha especial (para completarlo al elegirla en el formulario). */
export const propuestasDeFechas = (hoy = hoyLocal()) =>
  Object.fromEntries(FECHAS_ESPECIALES.map((f) => [f, fechaPropuesta(f, hoy)])) as Record<FechaEspecial, string>
