import type { FechaEspecial } from '@/lib/fechas-especiales'
import type { PasoGustos } from '@/lib/gustos'
import type { NombreSticker } from './giftr'

// Qué sticker reemplaza a cada ilustración cuando hay una propuesta de diseño puesta (ver components/Ilustrado.tsx). Aparte de
// Ilustrado, que es un componente de cliente: los server components los usan como valores.

/** El sticker de cada paso de los gustos. */
export const STICKER_GUSTO: Record<PasoGustos, NombreSticker> = {
  cumple: 'torta',
  deportes: 'padel',
  futbol: 'camiseta',
  hobbies: 'auriculares',
  ropa: 'bolsa',
  colores: 'remera',
  bebidas: 'cafe',
  'no-regalar': 'tazas',
}

/** El de cada fecha especial, y el del amigo invisible aparte (null). */
export const stickerDeFecha = (f: FechaEspecial | null): NombreSticker =>
  f === 'navidad' ? 'arbol' : f === 'amigo' ? 'mate' : f === 'padre' ? 'corbata' : f === 'madre' ? 'flores' : f === 'ninos' ? 'barrilete' : 'antifaz'
