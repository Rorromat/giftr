import type { MiRegalo } from '@/lib/mis-regalos'
import { plata } from '@/lib/pesos'
import { MESES } from '@/lib/events'
import { Icon, ItemPhoto, QuizasLink } from '@/components/ui'

// Un regalo mío (reservado, grupal, comprado) en una fila: en Mis regalos y en "Por comprar" de Inicio. Lleva a su deseo,
// donde se marca comprado o se libera.

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

export function FilaRegalo({ r, pasado = false }: { r: MiRegalo; pasado?: boolean }) {
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
