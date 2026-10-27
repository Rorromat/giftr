import { randomBytes } from 'node:crypto'
import { and, count, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { amistades, listFollows, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { avisar, type Enviar } from '@/lib/codazos'
import { guardarAviso } from '@/lib/bandeja'
import { esToken, esUuid, juntarNombres } from '@/lib/groups'
import { urlFoto } from '@/lib/users'

// Amigos: uno le manda una solicitud al otro (por su @usuario, su mail, o desde su lista) y, si la acepta, se ven
// mutuamente: cada uno sigue la lista personal del otro (aparece en Tu gente y su cumple en Eventos, ver gente.ts). Con
// el link de amigo (/amigo/<token>), quien lo abre y acepta queda amigo sin solicitud: el dueño del link ya lo compartió.
// Nada de esto toca reservas (la Sorpresa): un amigo ve la lista del otro como cualquiera que regala.
// Una rechazada no se le dice al que la mandó: la sigue viendo como enviada, y mandarla de nuevo no le llega al otro.

// ---------------------------------------------------------------- @usuario

/** 3 a 20: letras, números, punto y guión bajo; empieza y termina con letra o número. */
export const USUARIO = /^[a-z0-9](?:[a-z0-9._]{1,18})[a-z0-9]$/
const RESERVADOS = new Set(['giftr', 'admin', 'soporte', 'ayuda', 'usuario', 'amigo', 'amigos'])

/** Lo que escribió (con o sin @, con espacios o mayúsculas) como usuario; null si no puede ser uno. */
export function normalizarUsuario(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const u = s.trim().replace(/^@/, '').toLowerCase()
  return USUARIO.test(u) ? u : null
}

/**
 * El usuario que se le sugiere por el nombre: "Euge Mateus" → "euge.mateus", sin tildes. Hasta 16 (deja lugar para un
 * número), cortando en una palabra entera si se puede. Vacío si no da.
 */
export function usuarioDelNombre(nombre: string): string {
  let base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
  if (base.length > 16) {
    const punto = base.slice(0, 17).lastIndexOf('.')
    base = (punto >= 3 ? base.slice(0, punto) : base.slice(0, 16)).replace(/\.+$/, '')
  }
  return base.length >= 3 ? base : ''
}

/**
 * Su usuario; si no tiene, se le pone uno libre sacado del nombre ("euge.mateus", si no "euge.mateus2"…). Si justo otro
 * se queda con el mismo, prueba de nuevo. Null solo si el usuario no existe.
 */
export async function asegurarUsuario(db: Db, userId: string): Promise<string | null> {
  if (!esUuid(userId)) return null
  for (let intento = 0; intento < 4; intento++) {
    const [u] = await db.select({ usuario: users.usuario, nombre: users.nombre }).from(users).where(eq(users.id, userId))
    if (!u) return null
    if (u.usuario) return u.usuario
    const base = usuarioDelNombre(u.nombre) || 'usuario'
    const candidatos = [base, ...Array.from({ length: 30 }, (_, n) => `${base.slice(0, 18)}${n + 2}`)].filter((c) => !RESERVADOS.has(c))
    const tomados = new Set((await db.select({ u: users.usuario }).from(users).where(inArray(users.usuario, candidatos))).map((r) => r.u))
    const libre = candidatos.find((c) => !tomados.has(c)) ?? `${base.slice(0, 13)}.${randomBytes(3).toString('hex')}`
    try {
      const [listo] = await db.update(users).set({ usuario: libre }).where(and(eq(users.id, userId), isNull(users.usuario)))
        .returning({ usuario: users.usuario })
      if (listo) return listo.usuario
    } catch {
      // otro se lo quedó entre que se miró y se guardó: otra vuelta
    }
  }
  return null
}

export type CambioUsuario = { ok: true; usuario: string } | { ok: false; error: 'formato' | 'ocupado' }

/** Cambiar el usuario desde Perfil. Es el mismo en minúsculas para todos. */
export async function cambiarUsuario(db: Db, userId: string, escrito: unknown): Promise<CambioUsuario> {
  const usuario = normalizarUsuario(escrito)
  if (!usuario) return { ok: false, error: 'formato' }
  if (RESERVADOS.has(usuario)) return { ok: false, error: 'ocupado' }
  const [otro] = await db.select({ id: users.id }).from(users).where(eq(users.usuario, usuario))
  if (otro) return otro.id === userId ? { ok: true, usuario } : { ok: false, error: 'ocupado' }
  try {
    await db.update(users).set({ usuario }).where(eq(users.id, userId))
  } catch {
    // otro se lo quedó recién
    return { ok: false, error: 'ocupado' }
  }
  return { ok: true, usuario }
}

export type Persona = { id: string; nombre: string; usuario: string | null; foto: string | null }
const camposPersona = { id: users.id, nombre: users.nombre, usuario: users.usuario, fotoAt: users.fotoAt, avatarUrl: users.avatarUrl }
const persona = (u: { id: string; nombre: string; usuario: string | null; fotoAt: Date | null; avatarUrl: string | null }): Persona =>
  ({ id: u.id, nombre: u.nombre, usuario: u.usuario, foto: urlFoto(u) })

/** Lo que se muestra de varias personas (foto, nombre y @usuario), en el orden de los ids. */
export async function personas(db: Db, ids: string[]): Promise<Persona[]> {
  if (!ids.length) return []
  const filas = new Map((await db.select(camposPersona).from(users).where(inArray(users.id, ids))).map((u) => [u.id, persona(u)]))
  return ids.flatMap((id) => filas.get(id) ?? [])
}

/** Quién tiene ese usuario (para mostrarlo antes de mandarle la solicitud). Un usuario es público, como en otras apps. */
export async function buscarPorUsuario(db: Db, escrito: unknown): Promise<Persona | null> {
  const usuario = normalizarUsuario(escrito)
  if (!usuario) return null
  const [u] = await db.select(camposPersona).from(users).where(eq(users.usuario, usuario))
  return u ? persona(u) : null
}

/** Un mail que se puede escribir: algo@algo.algo, sin espacios. En minúsculas. */
export function normalizarEmail(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const e = s.trim().toLowerCase()
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

// ---------------------------------------------------------------- solicitudes

/** Cuántas solicitudes puede mandar alguien por día: alcanza para su gente y frena a quien quiera llenar a otros. */
export const SOLICITUDES_POR_DIA = 30

export type Relacion = 'yo' | 'amigos' | 'enviada' | 'recibida' | 'nada'

/** La fila entre los dos, mande quien la haya mandado. */
async function filaEntre(db: Db, a: string, b: string) {
  const [f] = await db.select().from(amistades).where(and(
    sql`least(${amistades.deUserId}, ${amistades.paraUserId}) = least(${a}::uuid, ${b}::uuid)`,
    sql`greatest(${amistades.deUserId}, ${amistades.paraUserId}) = greatest(${a}::uuid, ${b}::uuid)`,
    sql`${amistades.paraUserId} is not null`,
  ))
  return f ?? null
}

/** Qué son yo y el otro: amigos, una solicitud mía (pendiente o rechazada: para mí, enviada) o una suya pendiente. */
export async function relacionCon(db: Db, yo: string, otro: string): Promise<Relacion> {
  if (yo === otro) return 'yo'
  if (!esUuid(otro)) return 'nada'
  const f = await filaEntre(db, yo, otro)
  if (!f) return 'nada'
  if (f.estado === 'aceptada') return 'amigos'
  if (f.deUserId === yo) return 'enviada'
  return f.estado === 'pendiente' ? 'recibida' : 'nada'
}

/** El par bloqueado hasta el final de la transacción: dos solicitudes cruzadas a la vez no hacen dos filas. */
const bloquearPar = (t: Db, a: string, b: string) => t.execute(sql`select pg_advisory_xact_lock(hashtext(${`amistad:${[a, b].sort().join(':')}`}))`)

/** Que se vean: cada uno sigue la lista personal del otro (sin el link: son amigos). */
async function seguirseMutuamente(db: Db, a: string, b: string) {
  const personales = await db.select({ id: lists.id, ownerId: lists.ownerId }).from(lists)
    .where(and(inArray(lists.ownerId, [a, b]), eq(lists.tipo, 'personal')))
  const de = (u: string) => personales.find((l) => l.ownerId === u)?.id
  const filas = [[a, de(b)], [b, de(a)]].flatMap(([userId, listId]) => (listId ? [{ userId: userId!, listId }] : []))
  if (filas.length) await db.insert(listFollows).values(filas).onConflictDoNothing()
}

const primerNombre = (n: string) => n.split(' ')[0]

async function nombreDe(db: Db, userId: string) {
  const [u] = await db.select({ nombre: users.nombre }).from(users).where(eq(users.id, userId))
  return u?.nombre ?? 'Alguien'
}

export type ResultadoSolicitud =
  | { ok: true; estado: 'enviada' | 'amigos' }
  | { ok: false; reason: 'yo' | 'no_existe' | 'formato' | 'muchas' }

const pidioAmistad = (primer: string, de: string) =>
  ({ title: `🤝 ${primer} quiere ser tu amigo en GiftR`, body: 'Si aceptás, se ven las listas y los cumples.', url: '/gente#solicitudes', de })
const acepto = (primer: string) => ({ title: `🤝 ${primer} aceptó`, body: 'Ya son amigos: se ven las listas y los cumples.', url: '/gente' })

/**
 * Mandarle una solicitud a alguien. Si el otro ya me había mandado una (pendiente, o rechazada por mí), quedamos amigos:
 * los dos quieren. Si la mía ya estaba (pendiente o rechazada), no le llega de nuevo; la vuelvo a ver en enviadas.
 */
export async function pedirAmistad(db: Db, de: string, para: string, enviar?: Enviar, paraEmail: string | null = null): Promise<ResultadoSolicitud> {
  if (de === para) return { ok: false, reason: 'yo' }
  if (!esUuid(para)) return { ok: false, reason: 'no_existe' }
  const r = await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    await bloquearPar(t, de, para)
    const [existe] = await t.select({ id: users.id }).from(users).where(eq(users.id, para))
    if (!existe) return { ok: false, reason: 'no_existe' } as const
    const f = await filaEntre(t, de, para)
    if (f?.estado === 'aceptada') return { ok: true, estado: 'amigos', avisar: null } as const
    if (f && f.deUserId === de) {
      await t.update(amistades).set({ ocultaAt: null, ...(paraEmail && { paraEmail }) }).where(eq(amistades.id, f.id))
      return { ok: true, estado: 'enviada', avisar: null } as const
    }
    if (f) {
      // el otro me la había mandado: quedamos amigos
      await t.update(amistades).set({ estado: 'aceptada', respondidaAt: new Date(), ocultaAt: null }).where(eq(amistades.id, f.id))
      await seguirseMutuamente(t, de, para)
      return { ok: true, estado: 'amigos', avisar: 'acepto' } as const
    }
    const [{ n }] = await t.select({ n: count() }).from(amistades)
      .where(and(eq(amistades.deUserId, de), gt(amistades.createdAt, new Date(Date.now() - 24 * 3600_000))))
    if (n >= SOLICITUDES_POR_DIA) return { ok: false, reason: 'muchas' } as const
    await t.insert(amistades).values({ deUserId: de, paraUserId: para, paraEmail })
    return { ok: true, estado: 'enviada', avisar: 'pidio' } as const
  })
  if (!r.ok) return r
  if (r.avisar) {
    const primer = primerNombre(await nombreDe(db, de))
    await avisar(db, para, r.avisar === 'pidio' ? pidioAmistad(primer, de) : { ...acepto(primer), de }, enviar)
      .catch(() => 0)
  }
  return { ok: true, estado: r.estado }
}

/**
 * Por mail. A las cuentas que entraron con ese mail, como a cualquiera (ver pedirAmistad); si no hay ninguna, queda
 * esperando a que alguien entre con ese mail (ver reclamarSolicitudesPorMail). Para el que la manda es lo mismo haya o
 * no cuenta: no se puede averiguar con esto quién usa GiftR.
 */
export async function pedirAmistadPorMail(db: Db, de: string, escrito: unknown, enviar?: Enviar): Promise<ResultadoSolicitud> {
  const email = normalizarEmail(escrito)
  if (!email) return { ok: false, reason: 'formato' }
  const [yo] = await db.select({ email: users.email }).from(users).where(eq(users.id, de))
  if (!yo) return { ok: false, reason: 'no_existe' }
  if (yo.email.toLowerCase() === email) return { ok: false, reason: 'yo' }
  const cuentas = await db.select({ id: users.id }).from(users).where(and(sql`lower(${users.email}) = ${email}`, ne(users.id, de)))
  if (cuentas.length) {
    let amigos = false
    for (const c of cuentas) {
      const r = await pedirAmistad(db, de, c.id, enviar, email)
      if (!r.ok) return r
      amigos ||= r.estado === 'amigos'
    }
    // ya amigos con esa cuenta: lo sabía (la tiene en su gente), no es averiguar nada
    return { ok: true, estado: amigos ? 'amigos' : 'enviada' }
  }
  const [{ n }] = await db.select({ n: count() }).from(amistades)
    .where(and(eq(amistades.deUserId, de), gt(amistades.createdAt, new Date(Date.now() - 24 * 3600_000))))
  if (n >= SOLICITUDES_POR_DIA) return { ok: false, reason: 'muchas' }
  await db.insert(amistades).values({ deUserId: de, paraEmail: email }).onConflictDoUpdate({
    target: [amistades.deUserId, amistades.paraEmail], targetWhere: sql`${amistades.paraUserId} is null`, set: { ocultaAt: null },
  })
  return { ok: true, estado: 'enviada' }
}

/**
 * Al entrar con Google: las solicitudes que esperaban a su mail pasan a ser para su cuenta (Google ya verificó que el mail
 * es suyo). Si con alguien ya había una fila entre los dos, esa vale y la del mail se va.
 */
export async function reclamarSolicitudesPorMail(db: Db, userId: string, email: string) {
  const e = normalizarEmail(email)
  if (!e) return
  const esperando = await db.select().from(amistades).where(and(isNull(amistades.paraUserId), eq(amistades.paraEmail, e)))
  for (const s of esperando) {
    if (s.deUserId === userId || await filaEntre(db, s.deUserId, userId)) {
      await db.delete(amistades).where(eq(amistades.id, s.id))
      continue
    }
    let reclamada = false
    try {
      reclamada = (await db.update(amistades).set({ paraUserId: userId }).where(and(eq(amistades.id, s.id), isNull(amistades.paraUserId)))
        .returning({ id: amistades.id })).length > 0
    } catch {
      // justo se armó otra entre los dos
      await db.delete(amistades).where(eq(amistades.id, s.id))
    }
    // le llega a la bandeja (al celular no: recién entra)
    if (reclamada && s.estado === 'pendiente') {
      await guardarAviso(db, userId, pidioAmistad(primerNombre(await nombreDe(db, s.deUserId)), s.deUserId), s.deUserId)
    }
  }
}

/** Aceptar o rechazar una que me llegó. Aceptada: nos vemos, y le avisa. Rechazada: no se entera (la sigue viendo enviada). */
export async function responderSolicitud(db: Db, userId: string, id: string, acepta: boolean, enviar?: Enviar): Promise<boolean> {
  if (!esUuid(id)) return false
  const de = await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [s] = await t.update(amistades)
      .set({ estado: acepta ? 'aceptada' : 'rechazada', respondidaAt: new Date() })
      .where(and(eq(amistades.id, id), eq(amistades.paraUserId, userId), eq(amistades.estado, 'pendiente')))
      .returning({ de: amistades.deUserId })
    if (s && acepta) await seguirseMutuamente(t, s.de, userId)
    return s?.de ?? null
  })
  if (!de) return false
  if (acepta) {
    const primer = primerNombre(await nombreDe(db, userId))
    await avisar(db, de, { ...acepto(primer), de: userId }, enviar)
      .catch(() => 0)
  }
  return true
}

