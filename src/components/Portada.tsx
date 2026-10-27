import type { CSSProperties } from 'react'
import { SelloDibujo, type TipoSello } from '@/components/SelloDibujo'
import { Icon, PriorityTag, type Prioridad } from '@/components/ui'

// La portada: deseos de mentira que pasan de a uno, despacio, como en la lista de alguien. Cada uno con la nota de quien
// lo pidió y, al rato, el sello y quién se ocupa sin que el dueño se entere: lo que hace la app, sin explicarlo.
// Los regalos son dibujos (no fotos) con los colores de la app; la ronda es solo CSS (gr-portada en tokens.css).

const TINTA = 'var(--gr-ink)'
const linea = { stroke: TINTA, strokeWidth: 4, strokeLinejoin: 'round', strokeLinecap: 'round' } as const
const sombra = (cx: number, cy: number, rx: number) => <ellipse cx={cx} cy={cy} rx={rx} ry={7} fill="rgb(20 20 20 / 0.1)" />

/** Un pato de goma gigante, con alguien al lado para que se note. */
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

/** Anteojos con nariz y bigote, mirando de reojo. */
function Anteojos() {
  return (
    <>
      {sombra(120, 184, 62)}
      <g fill="none" {...linea}>
        <path d="M56 64Q84 44 112 60M128 60Q156 44 184 64" strokeWidth={10} />
        <path d="M60 92L30 84M180 92L210 84M114 90Q120 84 126 90" strokeWidth={7} />
      </g>
      <circle cx="88" cy="94" r="28" fill="var(--gr-surface)" {...linea} strokeWidth={7} />
      <circle cx="152" cy="94" r="28" fill="var(--gr-surface)" {...linea} strokeWidth={7} />
      <circle cx="97" cy="98" r="7" fill={TINTA} />
      <circle cx="161" cy="98" r="7" fill={TINTA} />
      <path d="M120 98C102 120 100 146 116 152C128 156 142 150 138 136C135 120 128 108 120 98Z" fill="#F6A48A" {...linea} />
      <ellipse cx="125" cy="132" rx="4" ry="7" fill="var(--gr-surface)" opacity="0.5" />
      <path d="M78 160C92 142 112 144 120 152C128 144 148 142 162 160C150 170 134 168 120 160C106 168 90 170 78 160Z" fill={TINTA} />
    </>
  )
}

/** Un almohadón pedorro, en plena función. */
function Almohadon() {
  return (
    <>
      {sombra(108, 174, 70)}
      <path d="M164 116L200 102C210 99 216 110 208 116L172 134Z" fill="#FF7FA8" {...linea} />
      <ellipse cx="106" cy="124" rx="72" ry="46" fill="#FF7FA8" {...linea} />
      <path d="M58 106C78 90 118 86 146 98" fill="none" stroke="var(--gr-surface)" strokeWidth={6} strokeLinecap="round" opacity="0.55" />
      <g fill="var(--gr-surface)" {...linea} strokeWidth={3}>
        <circle cx="219" cy="98" r="7" />
        <circle cx="229" cy="82" r="5" />
        <circle cx="235" cy="68" r="3.5" />
      </g>
      <text x="168" y="62" fontSize={22} fontWeight={800} fill={TINTA} transform="rotate(-12 168 62)"
            style={{ fontFamily: 'var(--gr-font-display)' }}>prrr</text>
    </>
  )
}

/** Un enano de jardín que guiña. */
function Enano() {
  return (
    <>
      {sombra(120, 184, 52)}
      <path d="M82 182L90 124Q120 110 150 124L158 182Z" fill="#2F5BEA" {...linea} />
      <path d="M86.5 150H153.5L154.8 160H85.2Z" fill={TINTA} />
      <rect x="112" y="148.5" width="16" height="13" rx="2" fill="var(--gr-accent)" {...linea} strokeWidth={2.5} />
      <circle cx="120" cy="98" r="21" fill="#F8C9A8" {...linea} />
      <path d="M96 106C98 142 112 156 120 160C128 156 142 142 144 106C132 116 108 116 96 106Z" fill="var(--gr-surface)" {...linea} />
      <circle cx="120" cy="108" r="7" fill="#F49A8B" {...linea} strokeWidth={3} />
      <path d="M106 95Q110 91.5 114 95" fill="none" {...linea} strokeWidth={2.5} />
      <circle cx="130" cy="95" r="2.8" fill={TINTA} />
      <path d="M97 84C103 54 122 28 156 14C144 38 140 60 145 84C128 90 112 90 97 84Z" fill="#F0433A" {...linea} />
    </>
  )
}

