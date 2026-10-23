import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import { count, eq, sql } from 'drizzle-orm'
import { conConsultas, createTestDb, seedOwnerAndGiver, servidor } from './helpers'
import { cuerpo, fixture } from './fixtures/links/leer'
import { pedidosAfuera } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Pedir } from '@/lib/bajar-foto'
import { PEDIDOS_AFUERA_POR_DIA } from '@/lib/pedidos-afuera'

// POST /api/deseo/link: lee el producto del link que pegó el dueño. La base es PGlite, la sesión es de mentira y la
// página la contesta un servidor de mentira (pedirPagina): nada sale a la red (https.get falla si se llama).

const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  session: null as { userId: string } | null,
  pedirPagina: undefined as unknown as Pedir,
  pedirMarketplace: true,
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session }))
vi.mock('@/lib/bajar-foto', async (original) => ({
  ...await original<typeof import('@/lib/bajar-foto')>(), get pedirPagina() { return h.pedirPagina },
}))
vi.mock('@/lib/mercadolibre', async (original) => ({
  ...await original<typeof import('@/lib/mercadolibre')>(), get ML_PEDIR_MARKETPLACE() { return h.pedirMarketplace },
}))

import { POST } from '@/app/api/deseo/link/route'

const html = { 'content-type': 'text/html; charset=utf-8' }
const pagina = (titulo: string) => `<html><head><meta property="og:type" content="product"><meta property="og:title" content="${titulo}"></head></html>`
const ARTICULO = 'https://articulo.mercadolibre.com.ar/MLA-1418506688-mate-de-algarrobo-premium-artesanal-con-bombilla-_JM'

