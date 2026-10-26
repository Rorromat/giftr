// La paleta de cada paso de los gustos (como las de las fechas especiales, ver colores-fechas.ts): el fondo del cartel de
// cada paso, el círculo de la ilustración (marco), su sombra en el piso y el detalle (acento). El texto va en blanco
// sobre el fondo: todos pasan 4.5:1.

import type { PasoGustos } from '@/lib/gustos'

export type PaletaGusto = { fondo: string; marco: string; piso: string; acento: string }

const PALETAS: Record<PasoGustos, PaletaGusto> = {
  cumple: { fondo: '#D6336C', marco: '#E4578A', piso: '#A61E50', acento: '#FFD43B' },
  deportes: { fondo: '#1864AB', marco: '#2B7BC6', piso: '#0F4C85', acento: '#E8F25C' },
  futbol: { fondo: '#237A36', marco: '#2F9445', piso: '#1A5E29', acento: '#75AADB' },
  hobbies: { fondo: '#6741D9', marco: '#7C5AE6', piso: '#4C2BB0', acento: '#C8F31D' },
  ropa: { fondo: '#B5541C', marco: '#CB6A30', piso: '#8C3E12', acento: '#C8F31D' },
  colores: { fondo: '#0C7A75', marco: '#16938C', piso: '#075C58', acento: '#FFD43B' },
  bebidas: { fondo: '#862E3E', marco: '#A03F51', piso: '#64202D', acento: '#E9C08F' },
  'no-regalar': { fondo: '#141414', marco: '#2A2A27', piso: '#000000', acento: '#C8F31D' },
}

export const paletaGusto = (paso: PasoGustos) => PALETAS[paso]
