import { useId } from 'react'
import type { FechaEspecial } from '@/lib/fechas-especiales'

// Las ilustraciones de las fechas especiales y del amigo invisible aparte (null), todas con las mismas reglas:
// - todo adentro del mismo círculo guía, con su sombra en el piso;
// - la luz viene de arriba a la izquierda: la mitad derecha de cada objeto va un tono más oscura;
// - formas redondeadas, sin puntas, salvo la estrella de GiftR, que va como firma;
// - las fechas, sobre azul; el aparte, sobre negro con lima.
// Cada una es una sola idea: el arbolito con un regalo abajo, el mate (con la Luna del 20 de julio de 1969 atrás), la camisa
// con corbata, el ramo, el barrilete y el regalo con antifaz. En chico va IconoFecha, la misma idea simplificada.

const C = {
  azul: '#2F5BEA', marco: '#4A74FF', piso: '#2347C4', marcoOscuro: '#2A2A27',
  blanco: '#FFFFFF', blancoSombra: '#D6E0FF', lima: '#C8F31D', limaSombra: '#A3C90B', tinta: '#141414',
}

/** Las puntas de la estrella de GiftR (la del logo), centrada en cx, cy. */
function puntas(cx: number, cy: number, afuera: number, adentro: number, n = 12) {
  return Array.from({ length: 2 * n }, (_, i) => {
    const r = i % 2 ? adentro : afuera
    const a = (Math.PI * i) / n - Math.PI / 2
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
  }).join(' ')
}
const Estrella = ({ cx, cy, r }: { cx: number; cy: number; r: number }) => <polygon points={puntas(cx, cy, r, r * 0.63)} fill={C.lima} />

/** Un destello de cuatro puntas. */
const Destello = ({ cx, cy, s, fill }: { cx: number; cy: number; s: number; fill: string }) => (
  <path fill={fill} d={`M${cx} ${cy - s} Q${cx + s * 0.12} ${cy - s * 0.12} ${cx + s} ${cy} Q${cx + s * 0.12} ${cy + s * 0.12} ${cx} ${cy + s} `
    + `Q${cx - s * 0.12} ${cy + s * 0.12} ${cx - s} ${cy} Q${cx - s * 0.12} ${cy - s * 0.12} ${cx} ${cy - s}Z`} />
)

/** El marco común: el círculo guía y la sombra en el piso. */
const Escenario = ({ oscuro = false }: { oscuro?: boolean }) => (
  <>
    <circle cx="80" cy="80" r="58" fill={oscuro ? C.marcoOscuro : C.marco} />
    <ellipse cx="80" cy="135" rx="44" ry="6" fill={oscuro ? '#000' : C.piso} opacity={oscuro ? 0.45 : 1} />
  </>
)

/**
 * La ilustración de una fecha especial (o del amigo invisible aparte, con null), de 160 de lado. firma: la estrellita de
 * GiftR al costado (sin ella donde ya hay otra estrella, como la cuenta regresiva de Próximos).
 */
