import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { UA_GIFTR } from '@/lib/giftrbot'

// La API oficial de MercadoLibre (leerDeLaApi): fetch es de mentira, con las formas de las respuestas de la API. Nada sale
// a la red. Cada test carga el módulo de nuevo: el token queda en memoria del módulo.

const ARTICULO = 'https://articulo.mercadolibre.com.ar/MLA-1418506688-mate-de-algarrobo-premium-artesanal-con-bombilla-_JM'
const CATALOGO = 'https://www.mercadolibre.com.ar/termo-original-stanley-mate-system-12-litros-rosa/p/MLA39939183'
const API = 'https://api.mercadolibre.com'

const TOKEN = {
  access_token: 'APP_USR-1234567890123456-102217-0123456789abcdef0123456789abcdef-987654321', token_type: 'Bearer',
  expires_in: 21600, scope: 'offline_access read write', user_id: 987654321,
}
const foto = (id: string, sufijo: string) => `http2.mlstatic.com/D_${id}-${sufijo}.jpg`
const ITEM = {
  id: 'MLA1418506688', site_id: 'MLA', title: 'Mate De Algarrobo Premium Artesanal Con Bombilla ', seller_id: 123456789,
  category_id: 'MLA412348', price: 88990, base_price: 88990, original_price: null, currency_id: 'ARS', initial_quantity: 12,
  available_quantity: 7, sold_quantity: 5, buying_mode: 'buy_it_now', listing_type_id: 'gold_special', condition: 'new',
  permalink: ARTICULO, thumbnail_id: '931470-MLA89297118039_082025', thumbnail: `http://${foto('931470-MLA89297118039_082025', 'I')}`,
  pictures: [
    {
      id: '931470-MLA89297118039_082025', url: `http://${foto('931470-MLA89297118039_082025', 'O')}`,
      secure_url: `https://${foto('931470-MLA89297118039_082025', 'O')}`, size: '500x500', max_size: '1200x1200', quality: '',
    },
    { id: '2', url: `http://${foto('2', 'O')}`, secure_url: `https://${foto('2', 'O')}`, size: '500x500', max_size: '1200x1200', quality: '' },
  ],
  accepts_mercadopago: true, shipping: { free_shipping: true }, attributes: [], status: 'active', sub_status: [], tags: [],
  catalog_product_id: null, domain_id: 'MLA-MATES', date_created: '2024-03-01T12:00:00.000Z', health: 0.85,
}
const PRODUCTO = {
  id: 'MLA39939183', status: 'active', domain_id: 'MLA-THERMOSES', permalink: CATALOGO,
  name: 'Termo Original Stanley Mate System 1.2 Litros Rosa', family_name: 'Termo Stanley Mate System',
  buy_box_winner: {
    item_id: 'MLA3070371712', category_id: 'MLA1234', seller_id: 1, price: 189990, currency_id: 'ARS', original_price: null,
    condition: 'new', listing_type_id: 'gold_pro', shipping: { free_shipping: true },
  },
  pictures: [{
    id: '890900-MLA99920915325_112025', url: 'https://http2.mlstatic.com/D_NQ_NP_890900-MLA99920915325_112025-F.jpg',
    suggested_for_picker: [], max_width: 1200, max_height: 1200, source_metadata: null, tags: [],
  }],
  attributes: [], short_description: { type: 'plaintext', content: '' }, parent_id: 'MLA25959040', children_ids: [],
}

const respuesta = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Llamada = { metodo: string; url: string; headers: Record<string, string>; cuerpo: string; redirect?: string }

/** fetch de mentira: por "MÉTODO url", lo que contesta cada vez (la última se repite). Lo que no conoce es un error. */
function apiDeMentira(rutas: Record<string, (() => Response | Promise<Response>)[]>) {
  const llamadas: Llamada[] = []
  const veces: Record<string, number> = {}
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const clave = `${init.method ?? 'GET'} ${String(url)}`
    llamadas.push({
      metodo: init.method ?? 'GET', url: String(url), headers: Object.fromEntries(new Headers(init.headers).entries()),
      cuerpo: String(init.body ?? ''), redirect: init.redirect,
    })
    init.signal?.throwIfAborted()
    const lista = rutas[clave]
    if (!lista) throw new Error(`no esperaba ${clave}`)
    const n = veces[clave] = (veces[clave] ?? 0) + 1
    return lista[Math.min(n, lista.length) - 1]()
  }))
  return llamadas
}

