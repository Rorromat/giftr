import { randomInt } from 'node:crypto'
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'
import { amigoInvisibleExcluidos, amigoInvisibleGente, amigoInvisiblePreguntas, amigosInvisibles, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { misAmigos, personas, type Persona } from '@/lib/amigos'
import { avisar, type Enviar } from '@/lib/codazos'
import { diasEntre, fechaLarga, hoyLocal } from '@/lib/events'
import { esFechaEspecial, FECHAS_ESPECIALES, proximaEspecial, type FechaEspecial } from '@/lib/fechas-especiales'
import { esToken, esUuid, fechaDeGrupoValida, newInviteToken } from '@/lib/groups'
import { LARGO, recortar } from '@/lib/limites'
import { recienHecho } from '@/lib/repetido'
import { guardarRegla, leerRegla, reglaDe, turnoEnElRobo } from '@/lib/reglas-invisible'

// Amigo invisible: el que lo arma (el que organiza) le pone nombre, temática, presupuesto y la fecha en que se dan los
// regalos, y suma gente de dos formas: manda el link del juego por WhatsApp (entra cualquiera con su cuenta, sin ser su
// amigo en GiftR: la oficina, la familia grande) o elige amigos suyos, que aceptan o no. Cuando están, lo sortea: a cada
// uno le toca alguien (nunca él mismo, ni alguien con quien "no se toca"), y a cada uno le llega el aviso.
// La regla: a quién le regala cada uno lo sabe solo él. Nadie más, tampoco el que organiza: ninguna vista devuelve el
// regalaA de otro. Las preguntas anónimas van del que regala al que le toca sin decir de quién son, y quién te regaló lo
// sabés solo si lo pedís, después de la fecha.
// Sumarse por el link no hace amigos a nadie (ni con el que organiza ni entre ellos): los del trabajo no tienen por qué
// ver tu lista todo el año. Cada uno ve los nombres de los que juegan y, desde el sorteo, la lista de quien le tocó.
// Después del sorteo se puede bajar o sumar gente (ver salir y entrar): una baja se arregla sola si se puede (al que le
// regalaba al que se fue le toca a quien ese le regalaba, y a nadie más le cambia nada) y, si no, o si alguien se sumó
// tarde, el que organiza sortea de nuevo.

export const MIN_JUGADORES = 3
export const MAX_JUGADORES = 40
export const PRESUPUESTO_MAXIMO = 100_000_000
const PREGUNTAS_POR_JUEGO = 20

const primerNombre = (n: string) => n.split(' ')[0]
const hoyIso = () => hoyLocal().toISOString().slice(0, 10)

export type DatosJuego = {
  nombre: string
  descripcion?: string | null
  /** la regla con la que juegan: el id de una (ver lib/reglas-invisible.ts) o 'propia', con su texto; otra cosa, sin regla */
  regla?: string | null
  reglaPropia?: string | null
  presupuesto?: number | null
  /** 'YYYY-MM-DD': cuándo se dan los regalos */
  fecha: string
  fechaEspecial?: FechaEspecial | null
}

/**
 * Lo cargado, acotado; null si falta el nombre o la fecha no sirve (una que no existe o que ya pasó). Una regla que no es
 * de las que hay, sin regla; con una que no lleva presupuesto ("De tu casa"), sin presupuesto.
 */
function limpiar(d: DatosJuego) {
  const nombre = recortar(d.nombre ?? '', LARGO.nombreGrupo)
  if (!nombre || !fechaDeGrupoValida(d.fecha) || d.fecha < hoyIso()) return null
  const p = d.presupuesto
  const regla = guardarRegla(d.regla, d.reglaPropia)
  return {
    nombre,
    descripcion: recortar(d.descripcion ?? '', LARGO.temaInvisible) || null,
    regla,
    presupuesto: !reglaDe(regla)?.sinPresupuesto && p && Number.isSafeInteger(p) && p > 0 && p <= PRESUPUESTO_MAXIMO ? p : null,
    fecha: d.fecha,
    fechaEspecial: d.fechaEspecial && esFechaEspecial(d.fechaEspecial) ? d.fechaEspecial : null,
  }
}

const url = (id: string) => `/invisible/${id}`

type Juego = typeof amigosInvisibles.$inferSelect
type Fila = typeof amigoInvisibleGente.$inferSelect

/** Los que ocupan un lugar del tope: los que juegan y los invitados que todavía no contestaron. */
const ocupan = (filas: Pick<Fila, 'estado'>[]) => filas.filter((f) => f.estado === 'juega' || f.estado === 'invitado').length

/** La fecha de los regalos ya pasó: no se suma ni se baja nadie, ni se sortea de nuevo. */
const yaPaso = (j: Pick<Juego, 'fecha'>) => j.fecha < hoyIso()

/**
 * Desde el último sorteo cambió quiénes juegan: alguien se bajó (aunque se haya arreglado solo) o hay alguno que juega
 * sin tener a quién regalarle (se sumó tarde, o se bajó quien le había tocado). Solo así se puede sortear de nuevo: si
 * no, el que organiza podría repetir el sorteo hasta que le toque quien quiere.
 */
const hayCambios = (filas: Pick<Fila, 'estado' | 'regalaA' | 'salioAt'>[]) => filas.some((f) => f.salioAt || (f.estado === 'juega' && !f.regalaA))

/** A los amigos nuevos del que organiza (no él, no los que ya están), hasta el tope; les llega el aviso. */
async function sumarInvitados(db: Db, juego: { id: string; nombre: string }, organizadorId: string, ids: string[], enviar?: Enviar) {
  const amigos = await misAmigos(db, organizadorId)
  const filas = await db.select({ id: amigoInvisibleGente.userId, estado: amigoInvisibleGente.estado }).from(amigoInvisibleGente)
    .where(eq(amigoInvisibleGente.amigoInvisibleId, juego.id))
  // al que había sacado y ahora elige de nuevo, lo deja volver
  const ya = new Set(filas.filter((f) => f.estado !== 'sacado').map((f) => f.id))
  const lugar = Math.max(0, MAX_JUGADORES - ocupan(filas))
  const nuevos = [...new Set(ids)].filter((id) => esUuid(id) && amigos.has(id) && !ya.has(id)).slice(0, lugar)
  if (!nuevos.length) return 0
  await db.delete(amigoInvisibleGente).where(and(eq(amigoInvisibleGente.amigoInvisibleId, juego.id), eq(amigoInvisibleGente.estado, 'sacado'),
    inArray(amigoInvisibleGente.userId, nuevos)))
  const insertados = await db.insert(amigoInvisibleGente).values(nuevos.map((userId) => ({ amigoInvisibleId: juego.id, userId })))
    .onConflictDoNothing().returning({ id: amigoInvisibleGente.userId })
  const [org] = await personas(db, [organizadorId])
  await Promise.all(insertados.map((i) => avisar(db, i.id, {
    de: organizadorId,
    tipo: 'invisible_invitacion',
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
    const [juego] = await t.insert(amigosInvisibles).values({ ...d, organizadorId, inviteToken: newInviteToken() }).returning({ id: amigosInvisibles.id })
    await t.insert(amigoInvisibleGente).values({ amigoInvisibleId: juego.id, userId: organizadorId, estado: 'juega' })
    return { id: juego.id, nuevo: true }
  })
  if (r.nuevo) await sumarInvitados(db, { id: r.id, nombre: d.nombre }, organizadorId, invitados, enviar)
  return { ok: true, id: r.id }
}

/** El juego del que organiza: el suyo. */
async function delOrganizador(db: Db, id: string, organizadorId: string) {
  if (!esUuid(id)) return null
  const [j] = await db.select().from(amigosInvisibles).where(and(eq(amigosInvisibles.id, id), eq(amigosInvisibles.organizadorId, organizadorId)))
  return j ?? null
}

const filasDe = (db: Db, id: string) =>
  db.select().from(amigoInvisibleGente).where(eq(amigoInvisibleGente.amigoInvisibleId, id)).orderBy(asc(amigoInvisibleGente.createdAt))
const laFila = (id: string, userId: string) => and(eq(amigoInvisibleGente.amigoInvisibleId, id), eq(amigoInvisibleGente.userId, userId))
const par = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string]
const paresExcluidos = async (db: Db, id: string) =>
  (await db.select({ a: amigoInvisibleExcluidos.a, b: amigoInvisibleExcluidos.b }).from(amigoInvisibleExcluidos)
    .where(eq(amigoInvisibleExcluidos.amigoInvisibleId, id))).map((e) => [e.a, e.b] as [string, string])

/**
 * Invitar a más amigos, eligiéndolos (también después del sorteo: el que acepta tarde entra cuando se sortee de nuevo).
 * Devuelve a cuántos.
 */
export async function invitarAlJuego(db: Db, id: string, organizadorId: string, ids: string[], enviar?: Enviar): Promise<number> {
  const j = await delOrganizador(db, id, organizadorId)
  return j && !yaPaso(j) ? sumarInvitados(db, j, organizadorId, ids, enviar) : 0
}

/** Cambiar el nombre, la temática, la regla, el presupuesto o la fecha (también después del sorteo). */
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
 * El link para sumarse al juego, para el que organiza. Los juegos de antes de que existiera no lo tienen: se arma la
 * primera vez que lo pide.
 */
export async function linkDelJuego(db: Db, id: string, organizadorId: string): Promise<string | null> {
  if (!esUuid(id)) return null
  const suyo = and(eq(amigosInvisibles.id, id), eq(amigosInvisibles.organizadorId, organizadorId))
  await db.update(amigosInvisibles).set({ inviteToken: newInviteToken() }).where(and(suyo, isNull(amigosInvisibles.inviteToken)))
  const [j] = await db.select({ token: amigosInvisibles.inviteToken }).from(amigosInvisibles).where(suyo)
  return j?.token ?? null
}

/**
 * Un link nuevo: el anterior deja de servir (por si llegó a un chat al que no tenía que llegar). Los que ya están,
 * siguen. Devuelve el nuevo, o null si no es el que organiza.
 */
export async function cambiarLinkDelJuego(db: Db, id: string, organizadorId: string): Promise<string | null> {
  if (!esUuid(id)) return null
  const [j] = await db.update(amigosInvisibles).set({ inviteToken: newInviteToken() })
    .where(and(eq(amigosInvisibles.id, id), eq(amigosInvisibles.organizadorId, organizadorId)))
    .returning({ token: amigosInvisibles.inviteToken })
  return j?.token ?? null
}

/** "Cerrar las altas" (o abrirlas de nuevo): con las altas cerradas el link no suma a nadie. */
export async function cerrarAltas(db: Db, id: string, organizadorId: string, cerrar: boolean): Promise<boolean> {
  if (!esUuid(id)) return false
  const filas = await db.update(amigosInvisibles).set({ altasCerradasAt: cerrar ? sql`coalesce(${amigosInvisibles.altasCerradasAt}, now())` : null })
    .where(and(eq(amigosInvisibles.id, id), eq(amigosInvisibles.organizadorId, organizadorId)))
    .returning({ id: amigosInvisibles.id })
  return filas.length > 0
}

type Entrada = { ok: true; nuevo: boolean; tarde: boolean } | { ok: false; reason: 'sacado' | 'cerrado' | 'lleno' | 'pasado' }

/**
 * Entrar a jugar: el que llega por el link, el invitado que dice "Juego" o el que había dicho que no y se suma. Con el
 * juego bloqueado (el tope no se pasa aunque entren dos a la vez). Al invitado lo eligió el que organiza: entra aunque
 * las altas estén cerradas. Con el sorteo ya hecho (tarde) queda esperando: juega, pero no le toca nadie ni él a nadie
 * hasta que se sortee de nuevo; a los demás no les cambia nada mientras tanto.
 */
async function entrar(t: Db, j: Juego, filas: Fila[], userId: string): Promise<Entrada> {
  const mia = filas.find((f) => f.userId === userId)
  if (mia?.estado === 'sacado') return { ok: false, reason: 'sacado' }
  if (mia?.estado === 'juega') return { ok: true, nuevo: false, tarde: false }
  if (yaPaso(j)) return { ok: false, reason: 'pasado' }
  if (mia?.estado !== 'invitado') {
    // antes del sorteo, el que dijo "No juego" cambia de idea como siempre: ya estaba en la lista
    if (j.altasCerradasAt && (!mia || j.sorteadoAt)) return { ok: false, reason: 'cerrado' }
    if (ocupan(filas) >= MAX_JUGADORES) return { ok: false, reason: 'lleno' }
  }
  const tarde = !!j.sorteadoAt
  const como = { estado: 'juega' as const, esperaSorteo: tarde, salioAt: null }
  if (mia) await t.update(amigoInvisibleGente).set(como).where(laFila(j.id, userId))
  else await t.insert(amigoInvisibleGente).values({ amigoInvisibleId: j.id, userId, ...como })
  return { ok: true, nuevo: true, tarde }
}

/** Al que organiza: alguien se sumó con el sorteo ya hecho (antes del sorteo no se avisa: con 30 de la oficina serían 30). */
async function avisarAlta(db: Db, j: Juego, userId: string, enviar?: Enviar) {
  const [p] = await personas(db, [userId])
  await avisar(db, j.organizadorId, {
    de: userId, tipo: 'invisible_sorteo', title: `🙋 ${primerNombre(p?.nombre ?? 'Alguien')} se sumó a "${j.nombre}"`,
    body: 'Ya se había sorteado: sorteá de nuevo para que entre.', url: `${url(j.id)}#sortear`,
  }, enviar).catch(() => 0)
}

/**
 * Lo que pasó con una baja. tarde: estaba en el sorteo. afectado: el que le regalaba, y si se arregló solo (ya le toca
 * otra persona) o se quedó sin nadie. pendiente: después de la baja queda alguien sin a quién regalarle.
 */
type Baja = { tarde: boolean; afectado: { id: string; reparado: boolean } | null; pendiente: boolean }

/**
 * Alguien deja de jugar: se baja solo (no_juega) o lo saca el que organiza (sacado: no ve más el juego ni vuelve con el
 * link). Con el juego bloqueado. Si estaba en el sorteo, queda un hueco en la cadena: Sofi le regalaba a Juan y Juan a
 * Rodri; se va Juan. Se arregla solo el hueco: Sofi pasa a regalarle a Rodri y a nadie más le cambia nada. No se puede
 * si Sofi y Rodri "no se tocan", si son la misma persona (Juan y Sofi se regalaban entre ellos) o si quedan menos de
 * los que hacen falta para jugar: ahí Sofi se queda sin nadie (no se le muestra un "te tocó" que ya no vale) hasta que
 * el que organiza sortee de nuevo. Sofi conserva "ya vio": si se le borrara, el que organiza la vería pasar de "Ya vio"
 * a "Todavía no vio" justo cuando se va Juan, y sabría a quién le regalaba. Null si la fecha ya pasó.
 */
async function salir(t: Db, j: Juego, filas: Fila[], mia: Fila, estado: 'no_juega' | 'sacado'): Promise<Baja | null> {
  const tarde = !!j.sorteadoAt && mia.estado === 'juega' && !mia.esperaSorteo
  let afectado: Baja['afectado'] = null
  let pendiente = false
  if (tarde) {
    if (yaPaso(j)) return null
    const quedan = filas.filter((f) => f.estado === 'juega' && f.userId !== mia.userId)
    const leRegalaba = quedan.find((f) => f.regalaA === mia.userId)
    if (leRegalaba) {
      const para = mia.regalaA
      const prohibido = new Set((await paresExcluidos(t, j.id)).map(([a, b]) => par(a, b).join('|')))
      const reparado = quedan.filter((f) => !f.esperaSorteo).length >= MIN_JUGADORES && !!para && para !== leRegalaba.userId
        && !prohibido.has(par(leRegalaba.userId, para).join('|'))
      await t.update(amigoInvisibleGente).set({ regalaA: reparado ? para : null, yaLoTengoAt: null }).where(laFila(j.id, leRegalaba.userId))
      afectado = { id: leRegalaba.userId, reparado }
    }
    pendiente = quedan.some((f) => (f.userId === afectado?.id ? !afectado.reparado : !f.regalaA))
  }
  await t.update(amigoInvisibleGente)
    .set({ estado, regalaA: null, vioAt: null, reveladoAt: null, yaLoTengoAt: null, esperaSorteo: false, salioAt: tarde ? new Date() : null })
    .where(laFila(j.id, mia.userId))
  if (estado === 'sacado') {
    await t.delete(amigoInvisibleExcluidos).where(and(eq(amigoInvisibleExcluidos.amigoInvisibleId, j.id),
      or(eq(amigoInvisibleExcluidos.a, mia.userId), eq(amigoInvisibleExcluidos.b, mia.userId))))
  }
  return { tarde, afectado, pendiente }
}

/**
 * Los avisos de una baja con el sorteo hecho: al que le regalaba al que se fue (le cambió a quién, o se quedó sin nadie
 * hasta el nuevo sorteo) y, si se fue solo, al que organiza. Al resto no le cambió nada y no se le avisa. El del
 * afectado va sin "de": en la bandeja no dice quién se bajó (ya lo sabe: era a quien le regalaba).
 */
async function avisarBaja(db: Db, j: Juego, quien: string, baja: Baja, alOrganizador: boolean, enviar?: Enviar) {
  if (!baja.tarde) return
  const avisos: Promise<number>[] = []
  if (baja.afectado) {
    avisos.push(avisar(db, baja.afectado.id, baja.afectado.reparado ? {
      tipo: 'invisible_sorteo', title: `🔄 Cambió a quién le regalás en "${j.nombre}"`,
      body: 'Se bajó la persona que te había tocado. Entrá a ver a quién le regalás ahora (solo lo sabés vos).', url: `${url(j.id)}#te-toco`,
    } : {
      tipo: 'invisible_sorteo', title: `⏳ "${j.nombre}": hay que sortear de nuevo`,
      body: 'Se bajó la persona que te había tocado. Hasta el nuevo sorteo no le regalás a nadie.', url: `${url(j.id)}#te-toco`,
    }, enviar))
  }
  if (alOrganizador) {
    const [p] = await personas(db, [quien])
    avisos.push(avisar(db, j.organizadorId, {
      de: quien, tipo: 'invisible_sorteo', title: `👋 ${primerNombre(p?.nombre ?? 'Alguien')} se bajó de "${j.nombre}"`,
      body: baja.pendiente ? 'Hay que sortear de nuevo: entrá y tocá "Volver a sortear".' : 'El sorteo sigue como está para los demás: no hace falta sortear de nuevo.',
      url: `${url(j.id)}#sortear`,
    }, enviar))
  }
  await Promise.all(avisos.map((a) => a.catch(() => 0)))
}

/**
 * "Juego" o "No juego" (también el que había dicho que sí y se baja). Antes del sorteo, como siempre. Con el sorteo
 * hecho, el que se suma espera al próximo (ver entrar) y el que se baja deja un hueco que se arregla solo si se puede
 * (ver salir). El que organiza juega siempre: si no, que lo borre.
 */
export async function responderJuego(db: Db, id: string, userId: string, juega: boolean, enviar?: Enviar): Promise<boolean> {
  if (!esUuid(id)) return false
  const r = await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [j] = await t.select().from(amigosInvisibles).where(eq(amigosInvisibles.id, id)).for('update')
    if (!j || j.organizadorId === userId) return null
    const filas = await filasDe(t, id)
    const mia = filas.find((f) => f.userId === userId)
    if (!mia || mia.estado === 'sacado') return null
    if (juega) {
      const e = await entrar(t, j, filas, userId)
      return e.ok ? { j, alta: e.nuevo && e.tarde, baja: null } : null
    }
    const baja = await salir(t, j, filas, mia, 'no_juega')
    return baja ? { j, alta: false, baja } : null
  })
  if (!r) return false
  if (r.alta) await avisarAlta(db, r.j, userId, enviar)
  if (r.baja) await avisarBaja(db, r.j, userId, r.baja, true, enviar)
  return true
}

