import type { DelBuzon } from '@/lib/buzon-compartido'
import { LARGO, recortar, sinControl } from '@/lib/limites'
import { linkEnTexto, linkHttp } from '@/lib/links'

// Lo que llega cuando alguien comparte a GiftR desde otra app (el share_target del manifest, o el atajo del iPhone),
// pasado a los campos de un deseo. Sin dependencias del servidor ni del navegador: lo usan el route /compartir, /agregar,
// Inicio y, con lo que dejó el service worker, RecibirCompartido. Cualquiera puede armar esto: no se confía en nada.

/** Lo que manda la app que comparte, con los nombres del manifest (Android manda solo title y text; url, nunca). */
export type Recibido = { title?: unknown; text?: unknown; url?: unknown }

/**
 * Para el formulario. Con link, solo el link, que va en "¿Qué querés?" como un link pegado (lo mueve a "Link a la tienda"
 * y le busca el nombre CompletarDesdeLink; sin JS, el servidor). Sin link, el texto: la primera línea de título y, si no
 * entra entero, todo en Notas.
 */
export type Compartido = { link: string; titulo?: undefined; notas?: undefined } | { link?: undefined; titulo: string; notas: string | null }

/** Lo más que se mira de cada campo (un texto de 1 MB no se recorre entero). */
const TEXTO_MAX = 5000

// los saltos de línea de un formulario multipart llegan como \r\n
const texto = (v: unknown) => (typeof v === 'string' ? sinControl(v.slice(0, TEXTO_MAX)).replace(/\r\n?/g, '\n').trim() : '')

// Una sola línea que termina en la extensión de una foto; con una barra es un link de verdad (el de una foto)
const NOMBRE_DE_FOTO = /^[^/\\\n]+\.(jpe?g|png|webp|gif|hei[cf]|avif)$/i
// Los de la cámara y las capturas, con o sin extensión
const DE_LA_CAMARA = /^(IMG|PXL|DSC|VID|Screenshot)[-_]\S*$/i

/**
 * El nombre del archivo que algunas galerías mandan con la foto ("IMG_20261022_101010.jpg"): no es lo que quiere, y uno
 * como "mate.png" pasaría por un link (https://mate.png). Con espacios, solo si es corto y trae números, como la fecha de
 * "Captura de pantalla 2026-10-22 a las 10.10.10.png": "Me gusta este mate.jpg", o una nota de varias líneas que termina
 * en ".png", es un texto.
 */
const esArchivo = (t: string) => DE_LA_CAMARA.test(t) || (NOMBRE_DE_FOTO.test(t) && (!/\s/.test(t) || (t.length <= 80 && /\d/.test(t))))
const sinArchivo = (t: string) => (esArchivo(t) ? '' : t)

// Lo que tiene forma de link, como lo busca linkEnTexto
const CON_FORMA_DE_LINK = /(?:https?:\/\/|www\.)\S+/gi

/**
 * Sin lo que tiene forma de link y no es uno que sirva (ver linkHttp: uno de más de 2000 caracteres no se toma, cortado no
 * anda). Si quedara, recortado a 120 en el título (o a 500 en las notas) sería un link que sí pasa, pero roto: se buscaría
 * como uno pegado y, al agregar, iría a "Link a la tienda". Sin los espacios que quedan de más.
 */
function sinLinksQueNoSirven(t: string): string {
  let saco = false
  const r = t.replace(CON_FORMA_DE_LINK, (m) => {
    if (linkEnTexto(m)) return m
    saco = true
    return ''
  })
  return saco ? r.replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').trim() : r
}

/** El primer link, con la misma regla que un pegado: el de url; si no, el de text (ahí lo pone Android) y, si no, el de title. */
function primerLink(...campos: string[]): string | null {
  for (const c of campos) {
    const l = c && (linkHttp(c) ?? linkEnTexto(c)?.link)
    if (l) return l
  }
  return null
}

/**
 * Lo compartido, para el formulario; null si no vino nada que sirva. Con link, lo que viene al lado no se usa: es de la app
 * ("Mirá este producto en Mercado Libre") o el <title> de la página, y en el título quedaría eso en vez del nombre del
 * producto.
 */
export function loCompartido(r: Recibido): Compartido | null {
  const [title, text] = [r.title, r.text].map((v) => sinLinksQueNoSirven(sinArchivo(texto(v))))
  const url = texto(r.url)
  const link = primerLink(url, text, title)
  if (link) return { link }
  const escrito = text || title
  const titulo = recortar(escrito.split('\n').find((l) => l.trim()) ?? '', LARGO.titulo)
  if (!titulo) return null
  return { titulo, notas: titulo === escrito ? null : recortar(escrito, LARGO.notas) }
}

