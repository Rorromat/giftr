import { useId } from 'react'

// Las ilustraciones de las cartas del agregado (ver Agregado), con las reglas de las de los gustos (ver IlustracionGusto):
// - todo adentro del mismo círculo guía, de un color de la paleta de tapas, con su sombra en el piso;
// - la luz viene de arriba a la izquierda: la mitad derecha de cada objeto va un tono más oscura;
// - formas redondeadas, sin puntas.
// Cada una es una sola idea: la página de una tienda con un eslabón de cadena (pegar un link), una cámara con el flash
// prendido (sacarle una foto), el celu con la galería y una foto que sale (una foto del celu) y un anotador con un lápiz
// (escribirlo).

export type DibujoAgregado = 'link' | 'foto' | 'galeria' | 'escribir'

const BLANCO = '#FFFFFF'
const BLANCO_SOMBRA = '#E6E2DA'
const TINTA = '#141414'
const LIMA = '#C8F31D'
const ACENTO = '#F2413B'

/** El círculo y el piso de cada una: tonos de la paleta de tapas (lib/tapas.ts). */
const ESCENARIOS: Record<DibujoAgregado, { marco: string; piso: string }> = {
  link: { marco: '#4F78E3', piso: '#1F45B0' },
  foto: { marco: '#D9963A', piso: '#9A6418' },
  galeria: { marco: '#C9607F', piso: '#8A2F4D' },
  escribir: { marco: '#3E9A72', piso: '#1E5C40' },
}

/** Un destello de cuatro puntas. */
const Destello = ({ cx, cy, s, fill }: { cx: number; cy: number; s: number; fill: string }) => (
  <path fill={fill} d={`M${cx} ${cy - s} Q${cx + s * 0.12} ${cy - s * 0.12} ${cx + s} ${cy} Q${cx + s * 0.12} ${cy + s * 0.12} ${cx} ${cy + s} `
    + `Q${cx - s * 0.12} ${cy + s * 0.12} ${cx - s} ${cy} Q${cx - s * 0.12} ${cy - s * 0.12} ${cx} ${cy - s}Z`} />
)

