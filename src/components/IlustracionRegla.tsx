// Los dibujos de las reglas del amigo invisible (ver ReglasInvisible): chiquitos pero trabajados, como las ilustraciones de
// las cartas del agregado (ver IlustracionAgregado): contorno en tinta, blanco y grises, y un solo detalle en el acento.
// Caja de 48 × 48.

const TINTA = '#121216'
const BLANCO = '#FFFFFF'
const GRIS_1 = '#EDEDF0'
const GRIS_2 = '#DCDCE1'
const GRIS_3 = '#B9B9C2'
const ACENTO = 'var(--gr-acento)'
const ACENTO_OSCURO = 'var(--gr-acento-oscuro)'
const o = { stroke: TINTA, strokeWidth: 2.2, strokeLinejoin: 'round', strokeLinecap: 'round' } as const
const fino = { ...o, strokeWidth: 1.8 }

/** Un moñito (dos lazadas) centrado en (x, y), del color que se le diga. */
const Monito = ({ x, y, fill }: { x: number; y: number; fill: string }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M0 0c-2.5-5-9-6-8.6-1.6.3 3 5.4 2.8 8.6 1.6z" fill={fill} {...fino} />
    <path d="M0 0c2.5-5 9-6 8.6-1.6-.3 3-5.4 2.8-8.6 1.6z" fill={fill} {...fino} />
  </g>
)