/** Sacar una de las enviadas. Pendiente: se borra (no le llega más). Rechazada: queda, así mandarla de nuevo no le llega. */
export async function cancelarSolicitud(db: Db, userId: string, id: string) {
  if (!esUuid(id)) return
  await db.delete(amistades).where(and(eq(amistades.id, id), eq(amistades.deUserId, userId), eq(amistades.estado, 'pendiente')))
  await db.update(amistades).set({ ocultaAt: new Date() })
    .where(and(eq(amistades.id, id), eq(amistades.deUserId, userId), eq(amistades.estado, 'rechazada')))
}

/** Dejar de ser amigos: ninguno ve más la lista del otro en su gente. Cualquiera puede volver a mandar una solicitud. */
export async function dejarDeSerAmigos(db: Db, userId: string, otro: string) {
  if (!esUuid(otro) || otro === userId) return
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const f = await filaEntre(t, userId, otro)
    if (f?.estado !== 'aceptada') return
    await t.delete(amistades).where(eq(amistades.id, f.id))
    const personales = await t.select({ id: lists.id, ownerId: lists.ownerId }).from(lists)
      .where(and(inArray(lists.ownerId, [userId, otro]), eq(lists.tipo, 'personal')))
    for (const l of personales) {
      const quien = l.ownerId === userId ? otro : userId
      await t.delete(listFollows).where(and(eq(listFollows.userId, quien), eq(listFollows.listId, l.id)))
    }
  })
}

