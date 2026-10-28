import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { misRegalos } from '@/lib/mis-regalos'
import { FilaRegalo } from '@/components/FilaRegalo'
import { ArmarSorpresa } from '@/components/Sorpresas'
import { ArmarJuego, FilaJuego } from '@/components/AmigoInvisible'
import { misAmigosInvisibles, tambienTeToco } from '@/lib/amigo-invisible'
import { Icon } from '@/components/ui'

/**
 * Mis regalos: lo que reservé y los regalos grupales en los que estoy, de todas las listas, en un solo lugar. Arriba mis
 * amigos invisibles (cada uno con lo que me toca hacer), después lo que falta comprar, lo comprado para lo que viene, y
 * aparte el historial: lo de un cumple o una fecha que ya pasó. Cada regalo lleva a su deseo, donde se marca comprado o
 * se libera.
 */

/** Cuántos días después de su fecha sigue un amigo invisible acá (para "¿Quién te regaló?"). */
const JUEGOS_PASADOS = 15
export default async function MisRegalos() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [{ porComprar, comprados, historial }, juegos] = await Promise.all([
    misRegalos(db, session.userId), misAmigosInvisibles(db, session.userId, undefined, JUEGOS_PASADOS),
  ])
  const tambien = tambienTeToco(juegos)

  // lo de arriba (el encabezado, el título y las pestañas) está en el layout, compartido con Cuentas
  return (
    <div className="gr-fundido flex flex-col gap-5">

      {juegos.length > 0 && (
        <section aria-labelledby="invisibles" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="invisibles" className="gr-heading">Amigos invisibles<span className="text-gr-muted"> · {juegos.length}</span></h2>
            <Link href="/invisible/nuevo" className="flex min-h-11 items-center text-sm font-semibold">+ Armar uno</Link>
          </div>
          {juegos.map((j) => <FilaJuego key={j.id} j={j} tambien={tambien.get(j.id)} />)}
        </section>
      )}

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
              ? <ul className="flex flex-col gap-2.5">{porComprar.map((r) => <FilaRegalo key={`${r.tipo}-${r.id}`} r={r} />)}</ul>
              : <p className="gr-empty px-4 py-4 text-center text-sm">Nada pendiente por ahora.</p>}
          </section>
          {comprados.length > 0 && (
            <section aria-labelledby="comprados" className="flex flex-col gap-2.5">
              <div>
                <h2 id="comprados" className="gr-heading">Comprados</h2>
                <p className="text-[13px] text-gr-muted">Listos para lo que viene.</p>
              </div>
              <ul className="flex flex-col gap-2.5">{comprados.map((r) => <FilaRegalo key={`${r.tipo}-${r.id}`} r={r} />)}</ul>
            </section>
          )}
          {historial.length > 0 && (
            <section aria-labelledby="historial" className="mt-2 flex flex-col gap-2.5 border-t border-gr-line pt-5">
              <div>
                <h2 id="historial" className="gr-heading">Historial</h2>
                <p className="text-[13px] text-gr-muted">Lo que ya regalaste: de cumples y fechas que pasaron.</p>
              </div>
              <ul className="flex flex-col gap-2.5">{historial.map((r) => <FilaRegalo key={`${r.tipo}-${r.id}`} r={r} pasado />)}</ul>
            </section>
          )}
        </>
      )}

      <ArmarSorpresa />
      {!juegos.length && <ArmarJuego />}
    </div>
  )
}