export type Unido =
  | { ok: true; id: string; /** recién entra (false: ya estaba jugando) */ nuevo: boolean; /** con el sorteo ya hecho: espera al próximo */ tarde: boolean }
  | { ok: false; reason: 'no_existe' | 'sacado' | 'cerrado' | 'lleno' | 'pasado' }

/**
 * Sumarse por el link del juego: cualquiera con cuenta, sin ser amigo del que organiza (y sin quedar amigo de nadie).
 * No entra si el link cambió, si las altas están cerradas, si ya son el tope, si la fecha pasó o si lo habían sacado.
 * El que ya estaba (también el que organiza) no cambia nada; el invitado que no había contestado queda jugando.
 */
export async function unirsePorLink(db: Db, token: string, userId: string, enviar?: Enviar): Promise<Unido> {
  if (!esToken(token) || !esUuid(userId)) return { ok: false, reason: 'no_existe' }
  const r = await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [j] = await t.select().from(amigosInvisibles).where(eq(amigosInvisibles.inviteToken, token)).for('update')
    if (!j) return null
    return { j, e: await entrar(t, j, await filasDe(t, j.id), userId) }
  })
  if (!r) return { ok: false, reason: 'no_existe' }
  if (!r.e.ok) return r.e
  if (r.e.nuevo && r.e.tarde) await avisarAlta(db, r.j, userId, enviar)
  return { ok: true, id: r.j.id, nuevo: r.e.nuevo, tarde: r.e.tarde }
}

