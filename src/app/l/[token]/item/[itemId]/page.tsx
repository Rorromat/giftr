import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { getItemForViewer } from '@/lib/lists'
import { getViewer, invitadoParaPreguntar } from '@/lib/viewer'
import { boughtAction, commentAction, releaseAction, unboughtAction } from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { CartelReserva, GuestGate } from '@/components/GuestGate'
import { BotonRobar } from '@/components/Novedades'
import { ConfirmarLista, ExDueno, NoSoyYo, OtraCuenta, PreguntaInvitado, QuienSos } from '@/components/Identidad'
import { ArmarRegaloGrupal, CartelCorreccion, RegaloGrupal } from '@/components/RegaloGrupal'
import { enDolares, parseDolares, parsePesos } from '@/lib/pesos'
import { esUuid } from '@/lib/groups'
import { itemParaCompartir, textoRegalador } from '@/lib/compartir'
import { nombreDeViewer } from '@/lib/guest'
import { identificado } from '@/lib/types'
import { hoyLocal, MESES, seguirLista } from '@/lib/events'
import { avisoDeCupo, type GiverItemView, type OwnerItemView } from '@/lib/serialize'
import { Icon, ItemPhoto, PriorityTag, PageHeader } from '@/components/ui'
import { LARGO } from '@/lib/limites'

/** El último día (en Argentina) de una reserva que dura hasta ese momento: "22 de agosto". Si termina a las 0 h, el anterior. */
function ultimoDia(hasta: Date) {
  const d = hoyLocal(new Date(hasta.getTime() - 1))
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}

/**
 * Cuántos pide de un deseo de varias unidades y, para quien ve la coordinación, cuántos quedan o cuántas reservas hay de
 * más (ver avisoDeCupo; al dueño no le llega nada).
 */
