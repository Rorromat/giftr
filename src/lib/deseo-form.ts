import type { CambiosDeseo, NewItemData } from '@/lib/items'
import { largo, LARGO } from '@/lib/limites'
import { esUrlFotoDeseo, linkEnTexto, linkHttp, sitioDeLink, tituloDelLink } from '@/lib/links'

// Sin dependencias del servidor: los avisos de abajo los usan los campos del formulario en el navegador.

const campo = (fd: FormData, k: string) => {
  const v = fd.get(k)
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/**
 * Un entero desde 1. El tope de 99 lo pone createItem/updateItem, y solo si cambió: uno de antes del tope con más se
 * sigue pudiendo editar sin que se la bajen (al editar, el tope es lo que ya tenía).
 */
function cantidad(v: string | null) {
  const n = Math.trunc(Number(v ?? '1'))
  return Number.isFinite(n) && n >= 1 ? n : 1
}

/** Un link que vino escrito: null si quedó vacío, undefined si no es un link (al editar, no borra el que había). */
function link(fd: FormData, k: string) {
  const v = campo(fd, k)
  return v === null ? null : linkHttp(v) ?? undefined
}

export type DeseoDelForm = Omit<NewItemData, 'notas' | 'fotoUrl' | 'precio' | 'rangoPrecio' | 'categoria' | 'linkTienda'> & CambiosDeseo

/**
 * El link del título que pasa a "Link a la tienda" (con lo que queda del título), o null si se queda en el título: pasa si
 * ese campo vino vacío o con el mismo link (lo pegó en los dos lados). Con uno distinto, o con algo que no es un link (un
 * link de antes que hoy no vale, que al editar se conserva), se queda: si no, se perdía ese otro link. El formulario usa la
 * misma regla en el navegador (ver linkParaCompletar), así los dos no mueven links distintos.
 */
export function linkQuePasa(titulo: string, linkTienda: string | null | undefined) {
  const enTitulo = linkTienda === undefined ? null : linkEnTexto(titulo)
  return enTitulo && (linkTienda === null || enTitulo.link === linkTienda) ? enTitulo : null
}

/**
 * Los campos del formulario de un deseo (agregar o editar). Null si falta el título. En los opcionales, null es que
 * quedó vacío (al editar, se borra) y undefined que vino algo que no sirve, como un link que no es link (al editar, queda
 * lo que había). Los largos y el tope de la cantidad los ponen createItem/updateItem.
 * - Un link sin https:// ("mercadolibre.com.ar/…") va con https://.
 * - Un link pegado en "¿Qué querés?" (lo que pide el formulario) pasa a "Link a la tienda" si ese campo vino vacío o con
 *   el mismo link, y el título queda con el resto del texto o, si era solo el link, con el nombre que trae el link ("Mate
 *   imperial", ver tituloDelLink) o el sitio, para que el dueño lo cambie (llega así sin JS, o si manda antes de que
 *   vuelva la lectura del producto). Si vino otro, el título queda como vino: sacárselo perdía ese link, y al editar un
 *   deseo de antes (con el link en el título y otro a la tienda) cualquier cambio le cambiaba el título y les avisaba a
 *   los que lo reservaron.
 * - alAgregar: no hay link guardado que conservar, así que algo que no es link en "Link a la tienda" cuenta como vacío y
 *   el del título pasa igual (llega sin JS o antes de que hidrate: si no, se quedaba en el título y createItem lo cortaba).
 */
export function deseoDesdeForm(fd: FormData, alAgregar = false): DeseoDelForm | null {
  let titulo = campo(fd, 'titulo')
  if (!titulo) return null
  let linkTienda = link(fd, 'linkTienda')
  const enTitulo = linkQuePasa(titulo, alAgregar ? linkTienda ?? null : linkTienda)
  if (enTitulo) {
    titulo = enTitulo.resto || tituloDelLink(enTitulo.link) || sitioDeLink(enTitulo.link)
    linkTienda = enTitulo.link
  }
  const p = campo(fd, 'prioridad')
  const foto = campo(fd, 'fotoUrl')
  const tipo = campo(fd, 'tipo') === 'idea' ? 'idea' : 'exacto'
  return {
    tipo,
    titulo,
    notas: campo(fd, 'notas'),
    precio: campo(fd, 'precio'),
    rangoPrecio: campo(fd, 'rangoPrecio'),
    categoria: campo(fd, 'categoria'),
    prioridad: p === 'mucho' || p === 'suelta' ? p : 'gustaria',
    cantidad: cantidad(campo(fd, 'cantidad')),
    // solo las ideas se repiten (en "Quiero ESTO" el casillero se esconde, pero puede venir tildado de antes)
    repetible: tipo === 'idea' && fd.get('repetible') === 'on',
    linkTienda,
    // una foto subida desde el teléfono (/foto/deseo/:id, en minúsculas como la ruta) o el link de una foto
    fotoUrl: foto === null ? null : esUrlFotoDeseo(foto) ? foto.toLowerCase() : linkHttp(foto) ?? undefined,
  }
}

/** Para agregar: lo vacío o lo que no sirve, simplemente no se carga. */
export function paraAgregar(d: DeseoDelForm): NewItemData {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== undefined)) as NewItemData
}

export const AVISO_LINK_LARGO = 'Ese link es muy largo. Probá copiarlo sin lo que va después del "?".'

export const AVISO_NO_ES_LINK = 'Eso no parece un link. Copiá el de la página de la tienda (por ejemplo mercadolibre.com.ar/…).'

/**
 * Lo que frena el envío del título en el navegador ('' si está bien), en vez de que el servidor lo corte sin avisar. No
 * lleva maxLength: tiene que entrar un link pegado entero (pasa a "Link a la tienda") y el navegador corta lo pegado en
 * silencio. Lo que cuenta es el texto sin el link, salvo que en "Link a la tienda" haya otro (linkTienda, como lo toma el
 * servidor: null vacío, undefined si no es un link; sin valor por defecto, que tomaría undefined como vacío): ahí el del
 * título se queda en el título (ver deseoDesdeForm) y cuenta.
 */
export function avisoDelTitulo(escrito: string, linkTienda: string | null | undefined): string {
  const v = escrito.trim()
  if (v.split(/\s+/).some((p) => p.length > LARGO.link)) return AVISO_LINK_LARGO
  const n = largo(linkQuePasa(v, linkTienda)?.resto ?? v)
  return n > LARGO.titulo ? `Hasta ${LARGO.titulo} letras: sobran ${n - LARGO.titulo}. Lo demás va en Notas.` : ''
}

/**
 * El de "Link a la tienda": entero o nada (cortado no anda, y si se pasa el servidor no lo guarda), y un link que el
 * servidor entienda (ver linkHttp): lo que no ("@lacasadelmate.ar", "tienda.com.ar." con el punto de la oración) se
 * descartaba sin avisar.
 */
export function avisoDelLink(escrito: string): string {
  const v = escrito.trim()
  if (!v) return ''
  if (v.length > LARGO.link) return AVISO_LINK_LARGO
  return linkHttp(v) ? '' : AVISO_NO_ES_LINK
}
