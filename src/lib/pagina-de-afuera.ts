import { aHttps, bajarDeAfuera, pedirPagina, UA_GIFTR, type Corte, type Falla, type Pedir } from '@/lib/bajar-foto'
import { esUrlPublica, tituloDelLink } from '@/lib/links'
import { esPublicacionDeMarketplace, linkDeMercadoLibre, ML_PEDIR_MARKETPLACE } from '@/lib/mercadolibre'
import { esHome, esUrlDeMuro, leerProducto, urlTrasElMuro, type Estado, type Producto } from '@/lib/producto-del-link'

// La página del producto que pegó el usuario, bajada desde el servidor: con nuestro User-Agent, siguiendo a mano las
// redirecciones (cada una revisada, como la foto de la vista previa), con topes de tiempo y de bytes. Lo de afuera nunca
// vuelve tal cual: ni el HTML ni los headers ni el status.

export { UA_GIFTR }

/** La página de producto más grande que vimos pesa 2,94 MB (Samsung); las og están en los primeros KB. */
export const PAGINA_MAX_BYTES = 4_000_000
/** Con los saltos: la más lenta con datos tardó 2,6 s (Amazon), y los muros contestan en menos de un segundo. */
export const PAGINA_TIEMPO_MS = 6000
/** meli.la → articulo, http → https, www → sin www, el slug nuevo de Nike: alcanzan y sobran. */
export const PAGINA_SALTOS = 5

const esHtml = (tipo: string) => /^\s*(text\/html|application\/xhtml\+xml)\s*(;|$)/i.test(tipo)

/** Un label que TextDecoder entiende; si no, null. */
function decodificador(label: string | undefined): TextDecoder | null {
  if (!label) return null
  try {
    return new TextDecoder(label.trim().replace(/^["']|["']$/g, ''))
  } catch {
    return null
  }
}

/**
 * El HTML como texto, en el charset que corresponda: el del BOM, el del header, el <meta charset> (o http-equiv) de los
 * primeros 4 KB, y si no, utf-8. El BOM primero, como los navegadores: un archivo utf-8 con BOM servido con un header
 * latin1 mal puesto se ve bien en el navegador, y acá también (TextDecoder saca el BOM). Un label que no existe se lee
 * como utf-8.
 */
export function aTexto(datos: Buffer, contentType: string | null): string {
  const bom = datos[0] === 0xef && datos[1] === 0xbb && datos[2] === 0xbf ? 'utf-8'
    : datos[0] === 0xff && datos[1] === 0xfe ? 'utf-16le'
      : datos[0] === 0xfe && datos[1] === 0xff ? 'utf-16be' : undefined
  const meta = /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(datos.subarray(0, 4096).toString('latin1'))?.[1]
  const d = decodificador(bom) ?? decodificador(/charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType ?? '')?.[1]) ??
    decodificador(meta) ?? new TextDecoder('utf-8')
  return d.decode(datos)
}

/** Qué le toca al usuario por cada falla de la descarga. */
export function estadoDeFalla(f: Falla): Exclude<Estado, 'ok'> {
  return f === 'bloqueada' ? 'bloqueado' : f === 'no-esta' ? 'no-esta' : f === 'sin-datos' ? 'sin-datos' : 'no-carga'
}

/**
 * Lo que no se pide. Un muro: el nombre sale de la publicación que se quería ver (la que dice el muro, o la que mandó
 * ahí). La home, si lo pegado no era la home: así terminan los links cortos rotos (amzn.to, spotify.link). Y las
 * publicaciones de marketplace de ML si ML_PEDIR_MARKETPLACE está apagado: el nombre sale de esa misma URL.
 */
function noPedir(url: string, desde: string | null, pegado: string): Corte | null {
  if (esUrlDeMuro(url)) return { falla: 'bloqueada', urlProducto: urlTrasElMuro(url) ?? desde }
  if (desde && esHome(url) && !esHome(pegado)) return { falla: 'sin-datos', urlProducto: null }
  if (!ML_PEDIR_MARKETPLACE && esPublicacionDeMarketplace(linkDeMercadoLibre(url))) return { falla: 'bloqueada', urlProducto: url }
  return null
}

/**
 * Baja la página de un link: hasta 5 redirecciones, 6 s y 4 MB en total (más que eso se corta y se lee lo que llegó). Un
 * http:// pegado se pide por https. Si no se pudo, la falla y la URL de la que sale el nombre del producto (urlProducto).
 */
export async function bajarPagina(link: string, pedir: Pedir = pedirPagina, signal?: AbortSignal):
  Promise<{ html: string; urlFinal: string; cortado: boolean } | Corte> {
  const r = await bajarDeAfuera(aHttps(link), pedir, esUrlPublica, {
    max: PAGINA_MAX_BYTES, tiempoMs: PAGINA_TIEMPO_MS, saltos: PAGINA_SALTOS, aceptar: esHtml, siSePasa: 'cortar', signal,
    noPedir: (url, desde) => noPedir(url, desde, link),
  })
  if ('falla' in r) return r
  return { html: aTexto(r.datos, r.tipo), urlFinal: r.urlFinal, cortado: r.cortado }
}

/**
 * Baja y lee el producto de un link (los pasos 6 y 7 del route): el estado, y el producto con el título del link si la
 * página no dio uno (o no se pudo leer). urlProducto es de la que sale el sitio para los avisos.
 */
export async function leerPagina(link: string, pedir: Pedir = pedirPagina, signal?: AbortSignal):
  Promise<{ estado: Estado; producto: Producto; urlProducto: string }> {
  const p = await bajarPagina(link, pedir, signal)
  const lectura = 'falla' in p ? { estado: estadoDeFalla(p.falla) } : leerProducto(p.html, p.urlFinal)
  const urlProducto = ('falla' in p ? p.urlProducto : p.urlFinal) ?? link
  const producto = lectura.estado === 'ok' ? lectura.producto : { titulo: null, precio: null, foto: null }
  return { estado: lectura.estado, producto: { ...producto, titulo: producto.titulo ?? tituloDelLink(urlProducto) }, urlProducto }
}
