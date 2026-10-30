import { fechaCorta, hoyLocal } from '@/lib/events'
import { juntarNombres } from '@/lib/groups'
import type { EntradaHistorial, Historial } from '@/lib/regalos'
import { Arte } from '@/components/ui'

/** Cuántos regalos se ven de entrada; los de antes, abriendo "Ver los anteriores". */
const A_LA_VISTA = 6

const fecha = (d: Date) => {
  const local = hoyLocal(d)
  return `${fechaCorta(local)} ${local.getUTCFullYear()}`
}
const anio = (d: Date) => hoyLocal(d).getUTCFullYear()

/** Quién lo compró, o de quién fue el grupal y con quiénes; quien mira es "vos" (y va primero entre los que se sumaron). */
function quien(e: EntradaHistorial) {
  if (!e.grupal) return e.esMia ? 'Lo compraste vos' : `Lo compró ${e.encargado}`
  const yoEn = e.miLugar ?? -1
  const con = yoEn < 0 ? e.con : ['vos', ...e.con.filter((_, i) => i !== yoEn)]
  return `Regalo grupal ${e.esMia ? 'tuyo' : `de ${e.encargado}`}${con.length ? ` con ${juntarNombres(con)}` : ''}`
}

/** Un regalo del historial: el deseo en su cuadrado de color, quién lo compró (o el grupal, con quiénes) y cuándo. */
function Regalo({ e }: { e: EntradaHistorial }) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <Arte id={e.itemId} src={e.foto} titulo={e.titulo} className="w-14 flex-none rounded-xl" />
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-gr-muted [overflow-wrap:anywhere]">
        <span className="block text-[15px] leading-tight font-bold tracking-[-0.01em] text-gr-ink">{e.titulo}</span>
        {quien(e)}{' · '}<span className="tabular-nums">{fecha(e.fecha)}</span>
        {e.nota && <span className="block">Compró: {e.nota}</span>}
      </span>
    </li>
  )
}

/** Los regalos en filas, con el año arriba de cada tanda (vienen del más nuevo al más viejo). */
function Regalos({ entradas }: { entradas: EntradaHistorial[] }) {
  const anios = [...new Set(entradas.map((e) => anio(e.fecha)))]
  return anios.map((a) => (
    <div key={a} className="flex flex-col gap-2">
      <h3 className="gr-label">{a}</h3>
      <ul className="gr-card divide-y divide-gr-line">
        {entradas.filter((e) => anio(e.fecha) === a).map((e) => <Regalo key={e.id} e={e} />)}
      </ul>
    </div>
  ))
}

/**
 * Al final de la lista, para quien regala: lo que ya le regalaron, del más nuevo al más viejo y separado por año (para no
 * repetir el año que viene), y quién se ocupó de cuántos. Sin regalos todavía, cuenta que van a aparecer acá.
 */
export function QuienSeOcupo({ historial, para }: { historial: Historial; para: string }) {
  const { entradas, ranking } = historial
  const nombre = (r: { nombre: string; esYo: boolean }) => (r.esYo ? 'Vos' : r.nombre)
  const max = ranking[0]?.cantidad ?? 1

  return (
    <section aria-labelledby="ya-le-regalaron" className="mt-6 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="ya-le-regalaron" className="gr-heading">Lo que ya le regalaron</h2>
        <p className="text-sm text-gr-muted">Para no repetir: lo que le compraron a {para} de esta lista, y quién.</p>
      </div>

      {!entradas.length ? (
        <p className="gr-empty text-sm">
          Todavía no hay regalos anotados. Cuando alguien marque «Ya lo compré» en un deseo, aparece acá con la fecha.
        </p>
      ) : (
        <>
          <Regalos entradas={entradas.slice(0, A_LA_VISTA)} />
          {entradas.length > A_LA_VISTA && (
            <details className="group flex flex-col gap-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center self-start text-sm font-bold underline underline-offset-4 group-open:hidden [&::-webkit-details-marker]:hidden">
                Ver los {entradas.length - A_LA_VISTA} anteriores
              </summary>
              <div className="flex flex-col gap-3"><Regalos entradas={entradas.slice(A_LA_VISTA)} /></div>
            </details>
          )}

          {ranking.length > 1 ? (
            <figure className="gr-card p-3.5">
              <figcaption className="mb-2.5 gr-label">Quién se ocupó</figcaption>
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
            <p className="text-sm text-gr-muted">
              {ranking[0].esYo ? 'Vos te ocupaste' : `${ranking[0].nombre} se ocupó`} {entradas.length === 1 ? 'del único regalo' : `de los ${entradas.length} regalos`} hasta ahora.
            </p>
          )}
        </>
      )}
    </section>
  )
}