/** El id que pone el service worker en /agregar?compartido=… (crypto.randomUUID). */
export const ID_COMPARTIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const esIdCompartido = (id?: string): id is string => !!id && ID_COMPARTIDO.test(id)

/**
 * /agregar con lo compartido: a donde manda el route /compartir y a donde se vuelve después de entrar con Google. Siempre
 * esa ruta, con los valores en URLSearchParams: nunca a lo que vino. buzon: lo guardó el service worker (un id que no es
 * uno se ignora); auto: se llegó desde GiftR o desde otra app (ver compartidoAutomatico), solo junto con buzon.
 */
export function rutaAgregar(o: { buzon?: string; auto?: boolean; compartido?: Compartido | null; sinFoto?: boolean }): string {
  const q = new URLSearchParams()
  const c = o.compartido
  if (esIdCompartido(o.buzon)) {
    q.set('compartido', o.buzon)
    if (o.auto) q.set('auto', '1')
  } else if (c?.link !== undefined) q.set('link', c.link)
  else if (c) q.set('texto', c.notas ?? c.titulo)
  if (o.sinFoto) q.set('foto', 'no')
  const s = q.toString()
  return s ? `/agregar?${s}` : '/agregar'
}

/**
 * Lo más largo que se manda de vuelta después de entrar con Google: Auth.js la guarda en una cookie de unos 4 KB, con la URL
 * entera y codificada otra vez. Si no entra, se vuelve sin lo compartido.
 */
export const VUELTA_MAX = 1500

/** Lo que arma rutaAgregar y nada más (para el ?volver= de Inicio): lo que da URLSearchParams, sin "//", "\" ni otro host. */
export const esRutaAgregar = (v: string) => /^\/agregar(\?[A-Za-z0-9%&=*._+-]*)?$/.test(v)

/**
 * Si la búsqueda del link y la subida de la foto corren solas: solo si se llegó desde GiftR o desde otra app (Sec-Fetch-Site
 * none o same-origin), no desde otro sitio, que si no podría gastarle al dueño los topes de lecturas y de fotos con un link
 * o un formulario. Sin Sec-Fetch-Site tampoco: falta en los navegadores que no lo mandan (Safari antes de 16.4, Firefox
 * antes de 90), y ahí cualquier sitio pasaría; el link queda en el título sin buscarse, como desde otro sitio. También con
 * auto=1 junto con un id del buzón: lo pone /agregar en la vuelta del login (que llega cross-site, desde Google) solo si la
 * primera llegada vino de acá, y otro sitio no conoce el id.
 */
export function compartidoAutomatico(o: { sitio: string | null; buzon?: string; auto?: string }): boolean {
  if (o.sitio === 'none' || o.sitio === 'same-origin') return true
  return esIdCompartido(o.buzon) && o.auto === '1'
}

/** Qué hace el formulario con lo que dejó el service worker (ver RecibirCompartido). */
export type QueHacer = {
  /** Lo que va en "¿Qué querés?": el link o la primera línea del texto. Solo si estaba vacío. */
  titulo?: string
  /**
   * El link, si es automático: entra en el título como un pegado (como "Pegar link copiado"), y CompletarDesdeLink lo busca
   * en el momento. Lo demás (un texto, o un link que no es automático) entra como escrito (ver RecibirCompartido).
   */
  pegar?: string
  /** Solo si estaban vacías. */
  notas?: string
  /** Se sube como una elegida con Foto. Solo si es automático. */
  foto?: Blob
  /** Vino una foto que no se sube: no es automático, o el service worker no la tomó (tipo o tamaño). */
  fotoNoLlego: boolean
}

/** Lo del buzón, sin pisar lo que ya esté escrito en el título y en las notas. */
export function queHacerConLoCompartido(r: DelBuzon, o: { automatico: boolean; titulo: string; notas: string }): QueHacer {
  const c = loCompartido(r)
  const titulo = c && !o.titulo.trim() ? c.link ?? c.titulo : undefined
  return {
    titulo,
    pegar: titulo !== undefined && o.automatico && c?.link !== undefined ? titulo : undefined,
    notas: c?.notas && !o.notas.trim() ? c.notas : undefined,
    foto: o.automatico && r.foto ? r.foto : undefined,
    fotoNoLlego: (!!r.foto && !o.automatico) || r.fotoRechazada,
  }
}
