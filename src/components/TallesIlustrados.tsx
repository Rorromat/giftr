import { useId } from 'react'
import type { Talles } from '@/lib/gustos'

// Los talles como un figurín de moda: una figura estilizada (proporciones largas, sin cara, como los bocetos de los
// diseñadores) con la remera, el pantalón y las zapatillas en color plano y trazo fino; de cada prenda sale una línea
// fina a su talle, escrito grande a la derecha. Sobre un fondo crema con un círculo detrás, como una lámina.

const TRAZO = '#2B2622'
const PIEL = '#C98E6A'
const PIEL_SOMBRA = '#B57A57'
const PELO = '#2A1D17'
const REMERA = '#C8F31D'
const REMERA_SOMBRA = '#AFD60F'
const JEAN = '#33507E'
const JEAN_SOMBRA = '#283F65'
const ZAPA = '#FBFAF6'
const FONDO = '#F3EBDD'
const CIRCULO = '#E8DAC4'
const TENUE = '#8C7D6B'

/** La línea fina que va de la prenda (el punto) a su talle, y el talle: qué es, chiquito, y el talle grande abajo. */
function Talle({ x, y, prenda, talle }: { x: number; y: number; prenda: string; talle: string | null }) {
  return (
    <g>
      <circle cx={x} cy={y} r="3.2" fill={TRAZO} />
      <path d={`M${x} ${y} H206`} stroke={TRAZO} strokeWidth="1.2" />
      <text x="214" y={y - 7} fontSize="10" fontWeight="700" letterSpacing="1.6" fill={TENUE}
            style={{ fontFamily: 'var(--gr-font-body), system-ui, sans-serif' }}>{prenda.toUpperCase()}</text>
      <text x="212" y={y + 30} fontSize="34" fontWeight="800" letterSpacing="-1" fill={talle ? TRAZO : TENUE}
            style={{ fontFamily: 'var(--gr-font-display), system-ui, sans-serif' }}>{talle ?? '—'}</text>
    </g>
  )
}

/**
 * Los talles en un figurín: la remera, el pantalón y las zapatillas, cada uno con su línea a su talle. Para el perfil
 * público ("Sus talles") y el propio, y el final de la bienvenida.
 */
