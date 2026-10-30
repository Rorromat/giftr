import { fechaCorta, hoyLocal } from '@/lib/events'
import { juntarNombres } from '@/lib/groups'
import type { Historial } from '@/lib/regalos'

const fecha = (d: Date) => {
  const local = hoyLocal(d)
  return `${fechaCorta(local)} ${local.getUTCFullYear()}`
}

/**
 * Historial de la lista para quien regala: un gráfico de barras de cuántos regalos compró cada uno
 * y la lista de los últimos, con fecha. Sirve para "¿quién se ocupó del último cumple de mamá?".
 */
export function QuienSeOcupo({ historial, para }: { historial: Historial; para: string }) {
  const { entradas, ranking } = historial
  if (!entradas.length) return null
  const max = ranking[0].cantidad
  const nombre = (r: { nombre: string; esYo: boolean }) => (r.esYo ? 'Vos' : r.nombre)

  return (
    <section aria-labelledby="quien-se-ocupo" className="mt-6 flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="quien-se-ocupo" className="text-[26px] leading-none font-semibold">Quién se ocupó</h2>
        <p className="text-sm font-medium">Lo que ya le regalaron a {para} y quién lo compró.</p>
      </div>

      {ranking.length > 1 ? (
        <figure className="gr-card p-3.5">
          <figcaption className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-gr-muted">Regalos comprados por persona</figcaption>
          <ul className="flex flex-col gap-2.5">
            {/* key por posición: el ranking no lleva ids (el de un invitado es parte de su credencial) */}
            {ranking.map((r, i) => (
              <li key={i} title={`${nombre(r)}: ${r.cantidad} ${r.cantidad === 1 ? 'regalo' : 'regalos'}`}
                  className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-2.5">
                <span className={`truncate text-sm ${r.esYo ? 'font-extrabold' : 'font-semibold'}`}>{nombre(r)}</span>
                <span className="flex min-w-0 items-center gap-2">
                  {/* una sola serie: un solo color; el valor va escrito en la punta */}
                  <span className="h-5 flex-none rounded-r-[4px] bg-gr-acento"
                        style={{ width: `calc((100% - 2rem) * ${r.cantidad / max})` }} />
                  <span className="text-sm font-semibold tabular-nums">{r.cantidad}</span>
                </span>
              </li>
            ))}
          </ul>
        </figure>
      ) : (
        <p className="gr-card px-4 py-3 text-lg leading-snug font-semibold [overflow-wrap:anywhere]">
          {ranking[0].esYo ? 'Vos te ocupaste' : `${ranking[0].nombre} se ocupó`} {entradas.length === 1 ? 'del único regalo' : `de los ${entradas.length} regalos`} hasta ahora.
        </p>
      )}

      <ol className="flex flex-col gap-2">
        {entradas.slice(0, 6).map((e) => (
          <li key={e.id} className="flex items-start gap-3 rounded-2xl border border-gr-line bg-gr-surface px-3 py-2.5">
            <span className="mt-0.5 flex-none rounded-lg bg-gr-brand px-2 py-0.5 text-xs font-semibold text-gr-bg tabular-nums">{fecha(e.fecha)}</span>
            <span className="min-w-0 text-sm leading-snug [overflow-wrap:anywhere]">
              <span className="font-semibold">{e.titulo}</span>
              {' · '}{e.grupal ? `regalo grupal de ${e.encargado}${e.con.length ? ` con ${juntarNombres(e.con)}` : ''}` : `lo compró ${e.encargado}`}
              {e.nota && <span className="text-gr-muted"> — {e.nota}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
