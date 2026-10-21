import type { CambiosDeseo, NewItemData } from '@/lib/items'
import { acotarCantidad } from '@/lib/limites'
import { esUrlFotoDeseo, linkEnTexto, linkHttp, sitioDeLink } from '@/lib/links'

const campo = (fd: FormData, k: string) => {
  const v = fd.get(k)
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Un link que vino escrito: null si quedó vacío, undefined si no es un link (al editar, no borra el que había). */
function link(fd: FormData, k: string) {
  const v = campo(fd, k)
  return v === null ? null : linkHttp(v) ?? undefined
}

export type DeseoDelForm = Omit<NewItemData, 'notas' | 'fotoUrl' | 'precio' | 'rangoPrecio' | 'categoria' | 'linkTienda'> & CambiosDeseo

/**
 * Los campos del formulario de un deseo (agregar o editar). Null si falta el título. En los opcionales, null es que
 * quedó vacío (al editar, se borra) y undefined que vino algo que no sirve, como un link que no es link (al editar, queda
 * lo que había). Los largos los corta createItem/updateItem.
 * - Un link sin https:// ("mercadolibre.com.ar/…") va con https://.
 * - Un link pegado en "¿Qué querés?" (lo que pide el formulario) pasa a "Link a la tienda" si no hay otro, y el título
 *   queda con el resto del texto o, si era solo el link, con el sitio, para que el dueño lo cambie.
 */
export function deseoDesdeForm(fd: FormData): DeseoDelForm | null {
  let titulo = campo(fd, 'titulo')
  if (!titulo) return null
  let linkTienda = link(fd, 'linkTienda')
  const enTitulo = linkEnTexto(titulo)
  if (enTitulo) {
    titulo = enTitulo.resto || sitioDeLink(enTitulo.link)
    if (!linkTienda) linkTienda = enTitulo.link
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
    cantidad: acotarCantidad(Number(campo(fd, 'cantidad') ?? '1')),
    // solo las ideas se repiten (en "Quiero ESTO" el casillero se esconde, pero puede venir tildado de antes)
    repetible: tipo === 'idea' && fd.get('repetible') === 'on',
    linkTienda,
    // una foto subida desde el teléfono (/foto/deseo/:id) o el link de una foto
    fotoUrl: foto === null ? null : esUrlFotoDeseo(foto) ? foto : linkHttp(foto) ?? undefined,
  }
}

/** Para agregar: lo vacío o lo que no sirve, simplemente no se carga. */
export function paraAgregar(d: DeseoDelForm): NewItemData {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== undefined)) as NewItemData
}
