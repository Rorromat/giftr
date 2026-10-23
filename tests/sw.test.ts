import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, test, vi } from 'vitest'
import manifest from '@/app/manifest'
import { BUZON, leerCompartido } from '@/lib/buzon-compartido'
import { ID_COMPARTIDO } from '@/lib/recibir-compartido'

// public/sw.js tal cual, corrido con node:vm: un self y un Cache Storage de mentira, y Response, Request, URL y crypto de
// Node. Lo que guarda el service worker lo lee leerCompartido (el formulario): es el contrato entre los dos.

const CODIGO = readFileSync('public/sw.js', 'utf8')
const BASE = 'https://giftr.test/'
const ML = 'https://articulo.mercadolibre.com.ar/MLA-1418506688-mate-imperial-de-calabaza-_JM'
const TEXTO_ML = `Mirá este producto en Mercado Libre ${ML}`

type Clave = string | URL | Request
type Caja = Map<string, Response>

/** Cache Storage de mentira: una caja por nombre, con las claves resueltas contra el origen (como en el navegador). */
function cachesDeMentira() {
  const cajas = new Map<string, Caja>()
  const url = (k: Clave) => new URL(typeof k === 'string' ? k : k instanceof URL ? k.href : k.url, BASE).href
  const caches = {
    async open(nombre: string) {
      const caja = cajas.get(nombre) ?? new Map<string, Response>()
      cajas.set(nombre, caja)
      return {
        async put(k: Clave, r: Response) { caja.set(url(k), r) },
        async match(k: Clave) { return caja.get(url(k))?.clone() },
        async keys() { return [...caja.keys()].map((u) => new Request(u)) },
        async delete(k: Clave) { return caja.delete(url(k)) },
      }
    },
  }
  return { caches: caches as unknown as CacheStorage, cajas }
}

type Handler = (e: unknown) => void

/** Carga sw.js con un self de mentira; anota los handlers que registra. */
function cargar(o: { caches?: unknown } = {}) {
  const handlers: Record<string, Handler> = {}
  const self = {
    addEventListener: (tipo: string, fn: Handler) => { handlers[tipo] = fn },
    location: new URL('https://giftr.test/sw.js'),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => []), openWindow: vi.fn(async () => null) },
    registration: { showNotification: vi.fn(async () => {}) },
  }
  const propio = cachesDeMentira()
  runInNewContext(CODIGO, { self, caches: o.caches ?? propio.caches, Response, Request, URL, URLSearchParams, crypto })
  return { handlers, self, ...propio }
}

/** Le pasa un pedido al handler de fetch: la respuesta, si llamó a respondWith. */
function pedir(sw: ReturnType<typeof cargar>, request: Request): Promise<Response> | null {
  let respuesta: Promise<Response> | null = null
  sw.handlers.fetch({ request, respondWith: (r: Response | Promise<Response>) => { respuesta = Promise.resolve(r) } })
  return respuesta
}

/** Lo que manda Android al compartir, como un formulario multipart. */
function compartir(campos: Record<string, string | File | File[]>, url = `${BASE}compartir`) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) for (const x of [v].flat()) fd.append(k, x)
  return new Request(url, { method: 'POST', body: fd })
}

const bytes = (n: number, relleno = 7) => new Uint8Array(n).fill(relleno)
const jpeg = (n = 300) => new File([bytes(n)], 'foto.jpg', { type: 'image/jpeg' })

/** Esperar lo que pasó a waitUntil. */
async function conEspera(handler: Handler, extra: Record<string, unknown> = {}) {
  const promesas: Promise<unknown>[] = []
  handler({ waitUntil: (p: Promise<unknown>) => promesas.push(p), ...extra })
  await Promise.all(promesas)
}

test('registra install, activate, fetch, push y notificationclick', () => {
  expect(Object.keys(cargar().handlers).sort()).toEqual(['activate', 'fetch', 'install', 'notificationclick', 'push'])
})

