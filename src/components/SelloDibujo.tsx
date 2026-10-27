import { STAR_POINTS } from '@/components/ui'

/** Lo que dice el sello en cada momento (dos renglones) y el tamaño de la letra para que entre en la estrella. */
const TEXTOS = {
  tuyo: ['¡Es', 'tuyo!', 22],
  listo: ['¡Ya', 'está!', 22],
  todos: ['¡Entre', 'todos!', 18],
} as const
export type TipoSello = keyof typeof TEXTOS

/**
 * La estrella del sello: la del logo con borde blanco, torcida (gr-sello), con su texto o, la chica, un tilde. Solo el
 * dibujo: cuándo cae lo decide Sello; en la portada cae en ronda (ver Portada).
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
    <text x="50" y={y} dy="0.35em" textAnchor="middle" fontSize={letra} fontWeight={800} fill="var(--gr-ink)"
          style={{ fontFamily: 'var(--gr-font-display)' }}>{t}</text>
  )
  return (
    <svg ref={ref} aria-hidden width={size} height={size} viewBox="-7 -7 114 114" className={`gr-sello ${className}`}>
      <polygon points={STAR_POINTS} fill="var(--gr-accent)" stroke="var(--gr-surface)" strokeWidth={chico ? 12 : 10}
               strokeLinejoin="round" paintOrder="stroke" />
      {chico
        ? <path d="M30 52l13 13 27-29" fill="none" stroke="var(--gr-ink)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
        : <>{texto(arriba, 39)}{texto(abajo, 61)}</>}
    </svg>
  )
}
