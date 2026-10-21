import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { getItemForViewer } from '@/lib/lists'
import { getViewer, invitadoParaPreguntar } from '@/lib/viewer'
import { boughtAction, commentAction, releaseAction, unboughtAction } from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { CartelReserva, GuestGate } from '@/components/GuestGate'
import { ConfirmarLista, ExDueno, NoSoyYo, OtraCuenta, PreguntaInvitado, QuienSos } from '@/components/Identidad'
import { ArmarRegaloGrupal, RegaloGrupal } from '@/components/RegaloGrupal'
import { parsePesos } from '@/lib/pesos'
import { esUuid } from '@/lib/groups'
import { itemParaCompartir, textoRegalador } from '@/lib/compartir'
import { nombreDeViewer } from '@/lib/guest'
import { identificado } from '@/lib/types'
import { hoyLocal, MESES } from '@/lib/events'
import type { GiverItemView, OwnerItemView } from '@/lib/serialize'
import { BackLink, Icon, ItemPhoto, PriceSticker, PriorityTag } from '@/components/ui'

/** El último día (en Argentina) de una reserva que dura hasta ese momento: "22 de agosto". Si termina a las 0 h, el anterior. */
function ultimoDia(hasta: Date) {
  const d = hoyLocal(new Date(hasta.getTime() - 1))
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}

/**
 * Cuántos pide de un deseo de varias unidades y, para quien ve la coordinación, cuántos quedan. Si el dueño bajó la
 * cantidad por debajo de lo reservado, lo dice para que se acomoden entre ellos (al dueño no le llega nada).
 */