/** Una lámpara de lava, bien de los noventa. */
function Lampara() {
  return (
    <>
      {sombra(120, 186, 44)}
      <defs>
        <clipPath id="gr-portada-vidrio"><path d="M102 142L110 62H130L138 142Z" /></clipPath>
      </defs>
      <path d="M102 142L110 62H130L138 142Z" fill="#7B5CFF" />
      <g clipPath="url(#gr-portada-vidrio)" fill="#FF5FA2">
        <circle cx="122" cy="126" r="13" />
        <ellipse cx="113" cy="96" rx="6" ry="9" />
        <circle cx="126" cy="76" r="4.5" />
      </g>
      <path d="M102 142L110 62H130L138 142Z" fill="none" {...linea} />
      <path d="M92 186L102 142H138L148 186Z" fill={TINTA} {...linea} />
      <path d="M106 162H134" stroke="var(--gr-accent)" strokeWidth={3} strokeLinecap="round" />
      <path d="M110 62L114 40H126L130 62Z" fill={TINTA} {...linea} />
      <path d="M86 90L72 85M86 112L70 114M154 90L168 85M154 112L170 114" fill="none" {...linea} strokeWidth={3} opacity="0.45" />
    </>
  )
}

type Deseo = {
  Dibujo: () => React.ReactNode
  fondo: string
  lista: string
  inicial: string
  titulo: string
  nota: string
  precio: string
  prioridad: Prioridad
  sello: TipoSello
  quien: string
}

const DESEOS: Deseo[] = [
  { Dibujo: Pato, fondo: '#DCE8FF', lista: 'Lista de Euge', inicial: 'E', titulo: 'Pato de goma gigante', nota: 'Para la pelopincho. No es joda.',
    precio: '$38.000', prioridad: 'mucho', sello: 'tuyo', quien: 'Lo reservaste vos. Euge no se entera.' },
  { Dibujo: Anteojos, fondo: '#FFE1D6', lista: 'Lista de Mati', inicial: 'M', titulo: 'Nariz con bigote', nota: 'Para el Zoom con mi jefe.',
    precio: '$6.500', prioridad: 'gustaria', sello: 'tuyo', quien: 'Lo reservaste vos. Mati no se entera.' },
  { Dibujo: Almohadon, fondo: '#EAF7C4', lista: 'Lista del abuelo Tito', inicial: 'T', titulo: 'Almohadón pedorro', nota: 'Para la sobremesa del domingo.',
    precio: '$4.900', prioridad: 'mucho', sello: 'todos', quien: 'Entre los 6 nietos. Tito no se entera.' },
  { Dibujo: Enano, fondo: '#E7E2FF', lista: 'Lista de Caro', inicial: 'C', titulo: 'Enano de jardín', nota: 'Que se llame Ramón.',
    precio: '$29.000', prioridad: 'gustaria', sello: 'tuyo', quien: 'Lo reservaste vos. Caro no se entera.' },
  { Dibujo: Lampara, fondo: '#FFF0C2', lista: 'Lista de Lu', inicial: 'L', titulo: 'Lámpara de lava', nota: 'Para el depto nuevo. Muy 1998.',
    precio: '$27.000', prioridad: 'suelta', sello: 'todos', quien: 'Lo dividen entre 3. Lu no se entera.' },
]

export function Portada() {
  return (
    // de muestra: lo que dice la página está en el título y el texto de abajo
    <div aria-hidden className="relative mx-auto h-[366px] w-full max-w-[320px]">
      {/* la pila: otros deseos debajo */}
      <div className="absolute inset-x-6 top-4 h-[322px] -rotate-6 rounded-[22px] bg-gr-surface shadow-card" />
      <div className="absolute inset-x-6 top-2 h-[322px] rotate-[5deg] rounded-[22px] bg-gr-surface shadow-card" />
      {/* todos del mismo alto: el que espera abajo no asoma */}
      {DESEOS.map((d, i) => (
        <article key={d.titulo} className="gr-portada__deseo gr-card absolute inset-x-0 top-0 flex h-[336px] flex-col" style={{ '--i': i } as CSSProperties}>
          <div className="relative h-[196px]" style={{ background: d.fondo }}>
            <svg viewBox="0 0 240 200" className="absolute inset-0 m-auto h-[176px] w-[212px]"><d.Dibujo /></svg>
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-gr-surface py-1 pl-1 pr-2.5 text-xs font-semibold">
              <span className="flex size-5 items-center justify-center rounded-full bg-gr-accent text-[10px]">{d.inicial}</span>
              {d.lista}
            </span>
            <SelloDibujo tipo={d.sello} size={96} className="gr-portada__sello absolute -bottom-8 right-3 z-[1]" />
          </div>
          <div className="flex flex-1 flex-col gap-1 px-4 pb-4 pt-3">
            <p className="pr-[92px] text-lg leading-tight font-semibold">{d.titulo}</p>
            <p className="pr-[60px] text-sm leading-snug text-gr-muted">“{d.nota}”</p>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-base font-semibold">{d.precio}</span>
              <PriorityTag prioridad={d.prioridad} className="h-6 px-2" />
            </div>
            <p className="gr-portada__quien mt-auto flex items-start gap-1.5 text-[13px] leading-snug font-semibold">
              <Icon name="lock" size={15} strokeWidth={2.2} className="mt-px flex-none" />{d.quien}
            </p>
          </div>
        </article>
      ))}
    </div>
  )
}
