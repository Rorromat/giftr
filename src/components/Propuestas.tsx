'use client'

import Link from 'next/link'
import { useTema } from '@/components/Ilustrado'
import { Icon } from '@/components/ui'
import { PROPUESTAS, ponerTema, type Propuesta } from '@/lib/tema'
import { Sticker } from '@/stickers/Sticker'
import { STICKERS, type NombreSticker } from '@/stickers/giftr'
import { PALETAS } from '@/stickers/paletas'

// Las propuestas de diseño, para probarlas: cada una con su paleta, sus letras, sus formas y sus stickers. Al elegir una se
// pone en toda la app (en este navegador); "El de siempre" la saca. La muestra de cada tarjeta va con estilos propios, no
// con los de la propuesta puesta, así se comparan las cuatro desde cualquiera.

/** Los stickers de la muestra de cada propuesta: lo que más se ve en la app. */
const MUESTRA: NombreSticker[] = ['regalo', 'lista', 'alcancia', 'antifaz']

/** Las letras de cada una, para la muestra (las carga el layout raíz). */
const LETRAS: Record<Propuesta['id'], { titulo: React.CSSProperties; texto: string }> = {
  sobremesa: { titulo: { fontFamily: 'var(--font-fraunces)', fontWeight: 600, fontVariationSettings: "'opsz' 72, 'SOFT' 100" }, texto: 'var(--font-instrument)' },
  revista: { titulo: { fontFamily: 'var(--font-instrument-serif)', fontWeight: 400, fontSize: 40 }, texto: 'var(--font-instrument)' },
  brasa: { titulo: { fontFamily: 'var(--font-unbounded)', fontWeight: 600, fontSize: 28, letterSpacing: '-0.04em' }, texto: 'var(--font-manrope)' },
  cielo: { titulo: { fontFamily: 'var(--font-gabarito)', fontWeight: 800 }, texto: 'var(--font-rubik)' },
}

export function Propuestas() {
  const tema = useTema()
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => ponerTema(null)} aria-pressed={tema === null}
              className="gr-card flex items-center gap-3 p-4 text-left">
        <span aria-hidden className="flex size-11 flex-none items-center justify-center rounded-full bg-[#141414] text-[#C8F31D]">
          <Icon name="star" size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base leading-tight font-semibold">El de siempre</span>
          <span className="block text-[13px] leading-snug text-gr-muted">Tinta y lima, Instrument Sans y Bricolage.</span>
        </span>
        <Elegida si={tema === null} />
      </button>

      {PROPUESTAS.map((p) => <Tarjeta key={p.id} p={p} puesta={tema === p.id} />)}

      {tema && (
        <nav aria-label="Recorrer la app" className="gr-card flex flex-col gap-2 p-4">
          <p className="text-[15px] font-semibold">Recorrela con esta puesta</p>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/inicio" className="gr-btn gr-btn--sm">Inicio</Link>
            <Link href="/mi-lista" className="gr-btn gr-btn--sm">Tu lista</Link>
            <Link href="/regalos" className="gr-btn gr-btn--sm">Regalos</Link>
            <Link href="/gente" className="gr-btn gr-btn--sm">Tu gente</Link>
          </div>
        </nav>
      )}
    </div>
  )
}

function Elegida({ si }: { si: boolean }) {
  return si
    ? <span className="flex flex-none items-center gap-1 rounded-full bg-gr-brand px-2.5 py-1 text-xs font-semibold text-gr-on-brand"><Icon name="check" size={14} strokeWidth={2.6} />Puesta</span>
    : <span className="flex-none text-sm font-semibold">Probar</span>
}

function Tarjeta({ p, puesta }: { p: Propuesta; puesta: boolean }) {
  const [fondo, tinta] = p.id === 'brasa' ? ['#1E1E20', '#F6F1EC'] : p.id === 'revista' ? [p.paleta[0], p.paleta[2]] : [p.paleta[0], p.paleta[1]]
  const letras = LETRAS[p.id]
  return (
    <button type="button" onClick={() => ponerTema(p.id)} aria-pressed={puesta} className="gr-card flex flex-col text-left">
      {/* la muestra, con sus colores y sus letras */}
      <span className="flex flex-col gap-3 p-4" style={{ background: fondo, color: tinta, fontFamily: letras.texto }}>
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[34px] leading-none" style={letras.titulo}>{p.nombre}</span>
          <span className="flex flex-none gap-1">
            {p.paleta.map((c) => <span key={c} className="size-5 rounded-full" style={{ background: c, boxShadow: `0 0 0 1.5px ${tinta}` }} />)}
          </span>
        </span>
        <span className="grid grid-cols-4 gap-1">
          {MUESTRA.map((n) => <Sticker key={n} icon={STICKERS[n]} palette={PALETAS[p.id]} />)}
        </span>
        <span className="text-[15px] leading-snug">{p.idea}</span>
      </span>
      <span className="flex items-center gap-3 p-4">
        <span className="min-w-0 flex-1 text-[13px] leading-snug text-gr-muted">
          <span className="block font-semibold text-gr-ink">{p.letras}</span>
          {p.formas}
        </span>
        <Elegida si={puesta} />
      </span>
    </button>
  )
}
