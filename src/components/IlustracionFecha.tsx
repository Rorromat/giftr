import { useId } from 'react'
import { paletaDe } from '@/lib/colores-fechas'
import type { FechaEspecial } from '@/lib/fechas-especiales'

// Las ilustraciones de las fechas especiales y del amigo invisible aparte (null), todas con las mismas reglas:
// - todo adentro del mismo círculo guía, con su sombra en el piso (del color de la fecha, ver colores-fechas.ts);
// - la luz viene de arriba a la izquierda: la mitad derecha de cada objeto va un tono más oscura;
// - formas redondeadas, sin puntas, salvo la estrella de GiftR, que va como firma;
// - cada fecha con sus colores: Navidad, roja con el árbol verde y dorado; el Día del Amigo, noche violeta con la Luna y el
//   mate de calabaza; el del Padre, azul marino con la corbata mostaza; el de la Madre, frambuesa con flores rosas; el del
//   Niño, verde agua con el barrilete amarillo y naranja; el aparte, negro con lima.
// Cada una es una sola idea: el arbolito con un regalo abajo, el mate (con la Luna del 20 de julio de 1969 atrás), la camisa
// con corbata, el ramo, el barrilete y el regalo con antifaz. En chico va IconoFecha, la misma idea simplificada.

const BLANCO = '#FFFFFF'
const TINTA = '#141414'
const LIMA = '#C8F31D'

/** Las puntas de la estrella de GiftR (la del logo), centrada en cx, cy. */
function puntas(cx: number, cy: number, afuera: number, adentro: number, n = 12) {
  return Array.from({ length: 2 * n }, (_, i) => {
    const r = i % 2 ? adentro : afuera
    const a = (Math.PI * i) / n - Math.PI / 2
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
  }).join(' ')
}
const Estrella = ({ cx, cy, r, fill = LIMA }: { cx: number; cy: number; r: number; fill?: string }) => (
  <polygon points={puntas(cx, cy, r, r * 0.63)} fill={fill} />
)