export function IlustracionFecha({ fecha, size = 150, firma = true, className = '' }: {
  fecha: FechaEspecial | null
  size?: number
  firma?: boolean
  className?: string
}) {
  // ids propios para los recortes: puede haber varias en la misma pantalla
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const mitad = (x: number) => (
    <clipPath id={`${id}-m${x}`}><rect x={x} y="0" width={160 - x} height="160" /></clipPath>
  )
  const enSombra = (x: number) => `url(#${id}-m${x})`

  let dibujo: React.ReactNode
  switch (fecha) {
    case 'navidad': {
      const arbol = <><polygon points="80,38 103,64 57,64" /><polygon points="80,53 111,88 49,88" /><polygon points="80,70 119,112 41,112" /></>
      dibujo = (
        <>
          <defs>{mitad(80)}</defs>
          <Escenario />
          <g fill={C.blanco} stroke={C.blanco} strokeWidth="9" strokeLinejoin="round">{arbol}</g>
          <g clipPath={enSombra(80)} fill={C.blancoSombra} stroke={C.blancoSombra} strokeWidth="9" strokeLinejoin="round">{arbol}</g>
          <rect x="73" y="114" width="14" height="18" rx="3" fill={C.tinta} />
          <circle cx="67" cy="83" r="4.5" fill={C.lima} /><circle cx="93" cy="102" r="4.5" fill={C.lima} />
          <circle cx="86" cy="62" r="4" fill={C.lima} /><circle cx="60" cy="104" r="4" fill={C.lima} />
          <Estrella cx={80} cy={30} r={15} />
          {/* el regalo abajo del arbolito */}
          <rect x="99" y="109" width="32" height="25" rx="4" fill={C.lima} />
          <path d="M115 109 h12 a4 4 0 0 1 4 4 v17 a4 4 0 0 1 -4 4 h-12 Z" fill={C.limaSombra} />
          <rect x="96" y="102" width="38" height="10" rx="3.5" fill={C.lima} />
          <rect x="112" y="102" width="6" height="32" fill={C.tinta} />
          <path d="M115 102 c-5 -10 -16 -7 -9 0 Z M115 102 c5 -10 16 -7 9 0 Z" fill={C.tinta} />
        </>
      )
      break
    }
    case 'amigo': {
      const mate = 'M65 80 C50 86 42 101 46 116 C50 130 66 134 80 134 C94 134 110 130 114 116 C118 101 110 86 95 80 Z'
      dibujo = (
        <>
          <defs>
            {mitad(82)}
            <mask id={`${id}-luna`}><rect width="160" height="160" fill="white" /><circle cx="61" cy="37" r="14" fill="black" /></mask>
          </defs>
          <Escenario />
          {/* la Luna: el Día del Amigo nació con la llegada a la Luna */}
          <circle cx="52" cy="45" r="17" fill={C.lima} mask={`url(#${id}-luna)`} />
          <Destello cx={80} cy={34} s={5} fill={C.blanco} /><Destello cx={124} cy={92} s={5.5} fill={C.blanco} />
          <Destello cx={36} cy={76} s={3.5} fill={C.lima} />
          <path d="M87 74 L106 28" stroke={C.blancoSombra} strokeWidth="5.5" strokeLinecap="round" />
          <rect x="100" y="19" width="13" height="8" rx="3" transform="rotate(-22 106 23)" fill={C.blancoSombra} />
          <path d="M64 75 Q80 59 96 75 Z" fill={C.lima} />
          <path d={mate} fill={C.blanco} /><path d={mate} fill={C.blancoSombra} clipPath={enSombra(82)} />
          <rect x="60" y="72" width="40" height="9" rx="4.5" fill={C.tinta} />
        </>
      )
      break
    }
    case 'padre': {
      const camisa = 'M36 80 Q38 58 58 49 L72 44 L88 44 L102 49 Q122 58 124 80 L120 129 Q120 134 115 134 L45 134 Q40 134 40 129 Z'
      const corbata = 'M75 64 H85 L93 112 L80 126 L67 112 Z'
      dibujo = (
        <>
          <defs>{mitad(80)}<clipPath id={`${id}-corbata`}><path d={corbata} /></clipPath></defs>
          <Escenario />
          <path d={camisa} fill={C.blanco} /><path d={camisa} fill={C.blancoSombra} clipPath={enSombra(80)} />
          <rect x="50" y="90" width="16" height="13" rx="3" fill={C.blancoSombra} />
          <path d={corbata} fill={C.lima} stroke={C.lima} strokeWidth="3" strokeLinejoin="round" />
          <g clipPath={enSombra(80)}><path d={corbata} fill={C.limaSombra} stroke={C.limaSombra} strokeWidth="3" strokeLinejoin="round" /></g>
          <g clipPath={`url(#${id}-corbata)`} stroke={C.tinta} strokeWidth="4.5"><path d="M58 86 L102 70 M58 102 L102 86 M58 118 L102 102" /></g>
          <polygon points="80,52 58,38 52,63" fill={C.blancoSombra} stroke={C.blancoSombra} strokeWidth="4" strokeLinejoin="round" />
          <polygon points="80,52 102,38 108,63" fill={C.blanco} stroke={C.blanco} strokeWidth="4" strokeLinejoin="round" />
          <path d="M72 50 H88 L85 64 H75 Z" fill={C.tinta} stroke={C.tinta} strokeWidth="3" strokeLinejoin="round" />
          {firma && <Estrella cx={124} cy={38} r={10} />}
        </>
      )
      break
    }
    case 'madre': {
      const envoltorio = 'M46 78 L114 78 L86 134 L74 134 Z'
      const flor = (cx: number, cy: number, petalos: string) => (
        <>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} r="8" fill={petalos}
                    cx={(cx + 9.5 * Math.cos(((a - 90) * Math.PI) / 180)).toFixed(1)} cy={(cy + 9.5 * Math.sin(((a - 90) * Math.PI) / 180)).toFixed(1)} />
          ))}
          <circle cx={cx} cy={cy} r="6.5" fill={C.lima} />
        </>
      )
      dibujo = (
        <>
          <defs>{mitad(80)}</defs>
          <Escenario />
          <ellipse cx="52" cy="70" rx="6" ry="17" transform="rotate(-35 52 70)" fill={C.blancoSombra} />
          <ellipse cx="108" cy="70" rx="6" ry="17" transform="rotate(35 108 70)" fill={C.blancoSombra} />
          {flor(58, 66, C.blanco)}
          {flor(102, 66, C.blancoSombra)}
          {/* el tulipán del medio */}
          <path d="M65 50 L65 33.5 L72.5 41.75 L80 30.5 L87.5 41.75 L95 33.5 L95 50 Q95 65 80 65 Q65 65 65 50Z" fill={C.lima} />
          <path d={envoltorio} fill={C.blanco} stroke={C.blanco} strokeWidth="6" strokeLinejoin="round" />
          <g clipPath={enSombra(80)}><path d={envoltorio} fill={C.blancoSombra} stroke={C.blancoSombra} strokeWidth="6" strokeLinejoin="round" /></g>
          <path d="M78 106 L72 120 M82 106 L88 120" stroke={C.limaSombra} strokeWidth="4" strokeLinecap="round" />
          <path d="M80 102 L68 95 L68 109 Z M80 102 L92 95 L92 109 Z" fill={C.lima} stroke={C.lima} strokeWidth="3" strokeLinejoin="round" />
          <circle cx="80" cy="102" r="4.5" fill={C.limaSombra} />
        </>
      )
      break
    }
    case 'ninos': {
      const parte = (puntos: string, color: string) => (
        <polygon points={puntos} fill={color} stroke={color} strokeWidth="4" strokeLinejoin="round" />
      )
      dibujo = (
        <>
          <Escenario />
          <path d="M28 116 a10 10 0 0 1 11 -11 a14 14 0 0 1 26 3 a9 9 0 0 1 3 18 H37 a9 9 0 0 1 -9 -10 Z" fill={C.blanco} />
          <g transform="rotate(-12 80 66)">
            {parte('80,24 50,62 80,62', C.blanco)}{parte('80,24 110,62 80,62', C.lima)}
            {parte('50,62 80,108 80,62', C.limaSombra)}{parte('110,62 80,108 80,62', C.blancoSombra)}
            <path d="M80 24 V108 M50 62 H110" stroke={C.tinta} strokeWidth="2.5" />
            <path d="M80 108 C94 118 68 124 82 134 S76 146 92 150" stroke={C.tinta} strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M84 121 l-8 -5 v10 Z M84 121 l8 -5 v10 Z M80 138 l-7 -4.5 v9 Z M80 138 l7 -4.5 v9 Z" fill={C.lima} />
          </g>
          <Destello cx={124} cy={104} s={5} fill={C.blanco} />
        </>
      )
      break
    }
    default: {
      // el amigo invisible aparte: un regalo con antifaz (un regalo y un secreto)
      const caja = 'M44 76 h72 v48 a8 8 0 0 1 -8 8 h-56 a8 8 0 0 1 -8 -8 Z'
      const tapa = 'M44 60 h72 a6 6 0 0 1 6 6 v6 a6 6 0 0 1 -6 6 h-72 a6 6 0 0 1 -6 -6 v-6 a6 6 0 0 1 6 -6 Z'
      dibujo = (
        <>
          <defs>{mitad(84)}</defs>
          <Escenario oscuro />
          <path d={caja} fill={C.lima} /><path d={caja} fill={C.limaSombra} clipPath={enSombra(84)} />
          <rect x="76" y="60" width="8" height="72" fill={C.blanco} />
          <path d={tapa} fill={C.lima} /><path d={tapa} fill={C.limaSombra} clipPath={enSombra(84)} />
          <rect x="76" y="60" width="8" height="18" fill={C.blanco} />
          <path d="M80 60 C70 39 49 45 66 60 Z M80 60 C90 39 111 45 94 60 Z" fill={C.blanco} /><circle cx="80" cy="59" r="6" fill={C.blanco} />
          <path d="M47 100 Q33 93 29 104 M47 105 Q36 111 35 121" stroke={C.azul} strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M45 102 C45 90 62 88 80 96 C98 88 115 90 115 102 C115 114 100 118 90 110 Q80 104 70 110 C60 118 45 114 45 102 Z" fill={C.azul} />
          <ellipse cx="64" cy="102" rx="8.5" ry="6" fill={C.blanco} /><ellipse cx="96" cy="102" rx="8.5" ry="6" fill={C.blanco} />
          <circle cx="68" cy="103" r="3.2" fill={C.tinta} /><circle cx="100" cy="103" r="3.2" fill={C.tinta} />
          {firma && <Estrella cx={124} cy={40} r={10} />}
          <Destello cx={36} cy={50} s={4} fill={C.blanco} />
        </>
      )
    }
  }
  return <svg aria-hidden viewBox="0 0 160 160" width={size} height={size} className={className}>{dibujo}</svg>
}
