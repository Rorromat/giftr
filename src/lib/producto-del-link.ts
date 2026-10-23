import { LARGO, largo, recortar, sinControl } from '@/lib/limites'
import { esUrlPublica } from '@/lib/links'
import { pesos } from '@/lib/pesos'

// Qué producto hay en una página de afuera: nombre, foto y precio. Puro (sin red) y sin dependencias: solo <title>,
// <meta>, <link rel=canonical>, los JSON-LD, el __STATE__ de VTEX, itemprop y data-large_image. El HTML lo escribe
// cualquiera: todo con topes, cada tag se corta con indexOf (ver tagDesde) y ninguna regex vuelve atrás sobre la página,
// así que el tiempo crece con el largo y no con su cuadrado. Lo peor que puede pasar es que no se lea nada (sin-datos).

export type Producto = { titulo: string | null; precio: string | null; foto: string | null }
export type Estado = 'ok' | 'bloqueado' | 'sin-datos' | 'no-esta' | 'no-carga'
export type Lectura = { estado: 'ok'; producto: Producto } | { estado: 'bloqueado' | 'sin-datos' | 'no-esta' }

/** Lo que contesta POST /api/deseo/link: un estado grueso y lo que se puede completar, limpio. Nada de afuera tal cual. */
export type RespuestaLink = {
  estado: Estado
  /** 'ok': el de la página; si no (o si la página no dio uno), el del link, o null */
  titulo: string | null
  /** "$88.990" o "US$ 79,99"; otra moneda, null */
  precio: string | null
  /** https pública, sin guardar: la trae FotoField (POST /api/deseo/foto/desde-link) */
  foto: string | null
  /** "mercadolibre.com.ar", para los avisos */
  sitio: string
}

// ---------------------------------------------------------------- muros

const MURO_EN_URL = ['/gz/account-verification', '/risk/challenge', '/risk/action', '/_____tmd_____/']
// Lo que dicen las páginas de un muro anti-bots (ML, AliExpress, Zara, H&M, DataDome, Cloudflare, Amazon, Akamai). Se
// busca en los primeros 300 KB: una reseña que dice "captcha" más abajo no hace de un producto un muro.
const MURO_EN_HTML = [
  'suspicious-traffic-frontend', '_____tmd_____/punish', 'bm-verify', 'sec-if-cpt', 'captcha-delivery.com',
  'Attention Required! | Cloudflare', '<title>Just a moment...</title>', 'cf-chl-', 'api-services-support@amazon.com',
  'validateCaptcha', 'unable to give you access', '<TITLE>Access Denied</TITLE>',
]
const MURO_HTML_BYTES = 300_000

/** Si la URL es la de un muro anti-bots (el login de ML, el captcha de AliExpress o Shein, el "sorry" de Google). */
export function esUrlDeMuro(url: string): boolean {
  let u: URL
  try { u = new URL(url) } catch { return false }
  // sin la query: un link que trae "google.com/sorry" en un parámetro no es un muro
  const h = u.hostname.toLowerCase().replace(/\.+$/, '')
  return MURO_EN_URL.some((m) => u.pathname.includes(m)) || (/(^|\.)google\.[a-z.]+$/.test(h) && u.pathname.startsWith('/sorry'))
}

/** La página que se quería ver, según el muro (go= en ML, redirection= en Shein, continue= en Google); null si no dice. */
export function urlTrasElMuro(url: string): string | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  for (const p of ['go', 'redirection', 'continue']) {
    const v = u.searchParams.get(p)
    if (v && /^https?:\/\//i.test(v)) return v.replace(/^http:/i, 'https:')
  }
  return null
}

/** Si lo que llegó es un muro y no la página: por la URL o por lo que dice. Va antes de leer cualquier campo. */
export function esPaginaBloqueada(html: string, urlFinal: string): boolean {
  const inicio = html.slice(0, MURO_HTML_BYTES)
  return esUrlDeMuro(urlFinal) || MURO_EN_HTML.some((m) => inicio.includes(m))
}