/** Un destello de cuatro puntas. */
const Destello = ({ cx, cy, s, fill }: { cx: number; cy: number; s: number; fill: string }) => (
  <path fill={fill} d={`M${cx} ${cy - s} Q${cx + s * 0.12} ${cy - s * 0.12} ${cx + s} ${cy} Q${cx + s * 0.12} ${cy + s * 0.12} ${cx} ${cy + s} `
    + `Q${cx - s * 0.12} ${cy + s * 0.12} ${cx - s} ${cy} Q${cx - s * 0.12} ${cy - s * 0.12} ${cx} ${cy - s}Z`} />
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
  const paleta = paletaDe(fecha)
  // el marco común: el círculo guía y la sombra en el piso
  const escenario = (
    <>
      <circle cx="80" cy="80" r="58" fill={paleta.marco} />
      <ellipse cx="80" cy="135" rx="44" ry="6" fill={paleta.piso} opacity={fecha ? 1 : 0.45} />
    </>
  )

  let dibujo: React.ReactNode
  switch (fecha) {
    case 'navidad': {
      const verde = '#2A9D62', verdeSombra = '#1F7F4E', dorado = '#FFC94A', blancoSombra = '#F4D3D6'
      const arbol = <><polygon points="80,38 103,64 57,64" /><polygon points="80,53 111,88 49,88" /><polygon points="80,70 119,112 41,112" /></>
      dibujo = (
        <>
          <defs>{mitad(80)}</defs>
          {escenario}
          <g fill={verde} stroke={verde} strokeWidth="9" strokeLinejoin="round">{arbol}</g>
          <g clipPath={enSombra(80)} fill={verdeSombra} stroke={verdeSombra} strokeWidth="9" strokeLinejoin="round">{arbol}</g>
          <rect x="73" y="114" width="14" height="18" rx="3" fill="#5A3420" />
          <circle cx="67" cy="83" r="4.5" fill={dorado} /><circle cx="93" cy="102" r="4.5" fill={BLANCO} />
          <circle cx="86" cy="62" r="4" fill={BLANCO} /><circle cx="60" cy="104" r="4" fill={dorado} />
          <Estrella cx={80} cy={30} r={15} fill={dorado} />
          {/* el regalo abajo del arbolito */}
          <rect x="99" y="109" width="32" height="25" rx="4" fill={BLANCO} />
          <path d="M115 109 h12 a4 4 0 0 1 4 4 v17 a4 4 0 0 1 -4 4 h-12 Z" fill={blancoSombra} />
          <rect x="96" y="102" width="38" height="10" rx="3.5" fill={BLANCO} />
          <rect x="112" y="102" width="6" height="32" fill={paleta.fondo} />
          <path d="M115 102 c-5 -10 -16 -7 -9 0 Z M115 102 c5 -10 16 -7 9 0 Z" fill={paleta.fondo} />
        </>
      )
      break
    }
    case 'amigo': {
      const calabaza = '#E9C08F', calabazaSombra = '#D3A472', plata = '#DCDFE8', luna = '#FFE27A', yerba = paleta.acento
      const mate = 'M65 80 C50 86 42 101 46 116 C50 130 66 134 80 134 C94 134 110 130 114 116 C118 101 110 86 95 80 Z'
      dibujo = (
        <>
          <defs>
            {mitad(82)}
            <mask id={`${id}-luna`}><rect width="160" height="160" fill="white" /><circle cx="61" cy="37" r="14" fill="black" /></mask>
          </defs>
          {escenario}
          {/* la Luna: el Día del Amigo nació con la llegada a la Luna */}
          <circle cx="52" cy="45" r="17" fill={luna} mask={`url(#${id}-luna)`} />
          <Destello cx={80} cy={34} s={5} fill={BLANCO} /><Destello cx={124} cy={92} s={5.5} fill={BLANCO} />
          <Destello cx={36} cy={76} s={3.5} fill={luna} />
          <path d="M87 74 L106 28" stroke={plata} strokeWidth="5.5" strokeLinecap="round" />
          <rect x="100" y="19" width="13" height="8" rx="3" transform="rotate(-22 106 23)" fill={plata} />
          <path d="M64 75 Q80 59 96 75 Z" fill={yerba} />
          <path d={mate} fill={calabaza} /><path d={mate} fill={calabazaSombra} clipPath={enSombra(82)} />
          <rect x="60" y="72" width="40" height="9" rx="4.5" fill={plata} />
        </>
      )
      break
    }
    case 'padre': {
      const camisaSombra = '#D6E2F5', mostaza = paleta.acento, mostazaSombra = '#D98F22'
      const camisa = 'M36 80 Q38 58 58 49 L72 44 L88 44 L102 49 Q122 58 124 80 L120 129 Q120 134 115 134 L45 134 Q40 134 40 129 Z'
      const corbata = 'M75 64 H85 L93 112 L80 126 L67 112 Z'
      dibujo = (
        <>
          <defs>{mitad(80)}<clipPath id={`${id}-corbata`}><path d={corbata} /></clipPath></defs>
          {escenario}
          <path d={camisa} fill={BLANCO} /><path d={camisa} fill={camisaSombra} clipPath={enSombra(80)} />
          <rect x="50" y="90" width="16" height="13" rx="3" fill={camisaSombra} />
          <path d={corbata} fill={mostaza} stroke={mostaza} strokeWidth="3" strokeLinejoin="round" />
          <g clipPath={enSombra(80)}><path d={corbata} fill={mostazaSombra} stroke={mostazaSombra} strokeWidth="3" strokeLinejoin="round" /></g>
          <g clipPath={`url(#${id}-corbata)`} stroke={paleta.fondo} strokeWidth="4.5"><path d="M58 86 L102 70 M58 102 L102 86 M58 118 L102 102" /></g>
          <polygon points="80,52 58,38 52,63" fill={camisaSombra} stroke={camisaSombra} strokeWidth="4" strokeLinejoin="round" />
          <polygon points="80,52 102,38 108,63" fill={BLANCO} stroke={BLANCO} strokeWidth="4" strokeLinejoin="round" />
          <path d="M72 50 H88 L85 64 H75 Z" fill="#14284F" stroke="#14284F" strokeWidth="3" strokeLinejoin="round" />
          {firma && <Estrella cx={124} cy={38} r={10} />}
        </>
      )
      break
    }
    case 'madre': {
      const rosa = paleta.acento, coral = '#FF7A59', amarillo = '#FFD54A', hoja = '#5CB860', hojaSombra = '#469A4B'
      const papel = '#F6E7CB', papelSombra = '#E4CFA6'
      const envoltorio = 'M46 78 L114 78 L86 134 L74 134 Z'
      const flor = (cx: number, cy: number, petalos: string) => (
        <>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} r="8" fill={petalos}
                    cx={(cx + 9.5 * Math.cos(((a - 90) * Math.PI) / 180)).toFixed(1)} cy={(cy + 9.5 * Math.sin(((a - 90) * Math.PI) / 180)).toFixed(1)} />
          ))}
          <circle cx={cx} cy={cy} r="6.5" fill={amarillo} />
        </>
      )
      dibujo = (
        <>
          <defs>{mitad(80)}</defs>
          {escenario}
          <ellipse cx="52" cy="70" rx="6" ry="17" transform="rotate(-35 52 70)" fill={hoja} />
          <ellipse cx="108" cy="70" rx="6" ry="17" transform="rotate(35 108 70)" fill={hojaSombra} />
          {flor(58, 66, BLANCO)}
          {flor(102, 66, rosa)}
          {/* el tulipán del medio */}
          <path d="M65 50 L65 33.5 L72.5 41.75 L80 30.5 L87.5 41.75 L95 33.5 L95 50 Q95 65 80 65 Q65 65 65 50Z" fill={coral} />
          <path d={envoltorio} fill={papel} stroke={papel} strokeWidth="6" strokeLinejoin="round" />
          <g clipPath={enSombra(80)}><path d={envoltorio} fill={papelSombra} stroke={papelSombra} strokeWidth="6" strokeLinejoin="round" /></g>
          <path d="M78 106 L72 120 M82 106 L88 120" stroke={hojaSombra} strokeWidth="4" strokeLinecap="round" />
          <path d="M80 102 L68 95 L68 109 Z M80 102 L92 95 L92 109 Z" fill={hoja} stroke={hoja} strokeWidth="3" strokeLinejoin="round" />
          <circle cx="80" cy="102" r="4.5" fill={hojaSombra} />
        </>
      )
      break
    }
    case 'ninos': {
      const amarillo = paleta.acento, amarilloSombra = '#E8B52C', naranja = '#FF7F3F', naranjaSombra = '#E2652A'
      const parte = (puntos: string, color: string) => (
        <polygon points={puntos} fill={color} stroke={color} strokeWidth="4" strokeLinejoin="round" />
      )
      dibujo = (
        <>
          {escenario}
          <path d="M28 116 a10 10 0 0 1 11 -11 a14 14 0 0 1 26 3 a9 9 0 0 1 3 18 H37 a9 9 0 0 1 -9 -10 Z" fill={BLANCO} />
          <g transform="rotate(-12 80 66)">
            {parte('80,24 50,62 80,62', amarillo)}{parte('80,24 110,62 80,62', naranja)}
            {parte('50,62 80,108 80,62', naranjaSombra)}{parte('110,62 80,108 80,62', amarilloSombra)}
            <path d="M80 24 V108 M50 62 H110" stroke={TINTA} strokeWidth="2.5" />
            <path d="M80 108 C94 118 68 124 82 134 S76 146 92 150" stroke={TINTA} strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M84 121 l-8 -5 v10 Z M84 121 l8 -5 v10 Z M80 138 l-7 -4.5 v9 Z M80 138 l7 -4.5 v9 Z" fill={BLANCO} />
          </g>
          <Destello cx={124} cy={104} s={5} fill={BLANCO} />
        </>
      )
      break
    }
    default: {
      // el amigo invisible aparte: un regalo con antifaz (un regalo y un secreto)
      const limaSombra = '#A3C90B', azul = '#2F5BEA'
      const caja = 'M44 76 h72 v48 a8 8 0 0 1 -8 8 h-56 a8 8 0 0 1 -8 -8 Z'
      const tapa = 'M44 60 h72 a6 6 0 0 1 6 6 v6 a6 6 0 0 1 -6 6 h-72 a6 6 0 0 1 -6 -6 v-6 a6 6 0 0 1 6 -6 Z'
      dibujo = (
        <>
          <defs>{mitad(84)}</defs>
          {escenario}
          <path d={caja} fill={LIMA} /><path d={caja} fill={limaSombra} clipPath={enSombra(84)} />
          <rect x="76" y="60" width="8" height="72" fill={BLANCO} />
          <path d={tapa} fill={LIMA} /><path d={tapa} fill={limaSombra} clipPath={enSombra(84)} />
          <rect x="76" y="60" width="8" height="18" fill={BLANCO} />
          <path d="M80 60 C70 39 49 45 66 60 Z M80 60 C90 39 111 45 94 60 Z" fill={BLANCO} /><circle cx="80" cy="59" r="6" fill={BLANCO} />
          <path d="M47 100 Q33 93 29 104 M47 105 Q36 111 35 121" stroke={azul} strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M45 102 C45 90 62 88 80 96 C98 88 115 90 115 102 C115 114 100 118 90 110 Q80 104 70 110 C60 118 45 114 45 102 Z" fill={azul} />
          <ellipse cx="64" cy="102" rx="8.5" ry="6" fill={BLANCO} /><ellipse cx="96" cy="102" rx="8.5" ry="6" fill={BLANCO} />
          <circle cx="68" cy="103" r="3.2" fill={TINTA} /><circle cx="100" cy="103" r="3.2" fill={TINTA} />
          {firma && <Estrella cx={124} cy={40} r={10} />}
          <Destello cx={36} cy={50} s={4} fill={BLANCO} />
        </>
      )
    }
  }
  return <svg aria-hidden viewBox="0 0 160 160" width={size} height={size} className={className}>{dibujo}</svg>
}
