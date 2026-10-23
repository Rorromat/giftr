import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { conConsultas, createTestDb, seedOwnerAndGiver, tiempos } from './helpers'
import { mercadolibreConexion } from '@/db/schema'
import type { Db } from '@/db/types'
import { cifrar, descifrar } from '@/lib/cifrado'

// La cuenta de MercadoLibre del dueño de GiftR: conectarla (/api/mercadolibre/conectar y /callback), guardarla cifrada,
// renovar el token y usarlo en leerDeLaApi. La base es PGlite, la sesión es de mentira y fetch contesta con las formas que
// documenta ML: nada sale a la red. Cada test carga los módulos de nuevo (el token queda en memoria del módulo).

const h = vi.hoisted(() => ({ db: undefined as unknown as Db, session: null as { userId: string } | null }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session }))

const API = 'https://api.mercadolibre.com'
const ARTICULO = 'https://articulo.mercadolibre.com.ar/MLA-1418506688-mate-de-algarrobo-premium-artesanal-con-bombilla-_JM'
// copiado desde la app de MercadoLibre: el catálogo con el item elegido, sin el nombre en el camino
const CATALOGO_APP = 'https://www.mercadolibre.com.ar/p/MLA37631077?pdp_filters=item_id:MLA3034341816&from=share_eshop_android'
const CATALOGO = 'https://www.mercadolibre.com.ar/p/MLA37631077'

/** Lo que da /oauth/token al canjear el código o al renovar (developers.mercadolibre.com.ar, "Autenticación y autorización"). */
const tokens = (n: number) => ({
  access_token: `APP_USR-1234567890123456-102317-acceso${n}-987654321`, token_type: 'bearer', expires_in: 21600,
  scope: 'offline_access read', user_id: 987654321, refresh_token: `TG-renovar${n}-987654321`,
})
const ITEM = {
  id: 'MLA1418506688', site_id: 'MLA', title: 'Mate De Algarrobo Premium Artesanal Con Bombilla', price: 88990, currency_id: 'ARS',
  status: 'active', thumbnail: 'http://http2.mlstatic.com/D_931470-MLA89297118039_082025-I.jpg',
  pictures: [{ id: '931470', url: 'http://x', secure_url: 'https://http2.mlstatic.com/D_931470-MLA89297118039_082025-O.jpg' }],
}
const ELEGIDO = { ...ITEM, id: 'MLA3034341816', title: 'Termo Stanley Classic 1.4 Litros Verde', price: 145000 }
const PRODUCTO = {
  id: 'MLA37631077', status: 'active', name: 'Termo Stanley Classic Legendary 1.4 L Verde',
  buy_box_winner: { item_id: 'MLA3034341816', price: 139999, currency_id: 'ARS' },
  pictures: [{ id: '1', url: 'https://http2.mlstatic.com/D_NQ_NP_1-MLA1_012025-F.jpg' }],
}

const respuesta = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const despues = (r: () => Response, ms: number) => () => new Promise<Response>((ok) => setTimeout(() => ok(r()), ms))
/** Contesta a los ms, salvo que antes se corte su señal (como el fetch de verdad). */
const lento = (r: () => Response, ms: number) => (init: RequestInit) => new Promise<Response>((ok, mal) => {
  const t = setTimeout(() => ok(r()), ms)
  init.signal?.addEventListener('abort', () => { clearTimeout(t); mal(init.signal?.reason) })
})
/**
 * La respuesta (200) llega a los ms y su cuerpo, cuerpoMs después (sin cuerpoMs, nunca). Cortar la señal corta el cuerpo,
 * como el fetch de verdad.
 */
const cuerpoLento = (body: unknown, ms: number, cuerpoMs?: number) => (init: RequestInit) => new Promise<Response>((ok) => setTimeout(() => {
  ok(new Response(new ReadableStream<Uint8Array>({
    start(c) {
      const t = cuerpoMs === undefined ? undefined : setTimeout(() => { c.enqueue(new TextEncoder().encode(JSON.stringify(body))); c.close() }, cuerpoMs)
      init.signal?.addEventListener('abort', () => { clearTimeout(t); c.error(init.signal?.reason) })
    },
  }), { headers: { 'content-type': 'application/json' } }))
}, ms))

type Llamada = { metodo: string; url: string; headers: Record<string, string>; cuerpo: Record<string, string>; redirect?: string; signal?: AbortSignal }

type Contesta = (init: RequestInit) => Response | Promise<Response>

/** fetch de mentira: por "MÉTODO url", lo que contesta cada vez (la última se repite). Lo que no conoce es un error. */
function ml(rutas: Record<string, Contesta[]> = {}) {
  const llamadas: Llamada[] = []
  const veces: Record<string, number> = {}
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const clave = `${init.method ?? 'GET'} ${String(url)}`
    llamadas.push({
      metodo: init.method ?? 'GET', url: String(url), headers: Object.fromEntries(new Headers(init.headers).entries()),
      cuerpo: Object.fromEntries(new URLSearchParams(String(init.body ?? ''))), redirect: init.redirect, signal: init.signal ?? undefined,
    })
    init.signal?.throwIfAborted()
    const lista = rutas[clave]
    if (!lista) throw new Error(`no esperaba ${clave}`)
    const n = veces[clave] = (veces[clave] ?? 0) + 1
    return lista[Math.min(n, lista.length) - 1](init)
  }))
  return llamadas
}
const posts = (llamadas: Llamada[]) => llamadas.filter((l) => l.metodo === 'POST')
const gets = (llamadas: Llamada[]) => llamadas.filter((l) => l.metodo === 'GET')

/** Los módulos de nuevo, sin nada en memoria: leerDeLaApi, la conexión y los dos routes. */
async function cargar() {
  vi.resetModules()
  const ml = await import('@/lib/mercadolibre')
  const conexion = await import('@/lib/mercadolibre-conexion')
  const { GET: conectar } = await import('@/app/api/mercadolibre/conectar/route')
  const { GET: callback } = await import('@/app/api/mercadolibre/callback/route')
  return { ...ml, ...conexion, conectar, callback }
}
type Modulos = Awaited<ReturnType<typeof cargar>>

let ownerId: string
let giverId: string

beforeAll(async () => {
  h.db = await createTestDb()
  const { owner, giver } = await seedOwnerAndGiver(h.db)
  ownerId = owner.id
  giverId = giver.id
})

beforeEach(async () => {
  await h.db.delete(mercadolibreConexion)
  h.session = { userId: ownerId }
  vi.stubEnv('MELI_CLIENT_ID', '1234567890123456')
  vi.stubEnv('MELI_CLIENT_SECRET', 'clave-secreta-de-la-app')
  // el dueño entra con Google como euge@test.com (ver seedOwnerAndGiver)
  vi.stubEnv('MELI_ADMIN_EMAILS', ' otra@giftr.app , EUGE@Test.com')
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://giftr.app/')
  vi.stubEnv('AUTH_SECRET', 'secreto-de-la-app-para-los-tests')
  // solo producción renueva el acceso (ver 'solo producción renueva')
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('nada sale a la red') }))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const fila = async () => (await h.db.select().from(mercadolibreConexion))[0]
const USO_ACCESS = 'mercadolibre_conexion.access_token'
const USO_REFRESH = 'mercadolibre_conexion.refresh_token'

