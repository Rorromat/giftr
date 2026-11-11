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
import { linkParaVolver, nombreDeViewer } from '@/lib/guest'
import { identificado } from '@/lib/types'
import { seguirLista } from '@/lib/events'
import { avisoDeCupo, esAporte, type GiverItemView } from '@/lib/serialize'
import { sitioDeLaTienda } from '@/lib/links'
import { AvatarStack, AvatarSticker, Icon, PageHeader } from '@/components/ui'
import { miAporte, ProgresoAporte, QuienesAportaron } from '@/components/Aporte'
import { Aportar } from '@/components/Aportar'
import { pesos } from '@/lib/pesos'
import { BarraDeLaFicha, BotonTienda, FichasDeseo, FotoDeLaFicha, NombreDeLaFicha, NotaDeseo } from '@/components/FichaDeseo'
import { Sello, type TipoSello } from '@/components/Sello'
import { VideoDeseo } from '@/components/VideoDeseo'
import { ComoLoRegalas } from '@/components/ComoLoRegalas'
import { ReservaConfirmada, ultimoDia } from '@/components/ReservaConfirmada'
import { SoloConCuenta } from '@/components/SoloConCuenta'
import { FormDividir, InvitadosDelRegalo } from '@/components/Dividir'
import { amigosParaDividir, invitadosDeRegalo } from '@/lib/invitaciones'
import { LARGO } from '@/lib/limites'
import { esSorpresa } from '@/lib/sorpresas'
import { antiguedadDelPrecio } from '@/lib/presupuesto'

/**
 * Para quien ve la coordinación de un deseo de varias unidades, en su ficha de cuántos pide: cuántos quedan o cuántas
 * reservas hay de más (ver avisoDeCupo; al dueño no le llega nada).
 */
function cupo(giver: GiverItemView | null) {
  const c = giver && avisoDeCupo(giver, giver.claims.length)
  if (!c) return null
  return c.deMas ? { texto: `Hay ${c.reservas} reservas: arréglenlo en el hilo de abajo.`, alerta: true } : { texto: `Quedan ${c.quedan}`, alerta: false }
}

// La vista previa al compartir (WhatsApp): qué es, para quién y cuánto sale. La imagen sale de opengraph-image.
export async function generateMetadata({ params }: { params: Promise<{ token: string; itemId: string }> }): Promise<Metadata> {
  const { token, itemId } = await params
  const i = esUuid(itemId) ? await itemParaCompartir(db, token, itemId) : null
  if (!i) return {}
  const titulo = `${i.titulo} · para ${i.grupoNombre ?? i.para.split(' ')[0]}`
  // de un aporte en plata, que se aporta (no se reserva); nunca cuánto se juntó: la vista previa también le llega al dueño
  const descripcion = i.aporte ? 'Aportá lo que quieras en GiftR: no se entera por acá de quién aportó.'
    : [i.precio, i.prioridad === 'mucho' && 'Lo quiere mucho', 'Reservalo en GiftR sin que se entere.'].filter(Boolean).join(' · ')
  return { title: titulo, description: descripcion, openGraph: { title: titulo, description: descripcion, url: `/l/${token}/item/${itemId}` } }
}