describe('el POST de compartir', () => {
  test('guarda los textos y la foto en el buzón y manda con un 303 a /agregar?compartido=<id>; leerCompartido lo lee igual', async () => {
    const sw = cargar()
    const r = await pedir(sw, compartir({ text: TEXTO_ML, foto: jpeg(300) }))!
    expect(r.status).toBe(303)
    const destino = new URL(r.headers.get('location')!)
    expect(`${destino.origin}${destino.pathname}`).toBe('https://giftr.test/agregar')
    expect([...destino.searchParams.keys()]).toEqual(['compartido'])
    const id = destino.searchParams.get('compartido')!
    expect(id).toMatch(ID_COMPARTIDO)

    const caja = sw.cajas.get(BUZON)!
    expect([...caja.keys()].sort()).toEqual([`${BASE}compartido/${id}`, `${BASE}compartido/${id}/foto`])
    expect(await caja.get(`${BASE}compartido/${id}`)!.clone().json())
      .toEqual({ title: '', text: TEXTO_ML, url: '', foto: true, fotoRechazada: false, en: expect.any(Number) })
    const guardada = await caja.get(`${BASE}compartido/${id}/foto`)!.clone().blob()
    expect(guardada.type).toBe('image/jpeg')
    expect(new Uint8Array(await guardada.arrayBuffer())).toEqual(bytes(300))

    const leido = await leerCompartido(id, sw.caches)
    expect(leido).toEqual({ title: '', text: TEXTO_ML, url: '', foto: expect.any(Blob), fotoRechazada: false })
    expect(leido!.foto!.type).toBe('image/jpeg')
    expect(new Uint8Array(await leido!.foto!.arrayBuffer())).toEqual(bytes(300))
    // otro id, o uno que no es un id, no lee nada
    expect(await leerCompartido('0b6a3a9e-5d2c-4f1e-9a7b-3c4d5e6f7a8b', sw.caches)).toBeNull()
    expect(await leerCompartido('../compartido', sw.caches)).toBeNull()
  })

  test('uno por vez: un segundo compartir borra el primero', async () => {
    const sw = cargar()
    const primero = new URL((await pedir(sw, compartir({ text: ML, foto: jpeg() }))!).headers.get('location')!).searchParams.get('compartido')!
    const segundo = new URL((await pedir(sw, compartir({ text: 'Mate de calabaza' }))!).headers.get('location')!).searchParams.get('compartido')!
    expect(segundo).not.toBe(primero)
    expect([...sw.cajas.get(BUZON)!.keys()]).toEqual([`${BASE}compartido/${segundo}`])
    expect(await leerCompartido(primero, sw.caches)).toBeNull()
    expect(await leerCompartido(segundo, sw.caches)).toMatchObject({ text: 'Mate de calabaza', foto: null, fotoRechazada: false })
  })

  test('cada tipo que acepta el manifest se toma; HEIC, SVG o una de más de 25 MB quedan como rechazada', async () => {
    const accept = [manifest().share_target!.params.files].flat()[0]!.accept
    for (const tipo of [accept].flat()) {
      const sw = cargar()
      const id = new URL((await pedir(sw, compartir({ foto: new File([bytes(10)], 'x', { type: tipo }) }))!).headers.get('location')!)
        .searchParams.get('compartido')!
      const leido = await leerCompartido(id, sw.caches)
      expect(leido?.foto?.type, tipo).toBe(tipo)
      expect(leido?.fotoRechazada, tipo).toBe(false)
    }
    for (const foto of [new File([bytes(10)], 'x.heic', { type: 'image/heic' }), new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }),
      new File([bytes(25_000_001)], 'enorme.jpg', { type: 'image/jpeg' })]) {
      const sw = cargar()
      const id = new URL((await pedir(sw, compartir({ text: ML, foto }))!).headers.get('location')!).searchParams.get('compartido')!
      expect(await leerCompartido(id, sw.caches), foto.type).toEqual({ title: '', text: ML, url: '', foto: null, fotoRechazada: true })
      expect(sw.cajas.get(BUZON)!.size, foto.type).toBe(1)
    }
  })

  test('varias fotos: va la primera que sirve', async () => {
    const sw = cargar()
    const heic = new File([bytes(10)], 'a.heic', { type: 'image/heic' })
    const png = new File([bytes(20, 1)], 'b.png', { type: 'image/png' })
    const id = new URL((await pedir(sw, compartir({ foto: [heic, png, jpeg()] }))!).headers.get('location')!).searchParams.get('compartido')!
    const leido = await leerCompartido(id, sw.caches)
    expect(leido?.foto?.type).toBe('image/png')
    expect(leido?.fotoRechazada).toBe(false)
  })

  test('un GET a /compartir, un POST a otra ruta o a otro origen no los atiende (van a la red)', () => {
    const sw = cargar()
    expect(pedir(sw, new Request(`${BASE}compartir?url=${encodeURIComponent(ML)}`))).toBeNull()
    expect(pedir(sw, compartir({ text: ML }, `${BASE}otra`))).toBeNull()
    expect(pedir(sw, compartir({ text: ML }, `${BASE}compartir/x`))).toBeNull()
    expect(pedir(sw, compartir({ text: ML }, 'https://otro.test/compartir'))).toBeNull()
    expect(sw.cajas.size).toBe(0)
  })

  test('sin Cache Storage, los textos van por la URL al route (sin la foto); un cuerpo roto va a /agregar', async () => {
    const roto = { open: async () => { throw new Error('QuotaExceededError') } }
    const sw = cargar({ caches: roto })
    const r = await pedir(sw, compartir({ title: 'Mate | MercadoLibre', text: TEXTO_ML, foto: jpeg() }))!
    expect(r.status).toBe(303)
    const destino = new URL(r.headers.get('location')!)
    expect(`${destino.origin}${destino.pathname}`).toBe('https://giftr.test/compartir')
    expect(Object.fromEntries(destino.searchParams)).toEqual({ title: 'Mate | MercadoLibre', text: TEXTO_ML, url: '', foto: 'no' })
    // sin foto, sin foto=no
    const sinFoto = new URL((await pedir(sw, compartir({ text: ML }))!).headers.get('location')!)
    expect(sinFoto.searchParams.has('foto')).toBe(false)

    const malo = new Request(`${BASE}compartir`, { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: 'basura' })
    expect((await pedir(cargar(), malo))!.headers.get('location')).toBe('https://giftr.test/agregar')
  })

  test('un texto de 1 MB se guarda cortado', async () => {
    const sw = cargar()
    const id = new URL((await pedir(sw, compartir({ text: 'a'.repeat(1024 * 1024) }))!).headers.get('location')!).searchParams.get('compartido')!
    expect((await leerCompartido(id, sw.caches))!.text).toHaveLength(5000)
  })
})

