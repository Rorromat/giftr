import Link from 'next/link'
import { Aportar, type MiAporte } from '@/components/Aportar'
import { Icon } from '@/components/ui'
import { paraBuscar } from '@/lib/buscar'
import { pesos } from '@/lib/pesos'
import type { ClaimView, OwnerItemView } from '@/lib/serialize'

// Un deseo de aporte en plata ("Luna de miel", "Cochecito"), como lo ve quien regala: en la lista, arriba de todo (en un
// casamiento o un baby shower es lo que más se elige), y en su página. No tiene foto, precio ni "Reservar": tiene a qué
// alias transferir y "Ya aporté". De los demás se ve quiénes aportaron, con las reglas de nombres de la lista; cuánto puso
// cada uno, nunca. Server components puros; lo que tiene estado es <Aportar>.

/** Lo que hace falta de un aporte para dibujarlo: el deseo, los aportes que le tocan ver al que mira y el progreso, si va. */
export type AporteVista = OwnerItemView & { claims: ClaimView[]; juntado: number | null }

const nombresJuntos = (nombres: string[]) => (nombres.length <= 1 ? nombres[0] ?? '' : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`)

/** El aporte del que mira, si anotó uno (ver aportar): para "Ya aportaste" y deshacerlo. */
export function miAporte(claims: ClaimView[]): MiAporte | null {
  const c = claims.find((x) => x.esMia)
  return c ? { claimId: c.id, monto: c.monto, deshacer: c.deshacer } : null
}

/** Cuántos nombres se dicen antes de "y N más". */
const NOMBRES_A_LA_VISTA = 4

/**
 * Quiénes ya aportaron, además del que mira: "Ya aportaron Sofi y Martín". Solo nombres, y solo los que le llegan (a quien
 * no le toca verlos no le llega ninguno, ni cuántos son: ver loadClaimViews). Sin nadie más, nada.
 */
export function QuienesAportaron({ claims }: { claims: ClaimView[] }) {
  const otros = claims.filter((c) => !c.esMia).map((c) => c.claimerNombre ?? 'Alguien')
  if (!otros.length) return null
  const aLaVista = otros.slice(0, NOMBRES_A_LA_VISTA)
  const mas = otros.length - aLaVista.length
  return (
    <p className="flex items-start gap-2 text-sm font-medium">
      <span className="mt-px flex size-5 flex-none items-center justify-center rounded-full bg-gr-brand text-gr-on-brand">
        <Icon name="check" size={11} strokeWidth={3} />
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {otros.length === 1 ? 'Ya aportó' : 'Ya aportaron'} {mas > 0 ? `${aLaVista.join(', ')} y ${mas} más` : nombresJuntos(aLaVista)}
      </span>
    </p>
  )
}

/**
 * Cuánto va juntado de la meta, más o menos: una barra y "Van unos $120.000 de $300.000". Sale de lo que anotaron los que
 * quisieron decir cuánto, y lo dice. juntado null: al que mira no se le muestra (ver juntadoDeAportes); en cero, tampoco:
 * una barra vacía no dice si nadie aportó o si nadie anotó cuánto.
 */
export function ProgresoAporte({ meta, juntado }: { meta: number | null; juntado: number | null }) {
  if (!meta || !juntado) return null
  const parte = Math.min(100, Math.round((juntado / meta) * 100))
  return (
    <div className="flex flex-col gap-1.5">
      <div role="progressbar" aria-label="Lo juntado de la meta, aproximado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={parte}
           className="h-2 overflow-hidden rounded-full bg-gr-soft">
        <div className="h-full rounded-full bg-gr-acento" style={{ width: `${parte}%` }} />
      </div>
      <p className="text-[13px] leading-snug text-gr-muted">
        Van unos <span className="font-semibold text-gr-ink tabular-nums">{pesos(juntado)}</span> de {pesos(meta)}, según lo que anotaron los que aportaron.
      </p>
    </div>
  )
}

/**
 * Un aporte en plata en la lista de alguien, a lo ancho y arriba de los demás deseos: qué es, la meta si hay una, quiénes
 * ya aportaron y "Aportar", ahí mismo. El nombre lleva a su página (la descripción entera y el hilo para coordinar).
 */
export function TarjetaAporte({ item, token, anotar, identified, para, plural, volver }: {
  item: AporteVista
  token: string
  /** Si el que mira puede dejar anotado su aporte (ver Aportar). */
  anotar: boolean
  identified: boolean
  para: string
  plural: boolean
  volver: string
}) {
  if (!item.aporteAlias) return null
  return (
    <li id={`deseo-${item.id}`} data-buscar={paraBuscar(`${item.titulo} aporte plata ${item.notas ?? ''}`)} className="gr-card flex scroll-mt-4 flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-11 flex-none items-center justify-center rounded-full bg-gr-soft text-gr-acento-texto">
          <Icon name="wallet" size={22} strokeWidth={2.2} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="gr-label">Aporte en plata</p>
          <h3 className="text-[19px] leading-tight font-bold tracking-[-0.01em]">
            <Link href={`/l/${token}/item/${item.id}`} className="[overflow-wrap:anywhere]">{item.titulo}</Link>
          </h3>
          <p className="text-[13px] leading-snug text-gr-muted">
            {item.aporteMeta ? `Meta: ${pesos(item.aporteMeta)}. ` : ''}Ponés lo que quieras, y pueden aportar todos.
          </p>
        </div>
      </div>
      {item.notas && <p className="line-clamp-3 whitespace-pre-line text-sm leading-snug text-gr-ink/80 [overflow-wrap:anywhere]">{item.notas}</p>}
      <ProgresoAporte meta={item.aporteMeta} juntado={item.juntado} />
      <QuienesAportaron claims={item.claims} />
      <Aportar token={token} itemId={item.id} alias={item.aporteAlias} mio={miAporte(item.claims)} anotar={anotar} identified={identified}
               para={para} plural={plural} volver={volver} />
    </li>
  )
}