let ownerId: string
let info: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  h.db = await createTestDb()
  ownerId = (await seedOwnerAndGiver(h.db)).owner.id
  h.session = { userId: ownerId }
  h.pedirMarketplace = true
  h.pedirPagina = servidor({}).pedir
  vi.spyOn(https, 'get').mockImplementation(() => { throw new Error('nada sale a la red') })
  vi.spyOn(http, 'get').mockImplementation(() => { throw new Error('nada sale a la red') })
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function leer(body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) {
  return POST(new Request('https://giftr.app/api/deseo/link', {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
}

/** Lo que contestó afuera, por URL (ver servidor en helpers). */
function afuera(respuestas: Parameters<typeof servidor>[0]) {
  const s = servidor(respuestas)
  h.pedirPagina = s.pedir
  return s
}

const pedidos = async () => (await h.db.select({ n: count() }).from(pedidosAfuera).where(eq(pedidosAfuera.userId, ownerId)))[0].n

describe('lo que se puede pedir', () => {
  test('sin sesión: 401, sin salir a la red ni anotar nada', async () => {
    h.session = null
    const s = afuera({})
    const r = await leer({ url: 'https://www.crocs.com.ar/products/x' })
    expect(r.status).toBe(401)
    expect(await r.json()).toEqual({ error: 'sin_sesion' })
    expect(s.urls()).toEqual([])
    expect(await pedidos()).toBe(0)
  })

  test('lo que no es un link de una página pública: 400, sin salir a la red ni gastar el tope', async () => {
    const s = afuera({})
    for (const url of [
      'no es un link', `https://x.com/${'a'.repeat(1990)}`, 'https://localhost/x', 'http://localhost:3000/x', 'https://10.0.0.1/x',
      'https://169.254.169.254/latest/meta-data', 'https://[::1]/x', 'https://x.com:8443/x', 'https://db.internal/x', 'javascript:alert(1)',
      'file:///etc/passwd', 'ftp://x.com/a', 'https://usuario:clave@x.com/a', 42, null, '',
    ]) {
      const r = await leer({ url })
      expect([url, r.status], String(url)).toEqual([url, 400])
      expect(await r.json()).toEqual({ error: 'no_es_link' })
    }
    // no es JSON, no trae url, o no viene como JSON (un formulario de otro sitio)
    for (const [body, headers] of [
      ['{"url":', undefined], ['[]', undefined], ['{"link":"https://x.com/a"}', undefined],
      ['{"url":"https://x.com/a"}', { 'content-type': 'text/plain' }], ['url=https://x.com/a', { 'content-type': 'application/x-www-form-urlencoded' }],
    ] as const) {
      expect((await leer(body, headers)).status, body).toBe(400)
    }
    expect(s.urls()).toEqual([])
    expect(await pedidos()).toBe(0)
  })

  test('un cuerpo de más de 4 KB: 413, diga o no su largo', async () => {
    const grande = JSON.stringify({ url: `https://x.com/${'a'.repeat(5000)}` })
    expect((await leer(grande)).status).toBe(413)
    // sin content-length (llega de a pedazos): se deja de leer al pasar los 4 KB
    const trozos = new ReadableStream({
      start(c) {
        for (let i = 0; i < 100; i++) c.enqueue(new TextEncoder().encode('x'.repeat(1000)))
        c.close()
      },
    })
    const r = await POST(new Request('https://giftr.app/api/deseo/link', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: trozos, duplex: 'half',
    } as RequestInit))
    expect(r.status).toBe(413)
    expect(await pedidos()).toBe(0)
  })

  test('un link sin esquema o con http:// se pide por https://', async () => {
    const s = afuera({
      'https://www.crocs.com.ar/products/clog': { headers: html, cuerpo: pagina('Clog clásico') },
      'https://tienda.com.ar/products/mate': { headers: html, cuerpo: pagina('Mate') },
    })
    expect(await (await leer({ url: 'http://www.crocs.com.ar/products/clog' })).json()).toMatchObject({ estado: 'ok', titulo: 'Clog clásico' })
    expect(await (await leer({ url: '  tienda.com.ar/products/mate ' })).json()).toMatchObject({ estado: 'ok', titulo: 'Mate' })
    expect(s.urls()).toEqual(['https://www.crocs.com.ar/products/clog', 'https://tienda.com.ar/products/mate'])
  })
})

describe('lo que contesta', () => {
  test('solo las claves de RespuestaLink: ni el HTML, ni los headers, ni el status de afuera', async () => {
    const f = fixture('crocs-1')
    afuera({ [f.urlPegadaPorElUsuario]: { headers: { 'content-type': f.contentType!, 'x-secreto': 'no' }, cuerpo: cuerpo('crocs-1') } })
    const r = await leer({ url: f.urlPegadaPorElUsuario })
    expect(r.status).toBe(200)
    expect([...r.headers.keys()].filter((k) => k !== 'content-type')).toEqual([])
    const json = await r.json()
    expect(Object.keys(json).sort()).toEqual(['estado', 'foto', 'precio', 'sitio', 'titulo'])
    expect(json).toEqual({
      estado: 'ok', titulo: 'Crocs Classic Vegan Suede Moc', precio: '$99.999', foto: expect.stringMatching(/^https:\/\//), sitio: 'crocs.com.ar',
    })
    // y lo mismo cuando no se pudo: un estado grueso, nunca el status
    afuera({ 'https://x.com/products/mate-imperial': { status: 503, headers: html, cuerpo: '<h1>Service Unavailable</h1>' } })
    const caido = await (await leer({ url: 'https://x.com/products/mate-imperial' })).json()
    expect(caido).toEqual({ estado: 'bloqueado', titulo: 'Mate imperial', precio: null, foto: null, sitio: 'x.com' })
    expect(JSON.stringify(caido)).not.toMatch(/503|Service/)
  })

  test('el log dice el host, el estado y lo que tardó, nunca el link entero', async () => {
    afuera({ 'https://tienda.com.ar/products/mate?token=secreto123': { headers: html, cuerpo: pagina('Mate') } })
    await leer({ url: 'https://tienda.com.ar/products/mate?token=secreto123' })
    expect(info).toHaveBeenCalledTimes(1)
    const linea = String(info.mock.calls[0][0])
    expect(linea).toMatch(/^deseo\/link tienda\.com\.ar ok \d+ms$/)
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/secreto123|products/)
  })

  test('meli.la a una publicación que ya no existe: no-esta, con el nombre del Location', async () => {
    const corto = fixture('mercadolibre-16')
    const viejo = fixture('mercadolibre-9')
    const destino = corto.cadenaDeRespuestas[0].location!
    const s = afuera({
      [corto.urlPegadaPorElUsuario]: { status: 301, headers: { location: destino } },
      [destino]: { status: viejo.status, headers: { 'content-type': viejo.contentType! }, cuerpo: cuerpo('mercadolibre-9') },
    })
    expect(await (await leer({ url: corto.urlPegadaPorElUsuario })).json()).toEqual({
      estado: 'no-esta', titulo: 'Nissan altima 25 advance mt sedan', precio: null, foto: null, sitio: 'auto.mercadolibre.com.mx',
    })
    expect(s.urls()).toEqual([corto.urlPegadaPorElUsuario, destino])
  })
})

describe('MercadoLibre', () => {
  test('la publicación se pide tal como vino: con el muro, bloqueado y el nombre del link (nunca otro host)', async () => {
    const f = fixture('mercadolibre-10')
    const s = afuera({ [ARTICULO]: { status: 302, headers: { location: f.cadenaDeRespuestas[0].location! } } })
    expect(await (await leer({ url: ARTICULO })).json()).toEqual({
      estado: 'bloqueado', titulo: 'Mate de algarrobo premium artesanal con bombilla', precio: null, foto: null, sitio: 'mercadolibre.com.ar',
    })
    // ni el muro ni otro subdominio (auto., departamento.): solo el host del link
    expect(s.urls()).toEqual([ARTICULO])
    expect(await pedidos()).toBe(1)
  })

  test('una publicación que se lee (sin muro): completa, como cualquier página', async () => {
    const f = fixture('mercadolibre-1')
    afuera({ [ARTICULO]: { headers: { 'content-type': f.contentType! }, cuerpo: cuerpo('mercadolibre-1') } })
    expect(await (await leer({ url: ARTICULO })).json()).toEqual({
      estado: 'ok', titulo: 'Mate De Algarrobo Premium Artesanal Con Bombilla', precio: '$88.990',
      foto: expect.stringMatching(/^https:\/\/http2\.mlstatic\.com\//), sitio: 'mercadolibre.com.ar',
    })
  })

  test('con ML_PEDIR_MARKETPLACE apagado: articulo, /p/ y /up/ dan el nombre del link, sin red y sin gastar el tope', async () => {
    h.pedirMarketplace = false
    const s = afuera({})
    for (const [url, titulo] of [
      [ARTICULO, 'Mate de algarrobo premium artesanal con bombilla'],
      ['https://www.mercadolibre.com.ar/termo-original-stanley-mate-system-12-litros-rosa/p/MLA39939183', 'Termo original stanley mate system 12 litros rosa'],
      ['https://www.mercadolibre.com.ar/canasta-matera-eco-cuero/up/MLAU3409701436?pdp_filters=item_id%3AMLA2324526514', 'Canasta matera eco cuero'],
    ]) {
      expect(await (await leer({ url })).json(), url).toEqual({ estado: 'bloqueado', titulo, precio: null, foto: null, sitio: 'mercadolibre.com.ar' })
    }
    expect(s.urls()).toEqual([])
    expect(await pedidos()).toBe(0)
    // un clasificado sí se pide (no tiene muro), y cuenta
    const f = fixture('mercadolibre-5')
    const clasificado = afuera({ [f.urlPegadaPorElUsuario]: { headers: { 'content-type': f.contentType! }, cuerpo: cuerpo('mercadolibre-5') } })
    expect(await (await leer({ url: f.urlPegadaPorElUsuario })).json()).toMatchObject({ estado: 'ok', precio: 'US$ 309.000' })
    expect(clasificado.urls()).toEqual([f.urlPegadaPorElUsuario])
    expect(await pedidos()).toBe(1)
  })
})

describe('el tope por usuario', () => {
  const hace = (ms: number) => new Date(Date.now() - ms)

  test(`hasta ${PEDIDOS_AFUERA_POR_DIA} por día: el que pasa da 429 y no se anota`, async () => {
    await h.db.insert(pedidosAfuera).values(Array.from({ length: PEDIDOS_AFUERA_POR_DIA - 1 }, () => ({ userId: ownerId, createdAt: hace(3600_000) })))
    afuera({ 'https://tienda.com.ar/products/mate': { headers: html, cuerpo: pagina('Mate') } })
    expect((await leer({ url: 'https://tienda.com.ar/products/mate' })).status).toBe(200)
    expect(await pedidos()).toBe(PEDIDOS_AFUERA_POR_DIA)
    const s = afuera({})
    const r = await leer({ url: 'https://tienda.com.ar/products/mate' })
    expect(r.status).toBe(429)
    expect(await r.json()).toEqual({ error: 'muchos' })
    expect(s.urls()).toEqual([])
    expect(await pedidos()).toBe(PEDIDOS_AFUERA_POR_DIA)
  })

  test('dos pedidos a la vez no pasan juntos el tope (lock del usuario, como las fotos); de la base, solo users y pedidos_afuera', async () => {
    const { db, consultas } = conConsultas(h.db)
    h.db = db
    afuera({ 'https://tienda.com.ar/products/mate': { headers: html, cuerpo: pagina('Mate') } })
    expect((await leer({ url: 'https://tienda.com.ar/products/mate' })).status).toBe(200)
    const lock = consultas.findIndex((q) => /from "users".*for no key update/i.test(q))
    const cuenta = consultas.findIndex((q) => /count\(\*\).*from "pedidos_afuera"/i.test(q))
    expect(lock).toBeGreaterThanOrEqual(0)
    expect(cuenta).toBeGreaterThan(lock)
    // nada de los deseos, las reservas ni los regalos: la respuesta no puede cambiar según haya reservas (la Sorpresa)
    const tablas = new Set(consultas.flatMap((q) => [...q.matchAll(/(?:from|into|update|join)\s+"(\w+)"/gi)].map((m) => m[1])))
    expect([...tablas].sort()).toEqual(['pedidos_afuera', 'users'])
  })

  test('sin la tabla (un preview con la base sin migrar): no-carga con el nombre del link, sin salir a la red', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await h.db.execute(sql`drop table pedidos_afuera`)
    const s = afuera({})
    const r = await leer({ url: 'https://www.crocs.com.ar/products/crocs-classic-clog' })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ estado: 'no-carga', titulo: 'Crocs classic clog', precio: null, foto: null, sitio: 'crocs.com.ar' })
    expect(s.urls()).toEqual([])
  })
})