/** Las que me llegaron y no contesté, las más nuevas primero. */
export async function solicitudesRecibidas(db: Db, userId: string): Promise<{ id: string; de: Persona }[]> {
  const rows = await db.select({ solicitud: amistades.id, de: camposPersona }).from(amistades)
    .innerJoin(users, eq(amistades.deUserId, users.id))
    .where(and(eq(amistades.paraUserId, userId), eq(amistades.estado, 'pendiente')))
    .orderBy(desc(amistades.createdAt))
  return rows.map((r) => ({ id: r.solicitud, de: persona(r.de) }))
}

/**
 * Las que mandé y no son amistad: pendientes y rechazadas (para mí, las dos esperan). Las que mandé por mail se muestran
 * con el mail que escribí, no con el nombre de la cuenta.
 */
export async function solicitudesEnviadas(db: Db, userId: string): Promise<{ id: string; a: string; para: Persona | null }[]> {
  const rows = await db.select({ id: amistades.id, paraEmail: amistades.paraEmail, para: amistades.paraUserId, nombre: users.nombre, usuario: users.usuario, fotoAt: users.fotoAt, avatarUrl: users.avatarUrl })
    .from(amistades).leftJoin(users, eq(amistades.paraUserId, users.id))
    .where(and(eq(amistades.deUserId, userId), ne(amistades.estado, 'aceptada'), isNull(amistades.ocultaAt)))
    .orderBy(desc(amistades.createdAt))
  return rows.map((r) => {
    const p = r.para && !r.paraEmail && r.nombre ? persona({ id: r.para, nombre: r.nombre, usuario: r.usuario, fotoAt: r.fotoAt, avatarUrl: r.avatarUrl }) : null
    return { id: r.id, a: r.paraEmail ?? (r.usuario ? `@${r.usuario}` : r.nombre ?? ''), para: p }
  })
}

