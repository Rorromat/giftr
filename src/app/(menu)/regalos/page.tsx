import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { misRegalos, type MiRegalo } from '@/lib/mis-regalos'
import { plata } from '@/lib/pesos'
import { MESES } from '@/lib/events'
import { miFoto } from '@/lib/perfil'
import { PestanasRegalos } from '@/components/PestanasRegalos'
import { ArmarSorpresa } from '@/components/Sorpresas'
import { AppHeader, Icon, ItemPhoto, QuizasLink, Seccion } from '@/components/ui'

/** Qué pasa con este regalo, en una línea. */
function estado(r: MiRegalo): { texto: string; urgente?: boolean } {
  if (r.tipo === 'grupal') {
    const que = r.sorpresa ? 'Sorpresa' : 'Regalo grupal'
    if (r.estado === 'comprado') return { texto: r.miParte != null ? `${que} · tu parte ${plata(r.miParte, r.moneda)}` : `${que} · comprado` }
    const quien = r.soyEncargado ? 'lo organizás vos' : `organiza ${r.encargado?.split(' ')[0] ?? 'alguien'}`
    return { texto: `${que} · ${r.personas} ${r.personas === 1 ? 'persona' : 'personas'} · ${quien}` }
  }
  if (r.estado === 'comprado') return { texto: 'Comprado' }
  if (r.venceEnDias == null) return { texto: 'Reservado' }
  const d = r.venceEnDias
  return { texto: `Reservado · ${d === 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence en ${d} días`}`, urgente: d <= 2 }
}

/** "marzo de 2026": cuándo se compró, en el historial. */
const mesDe = (f: Date) => `${MESES[f.getMonth()]} de ${f.getFullYear()}`

function Fila({ r, pasado = false }: { r: MiRegalo; pasado?: boolean }) {
  const e = estado(r)
  return (
    <li>
      <QuizasLink href={r.href} className="gr-card flex items-center gap-3 p-2.5 pr-3.5">
        <div className="size-16 flex-none overflow-hidden rounded-2xl">
          <ItemPhoto src={r.foto} titulo={r.titulo} height={64} className="w-16" dimmed={pasado} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">{r.titulo}</p>
          <p className="text-[13px] font-medium text-gr-muted">{r.sorpresa && '🤫 '}para {r.para}{pasado && ` · ${mesDe(r.fecha)}`}</p>
          <p className={`flex items-center gap-1.5 text-[13px] font-semibold ${e.urgente ? 'text-red-700' : ''}`}>
            <Icon name={r.estado === 'comprado' ? 'check' : r.tipo === 'grupal' ? 'users' : 'clock'} size={14} strokeWidth={2.4} className="flex-none" />
            {e.texto}
          </p>
        </div>
        {r.href && <Icon name="chevron" size={18} className="flex-none text-gr-muted" />}
      </QuizasLink>
    </li>
  )
}

/**
 * Mis regalos: lo que reservé y los regalos grupales en los que estoy, de todas las listas, en un solo lugar. Arriba lo
 * que falta comprar, después lo comprado para lo que viene, y aparte el historial: lo de un cumple o una fecha que ya pasó.
 * Cada uno lleva a su deseo, donde se marca comprado o se libera.
 */
export default async function MisRegalos() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [{ porComprar, comprados, historial }, foto] = await Promise.all([misRegalos(db, session.userId), miFoto(db, session.userId)])

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <AppHeader nombre={session.user?.name ?? session.user?.email ?? 'Vos'} foto={foto} />
      <div className="flex flex-col gap-1">
        <h1 className="gr-title">Tus regalos</h1>
        <p className="text-[15px] text-gr-muted">Lo que reservaste y los regalos grupales en los que estás.</p>
      </div>
      <PestanasRegalos actual="regalos" />

      {!porComprar.length && !comprados.length && !historial.length ? (
        <div className="gr-empty flex flex-col items-center gap-2 py-7 text-center">
          <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-gr-surface shadow-card"><Icon name="gift" size={26} /></span>
          <p>Todavía no reservaste nada.</p>
          <p className="text-gr-muted">Cuando reserves algo de la lista de alguien, o te sumes a un regalo grupal, aparece acá.</p>
          <Link href="/gente" className="gr-btn gr-btn--sm mt-2">Ver tu gente</Link>
        </div>
      ) : (
        <>
          <section aria-labelledby="por-comprar" className="flex flex-col gap-2.5">
            <h2 id="por-comprar" className="gr-heading">Por comprar{porComprar.length > 0 && <span className="text-gr-muted"> · {porComprar.length}</span>}</h2>
            {porComprar.length
              ? <ul className="flex flex-col gap-2.5">{porComprar.map((r) => <Fila key={`${r.tipo}-${r.id}`} r={r} />)}</ul>
              : <p className="gr-empty px-4 py-4 text-center text-sm">Nada pendiente por ahora.</p>}
          </section>
          {comprados.length > 0 && (
            <section aria-labelledby="comprados" className="flex flex-col gap-2.5">
              <div>
                <h2 id="comprados" className="gr-heading">Comprados</h2>
                <p className="text-[13px] text-gr-muted">Listos para lo que viene.</p>
              </div>
              <ul className="flex flex-col gap-2.5">{comprados.map((r) => <Fila key={`${r.tipo}-${r.id}`} r={r} />)}</ul>
            </section>
          )}
          {historial.length > 0 && (
            <section aria-labelledby="historial" className="mt-2 flex flex-col gap-2.5 border-t border-gr-line pt-5">
              <div>
                <h2 id="historial" className="gr-heading">Historial</h2>
                <p className="text-[13px] text-gr-muted">Lo que ya regalaste: de cumples y fechas que pasaron.</p>
              </div>
              <ul className="flex flex-col gap-2.5">{historial.map((r) => <Fila key={`${r.tipo}-${r.id}`} r={r} pasado />)}</ul>
            </section>
          )}
        </>
      )}

      <ArmarSorpresa />
    </Seccion>
  )
}