/** Lo que se dijo en el log no tiene ningún token, la clave de la aplicación ni lo que contestó ML. */
function sinSecretos(...espias: { mock: { calls: unknown[][] } }[]) {
  const log = JSON.stringify(espias.flatMap((e) => e.mock.calls))
  expect(log).not.toMatch(/APP_USR|TG-|clave-secreta|secreto-de-la-app|invalid_grant|Error validating/)
}

// ---------------------------------------------------------------- conectar

/** /api/mercadolibre/conectar: la redirección, el pedido de la cookie (su valor) y la autorización a la que lleva. */
async function conectar(m: Modulos) {
  const r = await m.conectar()
  const cookie = r.headers.get('set-cookie') ?? ''
  const valor = /^giftr_ml_conectar=([^;]*)/.exec(cookie)?.[1] ?? ''
  return { r, cookie, valor, autorizacion: new URL(r.headers.get('location') ?? 'https://x.invalid') }
}

/** La vuelta de ML a /api/mercadolibre/callback, con lo que diga la query y la cookie que trae el navegador. */
function volver(m: Modulos, query: Record<string, string>, cookie?: string) {
  return m.callback(new Request(`https://giftr.app/api/mercadolibre/callback?${new URLSearchParams(query)}`, {
    headers: cookie === undefined ? {} : { cookie: `otra=1; giftr_ml_conectar=${cookie}; giftr_invitado=x` },
  }))
}

describe('quién puede conectar', () => {
  test('el admin (sin distinguir mayúsculas ni espacios) va a la autorización de ML, con state, PKCE y el pedido en una cookie', async () => {
    const m = await cargar()
    const { r, cookie, valor, autorizacion } = await conectar(m)
    expect(r.status).toBe(302)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(autorizacion.origin + autorizacion.pathname).toBe('https://auth.mercadolibre.com.ar/authorization')
    const q = Object.fromEntries(autorizacion.searchParams)
    expect(q).toEqual({
      response_type: 'code', client_id: '1234567890123456', redirect_uri: 'https://giftr.app/api/mercadolibre/callback',
      state: expect.stringMatching(/^[\w-]{32,}$/), code_challenge: expect.stringMatching(/^[\w-]{43}$/), code_challenge_method: 'S256',
    })
    // la clave nunca sale
    expect(autorizacion.toString()).not.toContain('clave-secreta')
    expect(cookie.split('; ').slice(1).sort()).toEqual(['HttpOnly', 'Max-Age=600', 'Path=/api/mercadolibre', 'SameSite=Lax'])
    expect(valor).toMatch(/^[\w-]+\.[\w-]+$/)
    // cada pedido, con su state y su verificador
    const otro = await conectar(m)
    expect(otro.autorizacion.searchParams.get('state')).not.toBe(q.state)
    expect(otro.autorizacion.searchParams.get('code_challenge')).not.toBe(q.code_challenge)
    // en producción, solo por https
    vi.stubEnv('NODE_ENV', 'production')
    expect((await conectar(await cargar())).cookie.split('; ')).toContain('Secure')
  })

  test('sin sesión, con un email que no está en MELI_ADMIN_EMAILS o sin todo lo que hace falta: 404 en los dos routes, sin pedir nada', async () => {
    const llamadas = ml()
    const no = async (caso: string) => {
      const m = await cargar()
      const r = await m.conectar()
      expect(r.status, caso).toBe(404)
      expect(r.headers.get('set-cookie'), caso).toBeNull()
      expect(r.headers.get('location'), caso).toBeNull()
      expect((await volver(m, { code: 'TG-codigo', state: 'x' }, 'x.y')).status, caso).toBe(404)
    }
    h.session = null
    await no('sin sesión')
    h.session = { userId: giverId }
    await no('rodri@test.com no es admin')
    h.session = { userId: 'no-es-un-uuid' }
    await no('una sesión rara')
    h.session = { userId: ownerId }
    for (const [variable, valor] of [
      ['MELI_ADMIN_EMAILS', ''], ['MELI_ADMIN_EMAILS', ' , '], ['MELI_CLIENT_ID', ''], ['MELI_CLIENT_SECRET', ''],
      // ML solo vuelve a una https
      ['NEXT_PUBLIC_BASE_URL', 'http://localhost:3000'], ['NEXT_PUBLIC_BASE_URL', ''], ['NEXT_PUBLIC_BASE_URL', 'no es un link'],
    ]) {
      vi.stubEnv('MELI_ADMIN_EMAILS', 'euge@test.com')
      vi.stubEnv('MELI_CLIENT_ID', '1234567890123456')
      vi.stubEnv('MELI_CLIENT_SECRET', 'clave-secreta-de-la-app')
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://giftr.app')
      vi.stubEnv(variable, valor)
      await no(`${variable}=${valor}`)
    }
    expect(llamadas).toEqual([])
    expect(await fila()).toBeUndefined()
  })
})

