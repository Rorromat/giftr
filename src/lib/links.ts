import { LARGO, recortar } from '@/lib/limites'

// Links escritos o pegados a mano (el de la tienda, el de una foto, uno pegado en el título). Sin dependencias: lo usan
// también los formularios en el navegador.

const ESQUEMA_HTTP = /^https?:\/\//i
// "mercadolibre.com.ar/…", "www.zara.com/ar": un dominio con punto, sin espacios, y lo que siga después de / ? o #
const DOMINIO = /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+(:\d+)?([/?#]\S*)?$/u

/**
 * Un link http(s), tal como lo escribieron: si viene sin esquema pero con pinta de dominio, con https:// adelante.
 * Null si no es un link de una página (javascript:, data:, texto suelto) o si es más largo de lo que se guarda (cortado
 * no anda). Termina en un <a href>: nunca otro esquema.
 */
export function linkHttp(valor: string): string | null {
  const v = valor.trim().replace(/^\/\//, '')
  // new URL acepta un \u0000 en el medio, y Postgres no: con eso, guardar el deseo daba la pantalla de error
  if (!v || /[\s\u0000-\u001f\u007f]/.test(v) || v.length > LARGO.link) return null
  const conEsquema = ESQUEMA_HTTP.test(v) ? v : DOMINIO.test(v) ? `https://${v}` : null
  if (!conEsquema || conEsquema.length > LARGO.link) return null
  try {
    const u = new URL(conEsquema)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? conEsquema : null
  } catch {
    return null
  }
}

/** Para el título de un deseo que era solo un link: el sitio, legible ("mercadolibre.com.ar"), para que el dueño lo cambie. */
export function sitioDeLink(link: string): string {
  try {
    return new URL(link).hostname.replace(/^(www|m|articulo|listado|produto)\./i, '')
  } catch {
    return link
  }
}

// MercadoLibre de cada país (con o sin subdominio), MercadoLivre de Brasil y los links cortos. Con $: un host parecido
// (mercadolibre.com.ar.otro.com) no es de MercadoLibre.
const HOST_ML = /^(?:[a-z0-9-]+\.)?mercadoli(?:bre\.(?:com\.ar|com\.mx|cl|com\.co|com\.uy|com\.pe|com\.ve|com\.ec|com)|vre\.com\.br)$|^(?:www\.)?meli\.la$/

/** Si el host es de MercadoLibre (o de sus links cortos). Sin el punto final ni mayúsculas que cambien el nombre. */
export const esHostDeMercadoLibre = (host: string) => HOST_ML.test(host.toLowerCase().replace(/\.+$/, ''))

// Dónde está el nombre en el link de cada tienda. En MercadoLibre, solo sus formas: el resto de sus links (tiendas,
// listados, clips) no traen el nombre de un producto.
const SLUG_ML = [
  /\/M[A-Z]{2}-?\d+-(.+?)-_JM/i, // publicación: /MLA-1418506688-mate-de-algarrobo-_JM
  /\/([^/]+)\/p\/M[A-Z]{2}\d+/i, // catálogo
  /\/([^/]+)\/up\/M[A-Z]{2}U\d+/i, // user product
]
const SLUG_TIENDA = [
  /\/products\/([^/]+)/, // Shopify
  /\/productos\/([^/]+)/, // Tiendanube
  /\/producto\/([^/_]+)/, // WooCommerce y Megatone (que sigue con _MKT0278BGH)
  /\/([^/]+)\/p\/?$/, // VTEX
  /\/p\/([^/]+)/, // Frávega
  /\/t\/([^/]+)/, // Nike
  /\/listing\/\d+\/([^/]+)/, // Etsy
  /\/([^/]+)\/dp\/[A-Z0-9]{10}/i, // Amazon
  /\/([^/]+)-p-\d+\.html$/, // Shein
  /\/([^/]+)-g-\d+\.html$/, // Temu
]

/** Un token que no es parte del nombre: un código o número largo (MKT0278BGH, cw2288, 2014), el JM de ML o algo enorme. */
function esCodigo(t: string): boolean {
  const digitos = t.replace(/\D/g, '').length
  return digitos >= 4 || (digitos > 0 && /\p{L}/u.test(t) && t.length >= 6) || t.toLowerCase() === 'jm' || t.length > 30
}

/**
 * El nombre del producto que trae el link, para el título mientras no haya otro ("…/MLA-123-mate-imperial-_JM" → "Mate
 * imperial"). Es un borrador que el dueño corrige: sale sin tildes ni puntos ("12 litros"). Null si el link no lo trae
 * (la home, un link que es solo un id, una sola palabra). Sin regex que tarden más que el largo del link.
 */
export function tituloDelLink(link: string): string | null {
  let u: URL
  try { u = new URL(link) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const ml = esHostDeMercadoLibre(u.hostname)
  for (const patron of ml ? SLUG_ML : SLUG_TIENDA) {
    const slug = patron.exec(u.pathname)?.[1]
    if (slug) return nombreDeSlug(slug)
  }
  if (ml) return null
  // Si no coincide ninguna forma conocida, el último pedazo del path sin la extensión; si ese es un código, el de antes
  // ("/pantalon-nike-club-mujer/NIIM8409-010.html", "/pd/chatitas-speedcat/401287.html"). No más atrás: sería la categoría.
  for (const pedazo of u.pathname.split('/').filter(Boolean).slice(-2).reverse()) {
    const nombre = nombreDeSlug(pedazo.replace(/\.[a-z0-9]{1,5}$/i, ''))
    if (nombre) return nombre
  }
  return null
}

/** "mate-imperial-de-calabaza-MKT0278" → "Mate imperial de calabaza"; null si no quedan al menos dos palabras. */
function nombreDeSlug(slug: string): string | null {
  let texto = slug
  try { texto = decodeURIComponent(slug) } catch { /* un % suelto: queda como vino */ }
  const tokens = texto.replace(/[-_+]/g, ' ').split(/\s+/).filter(Boolean)
  const quedan = tokens.filter((t) => !esCodigo(t))
  const palabras = quedan.filter((t) => (t.match(/\p{L}/gu)?.length ?? 0) >= 2).length
  // si se descartó más de la mitad, lo que queda no es el nombre
  if (palabras < 2 || (tokens.length - quedan.length) * 2 > tokens.length) return null
  const nombre = quedan.join(' ')
  return recortar(nombre.charAt(0).toUpperCase() + nombre.slice(1), LARGO.titulo) || null
}

const LINK_EN_TEXTO = /(?:https?:\/\/|www\.)\S+/i
// "…" y "’" son los que pone solo el teclado del iPhone en vez de "..." y "'".
const PUNTUACION = `.,;:!?'"»”’…>`
const cuenta = (s: string, c: string) => s.split(c).length - 1

// La puntuación de la oración pegada al final ("…/m, el negro", "…/x.", "(ver www.zara.com/ar)", "[https://…]") no es del
// link: con eso "Ver en la tienda" llevaba a una página que no existe. Un ")" o "]" que abre adentro se queda (wikipedia
// …/Mate_(infusión)). Letra por letra desde el final, sin una regex con $: el título no tiene largo máximo y una así tarda
// el cuadrado.
function sinPuntuacionFinal(s: string): string {
  const sobran = { ')': cuenta(s, ')') - cuenta(s, '('), ']': cuenta(s, ']') - cuenta(s, '[') }
  let fin = s.length
  while (fin > 0) {
    const c = s[fin - 1]
    if ((c === ')' || c === ']') && sobran[c] > 0) sobran[c]--
    else if (!PUNTUACION.includes(c)) break
    fin--
  }
  return s.slice(0, fin)
}

/**
 * El primer link http(s) de un texto ("Mate imperial https://…") y lo que queda sin él ni la puntuación pegada ("Remera
 * (ver": el dueño lo corrige si quiere). Null si no tiene.
 */
export function linkEnTexto(texto: string): { link: string; resto: string } | null {
  const m = LINK_EN_TEXTO.exec(texto)
  const link = m && linkHttp(sinPuntuacionFinal(m[0]))
  if (!m || !link) return null
  return { link, resto: `${texto.slice(0, m.index)} ${texto.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim() }
}

const RUTA_FOTO_DESEO = /^\/foto\/deseo\/([0-9a-f-]{36})$/i

/** Si el valor es la URL de una foto de deseo subida (y no un link cualquiera). */
export const esUrlFotoDeseo = (v: string) => RUTA_FOTO_DESEO.test(v)

/** El id (en minúsculas) de la foto subida de esa URL; null si es un link cualquiera. */
export const idDeUrlFotoDeseo = (v: string) => RUTA_FOTO_DESEO.exec(v)?.[1].toLowerCase() ?? null
