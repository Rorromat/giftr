import { PARTES_MONO } from '@/lib/mono'
import { ondas } from '@/lib/ondas'

/** Lo que dice el sello en cada momento (dos renglones) y el tamaño de la letra para que entre en el círculo. */
const TEXTOS = {
  tuyo: ['¡Es', 'tuyo!', 20],
  listo: ['¡Ya', 'está!', 20],
  todos: ['¡Entre', 'todos!', 17],
} as const
export type TipoSello = keyof typeof TEXTOS

const GRANDE = ondas(50, 54, 42, 16, 8.6)
const CHICO = ondas(50, 50, 44, 14, 9.5)

// El moño de arriba, en verdes oscuros (sobre el verde del sello se distingue) y con borde, como pegado encima
const TONOS = {
  claro: 'var(--gr-acento-oscuro)',
  medio: 'color-mix(in oklch, var(--gr-acento-oscuro) 88%, #000)',
  oscuro: 'color-mix(in oklch, var(--gr-acento-oscuro) 76%, #000)',
  nudo: 'color-mix(in oklch, var(--gr-acento-oscuro) 62%, #000)',
}
const MONO = 'translate(25 -6) scale(0.5)'

/**
 * El sello: un círculo del verde con el borde ondulado y el borde de la superficie, torcido (gr-sello), con el moño del
 * logo pegado arriba y su texto o, el chico (sin moño, no entraría), un tilde. Solo el dibujo: cuándo cae lo decide Sello;
 * en la portada cae en ronda (ver Portada).
 */
export function SelloDibujo({ tipo, size, chico = false, className = '', ref }: {
  tipo: TipoSello
  size: number
  chico?: boolean
  className?: string
  ref?: React.Ref<SVGSVGElement>
}) {
  const [arriba, abajo, letra] = TEXTOS[tipo]
  const texto = (t: string, y: number) => (
    <text x="50" y={y} dy="0.35em" textAnchor="middle" fontSize={letra} fontWeight={900} fill="var(--gr-on-acento)"
          style={{ fontFamily: 'var(--gr-font-display)' }}>{t}</text>
  )
  return (
    <svg ref={ref} aria-hidden width={size} height={size} viewBox="-7 -7 114 114" className={`gr-sello ${className}`}>
      <path d={chico ? CHICO : GRANDE} fill="var(--gr-acento)" stroke="var(--gr-surface)" strokeWidth={chico ? 12 : 7}
            strokeLinejoin="round" paintOrder="stroke" />
      {chico ? (
        <path d="M30 52l13 13 27-29" fill="none" stroke="var(--gr-on-acento)" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          {/* primero el borde de todo el moño junto, después el moño: así el borde queda solo afuera */}
          <g transform={MONO} fill="none" stroke="var(--gr-surface)" strokeWidth={14} strokeLinejoin="round">
            {PARTES_MONO.filter((p) => !p.opacidad).map((p, i) => <path key={i} d={p.d} />)}
          </g>
          <g transform={MONO}>
            {PARTES_MONO.map((p, i) => <path key={i} d={p.d} fill={TONOS[p.tono]} opacity={p.opacidad} />)}
          </g>
          {texto(arriba, 53)}{texto(abajo, 71)}
        </>
      )}
    </svg>
  )
}
