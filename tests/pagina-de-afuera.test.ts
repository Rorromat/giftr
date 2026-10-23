import { afterEach, describe, expect, test, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import http, { type IncomingMessage } from 'node:http'
import https from 'node:https'
import { Readable } from 'node:stream'
import zlib from 'node:zlib'
import { bajarDeAfuera, pedirAfuera, pedirFoto, pedirPagina } from '@/lib/bajar-foto'
import { esUrlPublica } from '@/lib/compartir'
import { aTexto, bajarPagina, estadoDeFalla, leerPagina, PAGINA_MAX_BYTES, UA_GIFTR } from '@/lib/pagina-de-afuera'
import { leerProducto } from '@/lib/producto-del-link'
import { cuerpo, fixture } from './fixtures/links/leer'
import { MB, servidor } from './helpers'

// La página del link que pegó el usuario la baja el servidor: con nuestro User-Agent, siguiendo a mano las redirecciones
// (cada una revisada), con topes de tiempo y de bytes. Acá nada sale a la red: https.get está espiado o el servidor es de
// mentira.

afterEach(() => {
  vi.restoreAllMocks()
})

const html = { 'content-type': 'text/html; charset=utf-8' }
const pagina = (titulo: string) => `<html><head><meta property="og:type" content="product"><meta property="og:title" content="${titulo}"></head></html>`

type Fake = { status?: number; headers?: Record<string, string>; trozos: Iterable<Buffer> }

/** https.get de mentira: contesta por URL (lo que no conoce es "sin red") y anota con qué opciones se lo llamó. */
function httpsDeMentira(respuestas: Record<string, Fake> = {}) {
  const llamadas: { url: string; opciones: https.RequestOptions }[] = []
  const falso = (url: string | URL, opciones: https.RequestOptions, cb: (res: IncomingMessage) => void) => {
    llamadas.push({ url: String(url), opciones })
    const req = new EventEmitter()
    const r = respuestas[String(url)]
    queueMicrotask(() => {
      if (!r) return req.emit('error', new Error('sin red'))
      cb(Object.assign(Readable.from(r.trozos), { statusCode: r.status ?? 200, headers: r.headers ?? html }) as unknown as IncomingMessage)
    })
    return req
  }
  vi.spyOn(https, 'get').mockImplementation(falso as unknown as typeof https.get)
  return llamadas
}

describe('cómo nos presentamos', () => {
  test('un bot con nombre propio, y nada de headers de navegador ni de otro servicio', async () => {
    const llamadas = httpsDeMentira()
    for (const pedir of [pedirPagina, pedirFoto, pedirAfuera]) {
      await expect(pedir('https://www.tienda.com.ar/products/mate', AbortSignal.timeout(2000))).rejects.toThrow('sin red')
    }
    for (const { opciones } of llamadas) {
      const headers = Object.fromEntries(Object.entries(opciones.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]))
      expect(headers['user-agent']).toBe(UA_GIFTR)
      expect(Object.keys(headers).filter((k) => /^(cookie|referer|sec-|upgrade-insecure|dnt$)/.test(k))).toEqual([])
      expect(opciones).toMatchObject({ agent: false, lookup: expect.any(Function) })
    }
    expect(UA_GIFTR).toMatch(/^Mozilla\/5\.0 \(compatible; GiftRBot\/1\.0(; \+https:\/\/[^\s)]+\/bot)?\)$/)
    expect(UA_GIFTR).not.toMatch(/facebookexternalhit|WhatsApp|Twitterbot|Googlebot|MercadoLibre-|curl|Chrome|Safari/i)
    const pagina = llamadas[0].opciones.headers as Record<string, string>
    expect(pagina['accept-language']).toMatch(/^es-AR/)
    expect(pagina.accept).toMatch(/^text\/html/)
    expect(pagina['accept-encoding']).toBe('gzip, deflate, br')
    expect((llamadas[1].opciones.headers as Record<string, string>).accept).toMatch(/^image\//)
  })

  test('el User-Agent lleva la página que explica qué es GiftRBot', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://giftr.example.com/')
    vi.resetModules()
    try {
      const { UA_GIFTR: ua } = await import('@/lib/pagina-de-afuera')
      expect(ua).toBe('Mozilla/5.0 (compatible; GiftRBot/1.0; +https://giftr.example.com/bot)')
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})

describe('tamaño y compresión', () => {
  test('una página de 5 MB: se leen los primeros 4 MB, y las og del principio sirven', async () => {
    const grande = pagina('Mate imperial') + `<p>${'x'.repeat(5 * MB)}</p>`
    const s = servidor({ 'https://x.com/p': { headers: html, cuerpo: grande, trozoBytes: 256 * 1024 } })
    const r = await bajarPagina('https://x.com/p', s.pedir)
    expect(r).toMatchObject({ cortado: true, urlFinal: 'https://x.com/p' })
    if (!('html' in r)) throw new Error('no bajó')
    expect(r.html.length).toBe(PAGINA_MAX_BYTES)
    expect(s.entregados()).toBeLessThan(4.5 * MB)
    expect(leerProducto(r.html, r.urlFinal)).toMatchObject({ estado: 'ok', producto: { titulo: 'Mate imperial' } })
  })

  test('el JSON-LD de Crocs está a 1,76 MB: se encuentra', async () => {
    const ld = { '@type': 'Product', name: 'Crocs Classic', offers: { price: '99.999', priceCurrency: 'ARS' }, image: 'https://cdn.crocs.com/a.jpg' }
    const s = servidor({
      'https://www.crocs.com.ar/products/crocs-classic': {
        headers: html, cuerpo: `<html><body>${' '.repeat(1_760_000)}<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
      },
    })
    expect(await leerPagina('https://www.crocs.com.ar/products/crocs-classic', s.pedir)).toMatchObject({
      estado: 'ok', producto: { titulo: 'Crocs Classic', precio: '$99.999', foto: 'https://cdn.crocs.com/a.jpg' },
    })
  })

  test('gzip, deflate y br llegan descomprimidos', async () => {
    const texto = Buffer.from(pagina('Mate imperial'))
    for (const [codificacion, comprimido] of [
      ['gzip', zlib.gzipSync(texto)], ['deflate', zlib.deflateSync(texto)], ['br', zlib.brotliCompressSync(texto)], ['identity', texto],
    ] as const) {
      httpsDeMentira({ 'https://x.com/p': { headers: { ...html, 'content-encoding': codificacion, 'content-length': String(comprimido.length) }, trozos: [comprimido] } })
      expect(await leerPagina('https://x.com/p'), codificacion).toMatchObject({ estado: 'ok', producto: { titulo: 'Mate imperial' } })
      vi.restoreAllMocks()
    }
  })

  test('una bomba gzip se corta a los 4 MB descomprimidos, sin descomprimirla entera', async () => {
    const miembro = zlib.gzipSync(Buffer.alloc(10 * MB, 'a')) // unos 10 KB que son 10 MB: 40 de estos son 400 MB
    let entregados = 0
    function* bomba() {
      for (let i = 0; i < 40; i++) {
        entregados++
        yield miembro
      }
    }
    httpsDeMentira({ 'https://x.com/bomba': { headers: { ...html, 'content-encoding': 'gzip' }, trozos: bomba() } })
    const r = await bajarPagina('https://x.com/bomba')
    expect(r).toMatchObject({ cortado: true })
    expect('html' in r && r.html.length).toBe(PAGINA_MAX_BYTES)
    // lo que se pidió de más es lo que el stream lee por adelantado, no lo que se descomprimió
    expect(entregados).toBeLessThan(20)
  })

  test('una codificación que no conocemos no se lee', async () => {
    httpsDeMentira({ 'https://x.com/p': { headers: { ...html, 'content-encoding': 'zstd' }, trozos: [Buffer.from(pagina('X'))] } })
    expect(await bajarPagina('https://x.com/p')).toEqual({ falla: 'no-carga', urlProducto: 'https://x.com/p' })
  })
})

test('el status de afuera, en grueso (y nunca tal cual)', async () => {
  for (const [status, estado] of [
    [202, 'bloqueado'], [401, 'bloqueado'], [403, 'bloqueado'], [418, 'bloqueado'], [429, 'bloqueado'], [451, 'bloqueado'],
    [503, 'bloqueado'], [404, 'no-esta'], [410, 'no-esta'], [500, 'no-carga'], [502, 'no-carga'], [204, 'no-carga'], [206, 'no-carga'],
    [304, 'no-carga'],
  ] as const) {
    const s = servidor({ 'https://x.com/p': { status, headers: html, cuerpo: pagina('Algo') } })
    const r = await leerPagina('https://x.com/p', s.pedir)
    expect([status, r.estado], String(status)).toEqual([status, estado])
    expect(r.producto).toEqual({ titulo: null, precio: null, foto: null })
  }
  // con 200, solo HTML: el 429 de ML viene en JSON, pero el status ya dice bloqueado
  for (const [status, tipo, estado] of [
    [200, 'application/json', 'no-carga'], [200, 'image/png', 'no-carga'], [200, '', 'no-carga'], [429, 'application/json', 'bloqueado'],
    [200, 'application/xhtml+xml', 'ok'], [200, 'TEXT/HTML', 'ok'],
  ] as const) {
    const s = servidor({ 'https://x.com/p': { status, headers: { 'content-type': tipo }, cuerpo: pagina('Algo') } })
    expect((await leerPagina('https://x.com/p', s.pedir)).estado, tipo).toBe(estado)
  }
})

describe('redirecciones', () => {
  const salto = (a: string) => ({ status: 301, headers: { location: a } })

  test('hasta 5 saltos, cada uno revisado, y la URL final es la del último', async () => {
    const cadena = (n: number) => Object.fromEntries(Array.from({ length: n + 1 }, (_, i) => [
      `https://a.com/${i}`, i < n ? salto(`/${i + 1}`) : { headers: html, cuerpo: pagina('Fin') },
    ]))
    const cinco = servidor(cadena(5))
    expect(await bajarPagina('https://a.com/0', cinco.pedir)).toMatchObject({ urlFinal: 'https://a.com/5' })
    const seis = servidor(cadena(6))
    expect(await bajarPagina('https://a.com/0', seis.pedir)).toEqual({ falla: 'no-carga', urlProducto: 'https://a.com/5' })
    expect(seis.urls()).not.toContain('https://a.com/6')
  })

  test('a la red interna, a otro puerto o a un esquema que no es web no se sigue: ni se pide', async () => {
    for (const destino of ['https://10.0.0.1/x', 'https://localhost./x', 'https://db.internal/x', 'https://x.com:8443/x', 'file:///etc/passwd', 'https://[::1]/x']) {
      const s = servidor({ 'https://a.com/p': salto(destino) })
      expect(await bajarPagina('https://a.com/p', s.pedir), destino).toEqual({ falla: 'no-permitida', urlProducto: 'https://a.com/p' })
      expect(s.urls()).toEqual(['https://a.com/p'])
    }
    const s = servidor({})
    expect(await bajarPagina('https://127.0.0.1/p', s.pedir)).toEqual({ falla: 'no-permitida', urlProducto: null })
    expect(s.urls()).toEqual([])
  })

  test('un http:// (pegado o en un Location) se pide por https: nunca se abre una conexión sin TLS', async () => {
    const s = servidor({
      'https://tienda.com/p': salto('http://www.tienda.com/p'),
      'https://www.tienda.com/p': { headers: html, cuerpo: pagina('Mate') },
    })
    expect(await bajarPagina('http://tienda.com/p', s.pedir)).toMatchObject({ urlFinal: 'https://www.tienda.com/p' })
    expect(s.urls()).toEqual(['https://tienda.com/p', 'https://www.tienda.com/p'])
    // con el pedido de verdad: https.get con https, y http.get nunca
    const sinTls = vi.spyOn(http, 'get')
    const llamadas = httpsDeMentira()
    expect(await bajarPagina('http://www.tienda.com/p')).toEqual({ falla: 'no-carga', urlProducto: 'https://www.tienda.com/p' })
    expect(llamadas.map((l) => l.url)).toEqual(['https://www.tienda.com/p'])
    expect(sinTls).not.toHaveBeenCalled()
  })

  test('al muro de ML no se le pide nada: bloqueada, y el nombre sale de la publicación', async () => {
    const f = fixture('mercadolibre-10')
    const s = servidor({ [f.urlPegadaPorElUsuario]: { status: 302, headers: { location: f.cadenaDeRespuestas[0].location! } } })
    expect(await bajarPagina(f.urlPegadaPorElUsuario, s.pedir)).toEqual({ falla: 'bloqueada', urlProducto: f.urlPegadaPorElUsuario })
    expect(s.urls()).toEqual([f.urlPegadaPorElUsuario])
    expect(await leerPagina(f.urlPegadaPorElUsuario, s.pedir)).toMatchObject({
      estado: 'bloqueado', producto: { titulo: 'Mate de algarrobo premium artesanal con bombilla', foto: null, precio: null },
    })
    // pegado el muro mismo, tampoco: el nombre sale de go=
    expect(await bajarPagina(f.urlFinal, s.pedir)).toEqual({ falla: 'bloqueada', urlProducto: f.urlPegadaPorElUsuario })
    expect(s.urls()).toHaveLength(2)
  })

  test('con ML_PEDIR_MARKETPLACE apagado, meli.la → articulo no pide articulo (el nombre sale de ahí)', async () => {
    const articulo = 'https://articulo.mercadolibre.com.ar/MLA-1418506688-mate-de-algarrobo-premium-artesanal-con-bombilla-_JM'
    const respuestas = { 'https://meli.la/2abcXYZ': { status: 301, headers: { location: articulo } }, [articulo]: { status: 403, headers: html } }
    // prendido (como está), se pide: así los logs dicen cuánto bloquea el muro
    const prendido = servidor(respuestas)
    expect(await bajarPagina('https://meli.la/2abcXYZ', prendido.pedir)).toEqual({ falla: 'bloqueada', urlProducto: articulo })
    expect(prendido.urls()).toEqual(['https://meli.la/2abcXYZ', articulo])
    vi.resetModules()
    vi.doMock('@/lib/mercadolibre', async (original) => ({ ...await original<typeof import('@/lib/mercadolibre')>(), ML_PEDIR_MARKETPLACE: false }))
    try {
      const { bajarPagina: bajar, leerPagina: leer } = await import('@/lib/pagina-de-afuera')
      const apagado = servidor(respuestas)
      expect(await bajar('https://meli.la/2abcXYZ', apagado.pedir)).toEqual({ falla: 'bloqueada', urlProducto: articulo })
      expect(apagado.urls()).toEqual(['https://meli.la/2abcXYZ'])
      expect((await leer('https://meli.la/2abcXYZ', apagado.pedir)).producto.titulo).toBe('Mate de algarrobo premium artesanal con bombilla')
      // un clasificado sí se pide
      const auto = 'https://auto.mercadolibre.com.ar/MLA-1579719973-toyota-hilux-_JM'
      const clasificado = servidor({ [auto]: { headers: html, cuerpo: pagina('Toyota Hilux') } })
      expect(await bajar(auto, clasificado.pedir)).toMatchObject({ urlFinal: auto })
    } finally {
      vi.doUnmock('@/lib/mercadolibre')
      vi.resetModules()
    }
  })

  test('un solo tiempo para toda la cadena, y se corta si el que pidió se va', async () => {
    const lento = (a: string) => ({ ...salto(a), demora: 150 })
    const s = servidor({
      'https://lento.com/1': lento('/2'), 'https://lento.com/2': lento('/3'), 'https://lento.com/3': lento('/4'),
      'https://lento.com/4': { headers: html, cuerpo: pagina('X'), demora: 150 },
    })
    const opciones = { max: MB, saltos: 5, aceptar: () => true, siSePasa: 'cortar' as const }
    let antes = Date.now()
    expect(await bajarDeAfuera('https://lento.com/1', s.pedir, esUrlPublica, { ...opciones, tiempoMs: 200 })).toEqual({ falla: 'no-carga', urlProducto: 'https://lento.com/2' })
    expect(Date.now() - antes).toBeLessThan(450)
    antes = Date.now()
    const usuario = new AbortController()
    setTimeout(() => usuario.abort(), 100)
    expect(await bajarDeAfuera('https://lento.com/1', s.pedir, esUrlPublica, { ...opciones, tiempoMs: 5000, signal: usuario.signal }))
      .toMatchObject({ falla: 'no-carga' })
    expect(Date.now() - antes).toBeLessThan(400)
  })
})

describe('redirecciones de los fixtures', () => {
  test('meli.la (mercadolibre-16) a una publicación que ya no existe (mercadolibre-9): no-esta, con el nombre del Location', async () => {
    const corto = fixture('mercadolibre-16')
    const viejo = fixture('mercadolibre-9')
    const destino = corto.cadenaDeRespuestas[0].location!
    const s = servidor({
      [corto.urlPegadaPorElUsuario]: { status: 301, headers: { location: destino, 'content-type': corto.contentType! }, cuerpo: cuerpo('mercadolibre-16') },
      [destino]: { status: viejo.status, headers: { 'content-type': viejo.contentType! }, cuerpo: cuerpo('mercadolibre-9') },
    })
    expect(await leerPagina('https://meli.la/2abcXYZ', s.pedir)).toEqual({
      estado: 'no-esta', producto: { titulo: 'Nissan altima 25 advance mt sedan', precio: null, foto: null }, urlProducto: destino,
    })
    // el host del Location tal cual: nunca se cambia un host de ML por otro
    expect(s.urls()).toEqual(['https://meli.la/2abcXYZ', destino])
  })

  /** El servidor de un acortador: la respuesta del fixture, y la que le digan para el destino. */
  function acortador(caso: string, destino?: { status?: number; headers?: Record<string, string>; cuerpo?: string | Buffer }) {
    const f = fixture(caso)
    const [r] = f.cadenaDeRespuestas
    const location = new URL(r.location!, f.urlPegadaPorElUsuario).toString().replace(/^http:/, 'https:')
    return {
      location,
      s: servidor({
        [f.urlPegadaPorElUsuario]: { status: r.status, headers: { location: r.location!, 'content-type': r.contentType ?? 'text/html' }, cuerpo: cuerpo(caso) },
        ...(destino && { [location]: { headers: html, ...destino } }),
      }),
    }
  }

  test('amzn.to, a.co y bit.ly van a donde digan: lo que dé esa página, nunca un error', async () => {
    for (const caso of ['acortador-1', 'acortador-2', 'acortador-3']) {
      const { s, location } = acortador(caso, { cuerpo: '<html><head><title>Lista de recomendados</title></head></html>' })
      const r = await leerPagina(fixture(caso).urlPegadaPorElUsuario, s.pedir)
      expect([caso, r.estado, r.urlProducto]).toEqual([caso, 'sin-datos', location])
      const conProducto = acortador(caso, { cuerpo: pagina('Echo Dot') })
      expect(await leerPagina(fixture(caso).urlPegadaPorElUsuario, conProducto.s.pedir)).toMatchObject({ estado: 'ok', producto: { titulo: 'Echo Dot' } })
    }
  })

  test('s.click.aliexpress termina en una página que redirige por JS: sin-datos', async () => {
    const { s, location } = acortador('acortador-4', { cuerpo: cuerpo('aliexpress-4') })
    expect(await leerPagina('https://s.click.aliexpress.com/e/_EuGprMV', s.pedir)).toMatchObject({ estado: 'sin-datos', urlProducto: location })
  })

  test('youtu.be a youtube.com, que contesta 429: bloqueado', async () => {
    const { s } = acortador('acortador-5', { status: 429, cuerpo: cuerpo('youtube-1') })
    expect((await leerPagina('https://youtu.be/dQw4w9WgXcQ', s.pedir)).estado).toBe('bloqueado')
  })

  test('un spotify.link o un amzn.to inválidos van a la home: sin-datos, sin pedirla (y la de Amazon era http)', async () => {
    for (const caso of ['acortador-6', 'acortador-7']) {
      const { s } = acortador(caso)
      const r = await leerPagina(fixture(caso).urlPegadaPorElUsuario, s.pedir)
      expect([caso, r.estado, r.producto.titulo]).toEqual([caso, 'sin-datos', null])
      expect(s.urls()).toEqual([fixture(caso).urlPegadaPorElUsuario])
    }
    // pegada la home, sí se pide: puede ser un bloqueo
    const s = servidor({ 'https://www.nike.com.ar/': { status: 403, headers: html, cuerpo: cuerpo('nike-ar-1') } })
    expect((await leerPagina('https://www.nike.com.ar/', s.pedir)).estado).toBe('bloqueado')
  })
})

describe('charset', () => {
  const cafe = (enc: BufferEncoding | 'latin1') => Buffer.from('<title>Café</title>', enc)

  test('por BOM, por header, por <meta>, y si no utf-8', () => {
    expect(aTexto(cafe('latin1'), 'text/html; charset=ISO-8859-1')).toContain('Café')
    expect(aTexto(cafe('latin1'), 'text/html; charset="windows-1252"')).toContain('Café')
    expect(aTexto(Buffer.concat([Buffer.from('<meta charset="windows-1252">'), cafe('latin1')]), 'text/html')).toContain('Café')
    expect(aTexto(Buffer.concat([Buffer.from('<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">'), cafe('latin1')]), null)).toContain('Café')
    expect(aTexto(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), cafe('utf8')]), 'text/html')).toBe('<title>Café</title>')
    expect(aTexto(Buffer.concat([Buffer.from([0xff, 0xfe]), cafe('utf16le')]), 'text/html')).toBe('<title>Café</title>')
    expect(aTexto(cafe('utf8'), 'text/html')).toBe('<title>Café</title>')
  })

  test('el BOM gana al header, como en los navegadores (y no queda en el texto)', () => {
    const bomUtf8 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), cafe('utf8')])
    expect(aTexto(bomUtf8, 'text/html; charset=iso-8859-1')).toBe('<title>Café</title>')
    expect(aTexto(Buffer.concat([Buffer.from([0xff, 0xfe]), cafe('utf16le')]), 'text/html; charset=utf-8')).toBe('<title>Café</title>')
    expect(aTexto(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(cafe('utf16le')).swap16()]), 'text/html; charset=utf-8')).toBe('<title>Café</title>')
  })

  test('el del header gana al del <meta>, y un label que no existe se lee como utf-8', () => {
    expect(aTexto(Buffer.concat([Buffer.from('<meta charset="windows-1252">'), cafe('utf8')]), 'text/html; charset=utf-8')).toContain('Café')
    expect(aTexto(cafe('utf8'), 'text/html; charset=no-existe')).toBe('<title>Café</title>')
    expect(aTexto(Buffer.concat([Buffer.from('<meta charset="x-inventado">'), cafe('utf8')]), null)).toContain('Café')
  })

  test('de punta a punta: una tienda en latin1', async () => {
    const s = servidor({ 'https://x.com.ar/p': { headers: { 'content-type': 'text/html; charset=iso-8859-1' }, cuerpo: Buffer.from(pagina('Café molido'), 'latin1') } })
    expect(await leerPagina('https://x.com.ar/p', s.pedir)).toMatchObject({ estado: 'ok', producto: { titulo: 'Café molido' } })
  })
})

test('cada falla, en lo que ve el usuario', () => {
  expect(estadoDeFalla('bloqueada')).toBe('bloqueado')
  expect(estadoDeFalla('no-esta')).toBe('no-esta')
  expect(estadoDeFalla('sin-datos')).toBe('sin-datos')
  for (const f of ['no-carga', 'no-permitida', 'otro-tipo'] as const) expect(estadoDeFalla(f)).toBe('no-carga')
})