describe('la vuelta de ML', () => {
  test('canjea el código con el verificador PKCE, guarda la conexión cifrada y borra el pedido: una página corta, sin redirigir', async () => {
    const m = await cargar()
    const { valor, autorizacion } = await conectar(m)
    const llamadas = ml({ [`POST ${API}/oauth/token`]: [() => respuesta(tokens(1))] })
    const ms = tiempos()
    const antes = Date.now()
    const r = await volver(m, { code: 'TG-6543210abcdef-987654321', state: autorizacion.searchParams.get('state')! }, valor)
    expect(r.status).toBe(200)
    expect(r.headers.get('location')).toBeNull()
    expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(r.headers.get('cache-control')).toBe('no-store')
    const html = await r.text()
    expect(html).toContain('MercadoLibre quedó conectado.')
    expect(html).not.toMatch(/APP_USR|TG-|987654321/)
    // el pedido ya se usó
    expect(r.headers.get('set-cookie')).toMatch(/^giftr_ml_conectar=; Path=\/api\/mercadolibre; Max-Age=0; HttpOnly; SameSite=Lax$/)
    // el canje: el código, la misma redirect URI y el verificador del desafío que fue a ML, con un tope de tiempo
    expect(llamadas).toHaveLength(1)
    const [canje] = llamadas
    expect(canje).toMatchObject({ metodo: 'POST', url: `${API}/oauth/token`, redirect: 'error' })
    expect(canje.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(canje.cuerpo).toEqual({
      grant_type: 'authorization_code', client_id: '1234567890123456', client_secret: 'clave-secreta-de-la-app',
      code: 'TG-6543210abcdef-987654321', redirect_uri: 'https://giftr.app/api/mercadolibre/callback', code_verifier: expect.any(String),
    })
    expect(createHash('sha256').update(canje.cuerpo.code_verifier).digest('base64url')).toBe(autorizacion.searchParams.get('code_challenge'))
    expect(ms).toEqual([m.CANJE_ML_TIEMPO_MS])
    // guardada: los tokens cifrados (en la base no están a la vista), quién la conectó y hasta cuándo vale el acceso
    const f = await fila()
    expect(f).toMatchObject({ id: 1, mlUserId: '987654321', conectadoPor: ownerId })
    expect(JSON.stringify(f)).not.toMatch(/APP_USR|TG-/)
    expect(descifrar(f.accessToken, 'mercadolibre_conexion.access_token')).toBe(tokens(1).access_token)
    expect(descifrar(f.refreshToken, 'mercadolibre_conexion.refresh_token')).toBe(tokens(1).refresh_token)
    expect(f.expiraAt!.getTime() - antes).toBeGreaterThanOrEqual(21600_000 - 1000)
    expect(f.expiraAt!.getTime() - Date.now()).toBeLessThanOrEqual(21600_000)
  })

  test('el pedido tiene que ser de este navegador: sin cookie, con otra firma, vencido, con otro state o de otra cuenta, no se canjea', async () => {
    vi.stubEnv('MELI_ADMIN_EMAILS', 'euge@test.com,rodri@test.com')
    const m = await cargar()
    const { valor, autorizacion } = await conectar(m)
    const state = autorizacion.searchParams.get('state')!
    const llamadas = ml({ [`POST ${API}/oauth/token`]: [() => respuesta(tokens(1))] })
    const [datos, firma] = valor.split('.')
    const otroDato = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(datos, 'base64url').toString()), e: Date.now() + 3600_000 }))
    const no = async (caso: string, query: Record<string, string>, cookie?: string) => {
      const r = await volver(m, { code: 'TG-codigo', ...query }, cookie)
      expect(r.status, caso).toBe(400)
      expect(r.headers.get('location'), caso).toBeNull()
      expect(await r.text(), caso).toContain('venció o no salió de este navegador')
    }
    await no('sin cookie', { state })
    await no('una cookie vacía', { state }, '')
    await no('sin state', {}, valor)
    await no('otro state', { state: `${state.slice(0, -1)}${state.endsWith('A') ? 'B' : 'A'}` }, valor)
    await no('los datos cambiados (otro vencimiento) con la firma de antes', { state }, `${otroDato.toString('base64url')}.${firma}`)
    await no('sin firma', { state }, datos)
    // firmado con otro secreto
    vi.stubEnv('AUTH_SECRET', 'otro-secreto')
    await no('otro secreto', { state }, valor)
    vi.stubEnv('AUTH_SECRET', 'secreto-de-la-app-para-los-tests')
    // el que lo empezó fue Euge
    h.session = { userId: giverId }
    await no('otra cuenta (también admin)', { state }, valor)
    h.session = { userId: ownerId }
    // a los 10 minutos venció
    const reloj = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + m.CONECTAR_ML_MS + 1)
    await no('vencido', { state }, valor)
    reloj.mockRestore()
    expect(llamadas).toEqual([])
    expect(await fila()).toBeUndefined()
    // el mismo, bien, sí
    expect((await volver(m, { code: 'TG-codigo', state }, valor)).status).toBe(200)
    expect(posts(llamadas)).toHaveLength(1)
  })

  test('si ML no da el permiso, no acepta el código o no da el refresh token: lo dice simple, sin lo que contestó ML, y no guarda nada', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const casos: [string, Record<string, string>, (() => Response | Promise<Response>) | null, string, number][] = [
      ['no dio el permiso', { error: 'access_denied' }, null, 'MercadoLibre no dio el permiso', 400],
      ['un código enorme', { code: 'x'.repeat(600) }, null, 'MercadoLibre no dio el permiso', 400],
      ['el código no vale', { code: 'TG-viejo' }, () => respuesta({
        message: 'Error validating grant. Your authorization code or refresh token may be expired or it was already used',
        error: 'invalid_grant', status: 400, cause: [],
      }, 400), 'MercadoLibre no aceptó la conexión', 502],
      ['ML caído', { code: 'TG-codigo' }, () => respuesta('Internal Server Error', 500), 'MercadoLibre no aceptó la conexión', 502],
      ['sin red', { code: 'TG-codigo' }, () => Promise.reject(new TypeError('fetch failed')), 'MercadoLibre no aceptó la conexión', 502],
      ['un JSON raro', { code: 'TG-codigo' }, () => respuesta({ access_token: '' }), 'MercadoLibre no aceptó la conexión', 502],
      ['sin offline_access', { code: 'TG-codigo' }, () => respuesta({ ...tokens(1), refresh_token: undefined, scope: 'read' }), 'offline_access', 502],
    ]
    for (const [caso, query, contesta, dice, status] of casos) {
      const m = await cargar()
      const { valor, autorizacion } = await conectar(m)
      const llamadas = ml(contesta ? { [`POST ${API}/oauth/token`]: [contesta] } : {})
      const r = await volver(m, { state: autorizacion.searchParams.get('state')!, ...query }, valor)
      expect(r.status, caso).toBe(status)
      expect(r.headers.get('location'), caso).toBeNull()
      const html = await r.text()
      expect(html, caso).toContain(dice)
      expect(html, caso).toContain('href="/api/mercadolibre/conectar"')
      expect(html, caso).not.toMatch(/invalid_grant|Error validating|Internal Server|APP_USR|TG-/)
      // el pedido ya se usó: se borra igual
      expect(r.headers.get('set-cookie'), caso).toMatch(/Max-Age=0/)
      expect(posts(llamadas), caso).toHaveLength(contesta ? 1 : 0)
    }
    expect(await fila()).toBeUndefined()
    sinSecretos(warn)
  })

  test('una conexión nueva reemplaza la de antes (una sola fila) y se empieza a usar enseguida', async () => {
    const m = await cargar()
    const primera = await conectar(m)
    ml({ [`POST ${API}/oauth/token`]: [() => respuesta(tokens(1))] })
    await volver(m, { code: 'TG-1', state: primera.autorizacion.searchParams.get('state')! }, primera.valor)
    // se lee una publicación con la primera
    const llamadas = ml({ [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)] })
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toMatchObject({ estado: 'ok' })
    // la vuelve a conectar (con otra cuenta de ML, o porque se había caído)
    const segunda = await conectar(m)
    ml({ [`POST ${API}/oauth/token`]: [() => respuesta({ ...tokens(2), user_id: 555 })] })
    await volver(m, { code: 'TG-2', state: segunda.autorizacion.searchParams.get('state')! }, segunda.valor)
    expect(await h.db.select().from(mercadolibreConexion)).toHaveLength(1)
    expect(await fila()).toMatchObject({ id: 1, mlUserId: '555' })
    const despuesDe = ml({ [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)] })
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(gets(llamadas)[0].headers.authorization).toBe(`Bearer ${tokens(1).access_token}`)
    expect(despuesDe.map((l) => l.headers.authorization)).toEqual([`Bearer ${tokens(2).access_token}`])
    // la base no deja una segunda fila
    await expect(h.db.execute(sql`insert into mercadolibre_conexion (id) values (2)`)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------- el cifrado

describe('el cifrado de los tokens', () => {
  test('ida y vuelta; con otra clave, para otro uso, tocado o basura no se descifra', () => {
    const t = tokens(1).refresh_token
    const c = cifrar(t, 'uso')
    expect(c).not.toContain(t)
    expect(c).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/)
    expect(descifrar(c, 'uso')).toBe(t)
    // cada vez con otro iv
    expect(cifrar(t, 'uso')).not.toBe(c)
    expect(descifrar(c, 'otro-uso')).toBeNull()
    const [v, iv, tag, datos] = c.split('.')
    const otroByte = (b64: string) => {
      const b = Buffer.from(b64, 'base64url')
      b[0] ^= 1
      return b.toString('base64url')
    }
    for (const tocado of [
      `${v}.${iv}.${tag}.${otroByte(datos)}`, `${v}.${otroByte(iv)}.${tag}.${datos}`, `${v}.${iv}.${otroByte(tag)}.${datos}`,
      // un tag recortado no se acepta
      `${v}.${iv}.${Buffer.from(tag, 'base64url').subarray(0, 4).toString('base64url')}.${datos}`,
      `v2.${iv}.${tag}.${datos}`, `${c}.x`, 'basura', '', null, undefined,
    ]) expect(descifrar(tocado, 'uso'), String(tocado)).toBeNull()
    // con otro secreto de la app, la clave es otra
    vi.stubEnv('AUTH_SECRET', 'otro-secreto')
    expect(descifrar(c, 'uso')).toBeNull()
    vi.stubEnv('AUTH_SECRET', 'secreto-de-la-app-para-los-tests')
    expect(descifrar(c, 'uso')).toBe(t)
  })
})

