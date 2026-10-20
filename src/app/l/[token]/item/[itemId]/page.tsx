import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { getItemForViewer } from '@/lib/lists'
import { getViewer } from '@/lib/viewer'
import { boughtAction, commentAction, releaseAction } from '@/app/actions'
import { GuestGate } from '@/components/GuestGate'
import { ArmarRegaloGrupal, RegaloGrupal } from '@/components/RegaloGrupal'
import { parsePesos } from '@/lib/pesos'
import { esUuid } from '@/lib/groups'
import { itemParaCompartir, textoRegalador } from '@/lib/compartir'
import { BackLink, Icon, ItemPhoto, PriceSticker, PriorityTag } from '@/components/ui'

// La vista previa al compartir (WhatsApp): qué es, para quién y cuánto sale. La imagen sale de opengraph-image.
export async function generateMetadata({ params }: { params: Promise<{ token: string; itemId: string }> }): Promise<Metadata> {
  const { token, itemId } = await params
  const i = esUuid(itemId) ? await itemParaCompartir(db, token, itemId) : null
  if (!i) return {}
  const titulo = `${i.titulo} · para ${i.grupoNombre ?? i.para.split(' ')[0]}`
  const descripcion = [i.precio, i.prioridad === 'mucho' && 'Lo quiere mucho', 'Reservalo en GiftR sin que se entere.'].filter(Boolean).join(' · ')
  return { title: titulo, description: descripcion, openGraph: { title: titulo, description: descripcion, url: `/l/${token}/item/${itemId}` } }
}

export default async function DetalleItem({ params, searchParams }: {
  params: Promise<{ token: string; itemId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const [{ token, itemId }, { error }] = await Promise.all([params, searchParams])
  const viewer = await getViewer()
  const detalle = await getItemForViewer(db, token, itemId, viewer)
  if (!detalle) notFound()
  if (detalle.role === 'owner') redirect(detalle.tipo === 'grupo' ? `/grupos/${detalle.listId}` : '/mi-lista')

  const { item, comments, ownerNombre, regalos } = detalle
  const plural = detalle.duenos.length > 1
  const identified = !!viewer.userId || !!viewer.guestId
  // La reserva de un regalo grupal se maneja desde el regalo; acá solo las sueltas.
  const miClaim = item.claims.find((c) => c.esMia && c.estado === 'reservado' && !c.grupal)
  const enUnRegalo = regalos.some((r) => r.soyParte)
  const logueado = !!viewer.userId
  const precio = item.precio ?? item.rangoPrecio

  return (
    <main className="flex flex-col gap-4 pb-12 pt-[52px]">
      <BackLink href={`/l/${token}`} label="Volver a la lista" />

      <article className="gr-sticker rounded-3xl shadow-[6px_6px_0_var(--gr-ink)]">
        <div className="relative">
          <ItemPhoto src={item.fotoUrl} titulo={item.titulo} height={260} dimmed={!item.disponible && !miClaim && !enUnRegalo} />
          <PriorityTag prioridad={item.prioridad} className="absolute left-3 top-3 h-[30px]" />
          {precio && <PriceSticker rotate={-5} className="right-3 rounded-xl px-2.5 py-1 text-lg">{precio}</PriceSticker>}
        </div>
        <div className="flex flex-col gap-3 p-3.5">
          <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.03em] [overflow-wrap:anywhere]">{item.titulo}</h1>
          {item.notas && (
            <p className="rounded-2xl border-[2.5px] border-dashed border-gr-ink px-3 py-2.5 text-sm leading-snug">
              <span className="font-bold">{ownerNombre} {plural ? 'dicen' : 'dice'}:</span> {item.notas}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {item.linkTienda && (
              <a href={item.linkTienda} target="_blank" className="gr-btn font-sans text-sm font-bold">
                Ver en la tienda <Icon name="external" size={16} strokeWidth={2.4} />
              </a>
            )}
            {/* Mandárselo a alguien: WhatsApp arma la vista previa con la foto (opengraph-image) */}
            <a target="_blank" className="gr-btn gap-2 font-sans text-sm font-bold"
               href={`https://wa.me/?text=${encodeURIComponent(textoRegalador({ titulo: item.titulo, precio, para: ownerNombre }, `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${token}/item/${item.id}`))}`}>
              <Icon name="chat" size={16} strokeWidth={2.4} />Mandarlo por WhatsApp
            </a>
          </div>
        </div>
      </article>

      <section className="flex flex-col gap-2.5">
        {item.claims.filter((c) => !c.grupal).map((c) => (
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

        {regalos.map((r) => (
          <RegaloGrupal key={r.id} regalo={r} token={token} itemId={item.id} titulo={item.titulo} ownerNombre={ownerNombre}
                        precio={parsePesos(precio)} logueado={logueado}
                        nota={item.claims.find((c) => c.grupal?.giftId === r.id)?.notaQueCompre} error={r.soyEncargado ? error : undefined} />
        ))}

        {item.disponible && !miClaim && !enUnRegalo && (
          <>
            <GuestGate token={token} itemId={item.id} identified={identified} variant="primary" />
            <ArmarRegaloGrupal token={token} itemId={item.id} logueado={logueado} />
          </>
        )}

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
            {logueado && <ArmarRegaloGrupal token={token} itemId={item.id} logueado convertir />}
          </div>
        )}
      </section>

      <section className="mt-2 flex flex-col gap-3">
        <h2 className="flex items-center gap-2 self-start rounded-full bg-gr-ink px-3.5 py-2 text-sm font-bold text-gr-bg">
          <Icon name="lock" size={16} strokeWidth={2.4} className="text-gr-accent" />
          Esto no lo {plural ? 'ven' : 've'} {ownerNombre}
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