test('activate: borra lo de más de un día (y una foto sin sus datos) y toma las pestañas abiertas', async () => {
  const sw = cargar()
  const caja = await sw.caches.open(BUZON)
  const sobre = (en: number) => new Response(JSON.stringify({ title: '', text: ML, url: '', foto: true, fotoRechazada: false, en }))
  await caja.put('/compartido/viejo', sobre(Date.now() - 25 * 60 * 60 * 1000))
  await caja.put('/compartido/viejo/foto', new Response(jpeg()))
  await caja.put('/compartido/nuevo', sobre(Date.now() - 60 * 1000))
  await caja.put('/compartido/nuevo/foto', new Response(jpeg()))
  await caja.put('/compartido/huerfana/foto', new Response(jpeg()))
  await caja.put('/compartido/roto', new Response('no es json'))
  await conEspera(sw.handlers.activate)
  expect([...sw.cajas.get(BUZON)!.keys()].sort()).toEqual([`${BASE}compartido/nuevo`, `${BASE}compartido/nuevo/foto`])
  expect(sw.self.clients.claim).toHaveBeenCalledOnce()
  // sin Cache Storage, igual toma las pestañas
  const sinCaches = cargar({ caches: { open: async () => { throw new Error('no') } } })
  await conEspera(sinCaches.handlers.activate)
  expect(sinCaches.self.clients.claim).toHaveBeenCalledOnce()
})

test('install: skipWaiting y los GET directo a la red si el navegador puede; si no puede o tira, no pasa nada', async () => {
  const sw = cargar()
  const addRoutes = vi.fn(async () => {})
  await conEspera(sw.handlers.install, { addRoutes })
  expect(sw.self.skipWaiting).toHaveBeenCalledOnce()
  expect(addRoutes).toHaveBeenCalledWith({ condition: { requestMethod: 'GET' }, source: 'network' })
  await conEspera(sw.handlers.install)
  await conEspera(sw.handlers.install, { addRoutes: () => { throw new TypeError('condición desconocida') } })
  await conEspera(sw.handlers.install, { addRoutes: async () => { throw new TypeError('condición desconocida') } })
  expect(sw.self.skipWaiting).toHaveBeenCalledTimes(4)
})

test('contrato: el buzón se llama igual en sw.js y en el formulario, y el manifest manda lo que leen los dos', () => {
  expect(/const BUZON = '([^']+)'/.exec(CODIGO)?.[1]).toBe(BUZON)
  const st = manifest().share_target!
  expect(st).toMatchObject({ action: '/compartir', method: 'POST', enctype: 'multipart/form-data' })
  expect(st.params).toMatchObject({ title: 'title', text: 'text', url: 'url' })
  const files = [st.params.files].flat()
  expect(files).toHaveLength(1)
  expect(files[0]!.name).toBe('foto')
  expect(files[0]!.accept).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
  // start_url no se toca: es la identidad de la app instalada
  expect(manifest().start_url).toBe('/')
})
