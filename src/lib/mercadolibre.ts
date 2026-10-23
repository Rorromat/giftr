import { esHostDeMercadoLibre } from '@/lib/links'

// Los links de MercadoLibre: qué son y qué ids traen, sin pedir nada a la red. Las publicaciones de marketplace
// (articulo., /p/, /up/) tienen un muro de login para los pedidos que salen de un datacenter: no lo eludimos, y el link
// se pide tal como vino. Los clasificados (auto., departamento., …) se leen como cualquier página.

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
const CATALOGO = /\/([^/]+)\/p\/(M[A-Z]{2}\d{5,15})(?=\/|$)/i
const UP = /\/([^/]+)\/up\/(M[A-Z]{2}U\d{5,15})(?=\/|$)/i

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
  if (up) return conSitio({ tipo: 'up', upId: up[2].toUpperCase(), slug: up[1], ...(itemId && { itemId }) })
  const cat = CATALOGO.exec(u.pathname)
  if (cat) return conSitio({ tipo: 'catalogo', productId: cat[2].toUpperCase(), slug: cat[1], ...(itemId && { itemId }) })
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
