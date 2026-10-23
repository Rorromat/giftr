import { auth } from '@/auth'
import { db } from '@/db'
import { sitioDeLink, tituloDelLink } from '@/lib/links'
import { esPublicacionDeMarketplace, hayApiDeMercadoLibre, leerDeLaApi, linkDeMercadoLibre, ML_PEDIR_MARKETPLACE } from '@/lib/mercadolibre'
import { expandirLinkCorto, leerPagina, type PaginaLeida } from '@/lib/pagina-de-afuera'
import { anotarPedidoAfuera, urlDelPedido } from '@/lib/pedidos-afuera'
import type { Estado, RespuestaLink } from '@/lib/producto-del-link'

// Leer el producto del link que pegó el dueño en el formulario de un deseo (nombre, foto y precio), para completar lo que
// esté vacío. Un route handler y no una Server Action: Next despacha las actions de a una por cliente, y "Agregar"
// quedaría esperando a la lectura. POST con JSON: no se cachea, el link no queda en los logs ni en el Referer, y un
// formulario de otro sitio no lo puede mandar. De afuera nunca vuelve nada tal cual (ni el HTML ni el status), solo
// RespuestaLink. De quien pide toca solo users (el lock) y pedidos_afuera: nada de reservas ni regalos (la Sorpresa).

// node:https, node:dns y zlib
export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * Para todo junto, desde que llega el pedido (la sesión, el tope, la API de ML y la página con sus saltos): el cliente
 * corta a los 9 s y maxDuration es 10. Una base que tarda en despertar se descuenta de acá.
 */
const TIEMPO_MS = 8000

type Leido = PaginaLeida & { api?: boolean }

/** Sin leer la página (no se pide, o no se pudo): el nombre que trae el link. */
const delLink = (estado: Estado, url: string): Leido => ({
  estado, producto: { titulo: tituloDelLink(url), precio: null, foto: null }, urlProducto: url,
})

/**
 * El orden de MercadoLibre: con la API configurada, un link corto se sigue hasta su destino (sin pedirlo) y, si es una
 * publicación, se le pregunta a la API; si no contesta, o si no hay API, la página como con cualquier link (la de un link
 * corto, desde su destino: el link corto no se vuelve a pedir). Con ML_PEDIR_MARKETPLACE apagado, bajarPagina no pide la
 * publicación y queda el nombre del link. Nunca se cambia el host del link.
 */
async function leer(link: string, signal: AbortSignal): Promise<Leido> {
  const ml = linkDeMercadoLibre(link)
  let url = link
  if (ml && hayApiDeMercadoLibre()) {
    if (ml.tipo === 'corto') {
      const corto = await expandirLinkCorto(link, undefined, signal)
      // no llegó a un destino (no cargó, fue a la home…): lo que dio
      if (!('destino' in corto)) return corto
      url = corto.destino
    }
    const api = await leerDeLaApi(url, signal)
    if (api?.estado === 'ok') return { estado: 'ok', producto: api.producto, urlProducto: url, api: true }
    if (api) return { ...delLink(api.estado, url), api: true }
  }
  return leerPagina(url, undefined, signal)
}

function hostDe(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return '?'
  }
}

function responder(r: Leido, inicio: number): Response {
  // solo el host, el estado y lo que tardó (el link entero puede traer tokens): para ver cuánto bloquea cada sitio
  console.info(`deseo/link ${hostDe(r.urlProducto)} ${r.estado} ${Date.now() - inicio}ms${r.api ? ' api' : ''}`)
  const { titulo, precio, foto } = r.producto
  return Response.json({ estado: r.estado, titulo, precio, foto, sitio: sitioDeLink(r.urlProducto) } satisfies RespuestaLink)
}

export async function POST(request: Request) {
  const inicio = Date.now()
  const session = await auth()
  if (!session?.userId) return Response.json({ error: 'sin_sesion' }, { status: 401 })
  const pedido = await urlDelPedido(request)
  if ('error' in pedido) return Response.json({ error: pedido.error }, { status: pedido.error === 'muy_grande' ? 413 : 400 })
  const link = pedido.url
  // una publicación de ML que no se pide (y sin API): el nombre del link, sin salir a la red ni gastar el tope
  if (!ML_PEDIR_MARKETPLACE && !hayApiDeMercadoLibre() && esPublicacionDeMarketplace(linkDeMercadoLibre(link))) {
    return responder(delLink('bloqueado', link), inicio)
  }
  try {
    if (!(await anotarPedidoAfuera(db, session.userId))) return Response.json({ error: 'muchos' }, { status: 429 })
  } catch (e) {
    // sin la tabla (un preview, con la base de producción sin migrar) o sin base: no se sale a la red
    console.error('deseo/link: no se pudo anotar el pedido', e)
    return responder(delLink('no-carga', link), inicio)
  }
  const tiempo = AbortSignal.timeout(Math.max(0, TIEMPO_MS - (Date.now() - inicio)))
  return responder(await leer(link, AbortSignal.any([request.signal, tiempo])), inicio)
}