export default async function DetalleItem({ params, searchParams }: {
  params: Promise<{ token: string; itemId: string }>
  searchParams: Promise<{ reserva?: string; correccion?: string; regalo?: string }>
}) {
  const [{ token, itemId }, { reserva, correccion, regalo: deRegalo }] = await Promise.all([params, searchParams])
  const viewer = await getViewer()
  const detalle = await getItemForViewer(db, token, itemId, viewer)
  if (!detalle) {
    // el deseo de una sorpresa (un aviso, la vuelta de una acción del regalo): a la suya, con lo que traía
    if (await esSorpresa(db, token)) redirect(`/sorpresa/${token}${deRegalo === 'sumado' ? '?regalo=sumado#regalo' : ''}`)
    notFound()
  }
  if (detalle.role === 'owner') redirect(detalle.tipo === 'grupo' ? `/grupos/${detalle.listId}` : '/mi-lista')

  const { item, ownerNombre } = detalle
  const plural = detalle.duenos.length > 1
  // identified: tiene nombre (sesión o invitado). Sin ver la coordinación (puede ser el dueño sin su sesión, ver
  // accesoALista) no se ve nada: ni reservas, ni regalos, ni comentarios.
  const identified = identificado(viewer)
  const giver = detalle.role === 'giver' ? detalle : null
  // ve qué está ocupado pero no por quién (sin cuenta, en una lista que lo muestra solo con cuenta): sin nombres, sin el
  // hilo y sin los regalos grupales, que no vienen en el detalle (ver getItemForViewer)
  const sinNombres = !!giver?.sinNombres
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
  // el sello sobre la foto, si te toca a vos: lo reservaste, lo compraste o se compró el regalo grupal en el que estás
  const sello: TipoSello | null = mia ? (mia.estado === 'comprado' ? 'listo' : 'tuyo')
    : regalos.some((r) => r.soyParte && r.estado === 'comprado') ? 'todos' : null
  // Una persona, una reserva por deseo (ver sumarseARegalo): en vez de "Me sumo", por qué no
  const ocupado = mia ? (mia.estado === 'comprado' ? 'Ya lo compraste vos: no hace falta que te sumes.'
    : 'Lo reservaste vos solo. Si preferís sumarte a este regalo, primero liberá tu reserva.')
    : enUnRegalo ? 'Ya estás en otro regalo grupal de este deseo.' : null
  const tienda = item.linkTienda && sitioDeLaTienda(item.linkTienda)
  // El regalo grupal: sus amigos (nunca los del cumple), para proponérselo al armarlo o después, desde el regalo que organiza
  // (también ya comprado: el que se suma después entra y se vuelve a dividir), con a quiénes se lo propuso y qué contestaron
  const amigos = viewer.userId && giver ? await amigosParaDividir(db, viewer.userId, item.id) : []
  const mio = regalos.find((r) => r.soyEncargado)
  const organizo = mio?.estado === 'abierto' ? mio : undefined
  const invitados = mio ? await invitadosDeRegalo(db, mio.id) : []
  const yaEstan = new Set([...(mio?.miembros.map((m) => m.userId) ?? []), ...invitados.map((i) => i.persona.id)])
  const logueado = !!viewer.userId
  const precio = item.precio ?? item.rangoPrecio
  // un precio cargado hace más de dos meses ya no es el de hoy: quien regala lo tiene que saber antes de ir a comprarlo
  const precioDe = precio ? antiguedadDelPrecio(item.precioAt) : null
  // como en la lista: un invitado que no dijo que no es suya, o donde entró alguien de la lista, no reserva acá
  const reservable = disponible && !mia && !vencida && !enUnRegalo && !(detalle.role === 'anonimo' && detalle.motivo !== 'sin_identidad')
  const verEnTienda = item.linkTienda && <BotonTienda link={item.linkTienda} tienda={tienda} />
  const urlDelDeseo = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${token}/item/${item.id}`
  const nombreDeLaLista = detalle.grupoNombre ?? `Lista de ${ownerNombre.split(' ')[0]}`
  const nota = item.notas && (
    <NotaDeseo notas={item.notas} quien={`${ownerNombre} ${plural ? 'dicen' : 'dice'}`}
               avatar={plural
                 ? <AvatarStack nombres={detalle.duenos} fotos={detalle.perfiles.map((d) => d.foto)} size={24} />
                 : <AvatarSticker nombre={ownerNombre} foto={detalle.perfiles[0]?.foto} size={24} className="text-[10px]" />} />
  )
  // quién es el que mira, si todavía no ve la coordinación (puede ser de la lista, ver accesoALista)
  const identidad = detalle.role === 'anonimo' && (detalle.motivo === 'ex_dueno' ? <ExDueno />
    : detalle.motivo === 'otra_cuenta' ? <OtraCuenta volver={aqui} />
      : detalle.motivo === 'confirmar' && quien ? <ConfirmarLista token={token} nombre={quien} volver={aqui} />
        : <QuienSos token={token} volver={aqui} />)
  // el hilo para coordinar, que no ven los dueños: solo para quien ve la coordinación con nombres
  const hilo = giver && !sinNombres && (
    <section className="mt-2 flex flex-col gap-3">
      <h2 className="flex items-center gap-2 self-start rounded-full bg-gr-brand px-3.5 py-2 text-sm font-semibold text-gr-bg">
        <Icon name="lock" size={16} strokeWidth={2} className="text-gr-acento-sobre-tinta" />
        Esto no lo {plural ? 'ven' : 've'} {ownerNombre}
      </h2>
      <ul className="flex flex-col gap-2">
        {comments.map((c) => (
          <li key={c.id} className="rounded-gr-md border border-gr-line bg-gr-surface px-3 py-2.5 text-sm [overflow-wrap:anywhere]">
            <span className="font-semibold">{c.autorNombre}:</span> {c.texto}
          </li>
        ))}
      </ul>
      <form action={commentAction} className="flex gap-2">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="itemId" value={item.id} />
        <input name="texto" required maxLength={LARGO.comentario} placeholder="Coordiná con los demás…" className="gr-input min-w-0 flex-1 shadow-none" />
        <BotonEnviar className="gr-btn gr-btn--dark min-h-[50px] px-4 text-[15px]">Enviar</BotonEnviar>
      </form>
    </section>
  )
  // un invitado (con "¿Es tu lista?" arriba, el link ya va ahí). Con cuenta, no: la sesión se cierra desde Perfil
  const noSoyYo = quien && !logueado && !(detalle.role === 'anonimo' && detalle.motivo === 'confirmar') && <NoSoyYo nombre={quien} volver={aqui} />

  // Un aporte en plata ("Luna de miel", "Cochecito") no es un objeto: no tiene foto, precio, tienda, "Reservar" ni regalo
  // grupal. Su página es a qué alias transferir y "Ya aporté", con quiénes ya aportaron (los nombres, como en el resto de
  // la lista; cuánto puso cada uno, nunca) y el mismo hilo para coordinar. Nunca queda ocupado: aportan todos los que quieran.
  if (esAporte(item) && item.aporteAlias) {
    const claimsDelAporte = giver?.item.claims ?? []
    return (
      <main className="flex flex-col gap-5 pb-16 pt-2">
        <PageHeader title="Aporte en plata" titulo="p" back={`/l/${token}`} backLabel="Volver a la lista"
                    action={(
                      <a target="_blank" aria-label="Mandarlo por WhatsApp" className="gr-icon-btn"
                         href={`https://wa.me/?text=${encodeURIComponent(textoRegalador({ titulo: item.titulo, precio: null, para: ownerNombre, aporte: true }, urlDelDeseo))}`}>
                        <Icon name="compartir" size={20} strokeWidth={2.2} />
                      </a>
                    )} />
        <article className="flex flex-col gap-5">
          <div className="gr-card flex flex-col items-start gap-2.5 p-5">
            <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-gr-soft text-gr-acento-texto">
              <Icon name="wallet" size={24} strokeWidth={2.2} />
            </span>
            <h1 className="gr-title text-[30px] [overflow-wrap:anywhere]">{item.titulo}</h1>
            <p className="text-[15px] text-gr-muted [overflow-wrap:anywhere]">{nombreDeLaLista}</p>
            {item.aporteMeta && <p className="text-[17px] font-bold tabular-nums">Meta: {pesos(item.aporteMeta)}</p>}
            <p className="text-sm leading-snug text-gr-muted">No se reserva: cada uno pone lo que quiere, y pueden aportar todos.</p>
          </div>
          {invitado && <PreguntaInvitado nombre={invitado} />}
          {nota}
        </article>

        <section className="flex flex-col gap-3">
          {identidad}
          {sinNombres && <SoloConCuenta volver={aqui} />}
          <ProgresoAporte meta={item.aporteMeta} juntado={giver?.item.juntado ?? null} />
          <QuienesAportaron claims={claimsDelAporte} />
          <Aportar token={token} itemId={item.id} alias={item.aporteAlias} mio={miAporte(claimsDelAporte)} abierto
                   anotar={!!giver || (detalle.role === 'anonimo' && detalle.motivo === 'sin_identidad')} identified={!!giver}
                   para={ownerNombre} plural={plural} volver={aqui} />
        </section>

        {hilo}
        {noSoyYo}
      </main>
    )
  }

  return (
    <main className="gr-ficha flex flex-col gap-5 pb-36">
      <article className="flex flex-col gap-5">
        {/* volver a la lista; arriba a la derecha, "Me lo robo" (con tu cuenta, sumarlo a tu lista) y mandárselo a alguien
            (WhatsApp arma la vista previa con la foto, ver opengraph-image). El sello, si te toca a vos. */}
        <FotoDeLaFicha foto={item.fotoUrl} titulo={item.titulo} apagado={!disponible && !mia && !enUnRegalo}
                       volver={`/l/${token}`} volverLabel="Volver a la lista"
                       acciones={
                         <>
                           {logueado && <BotonRobar token={token} itemId={item.id} variante="vidrio" />}
                           <a target="_blank" aria-label="Mandarlo por WhatsApp" className="gr-icon-btn gr-vidrio-oscuro"
                              href={`https://wa.me/?text=${encodeURIComponent(textoRegalador({ titulo: item.titulo, precio, para: ownerNombre }, urlDelDeseo))}`}>
                             <Icon name="compartir" size={20} strokeWidth={2.2} />
                           </a>
                         </>
                       }>
          {sello && <Sello tipo={sello} clave={item.id} size={96} className="absolute bottom-14 right-3 z-[2]" />}
        </FotoDeLaFicha>
        {/* qué es, de quién (para el que llega directo al deseo, un link por WhatsApp) y cuánto sale */}
        <NombreDeLaFicha titulo={item.titulo} categoria={item.categoria} precio={precio} lista={nombreDeLaLista} />
        {precioDe && <p className="-mt-3 text-[13px] leading-snug text-gr-muted">Precio de {precioDe}: puede haber cambiado.</p>}
        {invitado && <PreguntaInvitado nombre={invitado} />}
        {/* lo que hace falta para acertar: cuánto lo quiere, si sirve algo parecido, cuántos pide; y lo que dice */}
        <FichasDeseo deseo={item} voz={plural ? 'varios' : 'uno'} cupo={cupo(giver?.item ?? null)} />
        {nota}
        {item.videoUrl && <VideoDeseo url={item.videoUrl} titulo={item.titulo} />}
      </article>

      <section className="flex flex-col gap-2.5">
        {identidad}
        <CartelReserva motivo={reserva} veTodo={!!giver} conNombre={identified} />
        {giver && <CartelCorreccion motivo={correccion} cerrar={aqui} />}
        {sinNombres && <SoloConCuenta volver={aqui} />}

        {/* el regalo grupal tiene su tarjeta más abajo; sin nombres no viene, y acá va cuántos son */}
        {claims.filter((c) => sinNombres || !c.grupal).map((c) => (
          <p key={c.id} className="flex items-start gap-2 text-sm font-medium">
            <span className={`mt-px flex size-5 flex-none items-center justify-center rounded-full ${c.estado === 'comprado' ? 'bg-gr-brand text-gr-on-brand' : 'bg-gr-acento text-gr-on-acento'}`}>
              <Icon name={c.estado === 'comprado' ? 'check' : 'lock'} size={11} strokeWidth={3} />
            </span>
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {c.grupal ? `Regalo grupal de ${c.grupal.cuantos}${c.estado === 'comprado' ? ': ya lo compraron' : ''}`
                : c.esMia ? (c.estado === 'comprado' ? 'Vos lo compraste' : 'Vos lo reservaste')
                  : c.claimerNombre ? `${c.claimerNombre} lo ${c.estado === 'comprado' ? 'compró' : 'reservó'}`
                    : c.estado === 'comprado' ? 'Ya lo compraron' : 'Reservado'}
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
                <GuestGate token={token} itemId={item.id} identified={identified} volver={aqui} conCartel={!!reserva} texto="Reservar de nuevo"
                           para={ownerNombre} plural={plural} />
                {/* el de abajo no sale mientras se ve esto: que también pueda armar uno (con su cuenta: sin ella no puede) */}
                {logueado && <ArmarRegaloGrupal token={token} itemId={item.id} logueado />}
              </>
            )}
          </div>
        )}

        {deRegalo === 'sumado' && enUnRegalo && (
          <p role="status" className="flex items-start gap-2.5 rounded-gr-md border border-gr-line bg-gr-surface px-4 py-3 text-sm font-medium">
            <Icon name="check" size={18} strokeWidth={2.6} className="mt-px flex-none" />
            {regalos.some((r) => r.soyParte && r.estado === 'comprado')
              ? '¡Listo, te sumaste! Ya estaba comprado: abajo ves cuánto te toca.'
              : '¡Listo, te sumaste! Se divide en partes iguales entre los que estén.'}
          </p>
        )}

        {regalos.length > 0 && (
          <div id="regalo" className="flex scroll-mt-6 flex-col gap-2.5">
            {regalos.map((r) => (
              <RegaloGrupal key={r.id} regalo={r} token={token} itemId={item.id} titulo={item.titulo} ownerNombre={ownerNombre}
                            precio={enDolares(precio) ? parseDolares(precio) : parsePesos(precio)} monedaPrecio={enDolares(precio) ? 'USD' : 'ARS'}
                            logueado={logueado} ocupado={ocupado}
                            nota={claims.find((c) => c.grupal?.giftId === r.id)?.notaQueCompre}
                            invitar={r.id === mio?.id && (
                              <InvitadosDelRegalo token={token} itemId={item.id} giftId={r.id} invitados={invitados}
                                                  paraInvitar={amigos.filter((a) => !yaEstan.has(a.id))} />
                            )}
                            sinContestar={r.id === organizo?.id ? invitados.filter((i) => i.estado === 'esperando').map((i) => i.persona.nombre) : []} />
            ))}
          </div>
        )}

        {/* "Reservar" (para él), en la barra de abajo con la tienda: de un toque. "Armar regalo grupal", acá en el deseo, como
            acción secundaria y solo con su cuenta (ver ComoLoRegalas). Si no puede reservar, en la barra queda la tienda sola. */}
        {reservable ? (
          <ComoLoRegalas secundaria={verEnTienda}
                         reservar={<GuestGate token={token} itemId={item.id} identified={identified} variant="primary" volver={aqui} conCartel={!!reserva}
                                              para={ownerNombre} plural={plural} />}
                         grupal={giver && logueado && <FormDividir token={token} itemId={item.id} amigos={amigos} />} />
        ) : <BarraDeLaFicha secundaria={verEnTienda} />}

        {miClaim && (
          <div className="gr-card flex flex-col gap-3 p-3.5">
            {/* qué sigue: hasta cuándo es suyo (antes iba al lado de "Vos lo reservaste") y que lo marque; sin cuenta, que con
                Google le avisamos antes de que venza */}
            <ReservaConfirmada vence={miClaim.vence} entrar={logueado ? undefined : aqui}
                               recuperar={linkParaVolver(viewer, detalle.listId, token)} />
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

      {hilo}
      {noSoyYo}

    </main>
  )
}
