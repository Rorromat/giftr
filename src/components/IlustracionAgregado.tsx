import { useId } from 'react'

// Las ilustraciones de las cartas del agregado (ver Agregado). Monocromáticas, como la app: tinta, blanco y grises, con un
// solo detalle en el acento. Con las reglas de las de los gustos (ver IlustracionGusto):
// - todo adentro del mismo círculo guía, con su sombra en el piso;
// - la luz viene de arriba a la izquierda: la mitad derecha de cada objeto va un tono más oscura;
// - formas redondeadas, sin puntas, y acá con el contorno en tinta.
// Cada una es una sola idea: la página de una tienda con un eslabón de cadena (pegar un link), una cámara con el flash
// prendido (sacarle una foto), el celu con la galería y una foto que sale (una foto del celu) y un anotador con un lápiz
// (escribirlo).

export type DibujoAgregado = 'link' | 'foto' | 'galeria' | 'escribir'

const TINTA = '#121216'
const BLANCO = '#FFFFFF'
const ACENTO = '#F2413B'
// los grises de la base (ver tokens.css), de más claro a más oscuro
const GRIS_1 = '#EDEDF0'
const GRIS_2 = '#DCDCE1'
const GRIS_3 = '#B9B9C2'
const GRIS_4 = '#6C6C75'
const GRIS_5 = '#3A3A40'

/** Sobre la carta blanca o sobre la negra (la de la cámara): cambian el círculo, el piso y los destellos. */
const ESCENARIO = {
  clara: { marco: GRIS_1, piso: GRIS_2, destello: TINTA, sombra: GRIS_2 },
  oscura: { marco: '#2A2A30', piso: '#000000', destello: BLANCO, sombra: '#D2D2D8' },
}

/** Un destello de cuatro puntas. */
const Destello = ({ cx, cy, s, fill }: { cx: number; cy: number; s: number; fill: string }) => (
  <path fill={fill} d={`M${cx} ${cy - s} Q${cx + s * 0.12} ${cy - s * 0.12} ${cx + s} ${cy} Q${cx + s * 0.12} ${cy + s * 0.12} ${cx} ${cy + s} `
    + `Q${cx - s * 0.12} ${cy + s * 0.12} ${cx - s} ${cy} Q${cx - s * 0.12} ${cy - s * 0.12} ${cx} ${cy - s}Z`} />
)

