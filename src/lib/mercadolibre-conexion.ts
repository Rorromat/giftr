import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { mercadolibreConexion, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { cifrar, descifrar } from '@/lib/cifrado'
import { hmac, igualesSinFiltrarTiempo } from '@/lib/cookie-invitado'
import { UA_GIFTR } from '@/lib/giftrbot'
import { esUuid } from '@/lib/groups'

// La cuenta de MercadoLibre del dueño de GiftR, conectada una sola vez (no la de cada usuario): con su token la API lee
// las publicaciones que el muro no deja ver. Es el OAuth documentado por ML (authorization_code con PKCE, y refresh_token
// para renovar): el token de la aplicación (client_credentials, ver mercadolibre.ts) ML no lo documenta.
// - Conectar: /api/mercadolibre/conectar (con sesión y un email de MELI_ADMIN_EMAILS) lleva a la autorización de ML, que
//   vuelve a /api/mercadolibre/callback con el código; el canje da el par de tokens, que se guarda cifrado.
// - Usar: el access token dura 6 h; vencido, se renueva con el refresh token, que es de un solo uso (cada renovación da
//   otro y solo vale el último). Por eso se renueva con la fila bloqueada y se guarda el par nuevo antes de soltarla.
// Nunca se loguea un token, el secreto ni lo que contestó ML.

export const API_ML = 'https://api.mercadolibre.com'
const AUTORIZACION = 'https://auth.mercadolibre.com.ar/authorization'

export const hayApiDeMercadoLibre = () => !!(process.env.MELI_CLIENT_ID && process.env.MELI_CLIENT_SECRET)

type Json = Record<string, unknown>
export const esJson = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Una respuesta que no se va a leer: se suelta la conexión. */
export const descartar = (r: Response) => r.body?.cancel().catch(() => {})

// ---------------------------------------------------------------- quién conecta

/** Los emails de Google que pueden conectar la cuenta (MELI_ADMIN_EMAILS, separados por coma), en minúsculas. */
export function adminsDeMercadoLibre(): string[] {
  return (process.env.MELI_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

/** Adónde vuelve ML con el código: tiene que ser https (ML no acepta otra), si no, la conexión no se ofrece. */
export function redirectUriDeMercadoLibre(): string | null {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '')
  try {
    return base && new URL(base).protocol === 'https:' ? `${base}/api/mercadolibre/callback` : null
  } catch {
    return null
  }
}

/** Si se puede ofrecer la conexión: las credenciales de la aplicación, una redirect URI https y algún admin. */
export const conexionConfigurada = () => hayApiDeMercadoLibre() && !!redirectUriDeMercadoLibre() && adminsDeMercadoLibre().length > 0

/**
 * Si esta cuenta puede conectar MercadoLibre: con la conexión configurada y con el email que dio Google al entrar en
 * MELI_ADMIN_EMAILS (sin distinguir mayúsculas). Si no, los routes contestan 404, como si no existieran.
 */
export async function puedeConectar(db: Db, userId: string | null | undefined): Promise<boolean> {
  if (!conexionConfigurada() || !userId || !esUuid(userId)) return false
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId))
  return !!u && adminsDeMercadoLibre().includes(u.email.trim().toLowerCase())
}

// ---------------------------------------------------------------- el pedido de conexión (la cookie)

export const COOKIE_CONECTAR_ML = 'giftr_ml_conectar'
/** Lo que dura el pedido: de ir a ML y volver. */
export const CONECTAR_ML_MS = 10 * 60_000

/** El state (contra un callback que no salió de acá) y el verificador PKCE, de quien lo empezó y hasta cuándo vale. */
export type PedidoDeConexion = { state: string; verifier: string; userId: string; vence: number }

export function nuevoPedidoDeConexion(userId: string): PedidoDeConexion {
  return {
    state: randomBytes(24).toString('base64url'), verifier: randomBytes(32).toString('base64url'), userId, vence: Date.now() + CONECTAR_ML_MS,
  }
}

const firmaDelPedido = (datos: string) => hmac(`${COOKIE_CONECTAR_ML}:${datos}`)

/** El valor de la cookie: `<datos>.<firma>`, con los datos en base64url. */
export function firmarPedidoDeConexion(p: PedidoDeConexion): string {
  const datos = Buffer.from(JSON.stringify({ s: p.state, v: p.verifier, u: p.userId, e: p.vence })).toString('base64url')
  return `${datos}.${firmaDelPedido(datos)}`
}

