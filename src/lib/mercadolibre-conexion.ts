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
//   otro y solo vale el último). Por eso se renueva con la fila bloqueada, se guarda el par nuevo antes de soltarla y
//   renueva solo producción (ver renuevaEsteEntorno).
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
/** fallo con refresh: un 200 sin un acceso que sirva, pero con el refresh token nuevo (ver renovar). */
export type DelOAuth = ParDeTokens | { error: 'invalid_grant' } | { error: 'fallo'; refresh?: string }

/**
 * Un pedido a /oauth/token (canje o renovación). invalid_grant: ML dijo que el código o el refresh token no valen
 * (vencido, usado o revocado). fallo: todo lo demás (red, tiempo, otro status, un JSON raro). En el log, solo el status.
 * alContestar: cuando llega la respuesta, antes de leer el cuerpo.
 */
async function pedirAlOAuth(datos: Record<string, string>, signal: AbortSignal, alContestar?: () => void): Promise<DelOAuth> {
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
  alContestar?.()
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
  const refresh = esJson(j) && typeof j.refresh_token === 'string' && j.refresh_token ? j.refresh_token : null
  const segundos = esJson(j) ? Number(j.expires_in) : NaN
  if (!esJson(j) || typeof j.access_token !== 'string' || !j.access_token || !Number.isFinite(segundos) || segundos <= 0) {
    return refresh ? { error: 'fallo', refresh } : { error: 'fallo' }
  }
  return {
    access: j.access_token,
    refresh,
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
/**
 * Para renovar, hasta que ML contesta: aparte del tope de la lectura (API_ML_TIEMPO_MS) y más largo, porque cortado a la
 * mitad ML pudo haber dado el par nuevo y el refresh token de la base ya no valdría. Los otros pedidos no lo esperan (la
 * fila tomada se saltea, ver renovar). Una renovación empieza solo mientras el link tiene tiempo (antes de los 8 s del
 * route de deseo/link, ver tokenDeLaConexion): con RENOVAR_ML_CUERPO_MS y la base, termina antes de su maxDuration (30 s).
 */
export const RENOVAR_ML_TIEMPO_MS = 5000
/**
 * Con la respuesta en la mano (ML ya dio el par nuevo): lo que tiene el cuerpo para terminar de llegar. Si no llega, el
 * par se pierde y la próxima renovación desconecta: un cuerpo de unos cientos de bytes que no llega tras los encabezados
 * es raro, y esperarlo más tendría tomada la fila y la función.
 */
export const RENOVAR_ML_CUERPO_MS = 2000
/** Sin conexión (o con la base o la renovación fallando), cuánto no se vuelve a mirar. */
const SIN_CONEXION_MS = 60_000

/** El access token de la conexión, en memoria hasta MARGEN_ML_MS antes de que venza: no se lee la base en cada link. */
let enMemoria: { valor: string; vence: number } | null = null
/** Hasta cuándo no se mira la conexión (no había, o falló algo): cada link no paga otra lectura de la base. */
let sinMirarHasta = 0
/** Tras renovar por un 401, hasta cuándo otro 401 no vuelve a renovar (ver tokenDeLaConexion). */
let sinRenovarPor401Hasta = 0

const vigente = () => (enMemoria && Date.now() < enMemoria.vence ? enMemoria.valor : null)

/** Si se puede usar la conexión ahora, o puede haber una (ver apiDeMercadoLibreLista). */
export const conexionPosible = () => !!vigente() || Date.now() >= sinMirarHasta

/** Se olvida lo que se sabía de la conexión: se vuelve a leer de la base (al conectar, y en los tests). */
export function olvidarConexion() {
  enMemoria = null
  sinMirarHasta = 0
  sinRenovarPor401Hasta = 0
}

function recordar(valor: string, expiraAt: Date): string {
  enMemoria = { valor, vence: expiraAt.getTime() - MARGEN_ML_MS }
  sinMirarHasta = 0
  return valor
}

/** Un access token que todavía vale pero no se pudo renovar: hasta SIN_CONEXION_MS (o lo que le quede), y se vuelve a mirar. */
function porUnRato(valor: string, expiraAt: Date): string {
  enMemoria = { valor, vence: Math.min(expiraAt.getTime(), Date.now() + SIN_CONEXION_MS) }
  sinMirarHasta = Date.now() + SIN_CONEXION_MS
  return valor
}

function sinConexion(): null {
  enMemoria = null
  sinMirarHasta = Date.now() + SIN_CONEXION_MS
  return null
}

/**
 * Si este entorno renueva el acceso: solo producción (VERCEL_ENV, que pone Vercel). El refresh token es de un solo uso, y
 * un preview con su propia rama de Neon tiene una copia de la fila: si renovara, el de producción dejaría de valer y la
 * conexión se caería. Los otros entornos usan el access token mientras vale (el que renovó producción, si comparten la
 * base) y, si no, siguen sin conexión.
 */
const renuevaEsteEntorno = () => process.env.VERCEL_ENV === 'production'

type Fila = typeof mercadolibreConexion.$inferSelect
/** La conexión descifrada (null lo que no hay). */
type Conexion = { access: string | null; expiraAt: Date | null; refresh: string | null }
const OTRO_SECRETO = 'otro-secreto'

/**
 * La fila descifrada. OTRO_SECRETO si trae tokens que no se descifran: los cifró una instancia con otro AUTH_SECRET (un
 * `npm run dev` o un preview con la base de producción, o cambió el secreto). Acá no sirve, pero no se toca: para la que
 * la cifró sigue valiendo. Si de verdad cambió el secreto, el dueño la vuelve a conectar y guardarConexion la pisa.
 */
function descifrarFila(fila: Fila | undefined): Conexion | typeof OTRO_SECRETO {
  const access = descifrar(fila?.accessToken, USO_ACCESS)
  const refresh = descifrar(fila?.refreshToken, USO_REFRESH)
  if ((fila?.accessToken && !access) || (fila?.refreshToken && !refresh)) return OTRO_SECRETO
  return { access, expiraAt: fila?.expiraAt ?? null, refresh }
}

function otroSecreto(): null {
  console.warn('MercadoLibre: no se pudo descifrar la conexión (¿otro AUTH_SECRET?). Si cambió el secreto, volvé a conectarla en /api/mercadolibre/conectar')
  return sinConexion()
}

/**
 * El access token si vence en más de margen (MARGEN_ML_MS para usarlo sin renovar; 0, mientras no venció de verdad) y no
 * es el que ML acaba de rechazar.
 */
function usable(c: Conexion, rechazado?: string, margen = MARGEN_ML_MS): string | null {
  return c.access && c.expiraAt && c.expiraAt.getTime() - Date.now() > margen && c.access !== rechazado ? c.access : null
}

const leerFila = async (db: Db) => (await db.select().from(mercadolibreConexion).where(eq(mercadolibreConexion.id, 1)))[0]

/** La conexión se cayó: sin tokens, hasta que el dueño la vuelva a conectar. */
async function desconectar(db: Db) {
  await db.update(mercadolibreConexion).set({ accessToken: null, refreshToken: null, expiraAt: null, updatedAt: new Date() })
    .where(eq(mercadolibreConexion.id, 1))
  console.warn('MercadoLibre se desconectó: hay que volver a conectarlo en /api/mercadolibre/conectar')
}

/**
 * El refresh token por un par nuevo. El tope corre hasta que llega la respuesta; con ella en la mano, ML ya gastó el
 * refresh token, y el cuerpo tiene su propio tope para llegar. No se corta si se va quien preguntó: cortado a la mitad,
 * ML pudo haber dado el par nuevo y el refresh token de la base ya no valdría.
 */
async function renovarEnML(refresh: string): Promise<DelOAuth> {
  const corte = new AbortController()
  const cortar = () => corte.abort()
  const hastaQueConteste = AbortSignal.timeout(RENOVAR_ML_TIEMPO_MS)
  let hastaElCuerpo: AbortSignal | undefined
  hastaQueConteste.addEventListener('abort', cortar)
  try {
    return await pedirAlOAuth({ grant_type: 'refresh_token', refresh_token: refresh }, corte.signal, () => {
      hastaQueConteste.removeEventListener('abort', cortar)
      hastaElCuerpo = AbortSignal.timeout(RENOVAR_ML_CUERPO_MS)
      hastaElCuerpo.addEventListener('abort', cortar)
    })
  } finally {
    hastaQueConteste.removeEventListener('abort', cortar)
    hastaElCuerpo?.removeEventListener('abort', cortar)
  }
}

type Renovado = { valor: string; expiraAt: Date } | 'tomada' | 'caida' | 'fallo' | typeof OTRO_SECRETO
/** Lo que dio ML y va a la fila, y lo que contesta renovar una vez guardado. */
type PorGuardar = { valores: Partial<typeof mercadolibreConexion.$inferInsert>; listo: Renovado }

const MENSAJE_SIN_GUARDAR =
  'MercadoLibre: se renovó el acceso pero no se pudo guardar; si en un rato se desconecta, volvé a conectarlo en /api/mercadolibre/conectar'

/**
 * ML ya dio el par nuevo (y el refresh token de la base ya no vale), pero la transacción que lo guardaba falló (la base,
 * o la conexión que se cayó mientras esperaba a ML): una vez más, ya sin la fila tomada. Si tampoco, un aviso propio, y
 * el acceso nuevo sigue en la memoria de esta instancia mientras vale (lo recuerda renovar); las otras no van a poder
 * renovar.
 */
async function guardarFuera(db: Db, p: PorGuardar): Promise<Renovado> {
  try {
    await db.update(mercadolibreConexion).set(p.valores).where(eq(mercadolibreConexion.id, 1))
  } catch {
    console.warn(MENSAJE_SIN_GUARDAR)
  }
  return p.listo
}

/**
 * Renueva el access token con la fila bloqueada (select … for update): si dos pedidos vencidos llegan a la vez (en esta
 * instancia o en otra), uno solo gasta el refresh token. El otro no lo espera (skip locked: la renovación puede tardar
 * segundos y cada link esperaría a la fila): sigue con el access token de antes si todavía vale de verdad, o sin la API
 * en este link. Adentro se vuelve a mirar (otro pudo haberla renovado entre que se leyó y se tomó) y el par nuevo se
 * guarda antes de soltarla (si falla, ver guardarFuera). invalid_grant desconecta; otra falla deja la fila como estaba
 * (salvo un refresh token nuevo). antes: la conexión que se leyó sin bloquear.
 */
async function renovar(db: Db, antes: Conexion, rechazado?: string): Promise<string | null> {
  // lo que dio ML, afuera de la transacción: si ella falla después, no se pierde
  const dio: { porGuardar?: PorGuardar } = {}
  let r: Renovado
  try {
    r = await db.transaction(async (tx): Promise<Renovado> => {
      const t = tx as unknown as Db
      const [fila] = await t.select().from(mercadolibreConexion).where(eq(mercadolibreConexion.id, 1)).for('update', { skipLocked: true })
      if (!fila) return 'tomada'
      const c = descifrarFila(fila)
      // la volvieron a conectar desde un entorno con otro secreto
      if (c === OTRO_SECRETO) return c
      const ya = usable(c, rechazado)
      if (ya) return { valor: ya, expiraAt: c.expiraAt! }
      if (!c.refresh) return 'caida'
      const nuevo = await renovarEnML(c.refresh)
      if ('error' in nuevo) {
        if (nuevo.error === 'invalid_grant') {
          await desconectar(t)
          return 'caida'
        }
        if (!nuevo.refresh) return 'fallo'
        // un 200 sin un acceso que sirva, pero con el refresh token nuevo: es el único que vale ahora
        dio.porGuardar = { valores: { refreshToken: cifrar(nuevo.refresh, USO_REFRESH), updatedAt: new Date() }, listo: 'fallo' }
      } else {
        dio.porGuardar = {
          valores: {
            // si no dio otro refresh token, sigue valiendo el de antes
            accessToken: cifrar(nuevo.access, USO_ACCESS), refreshToken: nuevo.refresh ? cifrar(nuevo.refresh, USO_REFRESH) : fila.refreshToken,
            expiraAt: nuevo.expiraAt, mlUserId: nuevo.mlUserId ?? fila.mlUserId, updatedAt: new Date(),
          },
          listo: { valor: nuevo.access, expiraAt: nuevo.expiraAt },
        }
      }
      await t.update(mercadolibreConexion).set(dio.porGuardar.valores).where(eq(mercadolibreConexion.id, 1))
      return dio.porGuardar.listo
    })
  } catch (e) {
    // antes de que ML diera algo: como cualquier falla de la base (ver tokenDeLaConexion)
    if (!dio.porGuardar) throw e
    r = await guardarFuera(db, dio.porGuardar)
  }
  if (typeof r === 'object') return recordar(r.valor, r.expiraAt)
  if (r === OTRO_SECRETO) return otroSecreto()
  if (r === 'caida') return sinConexion()
  // la renueva otro, o no se pudo (ML caído, lento o raro): el de antes mientras vale de verdad (le quedan hasta 5 minutos)
  const vale = usable(antes, rechazado, 0)
  // tomada: sin recordar nada, el link que sigue ve el par nuevo
  if (r === 'tomada') return vale
  return vale ? porUnRato(vale, antes.expiraAt!) : sinConexion()
}

/**
 * El access token de la conexión para leer la API, renovado si vence en menos de MARGEN_ML_MS (solo en producción, ver
 * renuevaEsteEntorno). rechazado: el que ML acaba de contestar con un 401 aunque lo creíamos vigente, que se trata como
 * vencido; tras renovar por un 401, otro 401 no renueva por un minuto (si el nuevo también da 401, cada link, y dos veces
 * un catálogo, renovaría, y cada vez se arriesga el refresh token). signal: la del link; si ya se cortó (se le acabó el
 * tiempo o se fue quien preguntó), no se empieza a renovar: la renovación no se corta y tardaría hasta
 * RENOVAR_ML_TIEMPO_MS + RENOVAR_ML_CUERPO_MS más, quizás pasado el maxDuration; queda para el link que sigue, y en este
 * va el acceso de antes si todavía vale de verdad. Null si no hay conexión, se cayó o falló algo (la base, la
 * renovación): entonces no se vuelve a mirar por un minuto, y sigue el token de la aplicación o la página. Nunca tira.
 */
export async function tokenDeLaConexion(db: Db, rechazado?: string, signal?: AbortSignal): Promise<string | null> {
  const enUso = vigente()
  if (enUso && enUso !== rechazado) return enUso
  if (!enUso && Date.now() < sinMirarHasta) return null
  if (rechazado && Date.now() < sinRenovarPor401Hasta) return null
  enMemoria = null
  try {
    const c = descifrarFila(await leerFila(db))
    if (c === OTRO_SECRETO) return otroSecreto()
    const ya = usable(c, rechazado)
    if (ya) return recordar(ya, c.expiraAt!)
    if (c.refresh && renuevaEsteEntorno()) {
      // sin recordar nada: el link que sigue la vuelve a leer y renueva
      if (signal?.aborted) return usable(c, rechazado, 0)
      if (rechazado) sinRenovarPor401Hasta = Date.now() + SIN_CONEXION_MS
      return await renovar(db, c, rechazado)
    }
    // un entorno que no renueva: el access token mientras vale de verdad, mirando la base cada minuto por si lo renovó producción
    const vale = usable(c, rechazado, 0)
    if (vale) return porUnRato(vale, c.expiraAt!)
    if (c.refresh && !rechazado) console.warn('MercadoLibre: el acceso de la conexión venció y solo lo renueva producción')
    return sinConexion()
  } catch (e) {
    // sin la tabla (un preview con la base sin migrar) o sin base: solo el código de Postgres, nada de lo que se mandó
    const codigo = [e, esJson(e) ? e.cause : null].map((x) => (esJson(x) && typeof x.code === 'string' ? x.code : null)).find(Boolean)
    console.warn(`MercadoLibre: no se pudo leer o renovar la conexión${codigo ? ` (${codigo})` : ''}`)
    return sinConexion()
  }
}