/** La home: path "/" sin nada más. Ahí no hay un producto (y a la home manda un link corto roto). */
export function esHome(url: string): boolean {
  try {
    const u = new URL(url)
    return u.pathname === '/' && !u.search
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- texto

// Las entidades con nombre que aparecen en títulos y URLs: las de HTML 4 de U+00A0 a U+00FF, en orden, y algunas más.
const LATIN1 = (
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro ' +
  'para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil ' +
  'Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave ' +
  'Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml ' +
  'igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute ' +
  'thorn yuml'
).split(' ')
const ENTIDADES: Record<string, string> = {
  ...Object.fromEntries(LATIN1.map((n, i) => [n, String.fromCharCode(160 + i)])),
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚',
  ldquo: '“', rdquo: '”', bdquo: '„', hellip: '…', bull: '•', euro: '€', trade: '™', prime: '′', Prime: '″',
  ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '', zwj: '', lrm: '', rlm: '', OElig: 'Œ', oelig: 'œ', Scaron: 'Š',
  scaron: 'š', Yuml: 'Ÿ', circ: 'ˆ', tilde: '˜', dagger: '†', Dagger: '‡', permil: '‰', lsaquo: '‹', rsaquo: '›',
}

function caracter(n: number): string {
  return n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : '�'
}

/** &amp; &aacute; &#225; &#xe1; → el carácter. Las que no conoce quedan como están. */
function decodificar(t: string): string {
  return t.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z][a-z0-9]{1,15}));?/gi, (todo, dec, hex, nombre) => {
    if (dec) return caracter(Number(dec))
    if (hex) return caracter(parseInt(hex, 16))
    // con nombre, solo con el punto y coma: "?a=1&copy=2" en una URL no es un ©. hasOwn: con "in", &constructor; daba
    // la función de Object.prototype
    return todo.endsWith(';') && Object.hasOwn(ENTIDADES, nombre) ? ENTIDADES[nombre] : todo
  })
}

// Un nombre o un título de más de esto no es un nombre (y el título se corta a 120): así ninguna regex recorre megas
const TEXTO_MAX_CHARS = 5000

/** Texto de la página: entidades (dos veces: hay tiendas que traen &amp;amp;), sin tags, espacios colapsados. */
function limpio(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = decodificar(decodificar(v.slice(0, TEXTO_MAX_CHARS)))
  // [^<>]: un "<" sin cerrar no hace que cada uno de los que siguen recorra el resto
  return sinControl(t.replace(/<[^<>]*>/g, ' ').replace(/[\s\u00a0\u200b]+/g, ' ')).trim() || null
}

// ---------------------------------------------------------------- HTML

const ATRIBUTOS = new Map<string, RegExp>()

