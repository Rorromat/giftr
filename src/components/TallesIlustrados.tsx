import { useId } from 'react'
import { paletaGusto } from '@/lib/colores-gustos'
import type { Talles } from '@/lib/gustos'

// Los talles como una escena, con las reglas de las ilustraciones de los gustos (ver IlustracionGusto): un percherito con la
// remera en su percha, el pantalón colgado de los broches y las zapatillas en el estante; cada prenda con su etiqueta de
// cartón, como en un negocio, con el talle bien grande. Sobre el verde agua de "Colores y talles", la luz de arriba a la
// izquierda (la mitad derecha de cada cosa un tono más oscura) y sin figura humana: una persona dibujada nunca es la que
// mira.

const BLANCO = '#FFFFFF'
const TINTA = '#141414'
const LIMA = '#C8F31D'
const CARTON = '#F4E4C1'
const CARTON_TEXTO = '#8A7653'
const METAL = '#DCE6E5'
const METAL_SOMBRA = '#B9C8C6'

/** Un destello de cuatro puntas. */
const Destello = ({ cx, cy, s, fill }: { cx: number; cy: number; s: number; fill: string }) => (
  <path fill={fill} d={`M${cx} ${cy - s} Q${cx + s * 0.12} ${cy - s * 0.12} ${cx + s} ${cy} Q${cx + s * 0.12} ${cy + s * 0.12} ${cx} ${cy + s} `
    + `Q${cx - s * 0.12} ${cy + s * 0.12} ${cx - s} ${cy} Q${cx - s * 0.12} ${cy - s * 0.12} ${cx} ${cy - s}Z`} />
)

/** La etiqueta de cartón de una prenda, colgada de un hilo desde (hx, hy): qué es y el talle (o un guión, sin cargar). */
function Etiqueta({ x, y, hx, hy, giro, prenda, talle }: {
  x: number; y: number; hx: number; hy: number; giro: number; prenda: string; talle: string | null
}) {
  return (
    <g>
      <path d={`M${hx} ${hy} Q${(hx + x + 34) / 2} ${Math.max(hy, y) + 4} ${x + 34} ${y + 7}`} fill="none" stroke={TINTA} strokeWidth="1.6" />
      <g transform={`rotate(${giro} ${x + 34} ${y + 7})`}>
        <rect x={x} y={y} width="68" height="50" rx="9" fill={CARTON} />
        <rect x={x + 34} y={y} width="34" height="50" rx="9" fill={TINTA} opacity="0.06" />
        <circle cx={x + 34} cy={y + 7} r="3" fill={TINTA} opacity="0.5" />
        <text x={x + 34} y={y + 23} textAnchor="middle" fontSize="9" fontWeight="800" letterSpacing="0.8" fill={CARTON_TEXTO}
              style={{ fontFamily: 'var(--gr-font-body), system-ui, sans-serif' }}>{prenda.toUpperCase()}</text>
        <text x={x + 34} y={y + 43} textAnchor="middle" fontSize={talle && talle.length > 3 ? 17 : 21} fontWeight="800"
              fill={talle ? TINTA : CARTON_TEXTO} style={{ fontFamily: 'var(--gr-font-display), system-ui, sans-serif' }}>
          {talle ?? '—'}
        </text>
      </g>
    </g>
  )
}

/**
 * Los talles en una escena: la remera, el pantalón y las zapatillas con su etiqueta. Para el perfil público ("Sus talles")
 * y el propio, y el final de la bienvenida.
 */
