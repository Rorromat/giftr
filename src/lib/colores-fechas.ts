import type { FechaEspecial } from '@/lib/fechas-especiales'

// Los colores de cada fecha especial (y del amigo invisible aparte, con null), para distinguirlas de un vistazo: el fondo de
// su tarjeta, de su cabecera y de su cuadradito; el círculo y el piso de su ilustración (un tono más claro y uno más oscuro
// que el fondo), y el detalle de su ícono. Navidad, roja (con el árbol verde y dorado); el Día del Amigo, noche violeta
// (con la Luna); el del Padre, azul marino (con la corbata mostaza); el de la Madre, frambuesa (con flores rosas); el del
// Niño, verde agua (con el barrilete amarillo y naranja). El aparte, negro con lima: los de la marca. El texto blanco sobre
// cada fondo pasa el contraste de 4.5:1.

export type PaletaFecha = {
  fondo: string
  /** el círculo guía de la ilustración y el brillo de la tarjeta */
  marco: string
  /** la sombra en el piso de la ilustración */
  piso: string
  /** el detalle relleno del ícono sobre el fondo */
  acento: string
}

const PALETAS: Record<FechaEspecial | 'aparte', PaletaFecha> = {
  navidad: { fondo: '#C7323C', marco: '#DB4B53', piso: '#9E222C', acento: '#FFC94A' },
  amigo: { fondo: '#4C3BC9', marco: '#6150DF', piso: '#3A2BA3', acento: '#86C440' },
  padre: { fondo: '#1F3C78', marco: '#2F5193', piso: '#16305F', acento: '#F2A93B' },
  madre: { fondo: '#C2386E', marco: '#D4527F', piso: '#9C2A57', acento: '#FFC1D5' },
  ninos: { fondo: '#0B7C78', marco: '#1C958F', piso: '#085F5C', acento: '#FFD447' },
  aparte: { fondo: '#141414', marco: '#2A2A27', piso: '#000000', acento: '#C8F31D' },
}

export const paletaDe = (f: FechaEspecial | null): PaletaFecha => PALETAS[f ?? 'aparte']
