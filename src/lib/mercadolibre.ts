import { UA_GIFTR } from '@/lib/giftrbot'
import { esHostDeMercadoLibre } from '@/lib/links'
import { limpiarFoto, limpiarTitulo, montoDeTexto, precioParaElForm, type Lectura } from '@/lib/producto-del-link'

// Los links de MercadoLibre: qué son y qué ids traen, sin pedir nada a la red. Las publicaciones de marketplace
// (articulo., /p/, /up/) tienen un muro de login para los pedidos que salen de un datacenter: no lo eludimos, y el link
// se pide tal como vino. Los clasificados (auto., departamento., …) se leen como cualquier página. Si está configurada,
// la API oficial lee las publicaciones antes de ir a la página (ver leerDeLaApi, al final).

/**
 * Si se piden las publicaciones de marketplace. Con el muro no dan nada, pero pedirlas igual nos dice (por los logs de
 * host y estado) cuánto bloquea desde donde corre la app. En false no se piden: se contesta con el nombre del link.
 */
export const ML_PEDIR_MARKETPLACE: boolean = true

export type LinkML = {
  /** MLA, MLM, MLB…: el del id, o el del país del host; vacío en un link corto */
  sitio: string
  tipo: 'item' | 'catalogo' | 'up' | 'corto' | 'clasificado' | 'otro'
  /** articulo., www., produto. o sin subdominio (los clasificados no) */
  marketplace: boolean
  itemId?: string
  productId?: string
  upId?: string
  /** el pedazo del path con el nombre ("mate-de-algarrobo"), tal como viene */
  slug?: string
}

const PAIS: Record<string, string> = {
  'com.ar': 'MLA', 'com.mx': 'MLM', 'com.br': 'MLB', cl: 'MLC', 'com.co': 'MCO', 'com.uy': 'MLU', 'com.pe': 'MPE',
  'com.ve': 'MLV', 'com.ec': 'MEC',
}
const SUB_MARKETPLACE = new Set(['', 'www', 'articulo', 'produto'])
const ID = /^M[A-Z]{2}\d{5,15}$/
const ITEM = /\/(M[A-Z]{2})-?(\d{5,15})(?=[-_/]|$)/i
const ITEM_SLUG = /\/M[A-Z]{2}-?\d+-(.+?)-_JM/i
// el slug antes de /p/ o /up/ puede faltar (www.mercadolibre.com.ar/p/MLA39939183): sigue siendo un catálogo
const CATALOGO = /(?:\/([^/]+))?\/p\/(M[A-Z]{2}\d{5,15})(?=\/|$)/i
const UP = /(?:\/([^/]+))?\/up\/(M[A-Z]{2}U\d{5,15})(?=\/|$)/i

/** El item elegido de un /up/ o un /p/: pdp_filters=item_id:MLA…, o wid=MLA… (en la query o en el #fragmento). */
function itemDeLaQuery(u: URL): string | undefined {
  const filtro = /(?:^|[|,;])item_id:(M[A-Z]{2}\d{5,15})(?=$|[|,;])/i.exec(u.searchParams.get('pdp_filters') ?? '')?.[1]
  let wid = u.searchParams.get('wid')
  if (!wid) try { wid = new URLSearchParams(u.hash.slice(1)).get('wid') } catch { wid = null }
  const id = (filtro ?? wid ?? '').toUpperCase()
  return ID.test(id) ? id : undefined
}

/**
 * Qué es un link de MercadoLibre (MLA, MLM, MLB…, meli.la y mercadolibre.com/sec/). Null si no es de MercadoLibre. El
 * fragmento y los parámetros de tracking no cambian nada. Del muro (/gz/account-verification?go=…) sale la publicación
 * que se quería ver.
 */