export function TallesIlustrados({ talles, nombre }: { talles: Talles; nombre?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const paleta = paletaGusto('colores')
  const remera = paleta.acento, remeraSombra = '#E8B52C', jean = '#4A7BC0', jeanSombra = '#3A649F', jeanCostura = '#8FB4E3'
  const desc = [`remera ${talles.remera ?? 'sin cargar'}`, `pantalón ${talles.pantalon ?? 'sin cargar'}`, `calzado ${talles.calzado ?? 'sin cargar'}`].join(', ')
  // la misma forma dos veces: entera con luz y, recortada desde x, en sombra
  const mitad = (x: number) => <clipPath id={`${id}-m${x}`}><rect x={x} y="0" width={360 - x} height="320" /></clipPath>
  const conSombra = (d: string, luz: string, sombra: string, x: number, redondeo = 0) => (
    <>
      <path d={d} fill={luz} stroke={redondeo ? luz : undefined} strokeWidth={redondeo || undefined} strokeLinejoin="round" />
      <path d={d} fill={sombra} stroke={redondeo ? sombra : undefined} strokeWidth={redondeo || undefined} strokeLinejoin="round" clipPath={`url(#${id}-m${x})`} />
    </>
  )
  const camiseta = 'M62 64 L44 74 L26 98 L42 112 L52 104 V166 Q52 172 58 172 H112 Q118 172 118 166 V104 L128 112 L144 98 L126 74 L108 64 Q85 80 62 64 Z'
  const pantalon = 'M168 84 H226 L230 234 Q230 238 226 238 H202 L197 128 L194 238 H170 Q166 238 166 234 Z'
  const capellada = 'M246 246 C245 228 251 214 264 211 L282 211 C287 220 295 225 306 227 C322 230 333 236 335 246 Z'

  return (
    <svg viewBox="0 0 360 320" className="h-auto w-full max-w-[400px]" role="img" aria-label={`Talles${nombre ? ` de ${nombre}` : ''}: ${desc}`}>
      <defs>
        {mitad(85)}{mitad(197)}{mitad(293)}
        <clipPath id={`${id}-fondo`}><rect width="360" height="320" rx="26" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}-fondo)`}>
      <rect width="360" height="320" fill={paleta.fondo} />
      <circle cx="300" cy="64" r="74" fill={paleta.marco} />
      <ellipse cx="180" cy="300" rx="150" ry="9" fill={paleta.piso} />

      {/* el percherito: el caño, los parantes, el estante y las rueditas */}
      <rect x="14" y="30" width="332" height="8" rx="4" fill={METAL} />
      <rect x="180" y="30" width="166" height="8" rx="4" fill={METAL_SOMBRA} />
      <rect x="16" y="30" width="8" height="262" rx="4" fill={METAL} />
      <rect x="336" y="30" width="8" height="262" rx="4" fill={METAL_SOMBRA} />
      <rect x="14" y="256" width="332" height="9" rx="4.5" fill={METAL} />
      <rect x="180" y="256" width="166" height="9" rx="4.5" fill={METAL_SOMBRA} />
      <circle cx="20" cy="296" r="5" fill={TINTA} /><circle cx="340" cy="296" r="5" fill={TINTA} />

      {/* la remera en su percha */}
      <path d="M85 56 C85 47 79 45 79 40 C79 35 86 32 90 37" fill="none" stroke={TINTA} strokeWidth="3" strokeLinecap="round" />
      {conSombra(camiseta, remera, remeraSombra, 85, 5)}
      <path d="M70 66 Q85 78 100 66" fill="none" stroke={TINTA} strokeWidth="3" strokeLinecap="round" />
      <path d="M50 70 L85 55 L120 70" fill="none" stroke={TINTA} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* el pantalón, colgado de los broches */}
      <path d="M197 56 C197 47 191 45 191 40 C191 35 198 32 202 37" fill="none" stroke={TINTA} strokeWidth="3" strokeLinecap="round" />
      <path d="M160 64 L197 56 L234 64" fill="none" stroke={TINTA} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="172" y="62" width="7" height="26" rx="2" fill={TINTA} /><rect x="215" y="62" width="7" height="26" rx="2" fill={TINTA} />
      {conSombra(pantalon, jean, jeanSombra, 197, 4)}
      <path d="M168 84 H226" stroke={jeanSombra} strokeWidth="9" />
      <path d="M197 92 V124 M174 100 Q182 104 186 96 M220 100 Q212 104 208 96" fill="none" stroke={jeanCostura} strokeWidth="2" strokeLinecap="round" />

      {/* la zapatilla, en el estante: suela negra, entresuela, la capellada con su puntera y su talón lima, y los cordones */}
      <rect x="240" y="247" width="100" height="9" rx="4.5" fill={TINTA} />
      <rect x="242" y="239" width="96" height="11" rx="5.5" fill="#F2F1EC" />
      {conSombra(capellada, BLANCO, '#E3E6E4', 293)}
      <path d="M318 231 C327 233 334 238 335 246 H316 C314 240 315 234 318 231 Z" fill={LIMA} />
      <rect x="244" y="214" width="11" height="26" rx="4" fill={LIMA} />
      <path d="M262 213 Q272 222 283 212" fill="none" stroke={TINTA} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M284 217 L292 225 M292 219 L300 227 M300 221 L307 229" stroke={TINTA} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M262 238 Q290 234 316 240" fill="none" stroke="#C9CFCC" strokeWidth="2" strokeLinecap="round" />

      <Etiqueta x={51} y={190} hx={85} hy={172} giro={-4} prenda="Remera" talle={talles.remera} />
      <Etiqueta x={244} y={86} hx={226} hy={88} giro={6} prenda="Pantalón" talle={talles.pantalon} />
      <Etiqueta x={262} y={146} hx={292} hy={218} giro={-6} prenda="Calzado" talle={talles.calzado} />

      <Destello cx={140} cy={150} s={6} fill={BLANCO} /><Destello cx={150} cy={222} s={4} fill={LIMA} />
      <Destello cx={318} cy={118} s={4} fill={BLANCO} />
      </g>
    </svg>
  )
}