export function TallesIlustrados({ talles, nombre }: { talles: Talles; nombre?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const desc = [`remera ${talles.remera ?? 'sin cargar'}`, `pantalón ${talles.pantalon ?? 'sin cargar'}`, `calzado ${talles.calzado ?? 'sin cargar'}`].join(', ')
  // la luz viene de arriba a la izquierda: de la mitad del cuerpo (x 118) a la derecha, un tono más oscuro
  const sombra = `url(#${id}-sombra)`
  const linea = { stroke: TRAZO, strokeWidth: 1.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  const pliegue = { fill: 'none', strokeWidth: 1.1, strokeLinecap: 'round' as const }
  // la pose: el peso en la pierna izquierda (la cadera de ese lado más alta y el hombro más bajo), la otra suelta y con el
  // pie para afuera; un brazo cae, el otro tiene la mano en el bolsillo
  const remera = 'M110 76 Q118 86 126 74 L150 82 C158 94 163 106 167 121 L146 129 L143 118 L146 196 Q118 201 91 190 L96 120 L95 137 L74 133 C76 117 79 101 86 89 Z'
  const pantalon = 'M93 184 L145 189 C147 220 149 250 148 282 C149 310 150 336 152 362 L130 364 C127 336 125 308 122 282 L119 216 L117 216 '
    + 'C117 240 116 262 116 282 C116 310 117 336 119 364 L102 364 C99 336 97 310 97 282 C94 250 92 216 93 184 Z'
  const conLuz = (d: string, luz: string, osc: string) => (
    <><path d={d} fill={luz} /><path d={d} fill={osc} clipPath={sombra} /><path d={d} fill="none" {...linea} /></>
  )

  return (
    <svg viewBox="0 0 360 420" className="h-auto w-full max-w-[400px]" role="img" aria-label={`Talles${nombre ? ` de ${nombre}` : ''}: ${desc}`}>
      <defs>
        <clipPath id={`${id}-fondo`}><rect width="360" height="420" rx="26" /></clipPath>
        <clipPath id={`${id}-sombra`}><rect x="118" y="0" width="242" height="420" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}-fondo)`}>
        <rect width="360" height="420" fill={FONDO} />
        <circle cx="118" cy="222" r="168" fill={CIRCULO} />
        <ellipse cx="126" cy="381" rx="54" ry="6" fill="#D9C7AE" />

        {/* el brazo que cae y el de arriba del que tiene la mano en el bolsillo (abajo de las mangas) */}
        <path d="M77 130 C74 155 75 185 79 210 L88 210 C88 186 92 158 95 134 Z" fill={PIEL} {...linea} />
        <path d="M79 210 C76 220 80 230 85 229 C90 228 90 218 88 210 Z" fill={PIEL} {...linea} />
        <path d="M148 126 L165 122 C168 138 168 150 164 160 L152 160 C152 148 150 136 148 126 Z" fill={PIEL_SOMBRA} {...linea} />

        {/* el jean, recto y con el ruedo doblado */}
        {conLuz(pantalon, JEAN, JEAN_SOMBRA)}
        <path d="M101 354 L120 355 L119 364 L102 364 Z M129 353 L151 352 L152 362 L130 364 Z" fill="#4C6A9A" {...linea} />
        <path d="M100 280 Q106 284 112 279 M125 282 Q132 287 140 281 M98 232 Q102 252 99 268 M133 236 Q137 256 136 272" stroke="#7E9BC8" {...pliegue} />

        {/* las zapatillas, gruesas: una para cada lado */}
        <path d="M98 364 H121 Q124 364 124 368 V374 Q124 378 120 378 H92 Q86 378 86 373 Q87 366 98 364 Z" fill={ZAPA} {...linea} />
        <path d="M129 362 H150 Q162 364 164 372 Q164 377 159 377 H131 Q127 377 127 373 V366 Q127 362 129 362 Z" fill={ZAPA} {...linea} />
        <path d="M87 373 H124 M127 372 H164" stroke={TRAZO} strokeWidth="1.1" />
        <path d="M108 366 L111 372 M147 365 L143 371" stroke={REMERA_SOMBRA} strokeWidth="2.6" strokeLinecap="round" />

        {/* la remera, grande y de hombros caídos, con sus pliegues */}
        {conLuz(remera, REMERA, REMERA_SOMBRA)}
        <path d="M104 100 Q100 140 104 186 M134 104 Q138 150 134 192 M96 124 Q100 128 97 133" stroke="#8DAD0C" {...pliegue} />

        {/* el antebrazo con la mano en el bolsillo, adelante */}
        <path d="M152 158 L165 158 C160 176 153 190 147 200 L136 198 C140 186 146 172 152 158 Z" fill={PIEL_SOMBRA} {...linea} />

        {/* el cuello y la cabeza, sin cara y apenas inclinada, con el pelo corto */}
        <path d="M113 58 L112 76 Q118 80 124 76 L122 58 Z" fill={PIEL} {...linea} />
        <ellipse cx="117" cy="44" rx="12" ry="15" transform="rotate(-6 117 44)" fill={PIEL} {...linea} />
        <path d="M104 44 C101 28 112 20 122 22 C133 24 136 34 132 46 C130 38 125 33 118 33 C111 33 106 38 104 44 Z" fill={PELO} />

        <Talle x={124} y={140} prenda="Remera" talle={talles.remera} />
        <Talle x={140} y={292} prenda="Pantalón" talle={talles.pantalon} />
        <Talle x={156} y={370} prenda="Calzado" talle={talles.calzado} />
      </g>
    </svg>
  )
}