export type Invitacion = {
  id: string
  nombre: string
  descripcion: string | null
  /** la regla con la que juegan, como se guarda (ver leerRegla), o null */
  regla: string | null
  presupuesto: number | null
  fechaEspecial: FechaEspecial | null
  /** "Jueves 25 de diciembre" y cuántos días faltan (negativo si ya pasó) */
  cuando: string
  dias: number
  organizador: Persona
  /** cuántos juegan ya (sin nombres: el link puede terminar en cualquier chat) */
  juegan: number
  sorteado: boolean
  /** si el link suma gente ahora, o por qué no */
  estado: 'abierto' | 'cerrado' | 'lleno' | 'pasado'
  /** el que mira, si tiene cuenta: ya está en el juego (jugando, invitado o habiendo dicho que no) o lo sacaron */
  yo: 'adentro' | 'sacado' | null
}

/**
 * Lo que ve cualquiera que abre el link del juego, con o sin cuenta: quién organiza, cómo se llama, cuándo, hasta cuánto
 * y con qué regla. De los que juegan, solo cuántos son. Null si el link no es de ningún juego (o cambió).
 */
export async function juegoPorInvitacion(db: Db, token: string, userId?: string | null): Promise<Invitacion | null> {
  if (!esToken(token)) return null
  const [j] = await db.select().from(amigosInvisibles).where(eq(amigosInvisibles.inviteToken, token))
  if (!j) return null
  const [filas, [organizador]] = await Promise.all([
    db.select({ userId: amigoInvisibleGente.userId, estado: amigoInvisibleGente.estado }).from(amigoInvisibleGente)
      .where(eq(amigoInvisibleGente.amigoInvisibleId, j.id)),
    personas(db, [j.organizadorId]),
  ])
  if (!organizador) return null
  const mia = userId ? filas.find((f) => f.userId === userId) : undefined
  const hoy = hoyLocal()
  const fechaD = new Date(`${j.fecha}T00:00:00Z`)
  return {
    id: j.id, nombre: j.nombre, descripcion: j.descripcion, regla: leerRegla(j.regla) ? j.regla : null, presupuesto: j.presupuesto,
    fechaEspecial: esFechaEspecial(j.fechaEspecial) ? j.fechaEspecial : null,
    cuando: fechaLarga(fechaD, hoy), dias: diasEntre(hoy, fechaD), organizador,
    juegan: filas.filter((f) => f.estado === 'juega').length, sorteado: !!j.sorteadoAt,
    estado: yaPaso(j) ? 'pasado' : j.altasCerradasAt ? 'cerrado' : ocupan(filas) >= MAX_JUGADORES ? 'lleno' : 'abierto',
    yo: !mia ? null : mia.estado === 'sacado' ? 'sacado' : 'adentro',
  }
}

