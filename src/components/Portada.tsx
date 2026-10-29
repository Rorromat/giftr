'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { SelloDibujo } from '@/components/SelloDibujo'
import { Ilustrado } from '@/components/Ilustrado'
import type { NombreSticker } from '@/stickers/giftr'
import { Icon, PriorityTag, STAR_POINTS } from '@/components/ui'

// La portada: lo que hace la app, una carta por función, como un mazo. Pasan solas y despacio (la de arriba se va
// volando de costado y sube la de abajo) o a mano: arrastrándola, con las flechas o con los puntitos. Cada carta con su
// dibujo, para qué sirve y un ejemplo de verdad abajo. Los dibujos van con los colores de la app (con una propuesta de
// diseño puesta, son stickers con los suyos, y el fondo de cada carta también); cómo se mueven, en gr-portada (tokens.css).

const TINTA = 'var(--gr-ink)'
const linea = { stroke: TINTA, strokeWidth: 4, strokeLinejoin: 'round', strokeLinecap: 'round' } as const
const sombra = (cx: number, cy: number, rx: number) => <ellipse cx={cx} cy={cy} rx={rx} ry={7} fill="rgb(20 20 20 / 0.1)" />

/** Tu lista: un pato de goma gigante, con alguien al lado para que se note. */
function Pato() {
  return (
    <>
      {sombra(124, 178, 74)}
      <g fill="none" {...linea} strokeWidth={3}>
        <circle cx="30" cy="142" r="5" fill="var(--gr-surface)" />
        <path d="M30 147v18M30 165l-6 12M30 165l6 12M22 153l8 3 8-3" />
      </g>
      <path d="M46 104C58 112 66 118 78 120C100 108 150 106 182 122C204 134 200 168 166 172H96C64 172 44 152 46 104Z" fill="#FFD43B" {...linea} />
      <path d="M96 134C108 120 140 122 148 138C138 152 110 152 96 134Z" fill="#FFC21A" {...linea} />
      <circle cx="158" cy="84" r="36" fill="#FFD43B" {...linea} />
      <path d="M188 86C204 80 218 86 216 95C212 103 196 104 186 99Z" fill="#FF8A1F" {...linea} />
      <path d="M190 95C198 96 206 96 214 94" fill="none" {...linea} strokeWidth={3} />
      <ellipse cx="156" cy="97" rx="7" ry="4.5" fill="#FF9F7A" />
      <circle cx="168" cy="76" r="5.5" fill={TINTA} />
      <circle cx="170" cy="74" r="1.8" fill="var(--gr-surface)" />
    </>
  )
}

/** En secreto: un regalo cerrado (el sello le cae encima, ver la carta). */
function Regalo() {
  return (
    <>
      {sombra(116, 180, 64)}
      <path d="M116 74C96 48 76 58 98 74Z" fill="var(--gr-accent)" {...linea} strokeWidth={3} />
      <path d="M116 74C136 48 156 58 134 74Z" fill="var(--gr-accent)" {...linea} strokeWidth={3} />
      <rect x="66" y="96" width="100" height="78" rx="6" fill={TINTA} />
      <rect x="58" y="74" width="116" height="26" rx="5" fill={TINTA} />
      <rect x="108" y="74" width="16" height="100" fill="var(--gr-accent)" />
    </>
  )
}

/** Entre todos: el regalo en el medio y los que ponen alrededor. */
function EntreTodos() {
  const caras = [[42, 52, 'var(--gr-accent)', 'C'], [198, 52, '#FFD43B', 'M'], [42, 158, '#FF7FA8', 'E'], [198, 158, 'var(--gr-surface)', 'R']] as const
  return (
    <>
      <path d="M54 62L106 108M186 62L134 108M54 152L106 126M186 152L134 126" fill="none" stroke={TINTA} strokeWidth={2.5} strokeDasharray="5 6" />
      <rect x="94" y="96" width="52" height="46" rx="5" fill="#2F5BEA" {...linea} strokeWidth={3.5} />
      <rect x="88" y="84" width="64" height="16" rx="4" fill="#2F5BEA" {...linea} strokeWidth={3.5} />
      <rect x="114" y="84" width="12" height="58" fill="var(--gr-accent)" {...linea} strokeWidth={2} />
      {caras.map(([x, y, fondo, letra]) => (
        <g key={letra}>
          <circle cx={x} cy={y} r="20" fill={fondo} {...linea} strokeWidth={3} />
          <text x={x} y={y + 5} textAnchor="middle" fontSize={15} fontWeight={800} fill={TINTA} style={{ fontFamily: 'var(--gr-font-display)' }}>{letra}</text>
        </g>
      ))}
    </>
  )
}