export function linkDeMercadoLibre(url: string, enElMuro = false): LinkML | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  const host = u.hostname.toLowerCase().replace(/\.+$/, '')
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !esHostDeMercadoLibre(host)) return null
  if (/^(?:www\.)?meli\.la$/.test(host) || (/^(?:www\.)?mercadolibre\.com$/.test(host) && u.pathname.startsWith('/sec/'))) {
    return { sitio: '', tipo: 'corto', marketplace: false }
  }
  const [, sub = '', pais = ''] = /^(?:([a-z0-9-]+)\.)?mercadoli(?:bre|vre)\.(.+)$/.exec(host) ?? []
  const marketplace = SUB_MARKETPLACE.has(sub)
  const base = { sitio: PAIS[pais] ?? '', marketplace }
  if (u.pathname.startsWith('/gz/')) {
    const go = u.searchParams.get('go')
    return (!enElMuro && go && linkDeMercadoLibre(go, true)) || { ...base, tipo: 'otro' }
  }
  const conSitio = (l: Omit<LinkML, 'sitio' | 'marketplace'>): LinkML => {
    const id = l.itemId ?? l.productId ?? l.upId
    return { ...base, ...l, sitio: id?.slice(0, 3) ?? base.sitio }
  }
  const itemId = itemDeLaQuery(u)
  const up = UP.exec(u.pathname)
  if (up) return conSitio({ tipo: 'up', upId: up[2].toUpperCase(), ...(up[1] && { slug: up[1] }), ...(itemId && { itemId }) })
  const cat = CATALOGO.exec(u.pathname)
  if (cat) return conSitio({ tipo: 'catalogo', productId: cat[2].toUpperCase(), ...(cat[1] && { slug: cat[1] }), ...(itemId && { itemId }) })
  const item = ITEM.exec(u.pathname)
  if (item) {
    const slug = ITEM_SLUG.exec(u.pathname)?.[1]
    return conSitio({ tipo: marketplace ? 'item' : 'clasificado', itemId: (item[1] + item[2]).toUpperCase(), ...(slug && { slug }) })
  }
  return { ...base, tipo: 'otro' }
}

/** Una publicación de marketplace (articulo., /p/, /up/): las que tienen el muro. Las tiendas, listados y clips no. */
export const esPublicacionDeMarketplace = (l: LinkML | null) =>
  !!l && l.marketplace && (l.tipo === 'item' || l.tipo === 'catalogo' || l.tipo === 'up')

// ---------------------------------------------------------------- API oficial

// La API oficial de MercadoLibre, con un token de la aplicación (client_credentials): lee las publicaciones que el muro
// no deja ver, con la foto y el precio. Se prende con dos variables de entorno, las credenciales de una aplicación
// registrada en developers.mercadolibre.com.ar: MELI_CLIENT_ID (el App ID) y MELI_CLIENT_SECRET (la clave secreta). Sin
// las dos, no se usa y los links de ML siguen el camino de la página. Siempre a este host (por eso alcanza con fetch):
// los ids se validan antes de armar la URL.

const API = 'https://api.mercadolibre.com'
/** Para el token y la publicación juntos: si no contesta en esto, sigue el camino de la página. */
export const API_ML_TIEMPO_MS = 4000

export const hayApiDeMercadoLibre = () => !!(process.env.MELI_CLIENT_ID && process.env.MELI_CLIENT_SECRET)

type Json = Record<string, unknown>
const esJson = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** El token de la aplicación, en memoria hasta un minuto antes de que venza. */
let token: { valor: string; vence: number } | null = null
/** Tras un token que no se pudo sacar, hasta cuándo no se vuelve a pedir (ver tokenDeLaApp). */
let sinTokenHasta = 0
const TOKEN_ESPERA_MS = 60_000

/** Una respuesta que no se va a leer: se suelta la conexión. */
const descartar = (r: Response) => r.body?.cancel().catch(() => {})

/**
 * El token. Si no lo dan (credenciales mal, el OAuth caído, colgado o con un JSON raro), null por un minuto sin volver a
 * pedirlo: si no, cada link de ML esperaba lo mismo antes de ir a la página (hasta los 4 s, con el OAuth colgado) y dejaba
 * una línea en el log. Si lo que se cortó fue el pedido de quien pregunta (deQuienPide), no es culpa del token.
 */
async function tokenDeLaApp(signal: AbortSignal, deQuienPide?: AbortSignal): Promise<string | null> {
  if (token && Date.now() < token.vence) return token.valor
  if (Date.now() < sinTokenHasta) return null
  try {
    token = await pedirToken(signal)
  } catch (e) {
    if (!deQuienPide?.aborted) sinTokenHasta = Date.now() + TOKEN_ESPERA_MS
    throw e
  }
  if (!token) sinTokenHasta = Date.now() + TOKEN_ESPERA_MS
  return token?.valor ?? null
}

/** Un token nuevo; null si no lo dan o si no tiene la forma. */
async function pedirToken(signal: AbortSignal): Promise<{ valor: string; vence: number } | null> {
  const r = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': UA_GIFTR },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: process.env.MELI_CLIENT_ID ?? '', client_secret: process.env.MELI_CLIENT_SECRET ?? '',
    }),
    redirect: 'error',
    signal,
  })
  if (!r.ok) {
    // solo el status: ni la respuesta ni el pedido, que lleva la clave
    console.warn(`API de MercadoLibre: el token dio ${r.status}`)
    await descartar(r)
    return null
  }
  const j: unknown = await r.json()
  const segundos = esJson(j) ? Number(j.expires_in) : NaN
  if (!esJson(j) || typeof j.access_token !== 'string' || !j.access_token || !Number.isFinite(segundos)) return null
  return { valor: j.access_token, vence: Date.now() + Math.max(0, segundos - 60) * 1000 }
}

