import { esUrlPublica } from '@/lib/compartir'
import { LARGO, largo, recortar, sinControl } from '@/lib/limites'
import { pesos } from '@/lib/pesos'

// Qué producto hay en una página de afuera: nombre, foto y precio. Puro (sin red) y sin dependencias: regex lineales solo
// sobre <title>, <meta>, <link rel=canonical>, los JSON-LD, el __STATE__ de VTEX, itemprop y data-large_image. El HTML
// lo escribe cualquiera: todo con topes, y lo peor que puede pasar es que no se lea nada.

export type Producto = { titulo: string | null; precio: string | null; foto: string | null }
export type Estado = 'ok' | 'bloqueado' | 'sin-datos' | 'no-esta' | 'no-carga'
export type Lectura = { estado: 'ok'; producto: Producto } | { estado: 'bloqueado' | 'sin-datos' | 'no-esta' }

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
    // con nombre, solo con el punto y coma: "?a=1&copy=2" en una URL no es un ©
    return todo.endsWith(';') && nombre in ENTIDADES ? ENTIDADES[nombre] : todo
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

/** Los <meta> por property, name o itemprop (en minúsculas): el primero de cada uno. */
function metas(html: string): Map<string, string> {
  const r = new Map<string, string>()
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
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
  const tag = /<link\b[^>]*\brel\s*=\s*["']?canonical["']?[^>]*>/i.exec(html)?.[0]
  return tag ? absoluta(atributo(tag, 'href'), urlFinal) : null
}

// ---------------------------------------------------------------- JSON-LD

type Nodo = Record<string, unknown>
type Bloque = { enHead: boolean; json: unknown }

const BLOQUES_MAX = 50
const BLOQUE_MAX_CHARS = 1_000_000
const PROFUNDIDAD_MAX = 6
const ARRAY_MAX = 100
const APERTURA_LD = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>/gi

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
  const apertura = new RegExp(APERTURA_LD)
  const r: Bloque[] = []
  for (let n = 0, m = apertura.exec(html); m && n < BLOQUES_MAX; n++, m = apertura.exec(html)) {
    const bloque = hastaElCierre(html, m.index + m[0].length)
    if (!bloque) break
    apertura.lastIndex = bloque.fin
    const crudo = bloque.texto.trim()
    if (crudo.length > BLOQUE_MAX_CHARS) continue
    // Samsung tiene JSON-LD inválidos: con un salto de línea crudo adentro de un string, por ejemplo
    for (const intento of [crudo, crudo.replace(/[\u0000-\u001f]/g, ' ')]) {
      try {
        r.push({ enHead: finHead < 0 || m.index < finHead, json: JSON.parse(intento) })
        break
      } catch { /* el siguiente intento, o nada */ }
    }
  }
  return r
}

const esNodo = (v: unknown): v is Nodo => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Los nodos de un bloque: arrays, @graph y mainEntity, con topes de profundidad y de largo. */
function* nodos(v: unknown, prof = 0): Generator<Nodo> {
  if (prof > PROFUNDIDAD_MAX) return
  if (Array.isArray(v)) {
    for (const x of v.slice(0, ARRAY_MAX)) yield* nodos(x, prof + 1)
  } else if (esNodo(v)) {
    yield v
    for (const k of ['@graph', 'mainEntity']) if (k in v) yield* nodos(v[k], prof + 1)
  }
}

function tipos(n: Nodo): Set<string> {
  const t = n['@type']
  return new Set((Array.isArray(t) ? t : [t]).filter((x) => typeof x === 'string').map((x: string) => x.split('/').pop()!))
}

const PRODUCTO = ['Product', 'ProductGroup', 'IndividualProduct', 'ProductModel', 'Vehicle', 'Car', 'Book', 'VideoGame']
// Cosas que no son un producto pero sí un regalo posible: dan nombre y foto
const COSA = ['Hotel', 'LodgingBusiness', 'VacationRental', 'Event', 'MusicRecording', 'MusicAlbum', 'Course', 'TouristTrip']
const esDe = (n: Nodo, lista: string[]) => lista.some((t) => tipos(n).has(t))

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
  for (const b of bloques) {
    for (const n of nodos(b.json)) {
      if (esDe(n, ['WebPage', 'ItemPage']) && esNodo(n.mainEntity) && esDe(n.mainEntity, PRODUCTO)) return n.mainEntity
    }
  }
  const productos = bloques.flatMap((b) => [...nodos(b.json)].filter((n) => esDe(n, PRODUCTO) && n.name).map((n) => ({ n, b })))
  const esta = new Set([comparable(canon, urlFinal), comparable(urlFinal, urlFinal)].filter(Boolean))
  const deEsta = productos.find(({ n }) => {
    const ofertas = (Array.isArray(n.offers) ? n.offers : [n.offers]).filter(esNodo).map((o) => o.url)
    return [n.url, n['@id'], ...ofertas].some((v) => esta.has(comparable(v, urlFinal)))
  })
  const elegido = deEsta ?? productos.find(({ b }) => b.enHead) ?? productos[0]
  if (elegido) return elegido.n
  for (const b of bloques) for (const n of nodos(b.json)) if (esDe(n, COSA) && n.name) return n
  return null
}

