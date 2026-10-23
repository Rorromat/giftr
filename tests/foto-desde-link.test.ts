import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import { count, eq, sql } from 'drizzle-orm'
import sharp from 'sharp'
import { conConsultas, createTestDb, seedOwnerAndGiver, servidor } from './helpers'
import { fotosDeseo, pedidosAfuera } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Pedir } from '@/lib/bajar-foto'
import { FOTOS_POR_DIA, importarFotoDeseo, leerFotoDeseo } from '@/lib/fotos-deseo'
import { esUrlFotoDeseo } from '@/lib/links'
import { PEDIDOS_AFUERA_POR_DIA } from '@/lib/pedidos-afuera'

// POST /api/deseo/foto/desde-link: trae la foto que encontró la lectura del link y la guarda como una subida. La base es
// PGlite, la sesión es de mentira y las fotos las contesta un servidor de mentira (pedirFoto): nada sale a la red.

const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  session: null as { userId: string } | null,
  pedirFoto: undefined as unknown as Pedir,
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session }))
vi.mock('@/lib/bajar-foto', async (original) => ({
  ...await original<typeof import('@/lib/bajar-foto')>(), get pedirFoto() { return h.pedirFoto },
}))

import { POST } from '@/app/api/deseo/foto/desde-link/route'

const ML = 'https://http2.mlstatic.com/D_NQ_NP_931470-MLA89297118039_082025-O.webp'
const ML_GRANDE = 'https://http2.mlstatic.com/D_NQ_NP_931470-MLA89297118039_082025-F.webp'
const NO_DISPONIBLE = 'https://http2.mlstatic.com/resources/frontend/statics/img-not-available/1.0.0/F.jpg'

let ownerId: string
let jpeg: Buffer
let png: Buffer

beforeEach(async () => {
  h.db = await createTestDb()
  ownerId = (await seedOwnerAndGiver(h.db)).owner.id
  h.session = { userId: ownerId }
  h.pedirFoto = servidor({}).pedir
  vi.spyOn(https, 'get').mockImplementation(() => { throw new Error('nada sale a la red') })
  vi.spyOn(http, 'get').mockImplementation(() => { throw new Error('nada sale a la red') })
  jpeg ??= await sharp({ create: { width: 3000, height: 1500, channels: 3, background: '#C8F31D' } })
    .withExif({ IFD0: { Copyright: 'secreto' } }).jpeg().toBuffer()
  png ??= await sharp({ create: { width: 40, height: 40, channels: 3, background: '#FF0000' } }).png().toBuffer()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function traer(url: unknown) {
  return POST(new Request('https://giftr.app/api/deseo/foto/desde-link', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }),
  }))
}

function afuera(respuestas: Parameters<typeof servidor>[0]) {
  const s = servidor(respuestas)
  h.pedirFoto = s.pedir
  return s
}

const pedidos = async () => (await h.db.select({ n: count() }).from(pedidosAfuera).where(eq(pedidosAfuera.userId, ownerId)))[0].n
const fotos = async () => (await h.db.select({ n: count() }).from(fotosDeseo).where(eq(fotosDeseo.userId, ownerId)))[0].n

test('una foto servida como octet-stream: se guarda como una subida, de hasta 1200 px y sin EXIF', async () => {
  const s = afuera({ 'https://cdn.cuspide.com/libro.jpg': { headers: { 'content-type': 'application/octet-stream' }, cuerpo: jpeg } })
  const r = await traer('https://cdn.cuspide.com/libro.jpg')
  expect(r.status).toBe(200)
  const { url } = await r.json()
  expect(esUrlFotoDeseo(url)).toBe(true)
  const guardada = await sharp((await leerFotoDeseo(h.db, url.split('/').at(-1)))!).metadata()
  expect(guardada).toMatchObject({ format: 'jpeg', width: 1200, height: 600 })
  expect(guardada.exif).toBeUndefined()
  expect(s.urls()).toEqual(['https://cdn.cuspide.com/libro.jpg'])
  expect(await pedidos()).toBe(1)
})

test('de ML, primero la grande (-F); si no está, o es la de "imagen no disponible", la del link', async () => {
  const grande = afuera({ [ML_GRANDE]: { headers: { 'content-type': 'image/webp' }, cuerpo: png } })
  expect((await traer(ML)).status).toBe(200)
  expect(grande.urls()).toEqual([ML_GRANDE])
  for (const [caso, respuesta] of [
    ['404', { status: 404, headers: { 'content-type': 'text/html' } }],
    ['img-not-available', { status: 302, headers: { location: NO_DISPONIBLE } }],
  ] as const) {
    const s = afuera({
      [ML_GRANDE]: respuesta,
      [NO_DISPONIBLE]: { headers: { 'content-type': 'image/jpeg' }, cuerpo: png },
      [ML]: { headers: { 'content-type': 'image/webp' }, cuerpo: png },
    })
    const r = await traer(ML)
    expect([caso, r.status]).toEqual([caso, 200])
    expect(s.urls().at(-1)).toBe(ML)
  }
})