/**
 * El que organiza saca a alguien (se sumó por error, o con un link que circuló de más): deja de ver el juego y no vuelve
 * a entrar con el link (sin cambiarlo: el que ya se mandó al chat de la oficina sigue sirviendo para los demás). Con el
 * sorteo hecho, deja un hueco como el que se baja solo (ver salir). A él no se lo puede sacar nadie.
 */
export async function sacarDelJuego(db: Db, id: string, organizadorId: string, userId: string, enviar?: Enviar): Promise<boolean> {
  if (!esUuid(id) || !esUuid(userId) || userId === organizadorId) return false
  const r = await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [j] = await t.select().from(amigosInvisibles)
      .where(and(eq(amigosInvisibles.id, id), eq(amigosInvisibles.organizadorId, organizadorId))).for('update')
    if (!j) return null
    const filas = await filasDe(t, id)
    const suya = filas.find((f) => f.userId === userId)
    if (!suya || suya.estado === 'sacado') return null
    const baja = await salir(t, j, filas, suya, 'sacado')
    return baja ? { j, baja } : null
  })
  if (!r) return false
  await avisarBaja(db, r.j, userId, r.baja, false, enviar)
  return true
}

/** "Dejar que vuelva": el que había sacado puede entrar de nuevo con el link (o invitándolo). */
export async function dejarVolverAlJuego(db: Db, id: string, organizadorId: string, userId: string): Promise<boolean> {
  const j = await delOrganizador(db, id, organizadorId)
  if (!j || !esUuid(userId)) return false
  const filas = await db.delete(amigoInvisibleGente).where(and(laFila(id, userId), eq(amigoInvisibleGente.estado, 'sacado')))
    .returning({ id: amigoInvisibleGente.userId })
  return filas.length > 0
}

