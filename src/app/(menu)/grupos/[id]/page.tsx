import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { grupoParaDueno, juntarNombres, relacionDeLista } from '@/lib/groups'
import {
  invitarAlGrupoAction, leaveGroupAction, newInviteAction, newShareLinkAction, removeMemberAction, setGroupDateAction, setParentescoAction,
} from '@/app/actions'
import { fechaParaEditar, hoyLocal, rotuloFechaGrupo } from '@/lib/events'
import { amigosParaInvitar } from '@/lib/invitar-a-grupo'
import { ElegirAmigos } from '@/components/Dividir'
import { FotoDeLista } from '@/components/FotoDeLista'
import { CampoParentesco, CamposFecha } from '@/components/ListaEnComun'
import { Banners } from '@/components/Banners'
import { Confirmar } from '@/components/Confirmar'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import { Archivados, OwnerItemsGrid } from '@/components/OwnerItemsGrid'
import { DeseoEliminado, RecienAgregado } from '@/components/RecienAgregado'
import { Buscador } from '@/components/Buscador'
import { BUSCAR_DESDE } from '@/lib/buscar'
import { AvatarStack, BackLink, Icon, Seccion, SectionHeader } from '@/components/ui'
import { colorDe } from '@/lib/tapas'
import { ListaHero } from '@/components/ListaHero'
import { BotonEnviar } from '@/components/BotonEnviar'

// Después de cambiar un link o sacar a alguien (?nuevo=…), arriba se confirma qué pasó.
const AVISOS: Record<string, string> = {
  invitacion: 'Listo: el link de invitación es nuevo. El de antes ya no sirve para sumarse.',
  regalar: 'Listo: el link para regalar es nuevo. El de antes ya no anda: volvé a mandarlo por WhatsApp.',
  sacado: 'Listo: ya no es parte del grupo. El link de invitación cambió para que no vuelva a sumarse: si falta alguien, mandale el nuevo.',
  invitados: 'Listo: les avisamos. Cuando se sumen, van a aparecer acá.',
}