/**
 * El pedido de la cookie, si está bien firmado (comparando sin filtrar tiempo), no venció, es de esta cuenta y su state
 * es el que volvió de ML. Si no: null.
 */
export function leerPedidoDeConexion(valor: string | undefined, state: string | null, userId: string): PedidoDeConexion | null {
  const punto = valor?.lastIndexOf('.') ?? -1
  if (!valor || punto < 0 || !state) return null
  const datos = valor.slice(0, punto)
  if (!igualesSinFiltrarTiempo(valor.slice(punto + 1), firmaDelPedido(datos))) return null
  let j: unknown
  try {
    j = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!esJson(j) || typeof j.s !== 'string' || typeof j.v !== 'string' || typeof j.u !== 'string' || typeof j.e !== 'number') return null
  if (Date.now() >= j.e || j.u !== userId || !igualesSinFiltrarTiempo(j.s, state)) return null
  return { state: j.s, verifier: j.v, userId: j.u, vence: j.e }
}

/** El Set-Cookie del pedido (null lo borra): HttpOnly, Secure en producción, SameSite=Lax y solo para estos routes. */
export function cookieDelPedido(valor: string | null): string {
  return [
    `${COOKIE_CONECTAR_ML}=${valor ?? ''}`, 'Path=/api/mercadolibre', `Max-Age=${valor ? CONECTAR_ML_MS / 1000 : 0}`, 'HttpOnly', 'SameSite=Lax',
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
  ].join('; ')
}

/** La cookie del pedido que trae el navegador. */
export function cookieDelPedidoEn(request: Request): string | undefined {
  for (const par of (request.headers.get('cookie') ?? '').split(';')) {
    const igual = par.indexOf('=')
    if (igual > 0 && par.slice(0, igual).trim() === COOKIE_CONECTAR_ML) return par.slice(igual + 1).trim()
  }
  return undefined
}

/** El desafío PKCE (S256) del verificador. */
export const desafioPkce = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

/** La autorización de ML para este pedido. Siempre a ese host, con la redirect URI configurada (nunca una del pedido). */
export function urlDeAutorizacion(p: PedidoDeConexion): string {
  const u = new URL(AUTORIZACION)
  u.search = new URLSearchParams({
    response_type: 'code', client_id: process.env.MELI_CLIENT_ID ?? '', redirect_uri: redirectUriDeMercadoLibre() ?? '', state: p.state,
    code_challenge: desafioPkce(p.verifier), code_challenge_method: 'S256',
  }).toString()
  return u.toString()
}