/** Cuántas me esperan (el cartel de Inicio y de Vos). */
export async function cuantasRecibidas(db: Db, userId: string): Promise<{ n: number; primero: string | null }> {
  const rows = await db.select({ nombre: users.nombre }).from(amistades).innerJoin(users, eq(amistades.deUserId, users.id))
    .where(and(eq(amistades.paraUserId, userId), eq(amistades.estado, 'pendiente'))).orderBy(desc(amistades.createdAt))
  return { n: rows.length, primero: rows[0] ? primerNombre(rows[0].nombre) : null }
}

/** Con quiénes soy amigo (sus ids). */
export async function misAmigos(db: Db, userId: string): Promise<Set<string>> {
  const rows = await db.select({ de: amistades.deUserId, para: amistades.paraUserId }).from(amistades)
    .where(and(eq(amistades.estado, 'aceptada'), or(eq(amistades.deUserId, userId), eq(amistades.paraUserId, userId))))
  return new Set(rows.map((r) => (r.de === userId ? r.para! : r.de)))
}

/**
 * Al cambiar el link de la lista se dejan de seguir todos los que la tenían (ver cambiarLinkParaRegalar): los amigos no,
 * que no la seguían por el link. Va en la misma transacción.
 */
export async function volverASeguirAmigos(db: Db, ownerId: string, listId: string) {
  const amigos = [...await misAmigos(db, ownerId)]
  if (amigos.length) await db.insert(listFollows).values(amigos.map((userId) => ({ userId, listId }))).onConflictDoNothing()
}

