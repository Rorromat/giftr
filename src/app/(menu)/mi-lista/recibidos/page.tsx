import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { marcarRecibidosAction } from '@/app/actions'
import { getOwnList } from '@/lib/lists'
import { postEvento } from '@/lib/post-evento'
import { BotonEnviar } from '@/components/BotonEnviar'
import { AgradecerPorWhatsApp } from '@/components/PostEvento'
import { Icon, ItemPhoto, PageHeader, Seccion } from '@/components/ui'

/**
 * "¿Qué te regalaron?": después de su cumple, el dueño tilda de sus deseos los que recibió y los manda todos de una vez
 * (ver marcarRecibidos). La regla de la sorpresa vale también acá: van todos sus deseos activos, en el orden de su lista
 * y sin ninguno tildado. Nada sale de las reservas: ni cuáles se sugieren, ni el orden, ni cuántos "te reservaron".
 * Con ?listo=N, lo de después de mandarlo: cuántos marcó, agradecer y repasar lo que quedó para el año que viene.
 */
export default async function QueTeRegalaron({ searchParams }: { searchParams: Promise<{ listo?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [{ listo }, lista, despues] = await Promise.all([searchParams, getOwnList(db, session.userId), postEvento(db, session.userId)])
  // sin un cumple que ya pasó no hay qué marcar
  if (!lista || !despues) redirect('/mi-lista')
  // un aporte en plata no se tilda como recibido (ver post-evento.ts): sigue en la lista
  const activos = lista.items.filter((i) => i.estadoDueno === 'activo' && i.tipo !== 'aporte')

  if (listo !== undefined) {
    const marcados = Math.min(500, Math.max(0, Math.trunc(Number(listo)) || 0))
    return (
      <Seccion className="flex flex-col gap-5 pb-36 pt-2">
        <PageHeader title="¿Qué te regalaron?" back="/mi-lista" backLabel="Volver a Mi lista" titulo="p" />
        <section className="gr-hero flex flex-col gap-2 p-5">
          <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-gr-on-hero/15"><Icon name="check" size={24} strokeWidth={2.6} /></span>
          <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.01em]">¡Tu lista quedó al día!</h1>
          <p className="text-[15px] leading-snug text-gr-on-hero/75">
            {marcados === 0
              ? 'No marcaste nada: tu lista sigue como estaba.'
              : `Marcaste ${marcados} ${marcados === 1 ? 'regalo' : 'regalos'}: ${marcados === 1 ? 'quedó' : 'quedaron'} en Recibidos, abajo en tu lista.`}
          </p>
        </section>
        {marcados > 0 && (
          <section className="gr-card flex flex-col gap-2.5 p-4">
            <h2 className="text-[17px] leading-snug font-bold tracking-[-0.01em]">Agradecé</h2>
            <p className="text-sm leading-snug text-gr-muted">Te dejamos el mensaje escrito. Vos elegís a quién mandárselo.</p>
            <AgradecerPorWhatsApp className="self-start" />
          </section>
        )}
        {activos.length > 0 && (
          <section className="gr-card flex flex-col gap-2.5 p-4">
            <h2 className="text-[17px] leading-snug font-bold tracking-[-0.01em]">¿Seguís queriendo esto?</h2>
            <p className="text-sm leading-snug text-gr-muted">
              {activos.length === 1 ? 'Te quedó 1 deseo en la lista.' : `Te quedaron ${activos.length} deseos en la lista.`}{' '}
              Repasalos: sacá lo que ya no querés y sumá lo nuevo, así el año que viene tu gente acierta.
            </p>
            <Link href="/mi-lista#mis-deseos" className="gr-btn gr-btn--sm self-start">Repasar mi lista</Link>
          </section>
        )}
        <Link href="/mi-lista" className="gr-btn-primary">Volver a Mi lista</Link>
      </Seccion>
    )
  }

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <PageHeader title="¿Qué te regalaron?" back="/mi-lista" backLabel="Volver a Mi lista" />
      <div className="flex flex-col gap-1">
        <p className="text-[15px] leading-snug font-medium">Tildá lo que te regalaron de tu lista. Pasa a Recibidos y tu lista queda al día.</p>
        {/* por la regla de la sorpresa acá no hay nada tildado ni sugerido, y sin decirlo se lee como "nadie te regaló nada" */}
        <p className="text-[13px] leading-snug text-gr-muted">Solo vos sabés qué recibiste: acá no te mostramos qué reservó tu gente.</p>
      </div>
      {activos.length === 0 ? (
        <div className="gr-empty flex flex-col items-center gap-3 py-8 text-center">
          <p>No te queda nada en la lista para marcar.</p>
          <Link href="/mi-lista" className="gr-btn gr-btn--sm">Volver a Mi lista</Link>
        </div>
      ) : (
        <form action={marcarRecibidosAction} className="flex flex-col gap-5">
          <ul className="flex flex-col gap-2.5">
            {activos.map((i) => (
              <li key={i.id}>
                <label className="gr-card flex min-h-16 cursor-pointer items-center gap-3 p-2.5 pr-4 has-[:checked]:border-gr-ink">
                  <div className="size-12 flex-none overflow-hidden rounded-xl"><ItemPhoto src={i.fotoUrl} titulo={i.titulo} height={48} className="w-12" /></div>
                  <span className="min-w-0 flex-1 text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">{i.titulo}</span>
                  <input type="checkbox" name="itemId" value={i.id} className="size-[22px] flex-none accent-gr-ink" />
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <BotonEnviar pendiente="Guardando…" className="gr-btn-primary w-full">Listo</BotonEnviar>
            <p className="text-center text-[13px] leading-snug text-gr-muted">Si no te regalaron nada de la lista, tocá Listo sin tildar nada.</p>
          </div>
        </form>
      )}
    </Seccion>
  )
}
