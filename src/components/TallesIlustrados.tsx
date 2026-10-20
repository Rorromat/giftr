import type { Talles } from '@/lib/gustos'

const INK = 'var(--gr-ink)'
const ACC = 'var(--gr-accent)'
const SUR = 'var(--gr-surface)'
const MUT = 'var(--gr-muted)'

/** Una flecha de (x1,y1) a (x2,y2) con la punta en la prenda. */
function Flecha({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const punta = (d: number, g: number) => `${x2 - d * Math.cos(a + g)},${y2 - d * Math.sin(a + g)}`
  const d = `M${x1} ${y1} Q${(x1 + x2) / 2} ${Math.min(y1, y2) - 10} ${x2} ${y2}`
  const triangulo = `${x2},${y2} ${punta(14, 0.45)} ${punta(14, -0.45)}`
  // borde blanco abajo, como los stickers: así se ve también sobre el pantalón oscuro
  return (
    <g>
      <path d={d} fill="none" stroke={SUR} strokeWidth={8} strokeLinecap="round" />
      <polygon points={triangulo} fill={SUR} stroke={SUR} strokeWidth={6} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <polygon points={triangulo} fill={INK} />
    </g>
  )
}

function Etiqueta({ y, prenda, talle }: { y: number; prenda: string; talle: string | null }) {
  return (
    <g>
      <rect x={203} y={y + 4} width={124} height={54} rx={15} fill={INK} />
      <rect x={198} y={y} width={124} height={54} rx={15} fill={SUR} stroke={INK} strokeWidth={3} />
      <text x={214} y={y + 20} fontSize={13} fontWeight={700} fill={MUT} style={{ fontFamily: 'var(--gr-font-body)' }}>{prenda}</text>
      <text x={214} y={y + 45} fontSize={talle ? 25 : 16} fontWeight={800} fill={talle ? INK : MUT} style={{ fontFamily: 'var(--gr-font-display)' }}>
        {talle ?? 'Sin cargar'}
      </text>
    </g>
  )
}

/**
 * Los talles sobre una figura vestida: remera, pantalón y zapatillas, cada uno con su flechita.
 * Para el perfil público ("Sus talles") y el propio.
 */
export function TallesIlustrados({ talles, nombre }: { talles: Talles; nombre?: string }) {
  const desc = [`remera ${talles.remera ?? 'sin cargar'}`, `pantalón ${talles.pantalon ?? 'sin cargar'}`, `calzado ${talles.calzado ?? 'sin cargar'}`].join(', ')
  return (
    <svg viewBox="0 0 340 320" className="h-auto w-full max-w-[400px]" role="img" aria-label={`Talles${nombre ? ` de ${nombre}` : ''}: ${desc}`}>
      {/* brazos (debajo de la remera) */}
      {[[50, 112, 40, 186], [160, 112, 170, 186]].map(([x1, y1, x2, y2], i) => (
        <g key={i}>
          <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke={INK} strokeWidth={19} strokeLinecap="round" />
          <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke={SUR} strokeWidth={12} strokeLinecap="round" />
        </g>
      ))}
      {/* manos */}
      <circle cx={40} cy={190} r={9} fill={SUR} stroke={INK} strokeWidth={3} />
      <circle cx={170} cy={190} r={9} fill={SUR} stroke={INK} strokeWidth={3} />
      {/* cabeza y cuello */}
      <rect x={96} y={58} width={18} height={20} rx={4} fill={SUR} stroke={INK} strokeWidth={3} />
      <circle cx={105} cy={38} r={25} fill={SUR} stroke={INK} strokeWidth={3} />
      <path d="M81 33c3-14 14-21 26-20 11 1 19 9 21 19-9-5-20-6-31-2-6 2-11 3-16 3z" fill={INK} />
      {/* pantalón */}
      <path d="M70 164h70l7 108h-31l-11-74-11 74H63z" fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <path d="M105 172v24" stroke={SUR} strokeWidth={2} opacity={0.5} />
      {/* zapatillas */}
      <path d="M58 270h33v8c0 6-4 10-10 10H50c-4 0-6-3-5-6 2-7 7-12 13-12z" fill={SUR} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <path d="M119 270h33c6 0 11 5 13 12 1 3-1 6-5 6h-31c-6 0-10-4-10-10z" fill={SUR} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      {/* remera */}
      <path d="M72 76h66l34 28-17 21-15-11v56H70v-56l-15 11-17-21z" fill={ACC} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <path d="M92 76c3 9 23 9 26 0" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />

      <Etiqueta y={64} prenda="Remera" talle={talles.remera} />
      <Etiqueta y={160} prenda="Pantalón" talle={talles.pantalon} />
      <Etiqueta y={250} prenda="Calzado" talle={talles.calzado} />
      <Flecha x1={196} y1={92} x2={128} y2={122} />
      <Flecha x1={196} y1={188} x2={130} y2={222} />
      <Flecha x1={196} y1={277} x2={150} y2={278} />
    </svg>
  )
}