/** GET a la API con el token; si da 401 (vencido antes de tiempo, revocado), se pide otro una sola vez. Null si no da 200. */
async function deLaApi(ruta: string, signal: AbortSignal, deQuienPide?: AbortSignal): Promise<unknown> {
  for (let intento = 0; intento < 2; intento++) {
    const t = await tokenDeLaApp(signal, deQuienPide)
    if (!t) return null
    const r = await fetch(`${API}${ruta}`, {
      headers: { authorization: `Bearer ${t}`, accept: 'application/json', 'user-agent': UA_GIFTR }, redirect: 'error', signal,
    })
    if (r.ok) return r.json()
    await descartar(r)
    if (r.status !== 401) return null
    if (token?.valor === t) token = null
  }
  return null
}

/** Lo de la API, limpio como lo de la página (ver limpiarTitulo, limpiarFoto y precioParaElForm). Null sin título. */
function lectura(titulo: unknown, fotos: unknown[], monto: unknown, moneda: unknown, host: string): Lectura | null {
  const t = typeof titulo === 'string' ? limpiarTitulo(titulo, null, host) : null
  if (!t) return null
  const foto = fotos.map((f) => limpiarFoto(f, `https://${host}/`)).find(Boolean) ?? null
  const precio = precioParaElForm(montoDeTexto(monto), typeof moneda === 'string' ? moneda : null, host)
  return { estado: 'ok', producto: { titulo: t, foto, precio } }
}

/** /items/{id}: una publicación cerrada ya no está; pausada o activa, se completa (como con la página). */
function deItem(j: unknown, host: string): Lectura | null {
  if (!esJson(j)) return null
  if (j.status === 'closed') return { estado: 'no-esta' }
  const foto = Array.isArray(j.pictures) && esJson(j.pictures[0]) ? j.pictures[0].secure_url ?? j.pictures[0].url : null
  return lectura(j.title, [foto, j.thumbnail], j.price, j.currency_id, host)
}

/** /products/{id}: el producto de catálogo, con el precio de la publicación que gana (si no hay, sin precio). */
function deProducto(j: unknown, host: string): Lectura | null {
  if (!esJson(j)) return null
  const foto = Array.isArray(j.pictures) && esJson(j.pictures[0]) ? j.pictures[0].url : null
  const gana = esJson(j.buy_box_winner) ? j.buy_box_winner : null
  return lectura(j.name, [foto], gana?.price, gana?.currency_id, host)
}

/**
 * La publicación de un link de ML según la API oficial: el producto, o no-esta si se cerró. Una publicación (y un /up/ o
 * un catálogo con el item elegido) por /items; un catálogo sin item, por /products; un /up/ sin item no tiene API. Un
 * catálogo con el item elegido sigue por /products si ese item se cerró o no se pudo leer: el producto lo puede vender
 * otro. Null si la API no está configurada, si el link no tiene un id para ella o si algo falla (red, tiempo, status,
 * JSON raro): entonces sigue el camino de la página. Nunca tira.
 */
export async function leerDeLaApi(url: string, signal?: AbortSignal): Promise<Lectura | null> {
  const ml = linkDeMercadoLibre(url)
  if (!ml || !hayApiDeMercadoLibre()) return null
  const host = new URL(url).hostname.toLowerCase().replace(/\.+$/, '')
  const tiempo = AbortSignal.timeout(API_ML_TIEMPO_MS)
  const s = signal ? AbortSignal.any([tiempo, signal]) : tiempo
  const leer = async (ruta: string, de: (j: unknown, host: string) => Lectura | null) => {
    try {
      return de(await deLaApi(ruta, s, signal), host)
    } catch {
      // red, tiempo o un JSON roto
      return null
    }
  }
  const item = ml.itemId && ID.test(ml.itemId) ? await leer(`/items/${ml.itemId}`, deItem) : null
  if (item?.estado === 'ok' || ml.tipo !== 'catalogo' || !ml.productId || !ID.test(ml.productId)) return item
  // un catálogo, sin item o con uno que se cerró: el producto (y si tampoco, lo que dijo el item)
  return (await leer(`/products/${ml.productId}`, deProducto)) ?? item
}