const token = () => respuesta(TOKEN)
const conToken = (rutas: Record<string, (() => Response | Promise<Response>)[]>) => apiDeMentira({ [`POST ${API}/oauth/token`]: [token], ...rutas })

async function api() {
  vi.resetModules()
  return import('@/lib/mercadolibre')
}

beforeEach(() => {
  vi.stubEnv('MELI_CLIENT_ID', '1234567890123456')
  vi.stubEnv('MELI_CLIENT_SECRET', 'clave-secreta-de-la-app')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** Todo pedido va a la API, con un id validado: nunca una URL armada con texto del link. */
function soloLaApi(llamadas: Llamada[]) {
  for (const l of llamadas) expect(l.url).toMatch(/^https:\/\/api\.mercadolibre\.com\/(oauth\/token|items\/M[A-Z]{2}\d{5,15}|products\/M[A-Z]{2}\d{5,15})$/)
}

test('sin las dos credenciales no se usa: null, sin ningún pedido', async () => {
  const llamadas = apiDeMentira({})
  for (const [id, clave] of [['', 'x'], ['x', ''], ['', '']]) {
    vi.stubEnv('MELI_CLIENT_ID', id)
    vi.stubEnv('MELI_CLIENT_SECRET', clave)
    const { hayApiDeMercadoLibre, leerDeLaApi } = await api()
    expect(hayApiDeMercadoLibre()).toBe(false)
    expect(await leerDeLaApi(ARTICULO)).toBeNull()
  }
  expect(llamadas).toEqual([])
})

describe('una publicación', () => {
  test('token de la aplicación y /items/{id}: nombre, foto y precio, limpios como los de la página', async () => {
    const llamadas = conToken({ [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)] })
    const { leerDeLaApi } = await api()
    expect(await leerDeLaApi(ARTICULO)).toEqual({
      estado: 'ok',
      producto: { titulo: 'Mate De Algarrobo Premium Artesanal Con Bombilla', precio: '$88.990', foto: `https://${foto('931470-MLA89297118039_082025', 'O')}` },
    })
    soloLaApi(llamadas)
    const [pedirToken, item] = llamadas
    expect(pedirToken).toMatchObject({ metodo: 'POST', redirect: 'error' })
    expect(pedirToken.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(Object.fromEntries(new URLSearchParams(pedirToken.cuerpo))).toEqual({
      grant_type: 'client_credentials', client_id: '1234567890123456', client_secret: 'clave-secreta-de-la-app',
    })
    expect(item).toMatchObject({ metodo: 'GET', url: `${API}/items/MLA1418506688`, redirect: 'error' })
    expect(item.headers).toMatchObject({ authorization: `Bearer ${TOKEN.access_token}`, 'user-agent': UA_GIFTR })
    // la clave nunca va en la URL
    expect(llamadas.map((l) => l.url).join()).not.toContain('clave-secreta')
  })

  test('cerrada: no-esta; pausada o en revisión: se completa igual (como con la página)', async () => {
    for (const [status, estado] of [['closed', 'no-esta'], ['paused', 'ok'], ['under_review', 'ok'], ['active', 'ok']]) {
      conToken({ [`GET ${API}/items/MLA1418506688`]: [() => respuesta({ ...ITEM, status })] })
      const { leerDeLaApi } = await api()
      expect((await leerDeLaApi(ARTICULO))?.estado, status).toBe(estado)
    }
  })

  test('sin pictures, el thumbnail pasado a https; una foto que no es pública no se usa', async () => {
    const thumb = `https://${foto('931470-MLA89297118039_082025', 'I')}`
    for (const pictures of [[], null, [{ id: '1', secure_url: 'https://localhost/x.jpg', url: 'http://10.0.0.1/x.jpg' }], [null], 'raro']) {
      conToken({ [`GET ${API}/items/MLA1418506688`]: [() => respuesta({ ...ITEM, pictures })] })
      const { leerDeLaApi } = await api()
      expect(await leerDeLaApi(ARTICULO), JSON.stringify(pictures)).toMatchObject({ producto: { foto: thumb } })
    }
    conToken({ [`GET ${API}/items/MLA1418506688`]: [() => respuesta({ ...ITEM, pictures: [], thumbnail: 'javascript:alert(1)' })] })
    expect(await (await api()).leerDeLaApi(ARTICULO)).toMatchObject({ estado: 'ok', producto: { foto: null } })
  })

  test('el precio: pesos o dólares; otra moneda o un precio raro, sin precio', async () => {
    for (const [price, currency_id, precio] of [
      [88990, 'ARS', '$88.990'], [309000, 'USD', 'US$ 309.000'], [79.99, 'USD', 'US$ 79,99'], [120, 'BRL', null], [1500, 'MXN', null],
      [0, 'ARS', null], [-5, 'ARS', null], ['88990', 'ARS', '$88.990'], [null, 'ARS', null], [88990, null, '$88.990'],
    ] as const) {
      conToken({ [`GET ${API}/items/MLA1418506688`]: [() => respuesta({ ...ITEM, price, currency_id })] })
      const { leerDeLaApi } = await api()
      expect(await leerDeLaApi(ARTICULO), `${price} ${currency_id}`).toMatchObject({ estado: 'ok', producto: { precio } })
    }
  })

  test('el título: sin entidades ni tags, y de hasta 120 en una palabra', async () => {
    const largo = `Mate &amp; bombilla <b>premium</b> ${'artesanal '.repeat(20)}`
    conToken({ [`GET ${API}/items/MLA1418506688`]: [() => respuesta({ ...ITEM, title: largo })] })
    const r = await (await api()).leerDeLaApi(ARTICULO)
    const titulo = r?.estado === 'ok' ? r.producto.titulo! : ''
    expect(titulo.startsWith('Mate & bombilla premium artesanal')).toBe(true)
    expect(titulo.length).toBeLessThanOrEqual(120)
    expect(titulo.endsWith('artesanal')).toBe(true)
  })
})

describe('catálogo y /up/', () => {
  test('un catálogo sin item: /products, con el precio de la publicación que gana', async () => {
    const llamadas = conToken({ [`GET ${API}/products/MLA39939183`]: [() => respuesta(PRODUCTO)] })
    expect(await (await api()).leerDeLaApi(CATALOGO)).toEqual({
      estado: 'ok',
      producto: {
        titulo: 'Termo Original Stanley Mate System 1.2 Litros Rosa', precio: '$189.990',
        foto: 'https://http2.mlstatic.com/D_NQ_NP_890900-MLA99920915325_112025-F.jpg',
      },
    })
    soloLaApi(llamadas)
    // sin ganadora (nadie lo vende ahora): sin precio, pero con nombre y foto
    conToken({ [`GET ${API}/products/MLA39939183`]: [() => respuesta({ ...PRODUCTO, buy_box_winner: null })] })
    expect(await (await api()).leerDeLaApi(CATALOGO)).toMatchObject({ estado: 'ok', producto: { titulo: PRODUCTO.name, precio: null } })
  })

  test('un catálogo o un /up/ con el item elegido: /items de ese item', async () => {
    for (const url of [
      `${CATALOGO}?pdp_filters=item_id%3AMLA3070371712`,
      'https://www.mercadolibre.com.ar/canasta-matera/up/MLAU3409701436?pdp_filters=item_id%3AMLA3070371712',
      'https://www.mercadolibre.com.ar/canasta-matera/up/MLAU3409701436#polycard_client=x&wid=MLA3070371712',
    ]) {
      const llamadas = conToken({ [`GET ${API}/items/MLA3070371712`]: [() => respuesta({ ...ITEM, id: 'MLA3070371712' })] })
      expect(await (await api()).leerDeLaApi(url), url).toMatchObject({ estado: 'ok' })
      expect(llamadas.at(-1)?.url).toBe(`${API}/items/MLA3070371712`)
    }
  })

  test('sin un id para la API (un /up/ sin item, un link corto, una tienda, otro sitio): null, sin pedir nada', async () => {
    const llamadas = apiDeMentira({})
    const { leerDeLaApi } = await api()
    for (const url of [
      'https://www.mercadolibre.com.ar/canasta-matera/up/MLAU3409701436', 'https://meli.la/2abcXYZ', 'https://www.mercadolibre.com.ar/tienda/laska',
      'https://www.crocs.com.ar/products/x', 'https://mercadolibre.com.ar.evil.com/MLA-1418506688-mate-_JM', 'no es un link',
    ]) expect(await leerDeLaApi(url), url).toBeNull()
    expect(llamadas).toEqual([])
  })
})

describe('el token', () => {
  test('se reusa hasta un minuto antes de que venza; después se pide otro', async () => {
    const llamadas = conToken({ [`GET ${API}/items/MLA1418506688`]: [() => respuesta(ITEM)] })
    const { leerDeLaApi } = await api()
    const ahora = Date.now()
    const reloj = vi.spyOn(Date, 'now').mockReturnValue(ahora)
    await leerDeLaApi(ARTICULO)
    await leerDeLaApi(ARTICULO)
    reloj.mockReturnValue(ahora + (TOKEN.expires_in - 61) * 1000)
    await leerDeLaApi(ARTICULO)
    expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(1)
    reloj.mockReturnValue(ahora + (TOKEN.expires_in - 59) * 1000)
    await leerDeLaApi(ARTICULO)
    expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(2)
  })

  test('si la API dice 401, se pide otro token una sola vez', async () => {
    const no = () => respuesta({ message: 'invalid access token', error: 'not_found', status: 401, cause: [] }, 401)
    const llamadas = conToken({ [`GET ${API}/items/MLA1418506688`]: [no, () => respuesta(ITEM)] })
    expect(await (await api()).leerDeLaApi(ARTICULO)).toMatchObject({ estado: 'ok' })
    expect(llamadas.map((l) => l.metodo)).toEqual(['POST', 'GET', 'POST', 'GET'])
    const siempre = conToken({ [`GET ${API}/items/MLA1418506688`]: [no] })
    expect(await (await api()).leerDeLaApi(ARTICULO)).toBeNull()
    expect(siempre.map((l) => l.metodo)).toEqual(['POST', 'GET', 'POST', 'GET'])
  })

  test('si no lo dan, null; y en el log va el status, nunca la clave ni la respuesta', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const llamadas = apiDeMentira({
      [`POST ${API}/oauth/token`]: [() => respuesta({ message: 'invalid client_id or client_secret', error: 'invalid_client', status: 400, cause: [] }, 400)],
    })
    expect(await (await api()).leerDeLaApi(ARTICULO)).toBeNull()
    expect(llamadas.map((l) => l.metodo)).toEqual(['POST'])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls)).toContain('400')
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/clave-secreta|1234567890123456|invalid_client/)
    // un token que no tiene la forma: tampoco
    for (const raro of [{}, { access_token: '' }, { access_token: 'x' }, { access_token: 5, expires_in: 100 }, [], 'texto']) {
      apiDeMentira({ [`POST ${API}/oauth/token`]: [() => respuesta(raro)] })
      expect(await (await api()).leerDeLaApi(ARTICULO), JSON.stringify(raro)).toBeNull()
    }
  })
})