// ---------------------------------------------------------------- sugerencias

/** Alguien que quizás conocés, y los amigos tuyos que son amigos suyos (para "Amigos en común: Sofi y Juan"). */
export type Sugerencia = { p: Persona; enComun: string[] }

/** "Sofi", "Sofi y Juan", "Sofi, Juan y 2 más". */
export const amigosEnComun = (nombres: string[]) =>
  juntarNombres(nombres.length > 2 ? [...nombres.slice(0, 2), `${nombres.length - 2} más`] : nombres)

/**
 * Gente que quizás conocés: amigos de tus amigos que no son tus amigos ni tienen una solicitud con vos, de quien sea y como
 * esté (las pendientes ya tienen su lugar; una rechazada no se vuelve a sugerir), ni los que sacaste con "Ahora no"
 * (`sacada`, ver noSugerir). Primero los que tienen más amigos en común con vos.
 */
export async function sugerenciasDeAmigos(db: Db, userId: string, limite = 6, sacada: (id: string) => boolean = () => false): Promise<Sugerencia[]> {
  const amigos = await misAmigos(db, userId)
  if (!amigos.size) return []
  const filas = await db.select({ de: amistades.deUserId, para: amistades.paraUserId }).from(amistades)
    .where(and(eq(amistades.estado, 'aceptada'), or(inArray(amistades.deUserId, [...amigos]), inArray(amistades.paraUserId, [...amigos]))))
  // cada candidato, con los amigos míos que lo tienen de amigo
  const via = new Map<string, Set<string>>()
  for (const { de, para } of filas) {
    for (const [amigo, otro] of [[de, para!], [para!, de]]) {
      if (amigos.has(amigo) && otro !== userId && !amigos.has(otro)) via.set(otro, (via.get(otro) ?? new Set()).add(amigo))
    }
  }
  if (!via.size) return []
  const candidatos = [...via.keys()]
  const conAlgo = await db.select({ de: amistades.deUserId, para: amistades.paraUserId }).from(amistades).where(or(
    and(eq(amistades.deUserId, userId), inArray(amistades.paraUserId, candidatos)),
    and(eq(amistades.paraUserId, userId), inArray(amistades.deUserId, candidatos)),
  ))
  for (const f of conAlgo) via.delete(f.de === userId ? f.para! : f.de)
  for (const id of via.keys()) if (sacada(id)) via.delete(id)
  if (!via.size) return []

  const ids = new Set([...via.keys(), ...[...via.values()].flatMap((s) => [...s])])
  const gente = new Map((await db.select(camposPersona).from(users).where(inArray(users.id, [...ids]))).map((u) => [u.id, persona(u)]))
  const porNombre = (a: string, b: string) => (gente.get(a)?.nombre ?? '').localeCompare(gente.get(b)?.nombre ?? '', 'es')
  return [...via]
    .filter(([id]) => gente.has(id))
    .sort(([a, x], [b, y]) => y.size - x.size || porNombre(a, b))
    .slice(0, limite)
    .map(([id, comun]) => ({ p: gente.get(id)!, enComun: [...comun].sort(porNombre).map((a) => primerNombre(gente.get(a)?.nombre ?? '')) }))
}