/** Amigo invisible: los papelitos, con el que te tocó abierto. */
function Papelitos() {
  const doblado = (x: number, y: number, giro: number) => (
    <g transform={`rotate(${giro} ${x + 41} ${y + 23})`}>
      <rect x={x} y={y} width="82" height="46" rx="5" fill="var(--gr-surface)" {...linea} strokeWidth={3.5} />
      <path d={`M${x} ${y + 23}h82`} stroke={TINTA} strokeWidth={2} strokeDasharray="4 4" />
    </g>
  )
  return (
    <>
      {sombra(120, 186, 84)}
      {doblado(22, 118, -16)}
      {doblado(142, 124, 14)}
      <g transform="rotate(-5 120 98)">
        <rect x="60" y="40" width="120" height="108" rx="7" fill="var(--gr-surface)" {...linea} />
        <path d="M60 94h120" stroke="var(--gr-line)" strokeWidth={2} />
        <text x="120" y="76" textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--gr-muted)">Te tocó</text>
        <text x="120" y="132" textAnchor="middle" fontSize={36} fontWeight={800} fill={TINTA} style={{ fontFamily: 'var(--gr-font-display)' }}>Caro</text>
      </g>
      <polygon points={STAR_POINTS} transform="translate(158 20) scale(0.36)" fill="var(--gr-accent)" stroke={TINTA} strokeWidth={6} strokeLinejoin="round" />
    </>
  )
}

/** Cumples: la cuenta regresiva en la estrella, como en Inicio. */
function Cuenta() {
  return (
    <>
      <polygon points={STAR_POINTS} transform="translate(50 22) scale(1.4)" fill="var(--gr-accent)" stroke={TINTA} strokeWidth={2.8} strokeLinejoin="round" />
      {/* el número y "días" adentro de la estrella, como en Starburst (más arriba del centro y abajo) */}
      <text x="120" y="83" dy="0.35em" textAnchor="middle" fontSize={50} fontWeight={800} fill={TINTA} style={{ fontFamily: 'var(--gr-font-display)' }}>3</text>
      <text x="120" y="119" dy="0.35em" textAnchor="middle" fontSize={22} fontWeight={800} fill={TINTA} style={{ fontFamily: 'var(--gr-font-display)' }}>días</text>
      <g fill={TINTA}><circle cx="34" cy="50" r="4" /><circle cx="206" cy="40" r="3" /><circle cx="214" cy="160" r="4" /><circle cx="28" cy="150" r="3" /></g>
    </>
  )
}

/** Caritas en fila, para los que regalan juntos. */
function Caras({ letras }: { letras: string[] }) {
  // con una propuesta de diseño, los colores son los suyos (--gr-cara-*, en temas.css)
  const fondos = ['bg-gr-accent', 'bg-[var(--gr-cara-2,#FFD43B)]', 'bg-[var(--gr-cara-3,#FF7FA8)]', 'bg-[var(--gr-cara-4,#DCE8FF)]']
  return (
    <span aria-hidden className="flex pl-2">
      {letras.map((l, i) => (
        <span key={l} className={`-ml-2 flex size-[26px] items-center justify-center rounded-full border-2 border-gr-surface font-brand text-[10px] font-extrabold ${fondos[i % fondos.length]}`}>{l}</span>
      ))}
    </span>
  )
}

type Funcion = { Dibujo: () => ReactNode; sticker: NombreSticker; fondo: string; nombre: string; titulo: string; texto: string; ejemplo: ReactNode }