// ---------------------------------------------------------------- usar la conexión

/** Una conexión guardada: el par n, con el acceso que vence en tantos ms. */
async function conectada(m: Modulos, n: number, venceEn: number) {
  const t = tokens(n)
  await m.guardarConexion(h.db, { access: t.access_token, refresh: t.refresh_token, expiraAt: new Date(Date.now() + venceEn), mlUserId: '987654321' }, ownerId)
}
const HORA = 3600_000
/** El 401 de la API con un token que no acepta. */
const no = () => respuesta({ message: 'invalid access token', error: 'not_found', status: 401, cause: [] }, 401)
const SIN_GUARDAR =
  'MercadoLibre: se renovó el acceso pero no se pudo guardar; si en un rato se desconecta, volvé a conectarlo en /api/mercadolibre/conectar'
/**
 * La base de verdad, pero cada transacción falla al terminar (se cae la conexión al guardar): vuelve atrás lo que hizo.
 * actualizar: el update de afuera de la transacción (por defecto, el de verdad).
 */
const sinCommit = (actualizar: unknown = h.db.update.bind(h.db)) => ({
  select: h.db.select.bind(h.db),
  update: actualizar,
  transaction: (fn: (tx: unknown) => Promise<unknown>) => h.db.transaction(async (tx) => {
    await fn(tx)
    throw new Error('Connection terminated unexpectedly')
  }),
}) as unknown as Db