function cantidad(item: OwnerItemView, giver: GiverItemView | null) {
  if (item.repetible) return 'Se puede repetir: varios pueden regalar algo así.'
  if (!giver) return item.cantidad > 1 ? `Pide ${item.cantidad}.` : null
  const c = avisoDeCupo(giver, giver.claims.length)
  if (!c) return null
  return c.deMas ? `Pide ${item.cantidad} y hay ${c.reservas} reservas: arréglenlo en el hilo de abajo.` : `Pide ${item.cantidad} · quedan ${c.quedan}.`
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
  searchParams: Promise<{ reserva?: string; correccion?: string }>
}) {
  const [{ token, itemId }, { reserva, correccion }] = await Promise.all([params, searchParams])
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
    // como en la lista: abrir un deseo con sesión (el link de un regalo grupal, el que mandó el dueño) la sigue
    viewer.userId ? seguirLista(db, viewer.userId, detalle.listId, token) : null,
  ])
  // La reserva de un regalo grupal se maneja desde el regalo; acá solo las sueltas. Una por persona: con una comprada
  // tampoco se vuelve a ofrecer reservar (reserveItem devolvería esa). La compra se deshace solo si es de este evento.
  const mia = claims.find((c) => c.esMia && !c.grupal)
  const miClaim = mia?.estado === 'reservado' ? mia : undefined
  const miCompra = mia?.estado === 'comprado' && mia.deshacer ? mia : undefined
  const vencida = giver?.miVencida ?? null
  const enUnRegalo = regalos.some((r) => r.soyParte)
  // Una persona, una reserva por deseo (ver sumarseARegalo): en vez de "Me sumo", por qué no
  const ocupado = mia ? (mia.estado === 'comprado' ? 'Ya lo compraste vos: no hace falta que te sumes.'
    : 'Lo reservaste vos solo. Si preferís sumarte a este regalo, primero liberá tu reserva.')
    : enUnRegalo ? 'Ya estás en otro regalo grupal de este deseo.' : null
  const cuantos = cantidad(item, giver?.item ?? null)
  const logueado = !!viewer.userId
  const precio = item.precio ?? item.rangoPrecio

  return (
    <main className="flex flex-col gap-4 pb-12 pt-2">
      <PageHeader title="La lista" titulo="p" back={`/l/${token}`} backLabel="Volver a la lista" />

      {invitado && <PreguntaInvitado nombre={invitado} />}

      <article className="gr-card">
        <div className="relative">
          <ItemPhoto src={item.fotoUrl} titulo={item.titulo} height={260} dimmed={!disponible && !mia && !enUnRegalo} />
        </div>
        <div className="flex flex-col gap-3 p-3.5">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl leading-tight font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">{item.titulo}</h1>
            <div className="flex items-center gap-2">
              {precio && <p className="text-lg font-semibold">{precio}</p>}
              <PriorityTag prioridad={item.prioridad} className="h-6" />
            </div>
          </div>
          {cuantos && <p className="text-sm font-semibold">{cuantos}</p>}
          {item.notas && (
            <p className="rounded-2xl bg-gr-soft px-3 py-2.5 text-sm leading-snug [overflow-wrap:anywhere]">
              <span className="font-semibold">{ownerNombre} {plural ? 'dicen' : 'dice'}:</span> {item.notas}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {item.linkTienda && (
              <a href={item.linkTienda} target="_blank" className="gr-btn text-sm">
                Ver en la tienda <Icon name="external" size={16} strokeWidth={2} />
              </a>
            )}
            {/* "Me lo robo": con tu cuenta, sumarlo a tu lista (querés lo mismo) */}
            {logueado && <BotonRobar token={token} itemId={item.id} className="min-w-36" />}
            {/* Mandárselo a alguien: WhatsApp arma la vista previa con la foto (opengraph-image) */}
            <a target="_blank" className="gr-btn gap-2 text-sm"
               href={`https://wa.me/?text=${encodeURIComponent(textoRegalador({ titulo: item.titulo, precio, para: ownerNombre }, `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${token}/item/${item.id}`))}`}>
              <Icon name="chat" size={16} strokeWidth={2} />Mandarlo por WhatsApp
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
        {giver && <CartelCorreccion motivo={correccion} cerrar={aqui} />}

        {claims.filter((c) => !c.grupal).map((c) => (
          <p key={c.id} className="flex items-start gap-2 text-sm font-medium">
            <span className={`mt-px flex size-5 flex-none items-center justify-center rounded-full ${c.estado === 'comprado' ? 'bg-gr-accent' : 'bg-gr-brand text-gr-accent'} border border-gr-line`}>
              <Icon name={c.estado === 'comprado' ? 'check' : 'lock'} size={11} strokeWidth={3} />
            </span>
            <span className="min-w-0 [overflow-wrap:anywhere]">
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
            <BotonEnviar className="min-h-11 text-sm font-semibold underline underline-offset-4">Me equivoqué, todavía no lo compré</BotonEnviar>
          </form>
        )}

        {/* La reserva venció sin que la marcara: si lo compró, que lo pueda decir; si no, que la renueve. */}
        {vencida && (
          <div className="gr-card flex flex-col gap-3 p-3.5">
            <p className="text-sm font-medium leading-snug">
              <span className="font-semibold">Tu reserva venció el {ultimoDia(vencida.vencio)}.</span>{' '}
              {disponible ? '¿Ya lo compraste? Marcalo. Si no, reservalo de nuevo.' : 'Ahora lo tiene otra persona: si lo habías comprado, contalo en el hilo de abajo.'}
            </p>
            {disponible && (
              <>
                <form action={boughtAction} className="flex flex-col gap-2.5">
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="claimId" value={vencida.claimId} />
                  <input name="nota" maxLength={LARGO.notaCompra} placeholder="¿Qué compraste? (opcional)" className="gr-input shadow-none" />
                  <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">Ya lo compré</BotonEnviar>
                </form>
                <GuestGate token={token} itemId={item.id} identified={identified} volver={aqui} conCartel={!!reserva} texto="Reservar de nuevo" />
                {/* el de abajo no sale mientras se ve esto: que también pueda armar uno */}
                <ArmarRegaloGrupal token={token} itemId={item.id} logueado={logueado} />
              </>
            )}
          </div>
        )}

        {regalos.map((r) => (
          <RegaloGrupal key={r.id} regalo={r} token={token} itemId={item.id} titulo={item.titulo} ownerNombre={ownerNombre}
                        precio={enDolares(precio) ? parseDolares(precio) : parsePesos(precio)} monedaPrecio={enDolares(precio) ? 'USD' : 'ARS'}
                        logueado={logueado} ocupado={ocupado}
                        nota={claims.find((c) => c.grupal?.giftId === r.id)?.notaQueCompre} />
        ))}

        {/* como en la lista: un invitado que no dijo que no es suya, o donde entró alguien de la lista, no reserva acá */}
        {disponible && !mia && !vencida && !enUnRegalo && !(detalle.role === 'anonimo' && detalle.motivo !== 'sin_identidad') && (
          <>
            <GuestGate token={token} itemId={item.id} identified={identified} variant="primary" volver={aqui} conCartel={!!reserva} />
            {giver && <ArmarRegaloGrupal token={token} itemId={item.id} logueado={logueado} />}
          </>
        )}

        {miClaim && (
          <div className="gr-card flex flex-col gap-3 p-3.5">
            <form action={boughtAction} className="flex flex-col gap-2.5">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="claimId" value={miClaim.id} />
              <input name="nota" maxLength={LARGO.notaCompra} placeholder="¿Qué compraste? (opcional)" className="gr-input shadow-none" />
              <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">Ya lo compré</BotonEnviar>
            </form>
            <form action={releaseAction}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="claimId" value={miClaim.id} />
              <BotonEnviar className="min-h-11 text-sm font-semibold underline underline-offset-4">Liberar reserva</BotonEnviar>
            </form>
            {logueado && <ArmarRegaloGrupal token={token} itemId={item.id} logueado convertir />}
          </div>
        )}
      </section>

      {giver && (
        <section className="mt-2 flex flex-col gap-3">
          <h2 className="flex items-center gap-2 self-start rounded-full bg-gr-brand px-3.5 py-2 text-sm font-semibold text-gr-bg">
            <Icon name="lock" size={16} strokeWidth={2} className="text-gr-accent" />
            Esto no lo {plural ? 'ven' : 've'} {ownerNombre}
          </h2>
          <ul className="flex flex-col gap-2">
            {comments.map((c) => (
              <li key={c.id} className="rounded-2xl border border-gr-line bg-gr-surface px-3 py-2.5 text-sm [overflow-wrap:anywhere]">
                <span className="font-semibold">{c.autorNombre}:</span> {c.texto}
              </li>
            ))}
          </ul>
          <form action={commentAction} className="flex gap-2">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="itemId" value={item.id} />
            <input name="texto" required maxLength={LARGO.comentario} placeholder="Coordiná con los demás…" className="gr-input min-w-0 flex-1 shadow-none" />
            <BotonEnviar className="gr-btn bg-gr-brand text-gr-accent min-h-[50px] px-4 text-[15px]">Enviar</BotonEnviar>
          </form>
        </section>
      )}

      {/* con "¿Es tu lista?" arriba, el link ya va ahí */}
      {quien && !(detalle.role === 'anonimo' && detalle.motivo === 'confirmar') && <NoSoyYo nombre={quien} volver={aqui} conCuenta={logueado} />}

    </main>
  )
}