const FUNCIONES: Funcion[] = [
  { Dibujo: Pato, sticker: 'lista', fondo: 'var(--gr-portada-1, #DCE8FF)', nombre: 'Tu lista', titulo: 'Armá tu lista',
    texto: 'Con foto o link. Marcá lo que más querés y mandala por WhatsApp.',
    ejemplo: <><PriorityTag prioridad="mucho" className="h-6 px-2" />Pato de goma gigante · $38.000</> },
  { Dibujo: Regalo, sticker: 'regalo', fondo: 'var(--gr-portada-2, #EAF7C4)', nombre: 'En secreto', titulo: 'Te lo regalan en secreto',
    texto: 'Tu gente reserva y vos no ves nada: ni quién, ni qué.',
    ejemplo: <><Icon name="lock" size={15} strokeWidth={2.2} className="flex-none" />Lo reservaste vos. Euge no se entera.</> },
  { Dibujo: EntreTodos, sticker: 'alcancia', fondo: 'var(--gr-portada-3, #FFE1D6)', nombre: 'Entre todos', titulo: 'Lo pagan entre todos',
    texto: 'Uno lo compra y la app le hace las cuentas a cada uno.',
    ejemplo: <><Caras letras={['C', 'M', 'E', 'R']} />$12.000 cada uno</> },
  { Dibujo: Papelitos, sticker: 'antifaz', fondo: 'var(--gr-portada-4, #E7E2FF)', nombre: 'Amigo invisible', titulo: 'Amigo invisible sin papelitos',
    texto: 'La app sortea y cada uno ve solo a quién le regala. Ni el que organiza se entera.',
    ejemplo: <><Caras letras={['C', 'M', 'E', 'R']} />Navidad · hasta $20.000</> },
  { Dibujo: Cuenta, sticker: 'calendario', fondo: 'var(--gr-portada-5, #FFF0C2)', nombre: 'Cumples', titulo: 'Cumples con tiempo',
    texto: 'Te avisamos antes del cumple de tu gente, con su lista a mano.',
    ejemplo: <><Icon name="calendar" size={15} strokeWidth={2.2} className="flex-none" />Mati cumple el sábado</> },
]

/** Dónde está cada carta según cuál está arriba: arriba, la que sigue abajo, la anterior volada y el resto escondidas. */
function lugar(i: number, actual: number) {
  const n = FUNCIONES.length
  const pos = (i - actual + n) % n
  return pos === 0 ? 'arriba' : pos === 1 ? 'abajo' : pos === n - 1 ? 'fuera' : 'escondida'
}

const SIN_MOVIMIENTO = '(prefers-reduced-motion: reduce)'
const useSinMovimiento = () => useSyncExternalStore(
  (avisar) => {
    const m = matchMedia(SIN_MOVIMIENTO)
    m.addEventListener('change', avisar)
    return () => m.removeEventListener('change', avisar)
  },
  () => matchMedia(SIN_MOVIMIENTO).matches,
  // en el servidor no pasan: arrancan al llegar al navegador
  () => true,
)

/** Cuánto hay que arrastrar la carta para pasar a la otra. */
const UMBRAL = 60