test('cualquier falla (red, status, JSON raro, tiempo): null, para seguir por la página; nunca tira', async () => {
  const casos: [string, () => Response | Promise<Response>][] = [
    ['404', () => respuesta({ message: 'Item with id MLA1418506688 not found', error: 'not_found', status: 404, cause: [] }, 404)],
    ['500', () => respuesta('Internal Server Error', 500)],
    ['403', () => respuesta({ message: 'forbidden', status: 403 }, 403)],
    ['red', () => Promise.reject(new TypeError('fetch failed'))],
    ['JSON roto', () => respuesta('{"title": "Mate', 200)],
    ['un array', () => respuesta([ITEM])],
    ['sin título', () => respuesta({ ...ITEM, title: undefined })],
    ['título vacío', () => respuesta({ ...ITEM, title: '   ' })],
    ['título que no es texto', () => respuesta({ ...ITEM, title: { toString: 1 } })],
    ['null', () => respuesta('null')],
  ]
  for (const [caso, contesta] of casos) {
    conToken({ [`GET ${API}/items/MLA1418506688`]: [contesta] })
    expect(await (await api()).leerDeLaApi(ARTICULO), caso).toBeNull()
  }
  // si el que pidió se fue (o se vence el tiempo), se corta
  const llamadas = conToken({ [`GET ${API}/items/MLA1418506688`]: [() => new Promise<Response>(() => {})] })
  const usuario = new AbortController()
  usuario.abort()
  expect(await (await api()).leerDeLaApi(ARTICULO, usuario.signal)).toBeNull()
  expect(llamadas.filter((l) => l.metodo === 'GET')).toEqual([])
})
