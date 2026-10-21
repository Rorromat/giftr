import { linkHttp } from '@/lib/links'

// Las decisiones del campo de foto del formulario de un deseo (FotoField), sin React ni navegador para poder probarlas.

export type EstadoLink = 'ok' | 'probando' | 'no-es-foto'

/**
 * El link de foto escrito, listo para mandar, y cómo está: ok si ya cargó como imagen en el navegador (o es el que
 * estaba guardado, al editar: no se vuelve a pedir), probando mientras se prueba, no-es-foto si no es un link o no
 * cargó (una página de tienda). Sin nada escrito, sin estado.
 */
export function estadoDelLink(escrito: string, guardado: string | null, probados: Record<string, boolean>): { link: string | null; estado: EstadoLink | null } {
  const v = escrito.trim()
  if (!v) return { link: null, estado: null }
  if (v === guardado) return { link: v, estado: 'ok' }
  const link = linkHttp(v)
  if (!link) return { link: null, estado: 'no-es-foto' }
  const probado = Object.hasOwn(probados, link) ? probados[link] : undefined
  return { link, estado: probado === undefined ? 'probando' : probado ? 'ok' : 'no-es-foto' }
}

/**
 * Un pegado que trae una imagen, en cualquier campo del formulario. Una planilla o una nota copian el texto y además una
 * imagen de cómo se ve: el texto se pega normal en el campo y la imagen se sube solo si todavía no hay foto. Una imagen
 * sola ("Copiar imagen", que a veces trae también su link) es la foto. Nunca dos subidas a la vez.
 */
export function alPegarImagen(p: { texto: string; enCampoDeTexto: boolean; hayFoto: boolean; subiendo: boolean }): { dejarTexto: boolean; subir: boolean } {
  const texto = p.texto.trim()
  if (texto && p.enCampoDeTexto && !linkHttp(texto)) return { dejarTexto: true, subir: !p.hayFoto && !p.subiendo }
  return { dejarTexto: false, subir: !p.subiendo }
}