describe('leerDeLaApi con la cuenta conectada', () => {
  test('una publicación, con el token de la conexión (sin el de la aplicación); mientras no vence, no se vuelve a leer la base', async () => {
    const m = await cargar()
    await conectada(m, 1, HORA)
    m.olvidarConexion()
    const llamadas = ml({ [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)] })
    const { db, consultas } = conConsultas(h.db)
    expect(await m.leerDeLaApi(db, ARTICULO)).toEqual({
      estado: 'ok',
      producto: { titulo: ITEM.title, precio: '$88.990', foto: 'https://http2.mlstatic.com/D_931470-MLA89297118039_082025-O.jpg' },
    })
    expect(llamadas.map((l) => `${l.metodo} ${l.url}`)).toEqual([`GET ${API}/items/MLA1418506688`])
    expect(llamadas[0].headers.authorization).toBe(`Bearer ${tokens(1).access_token}`)
    expect(consultas).toHaveLength(1)
    await m.leerDeLaApi(db, ARTICULO)
    expect(consultas).toHaveLength(1)
    expect(gets(llamadas)).toHaveLength(2)
  })

  test('un catálogo copiado de la app (con pdp_filters): el item elegido; un catálogo sin item: el producto', async () => {
    const m = await cargar()
    await conectada(m, 1, HORA)
    const llamadas = ml({
      [`GET ${API}/items/MLA3034341816`]: [() => respuesta(ELEGIDO)], [`GET ${API}/products/MLA37631077`]: [() => respuesta(PRODUCTO)],
    })
    expect(await m.leerDeLaApi(h.db, CATALOGO_APP)).toMatchObject({ estado: 'ok', producto: { titulo: ELEGIDO.title, precio: '$145.000' } })
    expect(await m.leerDeLaApi(h.db, CATALOGO)).toEqual({
      estado: 'ok',
      producto: { titulo: PRODUCTO.name, precio: '$139.999', foto: 'https://http2.mlstatic.com/D_NQ_NP_1-MLA1_012025-F.jpg' },
    })
    expect(llamadas.map((l) => l.url)).toEqual([`${API}/items/MLA3034341816`, `${API}/products/MLA37631077`])
    expect(new Set(llamadas.map((l) => l.headers.authorization))).toEqual(new Set([`Bearer ${tokens(1).access_token}`]))
  })

  test('vencido (o a menos de 5 minutos de vencer): se renueva con el refresh token y se guarda el par nuevo antes de usarlo', async () => {
    for (const venceEn of [-HORA, 4 * 60_000]) {
      await h.db.delete(mercadolibreConexion)
      const m = await cargar()
      await conectada(m, 1, venceEn)
      const llamadas = ml({ [`POST ${API}/oauth/token`]: [() => respuesta(tokens(2))], [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)] })
      const ms = tiempos()
      const { db, consultas } = conConsultas(h.db)
      expect(await m.leerDeLaApi(db, ARTICULO), String(venceEn)).toMatchObject({ estado: 'ok' })
      expect(llamadas.map((l) => l.metodo)).toEqual(['POST', 'GET'])
      expect(llamadas[0].cuerpo).toEqual({
        grant_type: 'refresh_token', client_id: '1234567890123456', client_secret: 'clave-secreta-de-la-app', refresh_token: tokens(1).refresh_token,
      })
      expect(llamadas[0].redirect).toBe('error')
      expect(llamadas[1].headers.authorization).toBe(`Bearer ${tokens(2).access_token}`)
      // con su propio tope, aparte del de la lectura: hasta que contesta, y otro para el cuerpo
      expect(ms).toEqual([m.API_ML_TIEMPO_MS, m.RENOVAR_ML_TIEMPO_MS, m.RENOVAR_ML_CUERPO_MS])
      // con la fila bloqueada (si está tomada, no se espera), y el par nuevo guardado adentro
      const lock = consultas.findIndex((q) => /select .* from "mercadolibre_conexion" .*for update skip locked$/i.test(q))
      const guarda = consultas.findIndex((q) => /^update "mercadolibre_conexion"/i.test(q))
      expect(lock).toBeGreaterThan(0)
      expect(guarda).toBeGreaterThan(lock)
      const f = await fila()
      expect(descifrar(f.accessToken, 'mercadolibre_conexion.access_token')).toBe(tokens(2).access_token)
      expect(descifrar(f.refreshToken, 'mercadolibre_conexion.refresh_token')).toBe(tokens(2).refresh_token)
      expect(f.expiraAt!.getTime()).toBeGreaterThan(Date.now() + 5 * HORA)
      expect(f.conectadoPor).toBe(ownerId)
      // el que sigue usa el nuevo, sin renovar
      await m.leerDeLaApi(h.db, ARTICULO)
      expect(llamadas.map((l) => l.metodo)).toEqual(['POST', 'GET', 'GET'])
      // el espía de tiempos, para la vuelta que sigue
      vi.restoreAllMocks()
    }
  })

  test('dos renovaciones a la vez (en esta instancia o en otra) hacen un solo pedido a ML: la fila se bloquea y adentro se vuelve a mirar', async () => {
    // PGlite corre las transacciones de a una: las otras dos esperan a la primera y adentro ven la fila ya renovada (lo que
    // fija este test: que adentro se vuelve a mirar). Con Neon no esperan: la fila tomada se saltea y esos links siguen sin
    // la conexión, con el acceso vencido (ver 'la fila tomada por otra renovación'). Lo que vale igual: un solo POST.
    const m = await cargar()
    await conectada(m, 1, -HORA)
    // otra instancia: los mismos módulos cargados aparte, con su propia memoria
    const otra = await cargar()
    const llamadas = ml({
      [`POST ${API}/oauth/token`]: [despues(() => respuesta(tokens(2)), 20), () => respuesta({ error: 'invalid_grant', status: 400 }, 400)],
      [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)],
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await Promise.all([m.leerDeLaApi(h.db, ARTICULO), m.leerDeLaApi(h.db, ARTICULO), otra.leerDeLaApi(h.db, ARTICULO)]))
      .toMatchObject([{ estado: 'ok' }, { estado: 'ok' }, { estado: 'ok' }])
    expect(posts(llamadas)).toHaveLength(1)
    expect(gets(llamadas).map((l) => l.headers.authorization)).toEqual(Array(3).fill(`Bearer ${tokens(2).access_token}`))
    expect(warn).not.toHaveBeenCalled()
    expect(descifrar((await fila()).refreshToken, 'mercadolibre_conexion.refresh_token')).toBe(tokens(2).refresh_token)
  })

  test('invalid_grant al renovar: la conexión queda caída (sin tokens), un aviso sin secretos, y sigue como sin conexión (la página)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = await cargar()
    await conectada(m, 1, -HORA)
    const llamadas = ml({
      [`POST ${API}/oauth/token`]: [
        () => respuesta({ message: 'Error validating grant. Your authorization code or refresh token may be expired or it was already used', error: 'invalid_grant', status: 400, cause: [] }, 400),
        // después, el de la aplicación: tampoco
        () => respuesta({ message: 'invalid client', error: 'invalid_client', status: 400 }, 400),
      ],
    })
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toBeNull()
    expect(llamadas.map((l) => l.cuerpo.grant_type)).toEqual(['refresh_token', 'client_credentials'])
    expect(await fila()).toMatchObject({ accessToken: null, refreshToken: null, expiraAt: null, mlUserId: '987654321', conectadoPor: ownerId })
    expect(warn.mock.calls.map((c) => c[0])).toContain('MercadoLibre se desconectó: hay que volver a conectarlo en /api/mercadolibre/conectar')
    sinSecretos(warn)
    // las que siguen no la vuelven a intentar
    const despuesDe = ml({})
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toBeNull()
    expect(despuesDe).toEqual([])
    expect(m.apiDeMercadoLibreLista()).toBe(false)
  })

  test('un 401 con un token que creíamos vigente: se renueva y se reintenta una sola vez; después, otro 401 no renueva por un minuto', async () => {
    const m = await cargar()
    await conectada(m, 1, HORA)
    const llamadas = ml({ [`POST ${API}/oauth/token`]: [() => respuesta(tokens(2))], [`GET ${API}/items/MLA1418506688`]: [no, () => respuesta(ITEM)] })
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(llamadas.map((l) => `${l.metodo} ${l.headers.authorization ?? l.cuerpo.grant_type}`)).toEqual([
      `GET Bearer ${tokens(1).access_token}`, 'POST refresh_token', `GET Bearer ${tokens(2).access_token}`,
    ])
    expect(descifrar((await fila()).accessToken, 'mercadolibre_conexion.access_token')).toBe(tokens(2).access_token)
    // pasado el minuto, un 401 vuelve a renovar; si el nuevo también da 401, no se sigue renovando: null (la página)
    const ahora = Date.now()
    const reloj = vi.spyOn(Date, 'now').mockReturnValue(ahora + 61_000)
    const siempre = ml({ [`POST ${API}/oauth/token`]: [() => respuesta(tokens(3))], [`GET ${API}/items/MLA1418506688`]: [no] })
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toBeNull()
    expect(siempre.map((l) => `${l.metodo} ${l.headers.authorization ?? l.cuerpo.grant_type}`)).toEqual([
      `GET Bearer ${tokens(2).access_token}`, 'POST refresh_token', `GET Bearer ${tokens(3).access_token}`,
    ])
    // en el minuto, los 401 que siguen ni renuevan ni prueban el token de la aplicación
    const despuesDe = ml({ [`POST ${API}/oauth/token`]: [() => respuesta(tokens(4))], [`GET ${API}/items/MLA1418506688`]: [no] })
    reloj.mockReturnValue(ahora + 61_000 + 59_000)
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toBeNull()
    expect(despuesDe.map((l) => `${l.metodo} ${l.headers.authorization ?? l.cuerpo.grant_type}`)).toEqual([`GET Bearer ${tokens(3).access_token}`])
    reloj.mockRestore()
  })

  test('un 401 que sigue con el token nuevo: dos links de catálogo (cada uno pide /items y /products) renuevan una sola vez', async () => {
    const m = await cargar()
    await conectada(m, 1, HORA)
    const llamadas = ml({
      [`POST ${API}/oauth/token`]: [() => respuesta(tokens(2)), () => respuesta(tokens(3))],
      [`GET ${API}/items/MLA3034341816`]: [no], [`GET ${API}/products/MLA37631077`]: [no],
    })
    expect(await m.leerDeLaApi(h.db, CATALOGO_APP)).toBeNull()
    expect(await m.leerDeLaApi(h.db, CATALOGO_APP)).toBeNull()
    expect(llamadas.map((l) => `${l.metodo} ${l.url.slice(API.length)} ${l.headers.authorization?.includes('acceso2') ? 2 : l.headers.authorization?.includes('acceso1') ? 1 : ''}`)).toEqual([
      'GET /items/MLA3034341816 1', 'POST /oauth/token ', 'GET /items/MLA3034341816 2', 'GET /products/MLA37631077 2',
      'GET /items/MLA3034341816 2', 'GET /products/MLA37631077 2',
    ])
    expect(descifrar((await fila()).refreshToken, USO_REFRESH)).toBe(tokens(2).refresh_token)
  })

  test('si renovar falla (ML caído, sin red, colgado): la conexión no se pierde, sigue por la página y no se reintenta por un minuto', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const falla of [
      () => respuesta('Internal Server Error', 500), () => Promise.reject(new TypeError('fetch failed')), () => respuesta({ access_token: 5 }),
    ]) {
      await h.db.delete(mercadolibreConexion)
      const m = await cargar()
      await conectada(m, 1, -HORA)
      const llamadas = ml({ [`POST ${API}/oauth/token`]: [falla, () => respuesta({ error: 'invalid_client' }, 400)] })
      expect(await m.leerDeLaApi(h.db, ARTICULO)).toBeNull()
      expect(llamadas.map((l) => l.cuerpo.grant_type)).toEqual(['refresh_token', 'client_credentials'])
      expect(descifrar((await fila()).refreshToken, 'mercadolibre_conexion.refresh_token')).toBe(tokens(1).refresh_token)
      // en el minuto, ni la base ni ML
      const ahora = Date.now()
      const reloj = vi.spyOn(Date, 'now').mockReturnValue(ahora + 59_000)
      const { db, consultas } = conConsultas(h.db)
      expect(await m.leerDeLaApi(db, ARTICULO)).toBeNull()
      expect(consultas).toEqual([])
      expect(llamadas).toHaveLength(2)
      expect(m.apiDeMercadoLibreLista()).toBe(false)
      // pasado el minuto, se vuelve a probar
      reloj.mockReturnValue(ahora + 61_000)
      expect(m.apiDeMercadoLibreLista()).toBe(true)
      reloj.mockRestore()
    }
    sinSecretos(warn)
    // colgado: se corta a su propio tope (RENOVAR_ML_TIEMPO_MS, cien veces más corto acá), no al de la lectura, que vence
    // antes: cortarlo a la mitad podría perder el par nuevo
    await h.db.delete(mercadolibreConexion)
    const m = await cargar()
    await conectada(m, 1, -HORA)
    let antes = 0
    let cortada = 0
    vi.stubGlobal('fetch', vi.fn((_url: string | URL, init: RequestInit = {}) => new Promise<Response>((_ok, mal) => {
      // como el de verdad: con la señal ya cortada, ni sale
      if (init.signal?.aborted) return mal(init.signal.reason)
      init.signal?.addEventListener('abort', () => {
        cortada ||= Date.now() - antes
        mal(init.signal?.reason)
      })
    })))
    tiempos(100)
    antes = Date.now()
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toBeNull()
    expect(m.API_ML_TIEMPO_MS).toBeLessThan(m.RENOVAR_ML_TIEMPO_MS)
    expect(cortada).toBeGreaterThanOrEqual(m.RENOVAR_ML_TIEMPO_MS / 100 - 2)
    expect(Date.now() - antes).toBeLessThan(m.RENOVAR_ML_TIEMPO_MS / 100 + 200)
    expect(descifrar((await fila()).refreshToken, USO_REFRESH)).toBe(tokens(1).refresh_token)
  })

  test('si renovar falla y al acceso le quedan minutos: se sigue usando hasta un minuto, y después se vuelve a renovar', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = await cargar()
    await conectada(m, 1, 4 * 60_000)
    const llamadas = ml({
      [`POST ${API}/oauth/token`]: [() => respuesta('Internal Server Error', 500), () => respuesta(tokens(2))],
      [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)],
    })
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(llamadas.map((l) => l.headers.authorization ?? l.cuerpo.grant_type)).toEqual(['refresh_token', `Bearer ${tokens(1).access_token}`])
    // en el minuto, el mismo: ni la base ni renovar
    const ahora = Date.now()
    const reloj = vi.spyOn(Date, 'now').mockReturnValue(ahora + 59_000)
    const { db, consultas } = conConsultas(h.db)
    expect(await m.leerDeLaApi(db, ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(consultas).toEqual([])
    expect(llamadas.map((l) => l.headers.authorization ?? l.cuerpo.grant_type)).toEqual([
      'refresh_token', `Bearer ${tokens(1).access_token}`, `Bearer ${tokens(1).access_token}`,
    ])
    // pasado el minuto, se renueva
    reloj.mockReturnValue(ahora + 61_000)
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(llamadas.slice(3).map((l) => l.headers.authorization ?? l.cuerpo.grant_type)).toEqual(['refresh_token', `Bearer ${tokens(2).access_token}`])
    reloj.mockRestore()
    expect(descifrar((await fila()).refreshToken, USO_REFRESH)).toBe(tokens(2).refresh_token)
  })

  test('si se va quien preguntó mientras se renueva, la renovación sigue y el par nuevo queda guardado', async () => {
    const m = await cargar()
    await conectada(m, 1, -HORA)
    const quien = new AbortController()
    // se va apenas sale el pedido a ML
    const seVa = (init: RequestInit) => { setTimeout(() => quien.abort(), 5); return lento(() => respuesta(tokens(2)), 30)(init) }
    const llamadas = ml({ [`POST ${API}/oauth/token`]: [seVa], [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)] })
    expect(await m.leerDeLaApi(h.db, ARTICULO, quien.signal)).toBeNull()
    expect(quien.signal.aborted).toBe(true)
    expect(posts(llamadas)).toHaveLength(1)
    expect(posts(llamadas)[0].signal?.aborted).toBe(false)
    const f = await fila()
    expect(descifrar(f.accessToken, USO_ACCESS)).toBe(tokens(2).access_token)
    expect(descifrar(f.refreshToken, USO_REFRESH)).toBe(tokens(2).refresh_token)
    // el link que sigue lo usa, sin renovar
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(posts(llamadas)).toHaveLength(1)
    expect(gets(llamadas).at(-1)!.headers.authorization).toBe(`Bearer ${tokens(2).access_token}`)
  })

  test('ML contesta antes del tope y el cuerpo llega después: el par nuevo se guarda igual (ML ya gastó el refresh token)', async () => {
    // cincuenta veces más cortos: la lectura, 80 ms; hasta que contesta, 100 ms; el cuerpo, 40 ms más
    const m = await cargar()
    await conectada(m, 1, -HORA)
    const llamadas = ml({ [`POST ${API}/oauth/token`]: [cuerpoLento(tokens(2), 70, 35)], [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)] })
    tiempos(50)
    const antes = Date.now()
    // la lectura ya venció: esta vez, la página
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toBeNull()
    expect(Date.now() - antes).toBeGreaterThanOrEqual(m.RENOVAR_ML_TIEMPO_MS / 50)
    expect(posts(llamadas)).toHaveLength(1)
    expect(descifrar((await fila()).refreshToken, USO_REFRESH)).toBe(tokens(2).refresh_token)
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(posts(llamadas)).toHaveLength(1)
  })

  test('un cuerpo que no termina de llegar se corta a su tope y no cuelga la fila; queda el refresh de antes, que ML quizás ya gastó (riesgo aceptado)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = await cargar()
    await conectada(m, 1, -HORA)
    ml({ [`POST ${API}/oauth/token`]: [cuerpoLento(tokens(2), 70), () => respuesta({ error: 'invalid_client' }, 400)] })
    tiempos(50)
    const antes = Date.now()
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toBeNull()
    expect(Date.now() - antes).toBeLessThan(70 + m.RENOVAR_ML_CUERPO_MS / 50 + 200)
    expect(descifrar((await fila()).refreshToken, USO_REFRESH)).toBe(tokens(1).refresh_token)
  })

  test('un 200 con el refresh token nuevo pero sin un acceso que sirva: el refresh se guarda (es el único que vale) y la próxima renovación lo usa', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = await cargar()
    await conectada(m, 1, -HORA)
    const llamadas = ml({
      [`POST ${API}/oauth/token`]: [() => respuesta({ ...tokens(2), expires_in: undefined }), () => respuesta({ error: 'invalid_client' }, 400), () => respuesta(tokens(3))],
      [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)],
    })
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toBeNull()
    const f = await fila()
    expect(descifrar(f.refreshToken, USO_REFRESH)).toBe(tokens(2).refresh_token)
    // el acceso, el de antes (vencido)
    expect(descifrar(f.accessToken, USO_ACCESS)).toBe(tokens(1).access_token)
    const ahora = Date.now()
    const reloj = vi.spyOn(Date, 'now').mockReturnValue(ahora + 61_000)
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toMatchObject({ estado: 'ok' })
    reloj.mockRestore()
    expect(posts(llamadas).map((l) => l.cuerpo.refresh_token ?? l.cuerpo.grant_type)).toEqual([
      tokens(1).refresh_token, 'client_credentials', tokens(2).refresh_token,
    ])
  })

  test('con el tiempo del link ya cortado no se empieza a renovar (no se cortaría y podría pasarse del maxDuration): el acceso de antes si vale, y el link que sigue renueva', async () => {
    const m = await cargar()
    await conectada(m, 1, 4 * 60_000)
    const llamadas = ml({
      [`POST ${API}/oauth/token`]: [() => respuesta(tokens(2))],
      [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)],
    })
    // se le acabó el tiempo (expandir un meli.la, una base que tardó en despertar): sin renovar; el acceso de antes (el GET
    // con la señal cortada ni sale)
    expect(await m.leerDeLaApi(h.db, ARTICULO, AbortSignal.abort())).toBeNull()
    expect(llamadas.map((l) => l.headers.authorization ?? l.cuerpo.grant_type)).toEqual([`Bearer ${tokens(1).access_token}`])
    expect(descifrar((await fila()).refreshToken, USO_REFRESH)).toBe(tokens(1).refresh_token)
    // vencido del todo, tampoco; y no deja el minuto sin mirar la conexión
    await h.db.delete(mercadolibreConexion)
    await conectada(m, 1, -HORA)
    llamadas.length = 0
    expect(await m.leerDeLaApi(h.db, ARTICULO, AbortSignal.abort())).toBeNull()
    expect(posts(llamadas).filter((l) => l.cuerpo.grant_type === 'refresh_token')).toEqual([])
    expect(m.conexionPosible()).toBe(true)
    // el link que sigue, con tiempo, renueva
    llamadas.length = 0
    expect(await m.leerDeLaApi(h.db, ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(llamadas.map((l) => l.headers.authorization ?? l.cuerpo.grant_type)).toEqual(['refresh_token', `Bearer ${tokens(2).access_token}`])
  })

  test('ML dio el par nuevo y la transacción falla al guardarlo (se cae la conexión): se guarda otra vez, fuera de ella', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // un 200 con el par entero, y uno con el refresh token nuevo pero sin un acceso que sirva
    for (const dio of [tokens(2), { ...tokens(2), expires_in: undefined }]) {
      await h.db.delete(mercadolibreConexion)
      const m = await cargar()
      await conectada(m, 1, -HORA)
      const llamadas = ml({
        [`POST ${API}/oauth/token`]: [() => respuesta(dio), () => respuesta({ error: 'invalid_client' }, 400)],
        [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)],
      })
      const entero = dio.expires_in !== undefined
      const r = await m.leerDeLaApi(sinCommit(), ARTICULO)
      expect(posts(llamadas)[0].cuerpo.refresh_token).toBe(tokens(1).refresh_token)
      const f = await fila()
      expect(descifrar(f.refreshToken, USO_REFRESH)).toBe(tokens(2).refresh_token)
      if (entero) {
        expect(r).toMatchObject({ estado: 'ok' })
        expect(gets(llamadas)[0].headers.authorization).toBe(`Bearer ${tokens(2).access_token}`)
        expect(descifrar(f.accessToken, USO_ACCESS)).toBe(tokens(2).access_token)
        expect(f.expiraAt!.getTime()).toBeGreaterThan(Date.now() + 5 * HORA)
      } else {
        expect(r).toBeNull()
        expect(descifrar(f.accessToken, USO_ACCESS)).toBe(tokens(1).access_token)
      }
    }
    expect(warn.mock.calls.map((c) => c[0])).not.toContain(SIN_GUARDAR)
  })

  test('si tampoco se puede guardar fuera de la transacción: un aviso propio sin secretos, y esta instancia sigue con el acceso nuevo mientras vale', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = await cargar()
    await conectada(m, 1, -HORA)
    const llamadas = ml({ [`POST ${API}/oauth/token`]: [() => respuesta(tokens(2))], [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)] })
    const caida = sinCommit(() => { throw new Error('Connection terminated unexpectedly') })
    expect(await m.leerDeLaApi(caida, ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(gets(llamadas)[0].headers.authorization).toBe(`Bearer ${tokens(2).access_token}`)
    expect(warn.mock.calls.map((c) => c[0])).toEqual([SIN_GUARDAR])
    sinSecretos(warn)
    // en la base sigue el par de antes (su refresh ya no vale: por eso el aviso)
    expect(descifrar((await fila()).refreshToken, USO_REFRESH)).toBe(tokens(1).refresh_token)
    // los links que siguen usan el nuevo, sin la base ni renovar
    const { db, consultas } = conConsultas(h.db)
    expect(await m.leerDeLaApi(db, ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(consultas).toEqual([])
    expect(posts(llamadas)).toHaveLength(1)
    expect(gets(llamadas).at(-1)!.headers.authorization).toBe(`Bearer ${tokens(2).access_token}`)
  })

  test('la fila tomada por otra renovación (en otra instancia): no se la espera; el acceso de antes si todavía vale, si no la página', async () => {
    const m = await cargar()
    // el select … for update skip locked no la devuelve; lo demás, la base de verdad
    const tomada = {
      select: h.db.select.bind(h.db),
      transaction: (fn: (tx: unknown) => Promise<unknown>) => h.db.transaction(() => fn({
        select: () => ({ from: () => ({ where: () => ({ for: (_: string, o?: { skipLocked?: boolean }) => Promise.resolve(o?.skipLocked ? [] : null) }) }) }),
      })),
    } as unknown as Db
    await conectada(m, 1, 4 * 60_000)
    const llamadas = ml({ [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)], [`POST ${API}/oauth/token`]: [() => respuesta({ error: 'invalid_client' }, 400)] })
    expect(await m.leerDeLaApi(tomada, ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(llamadas.map((l) => l.headers.authorization ?? l.cuerpo.grant_type)).toEqual([`Bearer ${tokens(1).access_token}`])
    // vencido: este link sigue sin la conexión (sin renovar: el token de la aplicación, y la página), y el que sigue vuelve
    // a mirar enseguida
    await h.db.delete(mercadolibreConexion)
    await conectada(m, 1, -HORA)
    const vencido = ml({ [`POST ${API}/oauth/token`]: [() => respuesta({ error: 'invalid_client' }, 400)] })
    expect(await m.leerDeLaApi(tomada, ARTICULO)).toBeNull()
    expect(vencido.map((l) => l.cuerpo.grant_type)).toEqual(['client_credentials'])
    expect(m.conexionPosible()).toBe(true)
    // ya renovada por la otra: se usa
    await conectada(m, 2, HORA)
    const despuesDe = ml({ [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)] })
    expect(await m.leerDeLaApi(tomada, ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(despuesDe.map((l) => l.headers.authorization)).toEqual([`Bearer ${tokens(2).access_token}`])
  })

  test('solo producción renueva: un preview (quizás con su propia rama de Neon) o un npm run dev usan el acceso mientras vale, sin gastar el refresh token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const entorno of ['preview', 'development', undefined]) {
      vi.stubEnv('VERCEL_ENV', entorno)
      await h.db.delete(mercadolibreConexion)
      const m = await cargar()
      // le quedan 4 minutos: producción ya lo renovaría, acá se usa
      await conectada(m, 1, 4 * 60_000)
      const llamadas = ml({ [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)], [`POST ${API}/oauth/token`]: [() => respuesta({ error: 'invalid_client' }, 400)] })
      expect(await m.leerDeLaApi(h.db, ARTICULO), String(entorno)).toMatchObject({ estado: 'ok' })
      expect(llamadas.map((l) => l.headers.authorization ?? l.cuerpo.grant_type), String(entorno)).toEqual([`Bearer ${tokens(1).access_token}`])
      // vencido: sin renovar y sin la conexión (el token de la aplicación, y la página)
      const ahora = Date.now()
      const reloj = vi.spyOn(Date, 'now').mockReturnValue(ahora + 5 * 60_000)
      expect(await m.leerDeLaApi(h.db, ARTICULO), String(entorno)).toBeNull()
      expect(llamadas.slice(1).map((l) => l.cuerpo.grant_type), String(entorno)).toEqual(['client_credentials'])
      const f = await fila()
      expect(descifrar(f.accessToken, USO_ACCESS)).toBe(tokens(1).access_token)
      expect(descifrar(f.refreshToken, USO_REFRESH)).toBe(tokens(1).refresh_token)
      // producción la renueva en la misma base: al minuto, se usa la nueva
      await h.db.update(mercadolibreConexion).set({
        accessToken: cifrar(tokens(2).access_token, USO_ACCESS), refreshToken: cifrar(tokens(2).refresh_token, USO_REFRESH), expiraAt: new Date(ahora + 6 * HORA),
      })
      reloj.mockReturnValue(ahora + 6 * 60_000 + 1000)
      expect(await m.leerDeLaApi(h.db, ARTICULO), String(entorno)).toMatchObject({ estado: 'ok' })
      expect(gets(llamadas).at(-1)!.headers.authorization).toBe(`Bearer ${tokens(2).access_token}`)
      expect(posts(llamadas).map((l) => l.cuerpo.grant_type)).toEqual(['client_credentials'])
      reloj.mockRestore()
    }
    expect(warn.mock.calls.map((c) => c[0])).toContain('MercadoLibre: el acceso de la conexión venció y solo lo renueva producción')
    sinSecretos(warn)
  })

  test('una instancia con otro AUTH_SECRET (un npm run dev o un preview con la base de producción): no puede usar la conexión, pero no la toca', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const venceEn of [HORA, -HORA]) {
      await h.db.delete(mercadolibreConexion)
      const prod = await cargar()
      await conectada(prod, 1, venceEn)
      const antes = await fila()
      // la otra instancia, con su propio secreto
      vi.stubEnv('AUTH_SECRET', 'secreto-del-preview')
      warn.mockClear()
      const otra = await cargar()
      const llamadas = ml({ [`POST ${API}/oauth/token`]: [() => respuesta({ error: 'invalid_client' }, 400)] })
      expect(await otra.leerDeLaApi(h.db, ARTICULO), String(venceEn)).toBeNull()
      // sin renovar: solo el token de la aplicación
      expect(llamadas.map((l) => l.cuerpo.grant_type), String(venceEn)).toEqual(['client_credentials'])
      expect(await fila(), String(venceEn)).toEqual(antes)
      expect(warn.mock.calls.map((c) => c[0])).toContain(
        'MercadoLibre: no se pudo descifrar la conexión (¿otro AUTH_SECRET?). Si cambió el secreto, volvé a conectarla en /api/mercadolibre/conectar',
      )
      expect(warn.mock.calls.map((c) => c[0])).not.toContain('MercadoLibre se desconectó: hay que volver a conectarlo en /api/mercadolibre/conectar')
      sinSecretos(warn)
      // producción la sigue usando (o renovando)
      vi.stubEnv('AUTH_SECRET', 'secreto-de-la-app-para-los-tests')
      const deProd = ml({ [`POST ${API}/oauth/token`]: [() => respuesta(tokens(2))], [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)] })
      expect(await prod.leerDeLaApi(h.db, ARTICULO), String(venceEn)).toMatchObject({ estado: 'ok' })
      expect(gets(deProd)[0].headers.authorization).toBe(`Bearer ${tokens(venceEn > 0 ? 1 : 2).access_token}`)
    }
  })

  test('sin la tabla (un preview con la base sin migrar) o con la base caída: sigue sin conexión, nunca tira, y el log no lleva lo de la base', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = await createTestDb()
    await db.execute(sql`drop table mercadolibre_conexion`)
    const m = await cargar()
    const llamadas = ml({ [`POST ${API}/oauth/token`]: [() => respuesta({ access_token: 'APP_USR-app', expires_in: 21600 })], [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)] })
    // sigue con el token de la aplicación (si ML lo diera)
    expect(await m.leerDeLaApi(db, ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(llamadas.map((l) => l.cuerpo.grant_type ?? l.metodo)).toEqual(['client_credentials', 'GET'])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toMatch(/^MercadoLibre: no se pudo leer o renovar la conexión \(42P01\)$/)
    // una base que tira cualquier cosa
    const rota = { select: () => { throw new Error('Failed query: select ... params: secreto') } } as unknown as Db
    const otra = await cargar()
    ml({ [`POST ${API}/oauth/token`]: [() => respuesta({ error: 'invalid_client' }, 400)] })
    expect(await otra.leerDeLaApi(rota, ARTICULO)).toBeNull()
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Failed query|params/)
  })

  test('con la conexión, el log de la lectura no lleva ningún token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = await cargar()
    await conectada(m, 1, -HORA)
    ml({ [`POST ${API}/oauth/token`]: [() => respuesta('error', 503)], [`GET ${API}/items/MLA1418506688`]: [() => respuesta('', 500)] })
    await m.leerDeLaApi(h.db, ARTICULO)
    sinSecretos(warn, info, error)
  })
})