function cantidad(item: OwnerItemView, giver: GiverItemView | null) {
  if (item.repetible) return 'Se puede repetir: varios pueden regalar algo así.'
  if (!giver) return item.cantidad > 1 ? `Pide ${item.cantidad}.` : null
  if (giver.claims.length > item.cantidad) return `Pide ${item.cantidad} y hay ${giver.claims.length} reservas: arréglenlo en el hilo de abajo.`
  return item.cantidad > 1 ? `Pide ${item.cantidad} · quedan ${giver.quedan}.` : null
}

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
  searchParams: Promise<{ error?: string; reserva?: string }>
}) {
  const [{ token, itemId }, { error, reserva }] = await Promise.all([params, searchParams])
  const viewer = await getViewer()
  const detalle = await getItemForViewer(db, token, itemId, viewer)
  if (!detalle) notFound()
  if (detalle.role === 'owner') redirect(detalle.tipo === 'grupo' ? `/grupos/${detalle.listId}` : '/mi-lista')

  const { item, ownerNombre } = detalle
  const plural = detalle.duenos.length > 1
  // identified: tiene nombre (sesión o invitado). Sin ver la coordinación (puede ser el dueño sin su sesión, ver
  // accesoALista) no se ve nada: ni reservas, ni regalos, ni comentarios.
  const identified = identificado(viewer)
  const giver = detalle.role === 'giver' ? detalle : null
  const aqui = `/l/${token}/item/${item.id}`
  const claims = giver?.item.claims ?? []
  const regalos = giver?.regalos ?? []
  const comments = giver?.comments ?? []
  const disponible = giver?.item.disponible ?? true
  const [quien, invitado] = await Promise.all([
    identified ? nombreDeViewer(db, viewer) : null,
    // volviendo de entrar con Google ("Me sumo"): si en este navegador había un invitado, se le pregunta si es él
    viewer.userId ? invitadoParaPreguntar(viewer.userId) : null,
  ])
  // La reserva de un regalo grupal se maneja desde el regalo; acá solo las sueltas. Una por persona: con una comprada
  // tampoco se vuelve a ofrecer reservar (reserveItem devolvería esa).
  const mia = claims.find((c) => c.esMia && !c.grupal)
  const miClaim = mia?.estado === 'reservado' ? mia : undefined
  const miCompra = mia?.estado === 'comprado' ? mia : undefined
  const vencida = giver?.miVencida ?? null
  const enUnRegalo = regalos.some((r) => r.soyParte)
  const cuantos = cantidad(item, giver?.item ?? null)
  const logueado = !!viewer.userId
  const precio = item.precio ?? item.rangoPrecio

  return (
    <main className="flex flex-col gap-4 pb-12 pt-[52px]">
      <BackLink href={`/l/${token}`} label="Volver a la lista" />

      {invitado && <PreguntaInvitado nombre={invitado} />}

      <article className="gr-sticker rounded-3xl shadow-[6px_6px_0_var(--gr-ink)]">
        <div className="relative">
          <ItemPhoto src={item.fotoUrl} titulo={item.titulo} height={260} dimmed={!disponible && !mia && !enUnRegalo} />
          <PriorityTag prioridad={item.prioridad} className="absolute left-3 top-3 h-[30px]" />
          {precio && <PriceSticker rotate={-5} className="right-3 rounded-xl px-2.5 py-1 text-lg">{precio}</PriceSticker>}
        </div>
        <div className="flex flex-col gap-3 p-3.5">
          <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.03em] [overflow-wrap:anywhere]">{item.titulo}</h1>
          {cuantos && <p className="text-sm font-semibold">{cuantos}</p>}
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
        {detalle.role === 'anonimo' && (detalle.motivo === 'ex_dueno' ? <ExDueno />
          : detalle.motivo === 'otra_cuenta' ? <OtraCuenta volver={aqui} />
            : detalle.motivo === 'confirmar' && quien ? <ConfirmarLista token={token} nombre={quien} volver={aqui} />
              : <QuienSos token={token} volver={aqui} />)}
        <CartelReserva motivo={reserva} veTodo={!!giver} conNombre={identified} />

        {claims.filter((c) => !c.grupal).map((c) => (
          <p key={c.id} className="flex items-start gap-2 text-sm font-medium">
            <span className={`mt-px flex size-5 flex-none items-center justify-center rounded-full ${c.estado === 'comprado' ? 'bg-gr-accent' : 'bg-gr-ink text-gr-accent'} border-2 border-gr-ink`}>
              <Icon name={c.estado === 'comprado' ? 'check' : 'lock'} size={11} strokeWidth={3} />
            </span>
            <span>
              {c.esMia
                ? (c.estado === 'comprado' ? 'Vos lo compraste' : 'Vos lo reservaste')
                : `${c.claimerNombre} lo ${c.estado === 'comprado' ? 'compró' : 'reservó'}`}
              {c.vence && <span className="text-gr-muted"> · hasta el {ultimoDia(c.vence)}</span>}
              {c.notaQueCompre && <span className="text-gr-muted"> — compró: {c.notaQueCompre}</span>}
            </span>
          </p>
        ))}

        {/* un toque equivocado en "Ya lo compré" no lo deja comprado para siempre */}
        {miCompra && (
          <form action={unboughtAction}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="claimId" value={miCompra.id} />
            <BotonEnviar className="min-h-11 text-sm font-bold underline decoration-2 underline-offset-4">Me equivoqué, todavía no lo compré</BotonEnviar>
          </form>
        )}

        {/* La reserva venció sin que la marcara: si lo compró, que lo pueda decir; si no, que la renueve. */}
        {vencida && (
          <div className="gr-sticker flex flex-col gap-3 p-3.5">
            <p className="text-sm font-medium leading-snug">
              <span className="font-bold">Tu reserva venció el {ultimoDia(vencida.vencio)}.</span>{' '}
              {disponible ? '¿Ya lo compraste? Marcalo. Si no, reservalo de nuevo.' : 'Ahora lo tiene otra persona: si lo habías comprado, contalo en el hilo de abajo.'}
            </p>
            {disponible && (
              <>
                <form action={boughtAction} className="flex flex-col gap-2.5">
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="claimId" value={vencida.claimId} />
                  <input name="nota" placeholder="¿Qué compraste? (opcional)" className="gr-input shadow-none" />
                  <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">Ya lo compré</BotonEnviar>
                </form>
                <GuestGate token={token} itemId={item.id} identified={identified} volver={aqui} conCartel={!!reserva} texto="Reservar de nuevo" />
              </>
            )}
          </div>
        )}

        {regalos.map((r) => (
          <RegaloGrupal key={r.id} regalo={r} token={token} itemId={item.id} titulo={item.titulo} ownerNombre={ownerNombre}
                        precio={parsePesos(precio)} logueado={logueado}
                        nota={claims.find((c) => c.grupal?.giftId === r.id)?.notaQueCompre} error={r.soyEncargado ? error : undefined} />
        ))}

        {/* como en la lista: un invitado que no dijo que no es suya, o donde entró alguien de la lista, no reserva acá */}
        {disponible && !mia && !vencida && !enUnRegalo && !(detalle.role === 'anonimo' && detalle.motivo !== 'sin_identidad') && (
          <>
            <GuestGate token={token} itemId={item.id} identified={identified} variant="primary" volver={aqui} conCartel={!!reserva} />
            {giver && <ArmarRegaloGrupal token={token} itemId={item.id} logueado={logueado} />}
          </>
        )}

        {miClaim && (
          <div className="gr-sticker flex flex-col gap-3 p-3.5">
            <form action={boughtAction} className="flex flex-col gap-2.5">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="claimId" value={miClaim.id} />
              <input name="nota" placeholder="¿Qué compraste? (opcional)" className="gr-input shadow-none" />
              <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">Ya lo compré</BotonEnviar>
            </form>
            <form action={releaseAction}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="claimId" value={miClaim.id} />
              <BotonEnviar className="min-h-11 text-sm font-bold underline decoration-2 underline-offset-4">Liberar reserva</BotonEnviar>
            </form>
            {logueado && <ArmarRegaloGrupal token={token} itemId={item.id} logueado convertir />}
          </div>
        )}
      </section>

      {giver && (
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
          <form action={commentAction} className="flex gap-2">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="itemId" value={item.id} />
            <input name="texto" required placeholder="Coordiná con los demás…" className="gr-input flex-1 shadow-none" />
            <BotonEnviar className="gr-btn bg-gr-ink text-gr-accent min-h-[50px] px-4 text-[15px]">Enviar</BotonEnviar>
          </form>
        </section>
      )}

      {quien && <NoSoyYo nombre={quien} volver={aqui} conCuenta={logueado} />}

    </main>
  )
}