/** Para quien no puede conectar (sin sesión, otro email, sin las variables): como si el route no existiera. */
export const noExiste = () =>
  new Response('No existe esta página.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * Lo que contesta el callback: una página corta, con lo que pasó en palabras simples (nunca lo que devolvió ML) y, si no
 * salió, el link para volver a empezar. Sin redirigir a ningún lado. cookie: el Set-Cookie que borra el pedido.
 */
export function paginaDeConexion(mensaje: string, o: { status?: number; reintentar?: boolean; cookie?: string } = {}): Response {
  const reintentar = o.reintentar ? '<p><a href="/api/mercadolibre/conectar">Volver a conectar MercadoLibre</a></p>' : ''
  const html = `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>MercadoLibre · GiftR</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5}</style></head>
<body><p>${escapar(mensaje)}</p>${reintentar}<p><a href="/">Volver a GiftR</a></p></body></html>`
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
  if (o.cookie) headers.set('set-cookie', o.cookie)
  return new Response(html, { status: o.status ?? 200, headers })
}

// ---------------------------------------------------------------- los tokens

/** Lo que da el OAuth de ML, validado. refresh: null si no lo dio (la aplicación sin offline_access). */
export type ParDeTokens = { access: string; refresh: string | null; expiraAt: Date; mlUserId: string | null }
export type DelOAuth = ParDeTokens | { error: 'invalid_grant' | 'fallo' }

/**
 * Un pedido a /oauth/token (canje o renovación). invalid_grant: ML dijo que el código o el refresh token no valen
 * (vencido, usado o revocado). fallo: todo lo demás (red, tiempo, otro status, un JSON raro). En el log, solo el status.
 */
async function pedirAlOAuth(datos: Record<string, string>, signal: AbortSignal): Promise<DelOAuth> {
  let r: Response
  try {
    r = await fetch(`${API_ML}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': UA_GIFTR },
      body: new URLSearchParams({ client_id: process.env.MELI_CLIENT_ID ?? '', client_secret: process.env.MELI_CLIENT_SECRET ?? '', ...datos }),
      redirect: 'error',
      signal,
    })
  } catch {
    return { error: 'fallo' }
  }
  let j: unknown = null
  try {
    j = await r.json()
  } catch {
    // no era JSON
  }
  if (!r.ok) {
    if (r.status === 400 && esJson(j) && j.error === 'invalid_grant') return { error: 'invalid_grant' }
    console.warn(`API de MercadoLibre: ${datos.grant_type} dio ${r.status}`)
    return { error: 'fallo' }
  }
  const segundos = esJson(j) ? Number(j.expires_in) : NaN
  if (!esJson(j) || typeof j.access_token !== 'string' || !j.access_token || !Number.isFinite(segundos) || segundos <= 0) return { error: 'fallo' }
  return {
    access: j.access_token,
    refresh: typeof j.refresh_token === 'string' && j.refresh_token ? j.refresh_token : null,
    expiraAt: new Date(Date.now() + segundos * 1000),
    mlUserId: typeof j.user_id === 'number' || (typeof j.user_id === 'string' && j.user_id) ? String(j.user_id) : null,
  }
}

/** Para canjear el código que volvió de ML. */
export const CANJE_ML_TIEMPO_MS = 8000

/** El código que volvió de ML, por el par de tokens (con el verificador PKCE del pedido). */
export function canjearCodigo(code: string, verifier: string): Promise<DelOAuth> {
  return pedirAlOAuth(
    { grant_type: 'authorization_code', code, redirect_uri: redirectUriDeMercadoLibre() ?? '', code_verifier: verifier },
    AbortSignal.timeout(CANJE_ML_TIEMPO_MS),
  )
}

const USO_ACCESS = 'mercadolibre_conexion.access_token'
const USO_REFRESH = 'mercadolibre_conexion.refresh_token'

/** Guarda la conexión (la de antes, si había, se reemplaza) y la empieza a usar. */
export async function guardarConexion(db: Db, par: ParDeTokens & { refresh: string }, userId: string) {
  const valores = {
    accessToken: cifrar(par.access, USO_ACCESS), refreshToken: cifrar(par.refresh, USO_REFRESH), expiraAt: par.expiraAt,
    mlUserId: par.mlUserId, conectadoPor: userId, updatedAt: new Date(),
  }
  await db.insert(mercadolibreConexion).values({ id: 1, ...valores }).onConflictDoUpdate({ target: mercadolibreConexion.id, set: valores })
  olvidarConexion()
}

// ---------------------------------------------------------------- usar la conexión

/** Un access token que vence en menos que esto se renueva antes de usarlo. */
export const MARGEN_ML_MS = 5 * 60_000
/** Para renovar: corto, porque la fila queda bloqueada mientras tanto. */
export const RENOVAR_ML_TIEMPO_MS = 3000
/** Sin conexión (o con la base o la renovación fallando), cuánto no se vuelve a mirar. */
const SIN_CONEXION_MS = 60_000

/** El access token de la conexión, en memoria hasta MARGEN_ML_MS antes de que venza: no se lee la base en cada link. */
let enMemoria: { valor: string; vence: number } | null = null
/** Hasta cuándo no se mira la conexión (no había, o falló algo): cada link no paga otra lectura de la base. */
let sinMirarHasta = 0

const vigente = () => (enMemoria && Date.now() < enMemoria.vence ? enMemoria.valor : null)

/** Si se puede usar la conexión ahora, o puede haber una (ver apiDeMercadoLibreLista). */
export const conexionPosible = () => !!vigente() || Date.now() >= sinMirarHasta

/** Se olvida lo que se sabía de la conexión: se vuelve a leer de la base (al conectar, y en los tests). */
export function olvidarConexion() {
  enMemoria = null
  sinMirarHasta = 0
}

function recordar(valor: string, expiraAt: Date): string {
  enMemoria = { valor, vence: expiraAt.getTime() - MARGEN_ML_MS }
  sinMirarHasta = 0
  return valor
}

function sinConexion(): null {
  enMemoria = null
  sinMirarHasta = Date.now() + SIN_CONEXION_MS
  return null
}

type Fila = typeof mercadolibreConexion.$inferSelect

/** El access token de la fila si vence en más de MARGEN_ML_MS (y no es el que ML acaba de rechazar). */
function usable(fila: Fila | undefined, rechazado?: string): string | null {
  if (!fila?.accessToken || !fila.expiraAt || fila.expiraAt.getTime() - Date.now() <= MARGEN_ML_MS) return null
  const t = descifrar(fila.accessToken, USO_ACCESS)
  return t && t !== rechazado ? t : null
}

const leerFila = async (db: Db) => (await db.select().from(mercadolibreConexion).where(eq(mercadolibreConexion.id, 1)))[0]

/** La conexión se cayó: sin tokens, hasta que el dueño la vuelva a conectar. */
async function desconectar(db: Db) {
  await db.update(mercadolibreConexion).set({ accessToken: null, refreshToken: null, expiraAt: null, updatedAt: new Date() })
    .where(eq(mercadolibreConexion.id, 1))
  console.warn('MercadoLibre se desconectó: hay que volver a conectarlo en /api/mercadolibre/conectar')
}

/**
 * Renueva el access token con la fila bloqueada (select … for update): si dos pedidos vencidos llegan a la vez (en esta
 * instancia o en otra), el segundo espera y adentro ve el par que guardó el primero, sin gastar el refresh token otra vez.
 * El pedido a ML no se corta si se va quien preguntó (solo a los RENOVAR_ML_TIEMPO_MS): cortado a la mitad, ML pudo
 * haber dado el par nuevo y el refresh token de la base ya no valdría. invalid_grant desconecta.
 */
async function renovar(db: Db, rechazado?: string): Promise<string | null> {
  const r = await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [fila] = await t.select().from(mercadolibreConexion).where(eq(mercadolibreConexion.id, 1)).for('update')
    // otro pedido la renovó mientras se esperaba la fila
    const ya = usable(fila, rechazado)
    if (ya) return { valor: ya, expiraAt: fila.expiraAt! }
    if (!fila?.refreshToken) return null
    const refresh = descifrar(fila.refreshToken, USO_REFRESH)
    // cifrado con otro secreto (cambió AUTH_SECRET): no sirve más
    if (!refresh) {
      await desconectar(t)
      return null
    }
    const nuevo = await pedirAlOAuth({ grant_type: 'refresh_token', refresh_token: refresh }, AbortSignal.timeout(RENOVAR_ML_TIEMPO_MS))
    if ('error' in nuevo) {
      if (nuevo.error === 'invalid_grant') await desconectar(t)
      return null
    }
    // si no dio otro refresh token, sigue valiendo el de antes
    await t.update(mercadolibreConexion).set({
      accessToken: cifrar(nuevo.access, USO_ACCESS), refreshToken: nuevo.refresh ? cifrar(nuevo.refresh, USO_REFRESH) : fila.refreshToken,
      expiraAt: nuevo.expiraAt, mlUserId: nuevo.mlUserId ?? fila.mlUserId, updatedAt: new Date(),
    }).where(eq(mercadolibreConexion.id, 1))
    return { valor: nuevo.access, expiraAt: nuevo.expiraAt }
  })
  return r ? recordar(r.valor, r.expiraAt) : sinConexion()
}

/**
 * El access token de la conexión para leer la API, renovado si vence en menos de MARGEN_ML_MS. rechazado: el que ML acaba
 * de contestar con un 401 aunque lo creíamos vigente, que se trata como vencido. Null si no hay conexión, se cayó o falló
 * algo (la base, la renovación): entonces no se vuelve a mirar por un minuto, y sigue el token de la aplicación o la
 * página. Nunca tira.
 */
export async function tokenDeLaConexion(db: Db, rechazado?: string): Promise<string | null> {
  const enUso = vigente()
  if (enUso && enUso !== rechazado) return enUso
  if (!enUso && Date.now() < sinMirarHasta) return null
  enMemoria = null
  try {
    const fila = await leerFila(db)
    const ya = usable(fila, rechazado)
    if (ya) return recordar(ya, fila!.expiraAt!)
    return fila?.refreshToken ? await renovar(db, rechazado) : sinConexion()
  } catch (e) {
    // sin la tabla (un preview con la base sin migrar) o sin base: solo el código de Postgres, nada de lo que se mandó
    const codigo = [e, esJson(e) ? e.cause : null].map((x) => (esJson(x) && typeof x.code === 'string' ? x.code : null)).find(Boolean)
    console.warn(`MercadoLibre: no se pudo leer o renovar la conexión${codigo ? ` (${codigo})` : ''}`)
    return sinConexion()
  }
}