/**
 * "Que no se toquen" (o que sí, otra vez), entre dos que están en el juego. Antes del sorteo, o cuando hay que sortear
 * de nuevo (se sumó tarde la pareja de uno que ya jugaba): vale para el sorteo que viene.
 */
export async function cambiarExcluidos(db: Db, id: string, organizadorId: string, x: string, y: string, excluir: boolean): Promise<boolean> {
  const j = await delOrganizador(db, id, organizadorId)
  if (!j || !esUuid(x) || !esUuid(y) || x === y) return false
  const filas = await filasDe(db, id)
  if (j.sorteadoAt && !hayCambios(filas)) return false
  if (filas.filter((f) => (f.userId === x || f.userId === y) && f.estado !== 'sacado').length !== 2) return false
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
 * El que organiza sortea entre los que juegan (los que no contestaron quedan afuera): a cada uno le llega el aviso y
 * desde ahí ve a quién le regala. Sortear de nuevo, solo si desde el último sorteo alguien se bajó o se sumó (ver
 * hayCambios) y la fecha no pasó: se sortea todo otra vez entre los que juegan ahora, a todos les puede cambiar a quién
 * le regalan y cada uno tiene que mirar de nuevo. Si no alcanza la gente o no hay forma, no se toca nada.
 */
export async function sortear(db: Db, id: string, organizadorId: string, enviar?: Enviar, azar?: (n: number) => number): Promise<Sorteo> {
  if (!esUuid(id)) return { ok: false, reason: 'no_permitido' }
  const r = await db.transaction(async (tx): Promise<Sorteo & { juegan?: string[]; nombre?: string; otraVez?: boolean }> => {
    const t = tx as unknown as Db
    const [j] = await t.select().from(amigosInvisibles)
      .where(and(eq(amigosInvisibles.id, id), eq(amigosInvisibles.organizadorId, organizadorId))).for('update')
    if (!j) return { ok: false, reason: 'no_permitido' }
    const filas = await filasDe(t, id)
    const otraVez = !!j.sorteadoAt
    if (otraVez && (yaPaso(j) || !hayCambios(filas))) return { ok: false, reason: 'no_permitido' }
    const juegan = filas.filter((f) => f.estado === 'juega').map((f) => f.userId)
    if (juegan.length < MIN_JUGADORES) return { ok: false, reason: 'pocos' }
    const asignado = asignar(juegan, await paresExcluidos(t, id), azar)
    if (!asignado) return { ok: false, reason: 'imposible' }
    // lo del sorteo anterior ya no vale para nadie: ni a quién, ni que lo vio, ni que ya tenía el regalo
    if (otraVez) {
      await t.update(amigoInvisibleGente).set({ regalaA: null, vioAt: null, reveladoAt: null, yaLoTengoAt: null, esperaSorteo: false, salioAt: null })
        .where(eq(amigoInvisibleGente.amigoInvisibleId, id))
    }
    for (const [de, para] of asignado) {
      await t.update(amigoInvisibleGente).set({ regalaA: para }).where(laFila(id, de))
    }
    await t.update(amigoInvisibleGente).set({ estado: 'no_juega' })
      .where(and(eq(amigoInvisibleGente.amigoInvisibleId, id), eq(amigoInvisibleGente.estado, 'invitado')))
    await t.update(amigosInvisibles).set({ sorteadoAt: new Date() }).where(eq(amigosInvisibles.id, id))
    return { ok: true, juegan, nombre: j.nombre, otraVez }
  })
  if (!r.ok) return r
  await Promise.all(r.juegan!.map((u) => avisar(db, u, r.otraVez ? {
    tipo: 'invisible_sorteo', title: `🔄 Se sorteó de nuevo "${r.nombre}"`,
    body: 'Puede haber cambiado a quién le regalás: entrá a ver (solo lo sabés vos).', url: url(id),
  } : {
    tipo: 'invisible_sorteo', title: `🎁 Ya se sorteó "${r.nombre}"`, body: 'Entrá a ver a quién le regalás (solo lo sabés vos).', url: url(id),
  }, enviar).catch(() => 0)))
  return { ok: true }
}

export type Pregunta = { id: string; texto: string; respuesta: string | null }

export type VistaJuego = {
  id: string
  nombre: string
  descripcion: string | null
  /** la regla con la que juegan, como se guarda (ver leerRegla), o null */
  regla: string | null
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
  /**
   * todos (menos los que sacó el que organiza), con cómo están y si ya vieron a quién les toca (nunca a quién). espera:
   * se sumó con el sorteo ya hecho y entra en el próximo
   */
  gente: { persona: Persona; estado: 'invitado' | 'juega' | 'no_juega'; vio: boolean; espera: boolean }[]
  /** solo para el que organiza: los que no se tocan */
  excluidos: [Persona, Persona][]
  /** el que organiza cerró las altas: el link no suma a nadie */
  altasCerradas: boolean
  /** ya son el tope: no entra nadie más */
  lleno: boolean
  /**
   * juego y el sorteo ya se hizo, pero no tengo a quién regalarle hasta que se sortee de nuevo: porque me sumé después
   * ('nuevo') o porque se bajó quien me había tocado y no se pudo arreglar solo ('hueco')
   */
  esperoSorteo: 'nuevo' | 'hueco' | null
  /** no juego, ya se sorteó y todavía puedo sumarme (entro en el próximo sorteo) */
  puedoSumarme: boolean
  /**
   * solo para el que organiza, desde el sorteo. bajas: los que se bajaron (o sacó) desde el último sorteo.
   * faltaSortearDeNuevo: hay alguien que juega sin a quién regalarle (nunca dice quién, salvo los que esperan en gente).
   * puedeSortearDeNuevo: cambió quiénes juegan y la fecha no pasó. sacados: los que sacó, por si quiere dejarlos volver.
   */
  bajas: Persona[]
  faltaSortearDeNuevo: boolean
  puedeSortearDeNuevo: boolean
  sacados: Persona[]
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
  /** con la regla "Robo de regalos", desde el sorteo y si juego: mi turno para abrir o robar (ver turnoEnElRobo) */
  miTurno: { turno: number; de: number } | null
}

/**
 * El juego para uno que está (también un invitado que no contestó) o el que organiza; null para cualquier otro, también
 * para el que sacaron. Las preguntas son las del par de ahora: si después de sortear de nuevo le regalo a otro, las que
 * le hice al de antes (y sus respuestas) no aparecen con el nombre del nuevo.
 */
export async function amigoInvisibleParaViewer(db: Db, id: string, userId: string): Promise<VistaJuego | null> {
  if (!esUuid(id)) return null
  const [j] = await db.select().from(amigosInvisibles).where(eq(amigosInvisibles.id, id))
  if (!j) return null
  const todas = await filasDe(db, id)
  const mia = todas.find((f) => f.userId === userId)
  if (!mia || mia.estado === 'sacado') return null
  const filas = todas.filter((f) => f.estado !== 'sacado')
  const gente = new Map((await personas(db, [...new Set([j.organizadorId, ...todas.map((f) => f.userId)])])).map((p) => [p.id, p]))
  const soyOrganizador = j.organizadorId === userId
  const juego = mia.estado === 'juega'
  const quienMeRegala = j.sorteadoAt && juego ? filas.find((f) => f.regalaA === userId)?.userId : undefined
  const [excluidos, preguntas, token] = await Promise.all([
    soyOrganizador
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
  const sorteado = !!j.sorteadoAt
  const lleno = ocupan(filas) >= MAX_JUGADORES
  const deNombres = (fs: typeof todas) => fs.flatMap((f) => gente.get(f.userId) ?? [])
  return {
    id, nombre: j.nombre, descripcion: j.descripcion, regla: leerRegla(j.regla) ? j.regla : null, presupuesto: j.presupuesto, fecha: j.fecha,
    fechaEspecial: esFechaEspecial(j.fechaEspecial) ? j.fechaEspecial : null,
    cuando: fechaLarga(fechaD, hoy), dias: diasEntre(hoy, fechaD),
    organizador: gente.get(j.organizadorId)!, soyOrganizador, miEstado: mia.estado, sorteado,
    gente: filas.flatMap((f) => {
      const persona = gente.get(f.userId)
      return persona ? [{ persona, estado: f.estado as 'invitado' | 'juega' | 'no_juega', vio: !!f.vioAt, espera: f.esperaSorteo }] : []
    }),
    excluidos: excluidos.flatMap((e) => {
      const a = gente.get(e.a)
      const b = gente.get(e.b)
      return a && b ? [[a, b] as [Persona, Persona]] : []
    }),
    altasCerradas: !!j.altasCerradasAt, lleno,
    esperoSorteo: sorteado && juego && !mia.regalaA ? (mia.esperaSorteo ? 'nuevo' : 'hueco') : null,
    puedoSumarme: sorteado && mia.estado === 'no_juega' && !j.altasCerradasAt && !lleno && !yaPaso(j),
    bajas: soyOrganizador && sorteado ? deNombres(todas.filter((f) => f.salioAt)) : [],
    faltaSortearDeNuevo: soyOrganizador && sorteado && filas.some((f) => f.estado === 'juega' && !f.regalaA),
    puedeSortearDeNuevo: soyOrganizador && sorteado && hayCambios(todas) && !yaPaso(j),
    sacados: soyOrganizador ? deNombres(todas.filter((f) => f.estado === 'sacado')) : [],
    meToca: mia.regalaA && mia.vioAt && gente.get(mia.regalaA) ? { persona: gente.get(mia.regalaA)!, token } : null,
    vi: !!mia.vioAt,
    // las mías: las que le hice a quien le regalo ahora; para mí: las de quien me regala ahora (nunca se dice quién)
    preguntasMias: preguntas.filter((p) => p.deUserId === userId && p.paraUserId === mia.regalaA).map(anon),
    preguntasParaMi: preguntas.filter((p) => p.paraUserId === userId && p.deUserId === quienMeRegala).map(anon),
    puedoRevelar: !!j.sorteadoAt && juego && hoyIso() > j.fecha && !mia.reveladoAt && !!quienMeRegala,
    meRegalo: mia.reveladoAt && quienMeRegala ? gente.get(quienMeRegala) ?? null : null,
    yaLoTengo: !!mia.yaLoTengoAt,
    miTurno: j.sorteadoAt && juego && reglaDe(j.regla)?.id === 'robo'
      ? turnoEnElRobo(id, filas.filter((f) => f.estado === 'juega').map((f) => f.userId), userId) : null,
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
    tipo: 'invisible_pregunta', title: '🤫 Tu amigo invisible te hizo una pregunta', body: `En "${j?.nombre ?? 'el amigo invisible'}": ${texto}`, url: `${url(id)}#preguntas`,
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
    tipo: 'invisible_respuesta', title: '💬 Te contestaron', body: `En "${j?.nombre ?? 'el amigo invisible'}": ${respuesta}`, url: `${url(p.amigoInvisibleId)}#preguntas`,
  }, enviar).catch(() => 0)
  return p.amigoInvisibleId
}

export type MiJuego = {
  id: string
  nombre: string
  /** la regla con la que juegan, como se guarda (ver leerRegla), o null */
  regla: string | null
  fecha: string
  fechaEspecial: FechaEspecial | null
  presupuesto: number | null
  /** cuántos días faltan (negativo si ya pasó) */
  dias: number
  miEstado: 'invitado' | 'juega'
  /**
   * ya se sorteó y, si juego, tengo a quién regalarle. Si me sumé después del sorteo, o se bajó quien me había tocado,
   * hasta que se sortee de nuevo para mí es como si faltara sortear (no hay un "mirá a quién le regalás" que valga)
   */
  sorteado: boolean
  /** hubo un sorteo y hace falta otro: no tengo a quién regalarle o, si organizo, alguno de los que juegan no tiene */
  faltaSortearDeNuevo: boolean
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
  const [estados, sinNadie, sinContestar, tocan] = await Promise.all([
    db.select({ id: amigoInvisibleGente.amigoInvisibleId, estado: amigoInvisibleGente.estado, n: sql<number>`count(*)::int` })
      .from(amigoInvisibleGente).where(inArray(amigoInvisibleGente.amigoInvisibleId, ids))
      .groupBy(amigoInvisibleGente.amigoInvisibleId, amigoInvisibleGente.estado),
    // en qué juegos hay alguno que juega sin a quién regalarle (no quién): para decirle al que organiza que sortee de nuevo
    db.selectDistinct({ id: amigoInvisibleGente.amigoInvisibleId }).from(amigoInvisibleGente)
      .where(and(inArray(amigoInvisibleGente.amigoInvisibleId, ids), eq(amigoInvisibleGente.estado, 'juega'), isNull(amigoInvisibleGente.regalaA))),
    // las de quien me regala ahora: las del que me regalaba antes de sortear de nuevo ya no esperan respuesta
    db.select({ id: amigoInvisiblePreguntas.amigoInvisibleId, n: sql<number>`count(*)::int` }).from(amigoInvisiblePreguntas)
      .innerJoin(amigoInvisibleGente, and(eq(amigoInvisibleGente.amigoInvisibleId, amigoInvisiblePreguntas.amigoInvisibleId),
        eq(amigoInvisibleGente.userId, amigoInvisiblePreguntas.deUserId), eq(amigoInvisibleGente.regalaA, userId)))
      .where(and(inArray(amigoInvisiblePreguntas.amigoInvisibleId, ids), eq(amigoInvisiblePreguntas.paraUserId, userId), isNull(amigoInvisiblePreguntas.respuesta)))
      .groupBy(amigoInvisiblePreguntas.amigoInvisibleId),
    personas(db, [...new Set(filas.flatMap((f) => (f.mia.regalaA && f.mia.vioAt ? [f.mia.regalaA] : [])))]),
  ])
  const persona = new Map(tocan.map((p) => [p.id, p]))
  const cuenta = (id: string, cuales: string[]) => estados.filter((e) => e.id === id && cuales.includes(e.estado)).reduce((t, e) => t + e.n, 0)
  const falta = new Set(sinNadie.map((f) => f.id))
  return filas.map(({ j, mia, org }) => {
    const sinAQuien = !!j.sorteadoAt && mia.estado === 'juega' && !mia.regalaA
    return {
    id: j.id, nombre: j.nombre, regla: leerRegla(j.regla) ? j.regla : null, fecha: j.fecha,
    fechaEspecial: esFechaEspecial(j.fechaEspecial) ? j.fechaEspecial : null, presupuesto: j.presupuesto,
    dias: diasEntre(hoy, new Date(`${j.fecha}T00:00:00Z`)), miEstado: mia.estado as 'invitado' | 'juega', sorteado: !!j.sorteadoAt && !sinAQuien,
    faltaSortearDeNuevo: sinAQuien || (!!j.sorteadoAt && j.organizadorId === userId && falta.has(j.id)),
    vi: !!mia.vioAt, revelado: !!mia.reveladoAt, organizador: org, soyOrganizador: j.organizadorId === userId,
    invitados: cuenta(j.id, ['invitado', 'juega', 'no_juega']), contestaron: cuenta(j.id, ['juega', 'no_juega']),
    meToca: mia.regalaA && mia.vioAt ? persona.get(mia.regalaA) ?? null : null,
    yaLoTengo: !!mia.yaLoTengoAt, preguntasSinContestar: sinContestar.find((p) => p.id === j.id)?.n ?? 0,
    }
  })
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
