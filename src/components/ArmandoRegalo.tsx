import { PARTES_MONO } from '@/lib/mono'

// Mientras carga lo que sumaste en el agregado (ver Agregado): se arma el regalo, distinto según cómo lo sumaste. Como las
// ilustraciones de las cartas (ver IlustracionAgregado): tinta, blanco y grises, y el acento solo en la cinta y el moño, que
// es lo que lo vuelve regalo. Las animaciones van en tokens.css (gr-armando): lo que se ve sin ellas (movimiento reducido)
// es como termina, el regalo armado.
// - link: caen en la caja la foto, el precio y el nombre ("Trayendo nombre, foto y precio"); se cierra y sale el moño.
// - foto: el flash, una línea que la recorre ("Mirando la foto") y la foto se envuelve con la cinta y el moño.
// - galeria: la foto sube ("Subiendo la foto") y se envuelve.
// - escribir: un lápiz escribe la idea en una tarjetita, que queda atada con el moño y se hamaca.

type Tipo = 'link' | 'foto' | 'galeria' | 'escribir'

const TINTA = '#121216'
const BLANCO = '#FFFFFF'
const GRIS_1 = '#EDEDF0'
const GRIS_2 = '#DCDCE1'
const GRIS_3 = '#B9B9C2'
const ACENTO = 'var(--gr-acento)'
const ACENTO_OSCURO = 'var(--gr-acento-oscuro)'
const linea = { stroke: TINTA, strokeWidth: 3.5, strokeLinejoin: 'round', strokeLinecap: 'round' } as const

/** El moño del logo, con borde blanco (como pegado), centrado en (x, y) y de lado × lado. d: cuándo aparece. */
function Mono({ x, y, lado, d }: { x: number; y: number; lado: number; d: number }) {
  const t = `translate(${x - lado / 2} ${y - lado / 2}) scale(${lado / 100})`
  const tonos = {
    claro: ACENTO,
    medio: 'color-mix(in oklch, var(--gr-acento) 80%, var(--gr-acento-oscuro))',
    oscuro: 'color-mix(in oklch, var(--gr-acento) 55%, var(--gr-acento-oscuro))',
    nudo: ACENTO_OSCURO,
  }
  return (
    <g className="gr-armando__mono" style={{ '--d': `${d}ms` } as React.CSSProperties}>
      <g transform={t} fill="none" stroke={BLANCO} strokeWidth={12} strokeLinejoin="round">
        {PARTES_MONO.filter((p) => !p.opacidad).map((p) => <path key={p.d} d={p.d} />)}
      </g>
      <g transform={t}>
        {PARTES_MONO.map((p) => <path key={p.d} d={p.d} fill={tonos[p.tono]} opacity={p.opacidad} />)}
      </g>
    </g>
  )
}

/** Pegar un link: la caja abierta, caen la foto, el precio y el nombre, cae la tapa y sale el moño. */
function Caja() {
  const cae = (d: number) => ({ className: 'gr-armando__cae', style: { '--d': `${d}ms` } as React.CSSProperties })
  return (
    <>
      <ellipse cx="100" cy="178" rx="62" ry="8" fill={GRIS_2} />
      {/* el fondo de la caja, que se ve por arriba */}
      <rect x="46" y="98" width="108" height="14" rx="4" fill={GRIS_3} {...linea} />
      {/* lo que trae el link: la foto, el precio y el nombre */}
      <g {...cae(100)}>
        <rect x="74" y="34" width="52" height="40" rx="7" fill={BLANCO} {...linea} />
        <path d="M80 66l12-13 9 9 6-5 13 9" fill="none" {...linea} strokeWidth={3} />
        <circle cx="112" cy="46" r="4" fill={ACENTO} />
      </g>
      <g {...cae(330)}>
        <path d="M80 44h36a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H80l-10-13z" fill={GRIS_1} {...linea} />
        <text x="98" y="58" dy="0.35em" textAnchor="middle" fontSize="18" fontWeight="900" fill={TINTA}>$</text>
      </g>
      <g {...cae(560)}>
        <rect x="70" y="46" width="60" height="24" rx="7" fill={BLANCO} {...linea} />
        <path d="M78 54h34M78 62h22" fill="none" {...linea} strokeWidth={3} />
      </g>
      {/* el frente de la caja, con su mitad derecha en sombra, y la cinta */}
      <rect x="46" y="106" width="108" height="66" rx="8" fill={BLANCO} />
      <rect x="100" y="106" width="54" height="66" fill={GRIS_1} />
      <rect x="91" y="106" width="18" height="66" fill={ACENTO} />
      <rect x="46" y="106" width="108" height="66" rx="8" fill="none" {...linea} />
      <path d="M91 106v66M109 106v66" {...linea} strokeWidth={3} />
      {/* la tapa, que cae y cierra */}
      <g className="gr-armando__tapa">
        <rect x="38" y="88" width="124" height="24" rx="7" fill={BLANCO} />
        <rect x="100" y="88" width="62" height="24" fill={GRIS_1} />
        <rect x="91" y="88" width="18" height="24" fill={ACENTO} />
        <rect x="38" y="88" width="124" height="24" rx="7" fill="none" {...linea} />
        <path d="M91 88v24M109 88v24" {...linea} strokeWidth={3} />
      </g>
      <Mono x={100} y={76} lado={64} d={1300} />
    </>
  )
}