export default async function Grupo({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fecha?: string; nuevo?: string; agregado?: string; eliminado?: string }>
}) {
  const [{ id }, { fecha: errorFecha, nuevo, agregado, eliminado }] = await Promise.all([params, searchParams])
  const session = await auth()
  if (!session?.userId) redirect('/')
  const grupo = await grupoParaDueno(db, id, session.userId)
  if (!grupo) notFound()
  const paraInvitar = await amigosParaInvitar(db, grupo.id, session.userId)

  const activos = grupo.items.filter((i) => i.estadoDueno === 'activo')
  const nuevoDeseo = agregado ? activos.find((i) => i.id === agregado) : undefined
  const fechaInvalida = errorFecha === 'invalida'
  const aviso = nuevo && Object.hasOwn(AVISOS, nuevo) ? AVISOS[nuevo] : null
  const otros = grupo.duenos.filter((d) => d.id !== session.userId).map((d) => d.nombre)
  const relacion = relacionDeLista(grupo.duenos)
  const hoy = hoyLocal()
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? ''
  const shareUrl = `${base}/l/${grupo.shareToken}`
  const inviteUrl = `${base}/grupos/unirme/${grupo.inviteToken}`
  const waRegalar = encodeURIComponent(`Armamos la lista "${grupo.nombre}" en GiftR 🎁 ${shareUrl}`)
  const waInvitar = encodeURIComponent(`Armemos juntos la lista "${grupo.nombre}" en GiftR: ${inviteUrl}`)

  return (
    <Seccion className="flex flex-col gap-5 pb-36">
      {/* la tapa de la lista: un color de la paleta por su id, el mismo con que la ven los que regalan */}
      <ListaHero color={colorDe(grupo.id)} etiqueta={grupo.descripcion ?? 'Lista en común'} titulo={grupo.nombre} cantidad={activos.length}
                 arriba={(
                   <header className="flex min-h-14 items-center justify-between gap-2">
                     <BackLink href="/mi-lista" label="Volver a Mi lista" />
                     <p className="text-[15px] font-bold">Lista en común</p>
                     <Link href={`/agregar?lista=${grupo.id}`} aria-label="Agregar deseo al grupo" className="gr-icon-btn">
                       <Icon name="plus" size={20} strokeWidth={2.4} />
                     </Link>
                   </header>
                 )}
                 waHref={`https://wa.me/?text=${waRegalar}`} fecha={null}
                 foto={<FotoDeLista key={grupo.fotoUrl ?? ''} foto={grupo.fotoUrl} grupoId={grupo.id} size={56} />}>
        {/* Fecha del grupo (o su cumple): aparece en Eventos de los dueños y de quienes siguen la lista */}
        {/* key: al cambiar la fecha se vuelve a montar cerrado (si no, queda abierto tras guardar) */}
        <details key={`${grupo.eventoFecha}-${grupo.eventoAnual}-${grupo.esCumple}-${fechaInvalida}`} open={fechaInvalida} className="group flex flex-col">
          <summary className="flex min-h-10 border border-gr-line bg-gr-surface cursor-pointer list-none items-center gap-2 self-start rounded-full py-1.5 pl-2.5 pr-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <Icon name={grupo.esCumple ? 'cake' : 'calendar'} size={16} className="flex-none" />
            {rotuloFechaGrupo(grupo.eventoFecha, grupo.eventoAnual, hoy, grupo.esCumple)}
          </summary>
          <form action={setGroupDateAction} className="mt-2 flex flex-col gap-3 rounded-2xl bg-gr-surface p-3 text-gr-ink">
            <input type="hidden" name="grupoId" value={grupo.id} />
            {fechaInvalida && <p role="alert" className="text-sm font-semibold">Esa fecha no existe en el calendario: elegí otra.</p>}
            <CamposFecha esCumple={grupo.esCumple} eventoFecha={grupo.eventoFecha} anual={grupo.eventoAnual} opcional={false}
                         fechaEnCalendario={grupo.esCumple ? '' : fechaParaEditar(grupo.eventoFecha, grupo.eventoAnual, hoy)} />
            <div className="flex gap-2">
              <BotonEnviar className="gr-btn-primary gr-btn--sm flex-1">Guardar</BotonEnviar>
              {grupo.eventoFecha && (
                <BotonEnviar name="quitar" value="1" formNoValidate className="gr-btn gr-btn--sm flex-none">Quitar</BotonEnviar>
              )}
            </div>
          </form>
        </details>
      </ListaHero>

      <Banners />

      {aviso && (
        <p role="status" className="rounded-2xl bg-gr-soft px-3.5 py-3 text-sm font-medium">{aviso}</p>
      )}

      {/* Dueños e invitación. Este link da permiso para editar: es solo para quien arma la lista. */}
      <section className="gr-card flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <AvatarStack nombres={grupo.duenos.map((d) => d.nombre)} fotos={grupo.duenos.map((d) => d.foto)} />
          <div className="min-w-0 flex-1">
            <p className="text-base leading-tight font-semibold">
              {otros.length ? `Con ${juntarNombres(otros)}` : 'Solo vos por ahora'}
            </p>
            <p className="text-[13px] leading-snug text-gr-muted">{relacion ?? 'Invitá a quien arma la lista con vos: va a poder agregar y editar.'}</p>
          </div>
        </div>
        {/* qué es la lista para cada uno: cada dueño el suyo (la abuela de uno es la madre del otro) */}
        <details key={grupo.miParentesco ?? ''} className="group flex flex-col">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl bg-gr-comun px-3.5 text-sm [&::-webkit-details-marker]:hidden">
            <span className="font-medium">Para vos {grupo.nombre} es: <b className="font-semibold text-gr-comun-ink">{grupo.miParentesco ?? 'sin decir'}</b></span>
            <span className="text-[13px] font-semibold underline underline-offset-4">Cambiar</span>
          </summary>
          <form action={setParentescoAction} className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="grupoId" value={grupo.id} />
            <CampoParentesco actual={grupo.miParentesco} etiqueta="¿Qué es para vos?" />
            <p className="text-xs leading-snug text-gr-muted">Lo ven tus amigos en su gente, y los que regalan en la lista: “hijo de Rodri y Euge”.</p>
            <BotonEnviar className="gr-btn-primary gr-btn--sm">Guardar</BotonEnviar>
          </form>
        </details>
        {/* sumar a amigos de GiftR: les llega el aviso y se suman con un toque (ver invitarAGrupo) */}
        {paraInvitar.length > 0 && (
          <details className="group flex flex-col">
            <summary className="gr-btn-primary gr-btn--sm cursor-pointer list-none gap-2 [&::-webkit-details-marker]:hidden">
              <Icon name="users" size={18} />Sumar amigos de GiftR
            </summary>
            <form action={invitarAlGrupoAction} className="mt-2 flex flex-col gap-2.5">
              <input type="hidden" name="grupoId" value={grupo.id} />
              <ElegirAmigos amigos={paraInvitar} ambito="amigos-grupo" />
              <p className="text-xs leading-snug text-gr-muted">A cada uno le llega un aviso con el nombre de la lista y se suma con un toque.</p>
              <BotonEnviar pendiente="Avisando…" className="gr-btn gr-btn--sm w-full">Avisarles</BotonEnviar>
            </form>
          </details>
        )}
        <div className="flex items-center gap-2 rounded-full bg-gr-soft py-1.5 pl-4 pr-1.5">
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{inviteUrl.replace(/^https?:\/\//, '')}</p>
          <CopyLinkButton url={inviteUrl} />
        </div>
        <a href={`https://wa.me/?text=${waInvitar}`} target="_blank"
           className="gr-btn gr-btn--sm justify-center gap-2">
          <Icon name="users" size={18} />
          Invitar por WhatsApp
        </a>
        <p className="text-xs text-gr-muted">Para los que regalan usá “Mandala por WhatsApp”: ese link no deja editar.</p>
        {/* por si la invitación llegó a quien no tenía que llegar */}
        <Confirmar resumen="Generar un link de invitación nuevo" boton="Sí, generar uno nuevo" action={newInviteAction}
                   ocultos={{ grupoId: grupo.id }}>
          El link de ahora deja de servir: quien lo tenga y todavía no se sumó ya no va a poder. Los que ya están siguen.
        </Confirmar>
        {/* el que entró por error deja de editar: lo saca uno que ya estaba, y sigue sin ver lo reservado (como uno que sale) */}
        {grupo.sacables.length > 0 && (
          <details className="group flex flex-col">
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold [&::-webkit-details-marker]:hidden">
              ¿Alguien se sumó por error?
            </summary>
            <p className="text-[13px] leading-snug text-gr-muted">Podés sacar a quien se sumó después que vos.</p>
            {grupo.sacables.map((m) => (
              <Confirmar key={m.id} resumen={`Sacar a ${m.nombre}`} boton={`Sí, sacar a ${m.nombre}`}
                         action={removeMemberAction} ocultos={{ grupoId: grupo.id, userId: m.id }}>
                {m.nombre} deja de agregar y editar esta lista, y el link de invitación cambia para que no vuelva a sumarse con el
                de antes. Igual que alguien que sale del grupo, sigue sin ver qué reservaron y sin poder reservar en ella: pudo
                haber cargado deseos.
              </Confirmar>
            ))}
          </details>
        )}
      </section>

      {activos.length === 0 ? (
        <div className="gr-empty flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-gr-surface shadow-card"><Icon name="gift" size={26} /></span>
          <p>Todavía no hay nada en “{grupo.nombre}”.<br />Agreguen lo primero que necesiten.</p>
          <Link href={`/agregar?lista=${grupo.id}`} className="gr-btn-primary gr-btn--sm">Agregar un deseo</Link>
        </div>
      ) : (
        <SectionHeader title="Sus deseos" href={`/agregar?lista=${grupo.id}`} linkLabel="+ Agregar" />
      )}

      {activos.length >= BUSCAR_DESDE && <Buscador ambito="sus-deseos" placeholder="Buscar en la lista" vacio="No hay ningún deseo con «%s»." />}
      <div id="sus-deseos" className="flex flex-col gap-5">
        <OwnerItemsGrid items={activos} shareToken={grupo.shareToken} agregado={agregado} />
      </div>
      <Archivados items={grupo.items.filter((i) => i.estadoDueno !== 'activo')} grupo />
      {nuevoDeseo && (
        <RecienAgregado deseo={{ id: nuevoDeseo.id, titulo: nuevoDeseo.titulo, foto: nuevoDeseo.fotoUrl, prioridad: nuevoDeseo.prioridad, grupo: true }} />
      )}
      {eliminado === '1' && <DeseoEliminado />}

      <div className="flex flex-col gap-1">
        <Confirmar resumen="Cambiar el link para regalar" boton="Sí, cambiar el link" action={newShareLinkAction}
                   ocultos={{ grupoId: grupo.id }} className="items-center">
          El link de ahora deja de andar: los que lo tienen no van a poder abrir la lista hasta que les mandes el nuevo, y
          la lista sale de su gente y de sus eventos. Lo que ya reservaron no se pierde.
        </Confirmar>
        {grupo.duenos.length > 1 && (
          <Confirmar resumen="Salir del grupo" boton="Salir del grupo" action={leaveGroupAction} ocultos={{ grupoId: grupo.id }}
                     className="items-center">
            Vas a dejar de agregar y editar esta lista. Como la armaste vos también, aunque salgas no vas a ver qué
            reservaron los demás ni vas a poder reservar en ella.
          </Confirmar>
        )}
      </div>

    </Seccion>
  )
}
