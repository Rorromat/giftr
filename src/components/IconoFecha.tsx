import type { FechaEspecial } from '@/lib/fechas-especiales'

// Los íconos de las fechas especiales y del amigo invisible aparte (null): la idea de cada ilustración (ver
// IlustracionFecha), simplificada para lo chico (los cuadraditos de Regalos, los botones del formulario). Misma grilla de 24
// y mismo trazo de 2 con puntas redondas que los demás íconos de la app (ver Icon), y un detalle relleno como mucho.

type Glifo = { trazos: React.ReactNode; relleno?: React.ReactNode }

const GLIFOS: Record<FechaEspecial | 'aparte', Glifo> = {
  // el arbolito, con la estrella
  navidad: {
    trazos: <><path d="M12 2.8 L16.3 8.4 H14.2 L17.8 13.2 H15.6 L19.4 18.4 H4.6 L8.4 13.2 H6.2 L9.8 8.4 H7.7 Z" /><path d="M12 18.4 V21.4" /></>,
    relleno: <circle cx="12" cy="2.8" r="1.6" />,
  },
  // el mate con la bombilla; la yerba, rellena
  amigo: {
    trazos: <><path d="M8.2 9.5 C4.4 11.4 4.6 20.3 12 20.6 C19.4 20.3 19.6 11.4 15.8 9.5" /><path d="M7 9.3 H17" /><path d="M13.2 8.6 L16.8 3" /></>,
    relleno: <path d="M8.6 9.3 Q12 6.4 15.4 9.3 Z" />,
  },
  // el cuello de la camisa y la corbata
  padre: {
    trazos: <><path d="M7 4 L12 7.6 L17 4" /><path d="M10.6 7.6 h2.8 l-.6 2.6 h-1.6 Z" /><path d="M11.2 10.2 h1.6 L14.8 17.6 L12 20.8 L9.2 17.6 Z" /></>,
  },
  // un tulipán (del ramo)
  madre: {
    trazos: <><path d="M8 4 V9 A4 4 0 0 0 16 9 V4 L14 6 L12 3.5 L10 6 Z" /><path d="M12 13 V21" /><path d="M12 17.2 C9.6 15.6 7.2 15.9 6 18.2 C8.2 18.9 10.2 18.6 12 17.2" /></>,
  },
  // el barrilete, con la cola
  ninos: {
    trazos: <><path d="M12 2.6 L18.4 9 L12 16.6 L5.6 9 Z" /><path d="M12 2.6 V16.6 M5.6 9 H18.4" /><path d="M12 16.6 Q14.4 18.4 12.4 19.8 T13.6 22" /></>,
  },
  // el regalo con antifaz: el antifaz, relleno, tapa la caja
  aparte: {
    trazos: <><path d="M5 10.5 H19 V19 A1.6 1.6 0 0 1 17.4 20.6 H6.6 A1.6 1.6 0 0 1 5 19 Z" /><path d="M4 7 H20 V10.5 H4 Z" /><path d="M12 7 C10.4 3.4 7.2 4.2 9 7 M12 7 C13.6 3.4 16.8 4.2 15 7" /></>,
    relleno: <path d="M5.6 15.2 C5.6 13.4 8.4 13 12 14.2 C15.6 13 18.4 13.4 18.4 15.2 C18.4 17.2 16 17.6 14.4 16.4 Q12 15.2 9.6 16.4 C8 17.6 5.6 17.2 5.6 15.2 Z" />,
  },
}

/** El ícono de una fecha especial (o del aparte, con null): las líneas en el color del texto y el detalle en acento. */
export function IconoFecha({ fecha, size = 24, acento = 'var(--gr-accent)', className = '' }: {
  fecha: FechaEspecial | null
  size?: number
  /** el color del detalle relleno ("currentColor" para todo de un color) */
  acento?: string
  className?: string
}) {
  const g = GLIFOS[fecha ?? 'aparte']
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className={className}>
      <g fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{g.trazos}</g>
      {g.relleno && <g fill={acento}>{g.relleno}</g>}
    </svg>
  )
}