// ---------------------------------------------------------------- link de amigo

/** El token del link de amigo; si no tiene, se le crea. */
export async function miAmigoToken(db: Db, userId: string): Promise<string | null> {
  const [u] = await db.select({ t: users.amigoToken }).from(users).where(eq(users.id, userId))
  if (!u) return null
  if (u.t) return u.t
  await db.update(users).set({ amigoToken: randomBytes(12).toString('base64url') }).where(and(eq(users.id, userId), isNull(users.amigoToken)))
  const [listo] = await db.select({ t: users.amigoToken }).from(users).where(eq(users.id, userId))
  return listo?.t ?? null
}

/** De quién es un link de amigo. */
export async function duenoDeAmigoToken(db: Db, token: string): Promise<Persona | null> {
  if (!esToken(token)) return null
  const [u] = await db.select(camposPersona).from(users).where(eq(users.amigoToken, token))
  return u ? persona(u) : null
}

/**
 * Aceptar el link de amigo de alguien: quedamos amigos sin solicitud (el link lo compartió él). Si había una fila entre
 * los dos (pendiente o rechazada, de cualquiera), pasa a aceptada. Le avisa.
 */
export async function aceptarLinkDeAmigo(db: Db, userId: string, token: string, enviar?: Enviar): Promise<{ ok: true; de: Persona } | { ok: false; reason: 'no_existe' | 'yo' }> {
  const de = await duenoDeAmigoToken(db, token)
  if (!de) return { ok: false, reason: 'no_existe' }
  if (de.id === userId) return { ok: false, reason: 'yo' }
  const nuevo = await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    await bloquearPar(t, de.id, userId)
    const f = await filaEntre(t, de.id, userId)
    if (f?.estado === 'aceptada') return false
    if (f) await t.update(amistades).set({ estado: 'aceptada', respondidaAt: new Date(), ocultaAt: null }).where(eq(amistades.id, f.id))
    else await t.insert(amistades).values({ deUserId: de.id, paraUserId: userId, estado: 'aceptada', respondidaAt: new Date() })
    await seguirseMutuamente(t, de.id, userId)
    return true
  })
  if (nuevo) {
    const primer = primerNombre(await nombreDe(db, userId))
    await avisar(db, de.id, { title: `🤝 ${primer} se sumó como amigo`, body: 'Ya se ven las listas y los cumples.', url: '/gente', de: userId }, enviar)
      .catch(() => 0)
  }
  return { ok: true, de }
}