/** La foto de un nodo: string, array o ImageObject (url o contentUrl), salteando null y vacíos (Dexter trae [null…]). */
function imagenDe(v: unknown, prof = 0): unknown[] {
  if (prof > 3) return []
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.slice(0, ARRAY_MAX).flatMap((x) => imagenDe(x, prof + 1))
  if (esNodo(v)) return [v.url, v.contentUrl].flatMap((x) => imagenDe(x, prof + 1))
  return []
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
    if (monto) r.push({ monto, moneda: typeof moneda === 'string' ? moneda : null, enStock: String(v.availability ?? '').includes('InStock') })
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

/**
 * El caché de Apollo de VTEX IO (<template data-varname="__STATE__">): Carrefour no trae nada más en el HTML. Null si no
 * hay o no tiene un Product.
 */
function estadoVtex(html: string): Vtex | null {
  const m = /<template\b[^>]*data-varname\s*=\s*["']?__STATE__["']?[^>]*>\s*<script[^>]*>/i.exec(html)
  const bloque = m && hastaElCierre(html, m.index + m[0].length)
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
 * pesos. Sin moneda, pesos si la tienda es .ar.
 */
export function precioParaElForm(monto: number | null, moneda: string | null, host: string): string | null {
  if (!monto) return null
  const m = moneda?.trim().toUpperCase() || (host.toLowerCase().replace(/\.+$/, '').endsWith('.ar') ? 'ARS' : null)
  let r: string | null = null
  if (m === 'ARS') r = pesos(Math.round(monto))
  else if (m === 'USD') {
    const centavos = Math.round(monto * 100)
    r = `US$ ${miles(Math.floor(centavos / 100))}${centavos % 100 ? `,${String(centavos % 100).padStart(2, '0')}` : ''}`
  }
  return r && r.length <= LARGO.precio ? r : null
}

// ---------------------------------------------------------------- título

// El " - $ 88.990" que ML pone al final del og:title
const SUFIJO_PRECIO = /\s+-\s+(?:US\$|U\$S|R\$|\$)\s?[\d.,]+$/
const SEPARADORES = [' | ', ' - ', ' – ', ' — ', ' · ', ': ']
const TITULO_MAX_CHARS = 2000

/** El nombre de la tienda en su host: la etiqueta antes del dominio (www.crocs.com.ar → crocs, store.steampowered.com → steampowered). */
function nombreDelHost(host: string): string {
  const partes = host.toLowerCase().replace(/\.+$/, '').split('.')
  partes.pop()
  if (partes.length > 1 && /^(com|net|org|gob|gov|edu|co)$/.test(partes[partes.length - 1])) partes.pop()
  return partes.pop() ?? ''
}

const comparar = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

/** Si esa parte del título es el nombre del sitio ("Samsung Argentina", "AliExpress 18", "Amazon.com"). */
function esElSitio(parte: string, nombres: string[]): boolean {
  const p = comparar(parte)
  return !!p && nombres.some((n) => p === n || (n.length >= 3 && p.includes(n)) || (p.length >= 4 && n.includes(p)))
}

/** Sin el nombre del sitio al final (" | Sitio", " - Sitio"…) o al principio ("Sitio: …"). Nunca deja el título vacío. */
function sinSitio(t: string, sitio: string | null, host: string): string {
  const nombres = [sitio, nombreDelHost(host)].map((n) => comparar(n ?? '')).filter((n) => n.length >= 2)
  if (!nombres.length) return t
  for (const sep of SEPARADORES) {
    const i = t.lastIndexOf(sep)
    if (i < 0) continue
    const antes = t.slice(0, i).trim()
    if (largo(antes) >= 3 && esElSitio(t.slice(i + sep.length), nombres)) return antes
    const j = t.indexOf(sep)
    const despues = t.slice(j + sep.length).trim()
    if (sep === ': ' && largo(despues) >= 3 && esElSitio(t.slice(0, j), nombres)) return despues
  }
  return t
}

/** Hasta 120 caracteres, cortando en el último espacio después del 60 (si no hay, en el 120). */
function cortarTitulo(t: string): string {
  if (largo(t) <= LARGO.titulo) return t
  const uno = recortar(t, LARGO.titulo + 1)
  const i = uno.lastIndexOf(' ')
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

// ---------------------------------------------------------------- todo junto

const NO_ESTA = /discontinued|is unavailable|descatalogado|ya no est[aá] disponible|publicaci[oó]n finalizada/i
const OG_COSA = /^(article|video|music|book|place)/
const ITEMTYPE_PRODUCTO = /itemtype\s*=\s*["']?https?:\/\/schema\.org\/Product/i

/**
 * Lee el producto de una página ya bajada. Primero si es un muro; después el nodo del producto (JSON-LD), el __STATE__ de
 * VTEX, og/twitter/product:, itemprop. 'sin-datos' si no hay señal de producto ni de otra cosa (la categoría de IKEA, una
 * SPA, la home); 'no-esta' si el título dice que ya no existe. El título del link (si la página no da uno) lo pone quien
 * llama.
 */
export function leerProducto(html: string, urlFinal: string): Lectura {
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

  const titleTag = limpio(/<title\b[^>]*>([^<]*)<\/title\s*>/i.exec(html)?.[1])
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

  let precio = esProducto && nodo ? precioDelNodo(nodo) : null
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
