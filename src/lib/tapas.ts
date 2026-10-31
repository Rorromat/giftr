// Tapas: la app es neutra (papel de día, casi negro de noche) y el color lo ponen las fotos de los deseos y la tapa de cada
// lista, el color que pinta su encabezado de arriba y se funde con el fondo: el verde de la marca en la de una persona
// (todas iguales) y uva en la de una lista en común, para distinguirlas de un vistazo. La paleta (TAPAS) queda para la
// tarjeta grande de Inicio, una por persona. Son tonos medios, para que el texto blanco se lea encima en los dos modos.

/** La tapa de la lista de una persona (la tuya y la de cualquiera): el verde de la marca, la misma para todos. */
export const TAPA_PERSONA = 'var(--gr-acento)'
/** La tapa de una lista en común: uva, distinta de la de una persona. */
export const TAPA_EN_COMUN = '#5B3FB5'

export const TAPAS = [
  { id: 'frambuesa', nombre: 'Frambuesa', color: '#B5476A' },
  { id: 'francia', nombre: 'Francia', color: '#2D5BD0' },
  { id: 'monte', nombre: 'Monte', color: '#2E7D5B' },
  { id: 'uva', nombre: 'Uva', color: '#5B3FB5' },
  { id: 'camel', nombre: 'Camel', color: '#A26B3B' },
  { id: 'mostaza', nombre: 'Mostaza', color: '#C2802A' },
  { id: 'pileta', nombre: 'Pileta', color: '#2B8C9A' },
  { id: 'asfalto', nombre: 'Asfalto', color: '#4A4E5A' },
] as const

export type TapaId = (typeof TAPAS)[number]['id']

/** Un número estable para un texto (FNV-1a): el mismo id da siempre el mismo color, en el servidor y en el navegador. */
function hash(texto: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** El color de la paleta que le toca a algo (una persona o una lista) por su id. */
export const colorDe = (clave: string) => TAPAS[hash(clave) % TAPAS.length].color

/** La tapa de una persona: la que eligió en Perfil o, si no eligió, la que le toca por su id. */
export function tapaDe(id: string, elegida?: string | null) {
  return TAPAS.find((t) => t.id === elegida)?.color ?? colorDe(id)
}