export function Portada() {
  const [actual, setActual] = useState(0)
  // pasan solas hasta que la mueven a mano; mientras el mouse o el foco están encima, esperan
  const [aMano, setAMano] = useState(false)
  const [encima, setEncima] = useState(false)
  const quieto = useSinMovimiento()
  // lo que lleva arrastrada la de arriba (null: no la están arrastrando)
  const [arrastre, setArrastre] = useState<number | null>(null)
  const desde = useRef<number | null>(null)

  useEffect(() => {
    if (aMano || encima || quieto) return
    const t = setTimeout(() => setActual((a) => (a + 1) % FUNCIONES.length), 4200)
    return () => clearTimeout(t)
  }, [actual, aMano, encima, quieto])

  const ir = (a: number) => {
    setAMano(true)
    setActual((a + FUNCIONES.length) % FUNCIONES.length)
  }

  return (
    <section aria-label="Lo que hace GiftR" className="flex w-full flex-col items-center gap-2"
             onMouseEnter={() => setEncima(true)} onMouseLeave={() => setEncima(false)}
             onFocus={() => setEncima(true)} onBlur={() => setEncima(false)}>
      {/* en cuál vas, y para pasar a mano */}
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => ir(actual - 1)} aria-label="Anterior" className="flex size-10 items-center justify-center rounded-full text-gr-muted">
          <Icon name="chevron" size={18} strokeWidth={2.4} className="rotate-180" />
        </button>
        {FUNCIONES.map((f, i) => (
          <button key={f.nombre} type="button" onClick={() => ir(i)} aria-label={f.nombre} aria-current={i === actual}
                  className="flex h-10 items-center px-[2.5px]">
            <span className="gr-portada__punto" />
          </button>
        ))}
        <button type="button" onClick={() => ir(actual + 1)} aria-label="Siguiente" className="flex size-10 items-center justify-center rounded-full text-gr-muted">
          <Icon name="chevron" size={18} strokeWidth={2.4} />
        </button>
      </div>
      {/* arrastrar de costado pasa de carta; para arriba y abajo, la página se mueve como siempre */}
      <ul className="relative h-[346px] w-full max-w-[320px] touch-pan-y select-none"
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse' || e.button === 0) desde.current = e.clientX
          }}
          onPointerMove={(e) => {
            if (desde.current === null) return
            const dx = e.clientX - desde.current
            if (arrastre === null && Math.abs(dx) < 8) return
            if (arrastre === null) e.currentTarget.setPointerCapture(e.pointerId)
            setArrastre(dx)
          }}
          onPointerUp={() => {
            // a la izquierda, la que sigue (se va volando como cuando pasan solas); a la derecha, vuelve la anterior
            if (arrastre !== null && Math.abs(arrastre) > UMBRAL) ir(actual + (arrastre < 0 ? 1 : -1))
            desde.current = null
            setArrastre(null)
          }}
          onPointerCancel={() => {
            desde.current = null
            setArrastre(null)
          }}>
        {/* la pila: las otras cartas debajo */}
        <li aria-hidden className="absolute inset-x-6 top-4 h-[322px] -rotate-6 rounded-[22px] bg-gr-surface shadow-card" />
        <li aria-hidden className="absolute inset-x-6 top-2 h-[322px] rotate-[5deg] rounded-[22px] bg-gr-surface shadow-card" />
        {/* todas del mismo alto: la que espera abajo no asoma */}
        {FUNCIONES.map((f, i) => {
          const donde = lugar(i, actual)
          const arrastrada = donde === 'arriba' && arrastre !== null
          return (
            <li key={f.nombre} data-lugar={donde} data-arrastrada={arrastrada || undefined}
                className="gr-portada__carta gr-card absolute inset-x-0 top-0 flex h-[336px] flex-col"
                style={arrastrada ? { transform: `translateX(${arrastre}px) rotate(${arrastre / 18}deg)` } : undefined}>
              <div className="relative h-[196px]" style={{ background: f.fondo }}>
                <Ilustrado sticker={f.sticker} className="absolute inset-0 m-auto size-[196px]">
                  <svg aria-hidden viewBox="0 0 240 200" className="absolute inset-0 m-auto h-[176px] w-[212px]"><f.Dibujo /></svg>
                </Ilustrado>
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-gr-surface py-1 pl-1 pr-2.5 text-xs font-semibold">
                  <span aria-hidden className="flex size-5 items-center justify-center rounded-full bg-gr-brand text-[10px] font-bold text-gr-accent">{i + 1}</span>
                  {f.nombre}
                </span>
                {/* al regalo le cae el sello, como cuando reservás */}
                {f.Dibujo === Regalo && <SelloDibujo tipo="tuyo" size={86} className="gr-portada__sello absolute bottom-3 right-12" />}
              </div>
              <div className="flex flex-1 flex-col gap-1 px-4 pb-4 pt-3">
                <p className="text-lg leading-tight font-semibold">{f.titulo}</p>
                <p className="text-sm leading-snug text-gr-muted">{f.texto}</p>
                <p className="mt-auto flex items-center gap-2 text-[13px] leading-snug font-semibold">{f.ejemplo}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