const DIBUJOS: Record<string, React.ReactNode> = {
  // Sin regla: un regalo de siempre, en grises
  sin: <>
    <rect x="9" y="22" width="30" height="18" rx="3" fill={BLANCO} {...o} />
    <rect x="7" y="16" width="34" height="8" rx="2.5" fill={GRIS_1} {...o} />
    <path d="M21 16v24M27 16v24" {...fino} />
    <rect x="21" y="16" width="6" height="24" fill={GRIS_2} />
    <path d="M21 16v24M27 16v24" {...fino} />
    <Monito x={24} y={16} fill={GRIS_2} />
  </>,
  // Una propia: una tarjeta con renglones y el lápiz
  propia: <>
    <rect x="7" y="9" width="26" height="31" rx="3" fill={BLANCO} {...o} />
    <path d="M12 17h16M12 23h16M12 29h9" {...fino} />
    <g transform="translate(29 35) rotate(-48)">
      <rect x="0" y="-3.6" width="17" height="7.2" rx="1.2" fill={ACENTO} {...fino} />
      <rect x="17" y="-3.6" width="4" height="7.2" rx="1" fill={GRIS_2} {...fino} />
      <path d="M0-3.6L-6 0l6 3.6z" fill={BLANCO} {...fino} />
      <path d="M-4.2-1L-6 0l1.8 1z" fill={TINTA} />
    </g>
  </>,
  'de-tu-casa': <>
    <rect x="30" y="10" width="5" height="9" fill={BLANCO} {...o} />
    <rect x="11" y="21" width="26" height="19" rx="1.5" fill={BLANCO} {...o} />
    <path d="M6 23L24 8l18 15z" fill={ACENTO} {...o} />
    <rect x="20" y="29" width="8" height="11" rx="1.5" fill={GRIS_2} {...o} />
    <rect x="29.5" y="26" width="5" height="5" rx="1" fill={GRIS_1} {...fino} />
    <circle cx="26" cy="35" r=".9" fill={TINTA} />
  </>,
  'segunda-mano': <>
    <path d="M24 13v-2.5a3 3 0 1 0-3-3" fill="none" {...o} />
    <path d="M17 15l7-2 7 2 8 6-4 5-3-2v16H16V24l-3 2-4-5z" fill={BLANCO} {...o} />
    <path d="M21 14c1.5 3 4.5 3 6 0" fill="none" {...fino} />
    <path d="M31.5 24.5l2 3" {...fino} />
    <g transform="rotate(14 35 31)">
      <rect x="30" y="27" width="11" height="8.5" rx="1.6" fill={ACENTO} {...fino} />
      <circle cx="32.6" cy="31.2" r="1.1" fill={BLANCO} />
    </g>
  </>,
  bazar: <>
    <path d="M14 21C15 8 33 8 34 21" fill="none" {...o} />
    <rect x="15" y="9" width="6" height="14" rx="2" fill={GRIS_2} {...o} />
    <circle cx="29.5" cy="16.5" r="5" fill={ACENTO} {...o} />
    <path d="M29.5 11.5c.5-2 2-3 3.8-2.6" fill="none" {...fino} />
    <path d="M7 21h34l-4 19H11z" fill={BLANCO} {...o} />
    <path d="M10 27h28M11.5 33h25" {...fino} />
  </>,
  inicial: <>
    <path d="M10 17l6-6h22l-6 6z" fill={GRIS_2} {...o} />
    <path d="M32 17l6-6v21l-6 6z" fill={GRIS_1} {...o} />
    <rect x="10" y="17" width="22" height="21" rx="2" fill={BLANCO} {...o} />
    <path d="M15 33.5l6-12.5 6 12.5M17.4 28.5h7.2" fill="none" stroke={ACENTO} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
  </>,
  color: <>
    <path d="M12 18c2-13 22-13 24 0" fill="none" {...o} />
    <path d="M11.5 18h25l-3 22h-19z" fill={BLANCO} {...o} />
    <ellipse cx="24" cy="18" rx="12.5" ry="3.6" fill={ACENTO} {...o} />
    <path d="M17 20v7.5a2.3 2.3 0 0 0 4.6 0V20.8" fill={ACENTO} {...fino} />
    <path d="M14.5 25h3M26 30h7" {...fino} stroke={GRIS_3} />
  </>,
  palabra: <>
    <path d="M8 9h32a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H22l-8 7v-7H8a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3z" fill={BLANCO} {...o} />
    <rect x="11" y="14.5" width="17" height="6" rx="3" fill={ACENTO} />
    <rect x="11" y="23.5" width="25" height="3.5" rx="1.75" fill={GRIS_2} />
    <path d="M31 17.5h5" {...fino} />
  </>,
  epoca: <>
    <rect x="5" y="11" width="38" height="26" rx="3" fill={BLANCO} {...o} />
    <rect x="9" y="14.5" width="30" height="13" rx="1.5" fill={ACENTO} {...fino} />
    <rect x="14.5" y="18.5" width="19" height="6" rx="3" fill={BLANCO} {...fino} />
    <circle cx="18.5" cy="21.5" r="1.8" fill={GRIS_2} {...fino} />
    <circle cx="29.5" cy="21.5" r="1.8" fill={GRIS_2} {...fino} />
    <path d="M14 37l2-5h16l2 5" fill={GRIS_1} {...o} />
  </>,
  bizarro: <>
    <path d="M9 27c0 8 6 12 15 12s15-4 15-10c0-3.5-2.5-5-5.5-5H22c-7 0-13-1-13 3z" fill={BLANCO} {...o} />
    <circle cx="19" cy="16" r="7.5" fill={BLANCO} {...o} />
    <path d="M25.5 15.5l7.5 1.5-7.5 2.5z" fill={ACENTO} {...fino} />
    <rect x="13.5" y="12.5" width="11" height="4" rx="2" fill={TINTA} />
    <path d="M24 30c3-2.5 7-2.5 10 0" fill="none" {...fino} />
  </>,
  peor: <>
    <path d="M14 11H9a5 5 0 0 0 5 8M34 11h5a5 5 0 0 1-5 8" fill="none" {...o} />
    <path d="M14 8h20v10a10 10 0 0 1-20 0z" fill={BLANCO} {...o} />
    <circle cx="20" cy="15" r="1.3" fill={TINTA} />
    <circle cx="28" cy="15" r="1.3" fill={TINTA} />
    <path d="M20 22.5c2.5-2.5 5.5-2.5 8 0" fill="none" {...fino} />
    <rect x="21.5" y="28" width="5" height="5" fill={GRIS_2} {...o} />
    <rect x="15" y="33" width="18" height="7" rx="2" fill={ACENTO} {...o} />
  </>,
  envoltorio: <>
    <rect x="6" y="27" width="36" height="13" rx="2.5" fill={BLANCO} {...o} />
    <path d="M24 27v13" {...fino} />
    <rect x="12" y="18" width="24" height="9" rx="2" fill={GRIS_1} {...o} />
    <path d="M24 18v9" {...fino} />
    <rect x="17.5" y="11" width="13" height="7" rx="1.6" fill={ACENTO} {...o} />
    <Monito x={24} y={11} fill={ACENTO} />
  </>,
  robo: <>
    <path d="M12.5 16C17 6 31 6 35.5 16" fill="none" {...o} />
    <path d="M32 14.5l3.5 1.5 1.5-3.8M16 14.5L12.5 16 11 12.2" fill="none" {...o} />
    <rect x="5" y="22" width="16" height="16" rx="2.5" fill={BLANCO} {...o} />
    <path d="M13 22v16M5 30h16" {...fino} />
    <rect x="27" y="22" width="16" height="16" rx="2.5" fill={ACENTO} {...o} />
    <path d="M35 22v16M27 30h16" {...fino} />
  </>,
  adivina: <>
    <path d="M30.5 30.5L40 40" stroke={TINTA} strokeWidth={5.5} strokeLinecap="round" />
    <circle cx="21" cy="21" r="12.5" fill={BLANCO} {...o} />
    <circle cx="21" cy="21" r="9.5" fill="none" stroke={GRIS_2} strokeWidth={1.6} />
    <path d="M17.6 18.3a3.6 3.6 0 1 1 4.7 3.4c-1 .4-1.6 1.1-1.6 2.2v.9" fill="none" stroke={ACENTO} strokeWidth={2.8} strokeLinecap="round" />
    <circle cx="20.7" cy="28.6" r="1.6" fill={ACENTO} />
  </>,
  tesoro: <>
    <path d="M6 12l11-4 14 4 11-4v28l-11 4-14-4-11 4z" fill={BLANCO} {...o} />
    <path d="M17 8l14 4v28l-14-4z" fill={GRIS_1} />
    <path d="M17 8v28M31 12v28" {...fino} />
    <path d="M6 12l11-4 14 4 11-4v28l-11 4-14-4-11 4z" fill="none" {...o} />
    <path d="M10 33c4-6 8-7 12-4s6-2 9-7" fill="none" {...fino} strokeDasharray="1.5 3" />
    <path d="M32.5 16.5l5 5M37.5 16.5l-5 5" stroke={ACENTO} strokeWidth={3} strokeLinecap="round" />
  </>,
  rima: <>
    <rect x="7" y="8" width="25" height="32" rx="2.5" fill={BLANCO} {...o} />
    <path d="M12 16h14M12 22h14M12 28h9" {...fino} />
    <path d="M41 5C30 7 24 16 22 31c6-3.5 14-12 19-26z" fill={ACENTO} {...o} />
    <path d="M39 8.5L22 31" fill="none" {...fino} stroke={ACENTO_OSCURO} />
    <path d="M22 31l-1.5 3.5" {...o} />
  </>,
  'hecho-a-mano': <>
    <path d="M9 41L37 9M15 43L41 15" stroke={GRIS_3} strokeWidth={2.6} strokeLinecap="round" />
    <circle cx="37" cy="9" r="2" fill={BLANCO} {...fino} />
    <circle cx="41" cy="15" r="2" fill={BLANCO} {...fino} />
    <circle cx="21" cy="27" r="11" fill={ACENTO} {...o} />
    <path d="M12 23c6-4 13-3 18 4M11 29c7-3 14-1 19 7M15.5 35.5c4-6 9-9 15-9.5" fill="none" stroke={ACENTO_OSCURO} strokeWidth={1.6} strokeLinecap="round" />
    <path d="M31.5 31c5 2 7.5 5.5 8.5 10" fill="none" {...fino} />
  </>,
  experiencia: <>
    <path d="M32 13h10v6.5a4.5 4.5 0 0 0 0 9V35H32z" fill={ACENTO} />
    <path d="M6 13h36v6.5a4.5 4.5 0 0 0 0 9V35H6v-6.5a4.5 4.5 0 0 0 0-9z" fill="none" {...o} />
    <path d="M32 14v20" {...fino} strokeDasharray="2 2.6" />
    <path d="M18.5 17.5l1.8 3.7 4 .5-3 2.7.8 4-3.6-2-3.6 2 .8-4-3-2.7 4-.5z" fill={GRIS_2} {...fino} />
  </>,
  cuatro: <>
    <rect x="6" y="6" width="16" height="16" rx="2.5" fill={BLANCO} {...o} />
    <rect x="26" y="6" width="16" height="16" rx="2.5" fill={GRIS_1} {...o} />
    <rect x="6" y="26" width="16" height="16" rx="2.5" fill={GRIS_1} {...o} />
    <rect x="26" y="26" width="16" height="16" rx="2.5" fill={ACENTO} {...o} />
    <path d="M14 6v16M6 14h16M34 6v16M26 14h16M14 26v16M6 34h16M34 26v16M26 34h16" {...fino} />
  </>,
}

/** El dibujo de una regla (id de las de lib/reglas-invisible.ts, 'propia' o 'sin'), de lado × lado. */
export function IlustracionRegla({ id, size = 48, className = '' }: { id: string; size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
      {DIBUJOS[id] ?? DIBUJOS.sin}
    </svg>
  )
}