/** La ilustración de una carta del agregado. Ocupa lo que le dé su lugar (sin deformarse). */
export function IlustracionAgregado({ dibujo, className = '' }: { dibujo: DibujoAgregado; className?: string }) {
  // ids propios para los recortes: van las cuatro en la misma pantalla
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const enSombra = `url(#${id}-mitad)`
  // la misma forma dos veces: entera con luz y, recortada a la derecha, en sombra
  const conSombra = (d: string, luz: string, sombra: string) => (
    <><path d={d} fill={luz} /><path d={d} fill={sombra} clipPath={enSombra} /></>
  )
  const { marco, piso } = ESCENARIOS[dibujo]

  let adentro: React.ReactNode
  switch (dibujo) {
    case 'link': {
      // la página de un producto: la barra con sus tres puntitos, la bolsa, el nombre y el precio
      const ventana = 'M44 44 H116 Q124 44 124 52 V108 Q124 116 116 116 H44 Q36 116 36 108 V52 Q36 44 44 44 Z'
      const bolsa = 'M50 74 H80 L77 104 Q76.5 108 72.5 108 H57.5 Q53.5 108 53 104 Z'
      adentro = (
        <>
          {conSombra(ventana, BLANCO, BLANCO_SOMBRA)}
          <path d="M44 44 H116 Q124 44 124 52 V56 H36 V52 Q36 44 44 44 Z" fill="#DCE4FA" />
          <circle cx="45" cy="50" r="2.2" fill={ACENTO} /><circle cx="52" cy="50" r="2.2" fill="#FFC94A" /><circle cx="59" cy="50" r="2.2" fill="#3E9A72" />
          <rect x="44" y="64" width="42" height="48" rx="6" fill="#FFE3EC" />
          <path d={bolsa} fill="#FF8FB1" />
          <path d="M58 76 V71 Q58 64 65 64 Q72 64 72 71 V76" fill="none" stroke="#E05A86" strokeWidth="3" strokeLinecap="round" />
          <rect x="92" y="66" width="24" height="5" rx="2.5" fill="#C9D3F2" />
          <rect x="92" y="76" width="16" height="5" rx="2.5" fill="#C9D3F2" />
          <rect x="92" y="88" width="24" height="10" rx="5" fill={TINTA} />
          {/* el eslabón, adelante: dos argollas enganchadas */}
          <g transform="rotate(-35 112 116)" fill="none" strokeLinecap="round">
            <rect x="90" y="108" width="26" height="15" rx="7.5" stroke={TINTA} strokeWidth="9" />
            <rect x="108" y="108" width="26" height="15" rx="7.5" stroke={TINTA} strokeWidth="9" />
            <rect x="90" y="108" width="26" height="15" rx="7.5" stroke={LIMA} strokeWidth="4.5" />
            <rect x="108" y="108" width="26" height="15" rx="7.5" stroke={LIMA} strokeWidth="4.5" />
            {/* el pedacito de la primera que pasa por adelante de la segunda */}
            <path d="M116 112 Q116 108 112 108" stroke={TINTA} strokeWidth="9" />
            <path d="M116 112.5 Q116 108 111 108" stroke={LIMA} strokeWidth="4.5" />
          </g>
          <Destello cx={124} cy={36} s={6} fill={BLANCO} /><Destello cx={36} cy={124} s={4} fill={LIMA} />
        </>
      )
      break
    }
    case 'foto': {
      const cuerpo = 'M48 64 H112 Q122 64 122 74 V112 Q122 122 112 122 H48 Q38 122 38 112 V74 Q38 64 48 64 Z'
      adentro = (
        <>
          {/* el visor y el disparador, arriba */}
          <rect x="50" y="56" width="22" height="12" rx="4" fill={BLANCO} />
          <rect x="98" y="58" width="12" height="9" rx="3" fill={ACENTO} />
          {conSombra(cuerpo, BLANCO, BLANCO_SOMBRA)}
          {/* la franja de cuero */}
          <rect x="38" y="80" width="84" height="26" fill="#2A2A30" />
          <rect x="80" y="80" width="42" height="26" fill={TINTA} />
          {/* el flash, prendido */}
          <rect x="100" y="70" width="14" height="7" rx="2" fill="#FFE89A" />
          {/* el lente */}
          <circle cx="80" cy="93" r="22" fill={BLANCO} />
          <path d="M80 71 A22 22 0 0 1 80 115 Z" fill={BLANCO_SOMBRA} />
          <circle cx="80" cy="93" r="16" fill="#26262C" />
          <circle cx="80" cy="93" r="9" fill="#3D4BA8" />
          <circle cx="80" cy="93" r="4.5" fill={TINTA} />
          <circle cx="74" cy="87" r="3.6" fill={BLANCO} opacity="0.85" />
          <Destello cx={124} cy={46} s={10} fill="#FFE066" />
          <Destello cx={137} cy={62} s={5} fill={BLANCO} />
          <Destello cx={108} cy={36} s={4} fill={BLANCO} />
        </>
      )
      break
    }
    case 'galeria': {
      // las fotos de la galería, de muchos colores; una sale del celu con su tilde
      const fotos = ['#2D5BD0', '#FFD43B', '#2E7D5B', '#FF8FB1', '#A26B3B', '#2B8C9A', LIMA, '#5B3FB5', ACENTO, '#9DB4FF', '#FFB078', '#4A4E5A']
      adentro = (
        <>
          <rect x="44" y="30" width="54" height="104" rx="11" fill={TINTA} />
          <rect x="48" y="38" width="46" height="88" rx="7" fill={BLANCO} />
          <rect x="64" y="33" width="14" height="3" rx="1.5" fill="#3A3A40" />
          {fotos.map((c, i) => (
            <rect key={c} x={51 + (i % 3) * 14.5} y={42 + Math.floor(i / 3) * 14.5} width="12.5" height="12.5" rx="3" fill={c} />
          ))}
          <rect x="51" y="102" width="40" height="5" rx="2.5" fill="#E6E2DA" />
          <rect x="51" y="111" width="26" height="5" rx="2.5" fill="#E6E2DA" />
          {/* la foto elegida, afuera, como una polaroid */}
          <g transform="rotate(10 110 92)">
            <rect x="88" y="66" width="44" height="52" rx="6" fill={BLANCO} />
            <rect x="110" y="66" width="22" height="52" rx="0" fill={BLANCO_SOMBRA} opacity="0.6" />
            <rect x="92" y="70" width="36" height="32" rx="3" fill="#9DB4FF" />
            <circle cx="120" cy="78" r="4.5" fill="#FFD43B" />
            <path d="M92 102 L104 86 L112 95 L118 89 L128 102 Z" fill="#2E7D5B" />
          </g>
          <circle cx="132" cy="66" r="10" fill={LIMA} />
          <path d="M127 66.5 L130.5 70 L137 63" fill="none" stroke={TINTA} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <Destello cx={36} cy={52} s={6} fill={BLANCO} /><Destello cx={124} cy={124} s={4} fill={LIMA} />
        </>
      )
      break
    }
    case 'escribir': {
      const hoja = 'M50 42 H110 Q118 42 118 50 V120 Q118 128 110 128 H50 Q42 128 42 120 V50 Q42 42 50 42 Z'
      adentro = (
        <>
          {conSombra(hoja, '#FFF6D6', '#F2E4B6')}
          {/* el espiral de arriba */}
          <path d="M50 42 H110 Q118 42 118 50 V54 H42 V50 Q42 42 50 42 Z" fill={TINTA} />
          {[52, 62, 72, 82, 92, 102].map((x) => <circle key={x} cx={x + 2} cy="48" r="2.4" fill="#FFF6D6" />)}
          {/* lo anotado: dos renglones a mano y un corazón */}
          <path d="M52 70 Q56 63 60 70 T68 70 T76 70 T84 70 T92 70" fill="none" stroke={TINTA} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M52 84 Q56 77 60 84 T68 84 T76 84" fill="none" stroke={TINTA} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M60 106 C52 99 54 92 60 96 C66 92 68 99 60 106 Z" fill={ACENTO} />
          <path d="M52 116 H84" stroke="#E9D9A6" strokeWidth="2" strokeLinecap="round" />
          {/* el lápiz, apoyado en diagonal */}
          <g transform="rotate(38 104 100)">
            <rect x="96" y="58" width="16" height="10" rx="3" fill="#FF8FB1" />
            <rect x="96" y="66" width="16" height="6" fill="#C9C9CE" />
            <rect x="96" y="71" width="16" height="44" fill="#FFD43B" />
            <rect x="104" y="71" width="8" height="44" fill="#E8B923" />
            <path d="M96 115 H112 L104 132 Z" fill="#F0D9B5" />
            <path d="M101 126 H107 L104 132 Z" fill={TINTA} />
          </g>
          <Destello cx={128} cy={40} s={6} fill={BLANCO} /><Destello cx={34} cy={60} s={4} fill={LIMA} />
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
