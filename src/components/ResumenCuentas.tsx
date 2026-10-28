import Link from 'next/link'
import type { CuentaPersona, Cuentas } from '@/lib/regalos'
import { plata } from '@/lib/pesos'
import { AvatarSticker, Icon, SectionHeader } from '@/components/ui'

// Las cuentas pendientes en Inicio, abajo de lo nuevo de tus amigos: cuánto debés y cuánto te deben (como arriba en
// Cuentas) y con quién, los primeros. Todo lleva a Cuentas, donde se marca lo que se pagó.

/** Con cuántas personas como mucho (las demás, en Cuentas). */
export const PERSONAS_EN_INICIO = 3

/** Un total: en pesos, y lo de dólares abajo y aparte (si solo hay dólares, va eso solo). Como en Cuentas. */
function Total({ pesos, dolares, className = '' }: { pesos: number; dolares: number; className?: string }) {
  const soloDolares = !pesos && dolares > 0
  return (
    <>
      <span className={`gr-number text-[22px] tabular-nums ${className}`}>{soloDolares ? plata(dolares, 'USD') : plata(pesos)}</span>
      {!soloDolares && dolares > 0 && <span className={`gr-number text-base tabular-nums ${className}`}>+ {plata(dolares, 'USD')}</span>}
    </>
  )
}

function Persona({ p }: { p: CuentaPersona }) {
  const regalos = [...new Set(p.lineas.map((l) => l.itemTitulo))]
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <AvatarSticker nombre={p.nombre} size={40} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">
          {p.neto === 0 ? `Con ${p.nombre} están a mano` : p.neto < 0 ? `Le debés ${plata(-p.neto, p.moneda)} a ${p.nombre}` : `${p.nombre} te debe ${plata(p.neto, p.moneda)}`}
        </span>
        <span className="truncate text-[13px] text-gr-muted">{p.neto === 0 ? 'Falta marcarlo como saldado' : regalos.join(' · ')}</span>
      </span>
    </li>
  )
}

export function CuentasPendientes({ cuentas }: { cuentas: Cuentas }) {
  if (!cuentas.personas.length) return null
  const mas = cuentas.personas.length - PERSONAS_EN_INICIO
  return (
    <section aria-labelledby="cuentas-pendientes" className="flex flex-col gap-3">
      <SectionHeader id="cuentas-pendientes" title="Cuentas pendientes" href="/cuentas" linkLabel="Ver cuentas" />
      <Link href="/cuentas" className="gr-card flex flex-col">
        <span className="grid grid-cols-2 gap-2 p-2.5 pb-1">
          <span className="gr-hero flex flex-col gap-1 rounded-[20px] px-3.5 py-3">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-gr-on-hero/60 uppercase">Debés</span>
            <Total pesos={cuentas.debes} dolares={cuentas.dolares?.debes ?? 0} className="text-gr-hero-detail" />
          </span>
          <span className="flex flex-col gap-1 rounded-[20px] bg-gr-accent px-3.5 py-3">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-gr-ink/60 uppercase">Te deben</span>
            <Total pesos={cuentas.teDeben} dolares={cuentas.dolares?.teDeben ?? 0} />
          </span>
        </span>
        <ul className="flex flex-col divide-y divide-gr-line">
          {cuentas.personas.slice(0, PERSONAS_EN_INICIO).map((p) => <Persona key={`${p.id}-${p.moneda}`} p={p} />)}
        </ul>
        <span className="flex items-center gap-2 border-t border-gr-line px-4 py-3 text-sm font-semibold">
          <Icon name="wallet" size={18} className="flex-none" />
          <span className="flex-1">{mas > 0 ? `Y ${mas} ${mas === 1 ? 'cuenta' : 'cuentas'} más: saldalas en Cuentas` : 'Saldalas en Cuentas'}</span>
          <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
        </span>
      </Link>
    </section>
  )
}
