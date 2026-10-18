import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { getItemForViewer } from '@/lib/lists'
import { getViewer } from '@/lib/viewer'
import { boughtAction, commentAction, releaseAction } from '@/app/actions'
import { GuestGate } from '@/components/GuestGate'
import { BackLink, Icon, ItemPhoto, PriceSticker, PriorityTag } from '@/components/ui'

export default async function DetalleItem({ params }: { params: Promise<{ token: string; itemId: string }> }) {
  const { token, itemId } = await params
  const viewer = await getViewer()
  const detalle = await getItemForViewer(db, token, itemId, viewer)
  if (!detalle) notFound()
  if (detalle.role === 'owner') redirect('/mi-lista')

  const { item, comments, ownerNombre } = detalle
  const identified = !!viewer.userId || !!viewer.guestId
  const miClaim = item.claims.find((c) => c.esMia && c.estado === 'reservado')
  const precio = item.precio ?? item.rangoPrecio

  return (
    <main className="flex flex-col gap-4 pb-12 pt-[52px]">
      <BackLink href={`/l/${token}`} label="Volver a la lista" />

      <article className="gr-sticker rounded-3xl shadow-[6px_6px_0_var(--gr-ink)]">
        <div className="relative">
          <ItemPhoto src={item.fotoUrl} titulo={item.titulo} height={260} dimmed={!item.disponible && !miClaim} />
          <PriorityTag prioridad={item.prioridad} className="absolute left-3 top-3 h-[30px]" />
          {precio && <PriceSticker rotate={-5} className="right-3 rounded-xl px-2.5 py-1 text-lg">{precio}</PriceSticker>}
        </div>
        <div className="flex flex-col gap-3 p-3.5">
          <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.03em] [overflow-wrap:anywhere]">{item.titulo}</h1>
          {item.notas && (
            <p className="rounded-2xl border-[2.5px] border-dashed border-gr-ink px-3 py-2.5 text-sm leading-snug">
              <span className="font-bold">{ownerNombre} dice:</span> {item.notas}
            </p>
          )}
          {item.linkTienda && (
            <a href={item.linkTienda} target="_blank" className="gr-btn self-start font-sans text-sm font-bold">
              Ver en la tienda <Icon name="external" size={16} strokeWidth={2.4} />
            </a>
          )}
        </div>
      </article>

      <section className="flex flex-col gap-2.5">
        {item.claims.map((c) => (
          <p key={c.id} className="flex items-start gap-2 text-sm font-medium">
            <span className={`mt-px flex size-5 flex-none items-center justify-center rounded-full ${c.estado === 'comprado' ? 'bg-gr-accent' : 'bg-gr-ink text-gr-accent'} border-2 border-gr-ink`}>
              <Icon name={c.estado === 'comprado' ? 'check' : 'lock'} size={11} strokeWidth={3} />
            </span>
            <span>
              {c.esMia
                ? (c.estado === 'comprado' ? 'Vos lo compraste' : 'Vos lo reservaste')
                : `${c.claimerNombre} lo ${c.estado === 'comprado' ? 'compró' : 'reservó'}`}
              {c.notaQueCompre && <span className="text-gr-muted"> — compró: {c.notaQueCompre}</span>}
            </span>
          </p>
        ))}

        {item.disponible && !miClaim && <GuestGate token={token} itemId={item.id} identified={identified} variant="primary" />}

        {miClaim && (
          <div className="gr-sticker flex flex-col gap-3 p-3.5">
            <form action={boughtAction} className="flex flex-col gap-2.5">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="claimId" value={miClaim.id} />
              <input name="nota" placeholder="¿Qué compraste? (opcional)" className="gr-input shadow-none" />
              <button className="gr-btn-primary gr-btn--sm w-full">Ya lo compré</button>
            </form>
            <form action={releaseAction}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="claimId" value={miClaim.id} />
              <button className="min-h-11 text-sm font-bold underline decoration-2 underline-offset-4">Liberar reserva</button>
            </form>
          </div>
        )}
      </section>

      <section className="mt-2 flex flex-col gap-3">
        <h2 className="flex items-center gap-2 self-start rounded-full bg-gr-ink px-3.5 py-2 text-sm font-bold text-gr-bg">
          <Icon name="lock" size={16} strokeWidth={2.4} className="text-gr-accent" />
          Esto no lo ve {ownerNombre}
        </h2>
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface px-3 py-2.5 text-sm">
              <span className="font-bold">{c.autorNombre}:</span> {c.texto}
            </li>
          ))}
        </ul>
        {identified ? (
          <form action={commentAction} className="flex gap-2">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="itemId" value={item.id} />
            <input name="texto" required placeholder="Coordiná con los demás…" className="gr-input flex-1 shadow-none" />
            <button className="gr-btn bg-gr-ink text-gr-accent min-h-[50px] px-4 text-[15px]">Enviar</button>
          </form>
        ) : (
          <p className="text-sm text-gr-muted">Reservá algo para participar de la coordinación.</p>
        )}
      </section>

    </main>
  )
}