/** Un atributo de un tag, con comillas dobles, simples o sin comillas (Megatone), con las entidades decodificadas. */
function atributo(tag: string, nombre: string): string | null {
  let rx = ATRIBUTOS.get(nombre)
  if (!rx) ATRIBUTOS.set(nombre, (rx = new RegExp(`[\\s<]${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, 'i')))
  const m = rx.exec(tag)
  return m ? decodificar(m[1] ?? m[2] ?? m[3]) : null
}

type Tag = { tag: string; inicio: number; fin: number }
const APERTURAS = new Map<string, RegExp>()

/**
 * El primer <nombre …> desde esa posición, de "<" a ">", y dónde termina. El comienzo se busca con una regex y el ">"
 * con indexOf: con "<meta\b[^>]*>" en la regex, cada apertura sin ">" recorría el resto de la página y volvía de a un
 * carácter (el cuadrado del largo: minutos con 4 MB de "<meta "). Null si no hay más o si ese no cierra: entonces
 * ninguno de los que siguen cierra.
 */
function tagDesde(html: string, nombre: string, desde: number): Tag | null {
  let rx = APERTURAS.get(nombre)
  if (!rx) APERTURAS.set(nombre, (rx = new RegExp(`<${nombre}\\b`, 'gi')))
  rx.lastIndex = desde
  const m = rx.exec(html)
  const fin = m ? html.indexOf('>', m.index) : -1
  return m && fin >= 0 ? { tag: html.slice(m.index, fin + 1), inicio: m.index, fin: fin + 1 } : null
}

/** Los <nombre …> de la página, en orden. Como no se pisan, recorrerlos todos es lineal. */
function* tags(html: string, nombre: string): Generator<Tag> {
  for (let t = tagDesde(html, nombre, 0); t; t = tagDesde(html, nombre, t.fin)) yield t
}

/** Los <meta> por property, name o itemprop (en minúsculas): el primero de cada uno. */
function metas(html: string): Map<string, string> {
  const r = new Map<string, string>()
  for (const { tag } of tags(html, 'meta')) {
    const clave = atributo(tag, 'property') ?? atributo(tag, 'name') ?? atributo(tag, 'itemprop')
    const valor = atributo(tag, 'content')
    if (clave && valor !== null && !r.has(clave.toLowerCase())) r.set(clave.toLowerCase(), valor)
  }
  return r
}

/** Una URL de la página, absoluta y por https (contra el canonical o la URL final: Dexter tiene el canonical relativo). */
function absoluta(v: unknown, base: string): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  let u = decodificar(v.trim())
  if (u.startsWith('//')) u = `https:${u}`
  try {
    u = new URL(u, base).toString()
  } catch {
    return null
  }
  u = u.replace(/^http:/i, 'https:')
  return u.startsWith('https://') ? u : null
}

function canonical(html: string, urlFinal: string): string | null {
  for (const { tag } of tags(html, 'link')) {
    if (/\brel\s*=\s*["']?canonical/i.test(tag)) return absoluta(atributo(tag, 'href'), urlFinal)
  }
  return null
}

// ---------------------------------------------------------------- JSON-LD

type Nodo = Record<string, unknown>
type Bloque = { enHead: boolean; json: unknown }

const BLOQUES_MAX = 50
const BLOQUE_MAX_CHARS = 1_000_000
const PROFUNDIDAD_MAX = 6
const ARRAY_MAX = 100
// Una página de verdad trae unas decenas por bloque (Tiendanube: el de la página y 8 recomendados)
const NODOS_MAX = 1000
const ES_LD = /\btype\s*=\s*["']?application\/ld\+json/i

/**
 * Lo que hay desde donde termina un tag que abre hasta el primer </script>, y dónde termina ese cierre. Sin cierre, null:
 * quien llama deja de buscar (con "[\s\S]*?</script>" en la regex, cada apertura sin cierre recorría el resto de la página).
 */
function hastaElCierre(html: string, desde: number): { texto: string; fin: number } | null {
  const cierre = /<\/script\s*>/gi
  cierre.lastIndex = desde
  const c = cierre.exec(html)
  return c ? { texto: html.slice(desde, c.index), fin: c.index + c[0].length } : null
}

function jsonLd(html: string): Bloque[] {
  const finHead = html.search(/<\/head\s*>/i)
  const r: Bloque[] = []
  for (let n = 0, desde = 0; n < BLOQUES_MAX;) {
    const t = tagDesde(html, 'script', desde)
    if (!t) break
    desde = t.fin
    if (!ES_LD.test(t.tag)) continue
    n++
    const bloque = hastaElCierre(html, t.fin)
    if (!bloque) break
    desde = bloque.fin
    const crudo = bloque.texto.trim()
    if (crudo.length > BLOQUE_MAX_CHARS) continue
    // Samsung tiene JSON-LD inválidos: con un salto de línea crudo adentro de un string, por ejemplo
    for (const intento of [crudo, crudo.replace(/[\u0000-\u001f]/g, ' ')]) {
      try {
        r.push({ enHead: finHead < 0 || t.inicio < finHead, json: JSON.parse(intento) })
        break
      } catch { /* el siguiente intento, o nada */ }
    }
  }
  return r
}

const esNodo = (v: unknown): v is Nodo => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Los nodos de un bloque, en orden: arrays, @graph y mainEntity, con topes de profundidad, de largo y de cantidad. */
function nodos(v: unknown, prof = 0, r: Nodo[] = []): Nodo[] {
  if (prof > PROFUNDIDAD_MAX || r.length >= NODOS_MAX) return r
  if (Array.isArray(v)) {
    for (const x of v.slice(0, ARRAY_MAX)) nodos(x, prof + 1, r)
  } else if (esNodo(v)) {
    r.push(v)
    for (const k of ['@graph', 'mainEntity']) if (k in v) nodos(v[k], prof + 1, r)
  }
  return r
}

// Un tipo de schema.org, con su URL adelante, entra de sobra
const TIPO_MAX_CHARS = 100
const TIPOS = new WeakMap<Nodo, Set<string>>()

/**
 * Los @type de un nodo ("https://schema.org/Product" → Product). Una vez por nodo y con topes: el @type lo escribe
 * cualquiera, y un array de cientos de miles armado de nuevo en cada pregunta eran segundos con el event loop trabado.
 */
function tipos(n: Nodo): Set<string> {
  let r = TIPOS.get(n)
  if (!r) {
    const t = n['@type']
    r = new Set((Array.isArray(t) ? t.slice(0, ARRAY_MAX) : [t])
      .filter((x): x is string => typeof x === 'string' && x.length <= TIPO_MAX_CHARS)
      .map((x) => x.slice(x.lastIndexOf('/') + 1)))
    TIPOS.set(n, r)
  }
  return r
}

const PRODUCTO = ['Product', 'ProductGroup', 'IndividualProduct', 'ProductModel', 'Vehicle', 'Car', 'Book', 'VideoGame']
// Cosas que no son un producto pero sí un regalo posible: dan nombre y foto
const COSA = ['Hotel', 'LodgingBusiness', 'VacationRental', 'Event', 'MusicRecording', 'MusicAlbum', 'Course', 'TouristTrip']
function esDe(n: Nodo, lista: string[]): boolean {
  const t = tipos(n)
  return lista.some((x) => t.has(x))
}

/** host sin www. y path sin / final, en minúsculas: para ver si un nodo es el de esta página. */
function comparable(v: unknown, base: string): string | null {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v, base)
    return `${u.hostname.replace(/^www\./i, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return null
  }
}

/**
 * El nodo del producto de la página (el primero que aparezca gana): el mainEntity de un WebPage (Tiendanube: los Product
 * sueltos del body son recomendados); un producto cuya url, @id u offers.url es esta página (Jumbo trae el regular y el
 * promocional); el primero del <head>; el primero; si no hay producto, la primera "cosa" con nombre. Nunca og:url: VTEX
 * pone ahí una ruta interna.
 */
function elegir(bloques: Bloque[], canon: string | null, urlFinal: string): Nodo | null {
  const todos = bloques.map((b) => ({ b, ns: nodos(b.json) }))
  for (const { ns } of todos) {
    for (const n of ns) {
      if (esDe(n, ['WebPage', 'ItemPage']) && esNodo(n.mainEntity) && esDe(n.mainEntity, PRODUCTO)) return n.mainEntity
    }
  }
  const productos = todos.flatMap(({ b, ns }) => ns.filter((n) => esDe(n, PRODUCTO) && n.name).map((n) => ({ n, b })))
  const esta = new Set([comparable(canon, urlFinal), comparable(urlFinal, urlFinal)].filter(Boolean))
  const deEsta = productos.find(({ n }) => {
    const ofertas = (Array.isArray(n.offers) ? n.offers.slice(0, ARRAY_MAX) : [n.offers]).filter(esNodo).map((o) => o.url)
    return [n.url, n['@id'], ...ofertas].some((v) => esta.has(comparable(v, urlFinal)))
  })
  const elegido = deEsta ?? productos.find(({ b }) => b.enHead) ?? productos[0]
  if (elegido) return elegido.n
  for (const { ns } of todos) for (const n of ns) if (esDe(n, COSA) && n.name) return n
  return null
}

/**
 * Las fotos de un nodo: string, array o ImageObject (url o contentUrl), salteando null y vacíos (Dexter trae [null…]).
 * Las primeras 100: si ninguna sirve, las que siguen tampoco van a servir.
 */
function imagenDe(v: unknown, prof = 0, r: unknown[] = []): unknown[] {
  if (prof > 3 || r.length >= ARRAY_MAX) return r
  if (typeof v === 'string') r.push(v)
  else if (Array.isArray(v)) for (const x of v.slice(0, ARRAY_MAX)) imagenDe(x, prof + 1, r)
  else if (esNodo(v)) for (const x of [v.url, v.contentUrl]) imagenDe(x, prof + 1, r)
  return r
}

type Oferta = { monto: number; moneda: string | null; enStock: boolean }

/** Las ofertas de un nodo: Offer.price, AggregateOffer.lowPrice o priceSpecification.price, también las anidadas. */
function ofertas(v: unknown, prof = 0, r: Oferta[] = []): Oferta[] {
  if (prof > PROFUNDIDAD_MAX) return r
  if (Array.isArray(v)) {
    for (const x of v.slice(0, ARRAY_MAX)) ofertas(x, prof + 1, r)
  } else if (esNodo(v)) {
    const ps = Array.isArray(v.priceSpecification) ? v.priceSpecification[0] : v.priceSpecification
    const monto = montoDeTexto(v.price ?? v.lowPrice ?? (esNodo(ps) ? ps.price : null))
    const moneda = v.priceCurrency ?? (esNodo(ps) ? ps.priceCurrency : null)
    // availability solo si es texto: String() de un {"toString":1} de la página tira un TypeError
    const enStock = typeof v.availability === 'string' && v.availability.includes('InStock')
    if (monto) r.push({ monto, moneda: typeof moneda === 'string' ? moneda : null, enStock })
    if ('offers' in v) ofertas(v.offers, prof + 1, r)
  }
  return r
}

/** El precio del nodo: el de sus offers (con stock, si hay varias), o el de sus variantes (Shopify, Nike, Zara). */
function precioDelNodo(n: Nodo): { monto: number; moneda: string | null } | null {
  let lista = ofertas(n.offers)
  if (!lista.length && Array.isArray(n.hasVariant)) lista = n.hasVariant.slice(0, ARRAY_MAX).flatMap((v) => (esNodo(v) ? ofertas(v.offers) : []))
  const o = lista.find((x) => x.enStock) ?? lista[0]
  return o ? { monto: o.monto, moneda: o.moneda ?? lista.find((x) => x.moneda)?.moneda ?? null } : null
}

// ---------------------------------------------------------------- VTEX

type Vtex = { titulo: string | null; foto: unknown; monto: number | null }

const ES_STATE = /\bdata-varname\s*=\s*["']?__STATE__/i
const SCRIPT_PEGADO = /\s*<script\b/iy

/**
 * El caché de Apollo de VTEX IO (<template data-varname="__STATE__">): Carrefour no trae nada más en el HTML. Null si no
 * hay o no tiene un Product.
 */
function estadoVtex(html: string): Vtex | null {
  let bloque: { texto: string } | null = null
  for (const { tag, fin } of tags(html, 'template')) {
    if (!ES_STATE.test(tag)) continue
    // el <script> tiene que ir justo después: buscarlo más adelante haría que cada <template> recorra el resto
    SCRIPT_PEGADO.lastIndex = fin
    const s = SCRIPT_PEGADO.exec(html)
    if (!s) continue
    const cierra = html.indexOf('>', fin + s[0].length)
    bloque = cierra < 0 ? null : hastaElCierre(html, cierra + 1)
    break
  }
  if (!bloque) return null
  let st: unknown
  try { st = JSON.parse(bloque.texto) } catch { return null }
  if (!esNodo(st)) return null
  const clave = Object.keys(st).find((k) => k.startsWith('Product:') && !k.includes('.'))
  const producto = clave && st[clave]
  if (!clave || !esNodo(producto)) return null
  const item = st[`${clave}.items.0`]
  const ref = esNodo(item) && Array.isArray(item.images) ? item.images[0] : null
  const imagen = esNodo(ref) && typeof ref.id === 'string' ? st[ref.id] : null
  const oferta = st[`$${clave}.items.0.sellers.0.commertialOffer`]
  return {
    titulo: limpio(producto.productName),
    foto: esNodo(imagen) ? imagen.imageUrl : null,
    monto: esNodo(oferta) ? montoDeTexto(oferta.Price) : null,
  }
}

// ---------------------------------------------------------------- montos

/**
 * Un monto de schema.org (número) o con el formato de la tienda ("$ 88.990", "38,999", "30.900,00", "1,234.56"): con
 * dos separadores distintos el último es el decimal; uno repetido, de miles; uno solo, de miles si le siguen 3 dígitos.
 * Null si es 0 (Bellaverso publica 0: "sin precio"), negativo o raro.
 */
export function montoDeTexto(v: unknown): number | null {
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    // un menos antes del número, o letras entre los dígitos ("1e3"): no es un precio
    if (/^[^\d]*[-−]/.test(v) || /\d\s*\p{L}+\s*\d/u.test(v)) return null
    const s = v.replace(/[^\d.,]/g, '')
    if (!s || s.length > 20 || !/\d/.test(s)) return null
    const seps = s.replace(/\d/g, '')
    if (!seps) n = Number(s)
    else if (new Set(seps).size === 2) {
      const d = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
      n = Number(`${s.slice(0, d).replace(/[.,]/g, '')}.${s.slice(d + 1)}`)
    } else if (seps.length > 1) n = Number(s.replace(/[.,]/g, ''))
    else {
      const i = s.search(/[.,]/)
      const decimales = s.slice(i + 1)
      n = Number(decimales.length === 3 ? s.slice(0, i) + decimales : `${s.slice(0, i)}.${decimales}`)
    }
  } else return null
  return Number.isFinite(n) && n > 0 && n < 1e10 ? n : null
}

const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/**
 * El precio para el formulario: "$88.990" o "US$ 79,99". Otra moneda no: el regalo grupal leería un "$" mexicano como
 * pesos. Sin moneda, pesos si la tienda es .ar. Lo que redondeado da 0 (el 0,01 que algunas tiendas ponen cuando el
 * precio es a consultar) es "sin precio", como el 0.
 */
export function precioParaElForm(monto: number | null, moneda: string | null, host: string): string | null {
  if (!monto) return null
  const m = moneda?.trim().toUpperCase() || (host.toLowerCase().replace(/\.+$/, '').endsWith('.ar') ? 'ARS' : null)
  let r: string | null = null
  if (m === 'ARS' && Math.round(monto) > 0) r = pesos(Math.round(monto))
  else if (m === 'USD' && Math.round(monto * 100) > 0) {
    const centavos = Math.round(monto * 100)
    r = `US$ ${miles(Math.floor(centavos / 100))}${centavos % 100 ? `,${String(centavos % 100).padStart(2, '0')}` : ''}`
  }
  return r && r.length <= LARGO.precio ? r : null
}

// ---------------------------------------------------------------- título

// El " - $ 88.990" que ML pone al final del og:title
const SUFIJO_PRECIO = /\s+-\s+(?:US\$|U\$S|R\$|\$)\s?[\d.,]+$/
// Entre las partes de un título: " | ", " - ", " – ", " — ", " · " o ": "
const SEPARADOR = / [|\-–—·] |: /g
const TITULO_MAX_CHARS = 2000

/** El nombre de la tienda en su host: la etiqueta antes del dominio (www.crocs.com.ar → crocs, store.steampowered.com → steampowered). */
function nombreDelHost(host: string): string {
  const partes = host.toLowerCase().replace(/\.+$/, '').split('.')
  partes.pop()
  if (partes.length > 1 && /^(com|net|org|gob|gov|edu|co)$/.test(partes[partes.length - 1])) partes.pop()
  return partes.pop() ?? ''
}

/** Las palabras, en minúsculas y sin tildes: "Cúspide" es "cuspide", como en el host. */
const palabras = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

// Lo que las tiendas le agregan a su nombre y no es del producto: el país, el dominio, "oficial", "Comprar en …"
const AGREGADOS = new Set([
  'argentina', 'arg', 'ar', 'latam', 'mexico', 'mx', 'chile', 'cl', 'uruguay', 'uy', 'colombia', 'co', 'peru', 'pe',
  'espana', 'es', 'brasil', 'br', 'usa', 'us', 'uk', 'united', 'states', 'www', 'com', 'net', 'org', 'oficial', 'official',
  'sitio', 'site', 'tienda', 'store', 'shop', 'online', 'comprar', 'en', 'libreria', 'librerias',
])
const esAgregado = (w: string) => AGREGADOS.has(w) || /^\d+$/.test(w)
// El nombre de un sitio con lo que se le agrega no es más largo que esto
const SITIO_MAX_PALABRAS = 8

/**
 * Si esa parte del título es el sitio: su nombre (og:site_name o el del host) solo o con agregados ("Samsung Argentina",
 * "AliExpress 18", "Amazon.com", "Comprar en Roma objetos"), o un pedazo del nombre ("Steam" en store.steampowered.com).
 * Por palabras enteras: en "Nike Pegasus 41" está el nombre, pero lo demás es el modelo; en "Mimosa" no está "mimo".
 */
function esElSitio(parte: string, nombres: string[]): boolean {
  const ps = palabras(parte)
  const p = ps.join('')
  if (!p || ps.length > SITIO_MAX_PALABRAS) return false
  return nombres.some((n) => {
    if (p.length >= 4 && n.includes(p)) return true
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j <= ps.length; j++) {
        if (ps.slice(i, j).join('') === n && [...ps.slice(0, i), ...ps.slice(j)].every(esAgregado)) return true
      }
    }
    return false
  })
}

/**
 * Sin el sitio (ver esElSitio): desde la primera parte que lo es hasta el final (" - Jumbo Argentina | Aprovechá las
 * Ofertas"), o al principio ("Amazon.com: …"). Nunca deja menos de 3 caracteres.
 */
function sinSitio(t: string, sitio: string | null, host: string): string {
  const nombres = [sitio, nombreDelHost(host)].map((n) => palabras(n ?? '').join('')).filter((n) => n.length >= 2)
  if (!nombres.length) return t
  const cortes = Array.from(t.matchAll(SEPARADOR), (m) => ({ inicio: m.index, fin: m.index + m[0].length }))
  for (const [k, c] of cortes.entries()) {
    if (!esElSitio(t.slice(c.fin, cortes[k + 1]?.inicio ?? t.length), nombres)) continue
    const antes = t.slice(0, c.inicio).trim()
    if (largo(antes) >= 3) return antes
  }
  const [primero] = cortes
  if (primero && t.slice(primero.inicio, primero.fin) === ': ') {
    const despues = t.slice(primero.fin).trim()
    if (largo(despues) >= 3 && esElSitio(t.slice(0, primero.inicio), nombres)) return despues
  }
  return t
}

/** Hasta 120 caracteres, cortando en el último espacio después del 60 (si no hay, en el 120). */
function cortarTitulo(t: string): string {
  if (largo(t) <= LARGO.titulo) return t
  const uno = recortar(t, LARGO.titulo + 1)
  // el 121 era un espacio (recortar lo sacó): los primeros 120 terminan justo en una palabra
  const i = largo(uno) <= LARGO.titulo ? uno.length : uno.lastIndexOf(' ')
  return (i > 60 ? uno.slice(0, i) : recortar(t, LARGO.titulo)).replace(/[\s,\-–—|·:;]+$/, '')
}

function limpiarTituloLimpio(t: string, sitio: string | null, host: string): string | null {
  const r = cortarTitulo(sinSitio(t.slice(0, TITULO_MAX_CHARS).replace(SUFIJO_PRECIO, ''), sitio, host))
  return r.trim() || null
}

/**
 * El título de la página, para el deseo: sin el sufijo de precio de ML ni el nombre del sitio (cuando coincide con
 * og:site_name o con el host), y de hasta 120 caracteres cortado en una palabra. Las mayúsculas quedan como vienen.
 */
export function limpiarTitulo(t: string, sitio: string | null, host: string): string | null {
  const l = limpio(t)
  return l && limpiarTituloLimpio(l, limpio(sitio), host)
}

// ---------------------------------------------------------------- foto

/**
 * La foto en grande, en los CDN que lo permiten cambiando la URL: ML (-O → -F), VTEX (/ids/<id>/ → /ids/<id>-1000-1000/)
 * y Tiendanube (-480-0 → -1024-1024). Las demás quedan igual.
 */
export function fotoGrande(url: string): string {
  let u: URL
  try { u = new URL(url) } catch { return url }
  const h = u.hostname.toLowerCase()
  if (h === 'http2.mlstatic.com') u.pathname = u.pathname.replace(/-[OVIEWBCL]\.(webp|jpg)$/, '-F.$1')
  else if (h.endsWith('.vtexassets.com') || h.endsWith('.vteximg.com.br')) {
    u.pathname = u.pathname.replace(/\/arquivos\/ids\/(\d+)(?:-\d+-\d+)?\//, '/arquivos/ids/$1-1000-1000/')
  } else if (h === 'mitiendanube.com' || h.endsWith('.mitiendanube.com')) u.pathname = u.pathname.replace(/-\d+-0\.(\w+)$/, '-1024-1024.$1')
  else return url
  return u.toString()
}

/** La primera que sirve: https pública (ver esUrlPublica) y de un largo que se pueda guardar. */
function primeraFoto(candidatas: unknown[], base: string): string | null {
  for (const c of candidatas) {
    const u = absoluta(c, base)
    if (u && u.length <= LARGO.link && esUrlPublica(u)) return u
  }
  return null
}

/** Una foto de afuera como la de la página (la de la API de ML, por ejemplo): https pública y que entra; si no, null. */
export const limpiarFoto = (v: unknown, base: string) => primeraFoto([v], base)

// ---------------------------------------------------------------- todo junto

const NO_ESTA = /discontinued|is unavailable|descatalogado|ya no est[aá] disponible|publicaci[oó]n finalizada/i
const OG_COSA = /^(article|video|music|book|place)/
const ITEMTYPE_PRODUCTO = /itemtype\s*=\s*["']?https?:\/\/schema\.org\/Product/i
const CIERRE_TITLE = /<\/title\s*>/iy

/** El texto del primer <title> que no tiene tags adentro (lo de "<title…>([^<]*)</title>", sin regex que vuelvan atrás). */
function textoDelTitle(html: string): string | null {
  for (const { fin } of tags(html, 'title')) {
    const i = html.indexOf('<', fin)
    if (i < 0) return null
    CIERRE_TITLE.lastIndex = i
    if (CIERRE_TITLE.test(html)) return html.slice(fin, i)
  }
  return null
}

/**
 * Lee el producto de una página ya bajada. Primero si es un muro; después el nodo del producto (JSON-LD), el __STATE__ de
 * VTEX, og/twitter/product:, itemprop. 'sin-datos' si no hay señal de producto ni de otra cosa (la categoría de IKEA, una
 * SPA, la home); 'no-esta' si el título dice que ya no existe. El título del link (si la página no da uno) lo pone quien
 * llama. Si algo de la página hace fallar la lectura, 'sin-datos': nunca una excepción para quien llama.
 */
export function leerProducto(html: string, urlFinal: string): Lectura {
  try {
    return leer(html, urlFinal)
  } catch {
    return { estado: 'sin-datos' }
  }
}

function leer(html: string, urlFinal: string): Lectura {
  if (esPaginaBloqueada(html, urlFinal)) return { estado: 'bloqueado' }
  const me = metas(html)
  const canon = canonical(html, urlFinal)
  const nodo = elegir(jsonLd(html), canon, urlFinal)
  const esProducto = !!nodo && esDe(nodo, PRODUCTO)
  let vtex: Vtex | null | undefined
  const deVtex = () => (vtex === undefined ? (vtex = estadoVtex(html)) : vtex)

  const ogType = (me.get('og:type') ?? '').toLowerCase()
  const senal = esProducto || (ogType.includes('product') && ogType !== 'product.group') || !!me.get('product:price:amount') ||
    !!me.get('og:price:amount') || ITEMTYPE_PRODUCTO.test(html) || !!deVtex()?.titulo
  const cosa = !!nodo || OG_COSA.test(ogType)

  const titleTag = limpio(textoDelTitle(html))
  const titulo = (nodo && limpio(nodo.name)) || (!esProducto && deVtex()?.titulo) || limpio(me.get('og:title')) ||
    limpio(me.get('twitter:title')) || (senal ? titleTag : null)
  // Temu y Etsy: la página sigue, pero dice que el producto ya no está (Temu solo en el <title>)
  if (!esProducto && [titulo, titleTag].some((t) => t && NO_ESTA.test(t))) return { estado: 'no-esta' }
  if (ogType === 'product.group' || (!senal && !cosa) || esHome(urlFinal)) return { estado: 'sin-datos' }

  let host = ''
  try { host = new URL(urlFinal).hostname } catch { /* sin host: sin "pesos por ser .ar" */ }
  const base = canon ?? urlFinal
  const foto = primeraFoto([
    ...(nodo ? imagenDe(nodo.image) : []), deVtex()?.foto, me.get('og:image:secure_url'), me.get('og:image'),
    me.get('twitter:image'), me.get('twitter:image:src'), me.get('image'),
    // WooCommerce (Cúspide): la foto grande de la galería
    /data-large_image\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/.exec(html)?.slice(1).find((x) => x !== undefined),
  ], base)

  // el de las offers del nodo, sea un producto o una "cosa" (la entrada de un Event trae su precio)
  let precio = nodo ? precioDelNodo(nodo) : null
  if (!precio && senal) {
    const vtexMonto = deVtex()?.monto
    if (vtexMonto) precio = { monto: vtexMonto, moneda: null }
    else {
      for (const [monto, moneda] of [['product:price:amount', 'product:price:currency'], ['og:price:amount', 'og:price:currency'], ['price', 'pricecurrency']]) {
        const n = montoDeTexto(me.get(monto))
        if (n) {
          precio = { monto: n, moneda: me.get(moneda) ?? null }
          break
        }
      }
    }
  }
  const moneda = precio?.moneda || me.get('product:price:currency') || me.get('og:price:currency') || me.get('pricecurrency') || null

  return {
    estado: 'ok',
    producto: {
      titulo: titulo && limpiarTituloLimpio(titulo, limpio(me.get('og:site_name')), host),
      precio: precioParaElForm(precio?.monto ?? null, moneda, host),
      foto,
    },
  }
}