test('sin cupo de fotos: 429 muchas, sin bajar nada ni gastar el tope de pedidos', async () => {
  await h.db.insert(fotosDeseo).values(Array.from({ length: FOTOS_POR_DIA }, () => ({ userId: ownerId, datos: png })))
  const s = afuera({})
  const r = await traer(ML)
  expect(r.status).toBe(429)
  expect(await r.json()).toEqual({ error: 'muchas' })
  expect(s.urls()).toEqual([])
  expect(await pedidos()).toBe(0)
})

test('con el tope de pedidos lleno: 429 muchos, sin bajar nada', async () => {
  await h.db.insert(pedidosAfuera).values(Array.from({ length: PEDIDOS_AFUERA_POR_DIA }, () => ({ userId: ownerId })))
  const s = afuera({})
  const r = await traer(ML)
  expect(r.status).toBe(429)
  expect(await r.json()).toEqual({ error: 'muchos' })
  expect(s.urls()).toEqual([])
})

test('el pedido cuenta en el tope aunque la descarga falle: 422; una página o algo que no es una foto: 415', async () => {
  afuera({ [ML_GRANDE]: { status: 404 }, [ML]: { status: 404 } })
  const r = await traer(ML)
  expect(r.status).toBe(422)
  expect(await r.json()).toEqual({ error: 'no_carga' })
  expect(await pedidos()).toBe(1)
  // una página: no es una foto
  afuera({ 'https://tienda.com/producto': { headers: { 'content-type': 'text/html' }, cuerpo: '<html><body>Mate</body></html>' } })
  const pagina = await traer('https://tienda.com/producto')
  expect(pagina.status).toBe(415)
  expect(await pagina.json()).toEqual({ error: 'no_es_imagen' })
  // dice ser una foto (u octet-stream) pero no lo es: lo decide sharp
  afuera({ 'https://tienda.com/falsa.jpg': { headers: { 'content-type': 'application/octet-stream' }, cuerpo: '<html>no</html>' } })
  expect((await traer('https://tienda.com/falsa.jpg')).status).toBe(415)
  expect(await pedidos()).toBe(3)
  expect(await fotos()).toBe(0)
})

test('lo que no es una foto de afuera pública: 400, sin bajar nada; sin sesión, 401', async () => {
  const s = afuera({})
  for (const url of ['https://localhost/x.jpg', 'https://10.0.0.1/x.jpg', 'https://x.com:8443/x.jpg', 'data:image/png;base64,AAAA', '/foto/deseo/x', 42]) {
    expect((await traer(url)).status, String(url)).toBe(400)
  }
  h.session = null
  expect((await traer(ML)).status).toBe(401)
  expect(s.urls()).toEqual([])
  expect(await pedidos()).toBe(0)
})

test('un solo tiempo para la grande y la del link: pasado, no_carga', async () => {
  const s = servidor({
    [ML_GRANDE]: { status: 404, demora: 200 },
    [ML]: { headers: { 'content-type': 'image/webp' }, cuerpo: png, demora: 200 },
  })
  const antes = Date.now()
  expect(await importarFotoDeseo(h.db, ownerId, ML, { pedir: s.pedir, tiempoMs: 300 })).toEqual({ error: 'no_carga' })
  expect(Date.now() - antes).toBeLessThan(550)
  expect(s.urls()).toEqual([ML_GRANDE, ML])
  // y si el que pidió se va, también
  const usuario = new AbortController()
  setTimeout(() => usuario.abort(), 50)
  expect(await importarFotoDeseo(h.db, ownerId, ML, { pedir: s.pedir, signal: usuario.signal })).toEqual({ error: 'no_carga' })
})

test('toca solo users (el lock), pedidos_afuera y fotos_deseo: nada de deseos, reservas ni regalos', async () => {
  const { db, consultas } = conConsultas(h.db)
  const s = servidor({ [ML_GRANDE]: { headers: { 'content-type': 'image/webp' }, cuerpo: png } })
  expect(await importarFotoDeseo(db, ownerId, ML, { pedir: s.pedir })).toMatchObject({ url: expect.stringMatching(/^\/foto\/deseo\//) })
  const tablas = new Set(consultas.flatMap((q) => [...q.matchAll(/(?:from|into|update|join)\s+"(\w+)"/gi)].map((m) => m[1])))
  // items aparece solo en la limpieza de fotos que nadie usa (guardarFotoDeseo, como en cualquier subida): se mira si un
  // deseo usa la foto, no qué deseo ni si está reservado
  expect([...tablas].sort()).toEqual(['fotos_deseo', 'items', 'pedidos_afuera', 'users'])
  expect(consultas.filter((q) => /"(claims|comments|group_gifts|group_gift_members|notifications)"/.test(q))).toEqual([])
})

test('sin la tabla de pedidos (un preview con la base sin migrar): 422, sin salir a la red', async () => {
  await h.db.execute(sql`drop table pedidos_afuera`)
  const s = afuera({})
  expect((await traer(ML)).status).toBe(422)
  expect(s.urls()).toEqual([])
})