/** La ilustración de una carta del agregado. Ocupa lo que le dé su lugar (sin deformarse). */
export function IlustracionAgregado({ dibujo, oscura = false, className = '' }: { dibujo: DibujoAgregado; oscura?: boolean; className?: string }) {
  // ids propios para los recortes: van las cuatro en la misma pantalla
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const { marco, piso, destello, sombra } = ESCENARIO[oscura ? 'oscura' : 'clara']
  /** Una pieza: entera con luz, la mitad derecha en sombra y el contorno en tinta. */
  const pieza = (d: string, luz = BLANCO, enSombra = sombra) => (
    <>
      <path d={d} fill={luz} />
      <path d={d} fill={enSombra} clipPath={`url(#${id}-mitad)`} />
      <path d={d} fill="none" stroke={TINTA} strokeWidth="3" strokeLinejoin="round" />
    </>
  )

  let adentro: React.ReactNode
  switch (dibujo) {
    case 'link': {
      // la página de un producto: la barra con sus tres puntitos, la bolsa, el nombre y el precio
      adentro = (
        <>
          {pieza('M44 44 H116 Q124 44 124 52 V108 Q124 116 116 116 H44 Q36 116 36 108 V52 Q36 44 44 44 Z')}
          <path d="M37.5 56 H122.5" stroke={TINTA} strokeWidth="3" />
          <circle cx="46" cy="50" r="2.4" fill={ACENTO} /><circle cx="53" cy="50" r="2.4" fill={GRIS_3} /><circle cx="60" cy="50" r="2.4" fill={GRIS_3} />
          <rect x="44" y="63" width="42" height="46" rx="6" fill={GRIS_1} />
          {pieza('M51 76 H79 L76.5 101 Q76 105 72 105 H58 Q54 105 53.5 101 Z')}
          <path d="M58 76 V72 Q58 65 65 65 Q72 65 72 72 V76" fill="none" stroke={TINTA} strokeWidth="3" strokeLinecap="round" />
          <rect x="92" y="66" width="24" height="5" rx="2.5" fill={GRIS_3} />
          <rect x="92" y="76" width="16" height="5" rx="2.5" fill={GRIS_2} />
          <rect x="92" y="88" width="24" height="10" rx="5" fill={TINTA} />
          {/* el eslabón, adelante: dos argollas enganchadas, en tinta con el centro blanco */}
          <g transform="rotate(-35 112 116)" fill="none" strokeLinecap="round">
            <rect x="90" y="108" width="26" height="15" rx="7.5" stroke={TINTA} strokeWidth="9" />
            <rect x="108" y="108" width="26" height="15" rx="7.5" stroke={TINTA} strokeWidth="9" />
            <rect x="90" y="108" width="26" height="15" rx="7.5" stroke={BLANCO} strokeWidth="3.5" />
            <rect x="108" y="108" width="26" height="15" rx="7.5" stroke={BLANCO} strokeWidth="3.5" />
            {/* el pedacito de la primera que pasa por adelante de la segunda */}
            <path d="M116 112 Q116 108 112 108" stroke={TINTA} strokeWidth="9" />
            <path d="M116 112.5 Q116 108 111 108" stroke={BLANCO} strokeWidth="3.5" />
          </g>
          <Destello cx={124} cy={36} s={6} fill={destello} /><Destello cx={36} cy={124} s={4} fill={GRIS_3} />
        </>
      )
      break
    }
    case 'foto': {
      adentro = (
        <>
          {/* el visor y el disparador, arriba */}
          {pieza('M54 56 H68 Q72 56 72 60 V66 H50 V60 Q50 56 54 56 Z')}
          <rect x="97" y="57.5" width="13" height="9" rx="3" fill={ACENTO} stroke={TINTA} strokeWidth="3" />
          {pieza('M48 64 H112 Q122 64 122 74 V112 Q122 122 112 122 H48 Q38 122 38 112 V74 Q38 64 48 64 Z')}
          {/* la franja de cuero */}
          <rect x="39.5" y="80" width="81" height="26" fill={GRIS_5} />
          <rect x="80" y="80" width="40.5" height="26" fill={TINTA} />
          {/* el flash, prendido */}
          <rect x="100" y="69.5" width="14" height="7" rx="2" fill={GRIS_1} stroke={TINTA} strokeWidth="2" />
          {/* el lente */}
          <circle cx="80" cy="93" r="22" fill={BLANCO} />
          <path d="M80 71 A22 22 0 0 1 80 115 Z" fill={sombra} />
          <circle cx="80" cy="93" r="22" fill="none" stroke={TINTA} strokeWidth="3" />
          <circle cx="80" cy="93" r="15" fill={GRIS_5} />
          <circle cx="80" cy="93" r="9" fill={GRIS_4} />
          <circle cx="80" cy="93" r="4.5" fill={TINTA} />
          <circle cx="74.5" cy="87.5" r="3.4" fill={BLANCO} opacity="0.9" />
          <Destello cx={124} cy={46} s={10} fill={destello} />
          <Destello cx={137} cy={62} s={5} fill={GRIS_3} />
          <Destello cx={108} cy={36} s={4} fill={destello} />
        </>
      )
      break
    }
    case 'galeria': {
      // las fotos de la galería, en grises; una sale del celu con su tilde
      const fotos = [GRIS_5, GRIS_2, GRIS_4, GRIS_3, GRIS_1, GRIS_5, GRIS_2, GRIS_4, GRIS_3, GRIS_4, GRIS_2, GRIS_3]
      adentro = (
        <>
          <rect x="44" y="30" width="54" height="104" rx="11" fill={TINTA} />
          <rect x="48" y="38" width="46" height="88" rx="7" fill={BLANCO} />
          <rect x="64" y="33" width="14" height="3" rx="1.5" fill={GRIS_5} />
          {fotos.map((c, i) => (
            <rect key={i} x={51 + (i % 3) * 14.5} y={42 + Math.floor(i / 3) * 14.5} width="12.5" height="12.5" rx="3" fill={c} />
          ))}
          <rect x="51" y="102" width="40" height="5" rx="2.5" fill={GRIS_2} />
          <rect x="51" y="111" width="26" height="5" rx="2.5" fill={GRIS_2} />
          {/* la foto elegida, afuera, como una polaroid */}
          <g transform="rotate(10 110 92)">
            {pieza('M94 66 H126 Q132 66 132 72 V112 Q132 118 126 118 H94 Q88 118 88 112 V72 Q88 66 94 66 Z')}
            <rect x="93" y="71" width="34" height="31" rx="3" fill={GRIS_2} />
            <circle cx="119" cy="79" r="4.5" fill={BLANCO} stroke={TINTA} strokeWidth="2" />
            <path d="M93 102 L104 87 L112 96 L118 90 L127 102 Z" fill={GRIS_4} />
            <rect x="93" y="71" width="34" height="31" rx="3" fill="none" stroke={TINTA} strokeWidth="2" />
          </g>
          {/* la elegida, con el tilde en el acento */}
          <circle cx="132" cy="66" r="10" fill={ACENTO} stroke={TINTA} strokeWidth="3" />
          <path d="M127 66.5 L130.5 70 L137 63" fill="none" stroke={BLANCO} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <Destello cx={36} cy={52} s={6} fill={destello} /><Destello cx={124} cy={126} s={4} fill={GRIS_3} />
        </>
      )
      break
    }
    case 'escribir': {
      adentro = (
        <>
          {pieza('M50 42 H110 Q118 42 118 50 V120 Q118 128 110 128 H50 Q42 128 42 120 V50 Q42 42 50 42 Z')}
          {/* el espiral de arriba */}
          <path d="M50 42 H110 Q118 42 118 50 V54 H42 V50 Q42 42 50 42 Z" fill={TINTA} />
          {[52, 62, 72, 82, 92, 102].map((x) => <circle key={x} cx={x + 2} cy="48" r="2.4" fill={BLANCO} />)}
          {/* lo anotado: dos renglones a mano y un corazón en el acento */}
          <path d="M52 70 Q56 63 60 70 T68 70 T76 70 T84 70 T92 70" fill="none" stroke={TINTA} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M52 84 Q56 77 60 84 T68 84 T76 84" fill="none" stroke={TINTA} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M60 106 C52 99 54 92 60 96 C66 92 68 99 60 106 Z" fill={ACENTO} />
          <path d="M52 116 H84" stroke={GRIS_2} strokeWidth="2" strokeLinecap="round" />
          {/* el lápiz, apoyado en diagonal */}
          <g transform="rotate(38 104 100)" stroke={TINTA} strokeWidth="2.5" strokeLinejoin="round">
            <rect x="96" y="58" width="16" height="10" rx="3" fill={GRIS_4} />
            <rect x="96" y="66" width="16" height="6" fill={GRIS_2} />
            <path d="M96 71 H112 V115 H96 Z" fill={BLANCO} />
            <path d="M104 71 H112 V115 H104 Z" fill={sombra} stroke="none" />
            <path d="M96 71 H112 V115 H96 Z" fill="none" />
            <path d="M96 115 H112 L104 132 Z" fill={GRIS_1} />
            <path d="M101 126 H107 L104 132 Z" fill={TINTA} />
          </g>
          <Destello cx={128} cy={40} s={6} fill={destello} /><Destello cx={34} cy={60} s={4} fill={GRIS_3} />
        </>
      )
      break
    }
  }

  return (
    <svg aria-hidden viewBox="12 18 136 126" preserveAspectRatio="xMidYMid meet" className={className}>
      <defs><clipPath id={`${id}-mitad`}><rect x="80" y="0" width="80" height="160" /></clipPath></defs>
      <circle cx="80" cy="80" r="58" fill={marco} />
      <ellipse cx="80" cy="137" rx="44" ry="6" fill={piso} />
      {adentro}
    </svg>
  )
}