/** Sacarle una foto o una del celu: la foto (que sube, si viene del celu) se envuelve con la cinta y sale el moño. */
function Envuelta({ foto, sube }: { foto: string; sube: boolean }) {
  // de la cámara: primero el flash y la línea que la mira; del celu, primero sube
  const empieza = sube ? 550 : 900
  const cinta = (d: number) => ({ style: { '--d': `${d}ms` } as React.CSSProperties })
  return (
    <>
      <g className={sube ? 'gr-armando__sube' : undefined}>
        <image href={foto} x="0" y="0" width="200" height="200" preserveAspectRatio="xMidYMid slice" />
      </g>
      {!sube && (
        <>
          <rect className="gr-armando__flash" x="0" y="0" width="200" height="200" fill={BLANCO} />
          <g className="gr-armando__escaneo">
            <rect x="0" y="-14" width="200" height="16" fill={ACENTO} opacity="0.25" />
            <rect x="0" y="0" width="200" height="3" fill={ACENTO} />
          </g>
        </>
      )}
      <g className="gr-armando__cinta-v" {...cinta(empieza)}>
        <rect x="88" y="-4" width="24" height="208" fill={ACENTO} {...linea} />
      </g>
      <g className="gr-armando__cinta-h" {...cinta(empieza + 200)}>
        <rect x="-4" y="88" width="208" height="24" fill={ACENTO} {...linea} />
      </g>
      <Mono x={100} y={88} lado={88} d={empieza + 450} />
    </>
  )
}

/** Escribirlo: el lápiz escribe la idea en una tarjetita de regalo, que queda atada con el moño y se hamaca. */
function Tarjetita() {
  const renglon = (d: string, ms: number) => (
    <path className="gr-armando__renglon" d={d} pathLength={70} style={{ '--d': `${ms}ms` } as React.CSSProperties}
          fill="none" stroke={TINTA} strokeWidth={5} strokeLinecap="round" />
  )
  return (
    <>
      <ellipse cx="100" cy="186" rx="44" ry="6" fill={GRIS_2} />
      <g className="gr-armando__hamaca">
        <path d="M100 82C92 64 108 50 100 34" fill="none" {...linea} strokeWidth={3} />
        <path d="M76 78h48l22 22v62a10 10 0 0 1-10 10H64a10 10 0 0 1-10-10v-62z" fill={BLANCO} />
        <path d="M100 78h24l22 22v62a10 10 0 0 1-10 10h-36z" fill={GRIS_1} />
        <path d="M76 78h48l22 22v62a10 10 0 0 1-10 10H64a10 10 0 0 1-10-10v-62z" fill="none" {...linea} />
        <circle cx="100" cy="92" r="6" fill={GRIS_2} {...linea} strokeWidth={3} />
        {renglon('M68 120h64', 150)}
        {renglon('M68 138h64', 600)}
        {renglon('M68 156h40', 1050)}
      </g>
      {/* el lápiz, con la punta en el (0, 0) de su grupo, sigue los renglones */}
      <g className="gr-armando__lapiz">
        <g transform="rotate(-45)">
          <path d="M0 0l11-6v12z" fill={GRIS_3} {...linea} strokeWidth={2.5} />
          <rect x="11" y="-6" width="34" height="12" fill={ACENTO} {...linea} strokeWidth={2.5} />
          <rect x="45" y="-6" width="9" height="12" rx="3" fill={BLANCO} {...linea} strokeWidth={2.5} />
        </g>
      </g>
      <Mono x={100} y={36} lado={66} d={1450} />
    </>
  )
}

/** El dibujo de la tarjeta mientras carga. foto: la que eligió (en foto y galeria); sin ella, la caja. */
export function ArmandoRegalo({ tipo, foto }: { tipo: Tipo; foto: string | null }) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden className="gr-armando" data-tipo={tipo}>
      <rect width="200" height="200" fill={GRIS_1} />
      {tipo === 'escribir' ? <Tarjetita />
        : (tipo === 'foto' || tipo === 'galeria') && foto ? <Envuelta foto={foto} sube={tipo === 'galeria'} />
          : <Caja />}
    </svg>
  )
}
