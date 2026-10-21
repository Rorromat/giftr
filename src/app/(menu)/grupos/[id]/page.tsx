import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { ANIO_MAXIMO, ANIO_MINIMO, grupoParaDueno, juntarNombres } from '@/lib/groups'
import { leaveGroupAction, newInviteAction, newShareLinkAction, removeMemberAction, setGroupDateAction } from '@/app/actions'
import { fechaParaEditar, hoyLocal, rotuloFechaGrupo } from '@/lib/events'
import { Banners } from '@/components/Banners'
import { Confirmar } from '@/components/Confirmar'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import { Archivados, OwnerItemsGrid } from '@/components/OwnerItemsGrid'
import { AvatarStack, BackLink, Icon, Seccion, Starburst } from '@/components/ui'
import { BotonEnviar } from '@/components/BotonEnviar'

// Después de cambiar un link o sacar a alguien (?nuevo=…), arriba se confirma qué pasó.
const AVISOS: Record<string, string> = {
  invitacion: 'Listo: el link de invitación es nuevo. El de antes ya no sirve para sumarse.',
  regalar: 'Listo: el link para regalar es nuevo. El de antes ya no anda: volvé a mandarlo por WhatsApp.',
  sacado: 'Listo: ya no es parte del grupo. El link de invitación cambió para que no vuelva a sumarse: si falta alguien, mandale el nuevo.',
}

export default async function Grupo({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fecha?: string; nuevo?: string }>
}) {
  const [{ id }, { fecha: errorFecha, nuevo }] = await Promise.all([params, searchParams])
  const session = await auth()
  if (!session?.userId) redirect('/')
  const grupo = await grupoParaDueno(db, id, session.userId)
  if (!grupo) notFound()

  const activos = grupo.items.filter((i) => i.estadoDueno === 'activo')
  const fechaInvalida = errorFecha === 'invalida'
  const aviso = nuevo && Object.hasOwn(AVISOS, nuevo) ? AVISOS[nuevo] : null
  const otros = grupo.duenos.filter((d) => d.id !== session.userId).map((d) => d.nombre)
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? ''
  const shareUrl = `${base}/l/${grupo.shareToken}`
  const inviteUrl = `${base}/grupos/unirme/${grupo.inviteToken}`
  const waRegalar = encodeURIComponent(`Armamos la lista "${grupo.nombre}" en GiftR 🎁 ${shareUrl}`)
  const waInvitar = encodeURIComponent(`Armemos juntos la lista "${grupo.nombre}" en GiftR: ${inviteUrl}`)

  return (
    <Seccion className="flex flex-col gap-3.5 pb-48 pt-[52px]">
      <div className="flex items-center justify-between">
        <BackLink href="/mi-lista" label="Volver a Mi lista" />
        <Link href={`/agregar?lista=${grupo.id}`} className="gr-btn-primary gr-btn--sm min-h-11 rotate-2 rounded-[14px]">+ Agregar</Link>
      </div>

      <div className="relative flex flex-col gap-1 pr-20">
        <h1 className="gr-title [overflow-wrap:anywhere]">{grupo.nombre}</h1>
        {grupo.descripcion && <p className="text-[15px] font-medium">{grupo.descripcion}</p>}
        {/* Fecha del grupo: aparece en Eventos de los dueños y de quienes siguen la lista */}
        {/* key: al cambiar la fecha se vuelve a montar cerrado (si no, queda abierto tras guardar) */}
        <details key={`${grupo.eventoFecha}-${grupo.eventoAnual}-${fechaInvalida}`} open={fechaInvalida} className="group self-start">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-bold underline decoration-2 underline-offset-4 [&::-webkit-details-marker]:hidden">
            {rotuloFechaGrupo(grupo.eventoFecha, grupo.eventoAnual, hoyLocal())}
          </summary>
          <form action={setGroupDateAction} className="mt-1 flex flex-col gap-2 rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface p-3">
            <input type="hidden" name="grupoId" value={grupo.id} />
            {fechaInvalida && <p role="alert" className="text-sm font-semibold">Esa fecha no existe en el calendario: elegí otra.</p>}
            <input name="fecha" type="date" required min={`${ANIO_MINIMO}-01-01`} max={`${ANIO_MAXIMO}-12-31`}
                   defaultValue={fechaParaEditar(grupo.eventoFecha, grupo.eventoAnual, hoyLocal())} aria-label="Fecha del grupo" className="gr-input" />
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
              <input type="checkbox" name="anual" defaultChecked={grupo.eventoAnual} className="size-[22px] accent-gr-ink" /> Se repite todos los años
            </label>
            <div className="flex gap-2">
              <BotonEnviar className="gr-btn-primary gr-btn--sm flex-1 rounded-[14px]">Guardar</BotonEnviar>
              {grupo.eventoFecha && (
                <BotonEnviar name="quitar" value="1" formNoValidate className="gr-btn gr-btn--sm flex-none rounded-[14px] font-sans text-sm font-bold">Quitar</BotonEnviar>
              )}
            </div>
          </form>
        </details>
        {activos.length > 0 && (
          <Starburst label={`${activos.length} ${activos.length === 1 ? 'deseo' : 'deseos'}`}
                     fontSize={activos.length > 99 ? 30 : 40} className="absolute -top-1 right-[10px] rotate-12">
            {activos.length}
          </Starburst>
        )}
      </div>

      <Banners />

      {aviso && (
        <p role="status" className="rounded-2xl border-[2.5px] border-gr-ink bg-gr-accent px-3.5 py-3 text-sm font-semibold shadow-sticker-sm">{aviso}</p>
      )}

      {/* Dueños e invitación. Este link da permiso para editar: es solo para quien arma la lista. */}
      <section className="gr-sticker flex flex-col gap-3 p-3.5">
        <div className="flex items-center gap-3">
          <AvatarStack nombres={grupo.duenos.map((d) => d.nombre)} fotos={grupo.duenos.map((d) => d.foto)} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg leading-tight font-extrabold">
              {otros.length ? `Con ${juntarNombres(otros)}` : 'Solo vos por ahora'}
            </p>
            <p className="text-[13px] font-medium leading-snug">Invitá a quien arma la lista con vos: va a poder agregar y editar.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-gr-ink py-2 pl-3.5 pr-2 text-gr-bg">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-gr-accent">{inviteUrl.replace(/^https?:\/\//, '')}</p>
          <CopyLinkButton url={inviteUrl} />
        </div>
        <a href={`https://wa.me/?text=${waInvitar}`} target="_blank"
           className="gr-btn min-h-11 justify-center gap-2 font-sans text-sm font-bold">
          <Icon name="users" size={18} strokeWidth={2.4} />
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
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-bold underline decoration-2 underline-offset-4 [&::-webkit-details-marker]:hidden">
              ¿Alguien se sumó por error?
            </summary>
            <p className="text-[13px] font-medium leading-snug">Podés sacar a quien se sumó después que vos.</p>
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

      {activos.length === 0 && (
        <div className="relative mt-4 rounded-sticker border-[2.5px] border-dashed border-gr-ink px-5 py-8 text-center text-[15px] font-medium">
          <Starburst size={52} fontSize={50} className="absolute -right-2 -top-6 rotate-12">+</Starburst>
          Todavía no hay nada en “{grupo.nombre}”.<br />Agreguen lo primero que necesiten.
        </div>
      )}

      <OwnerItemsGrid items={activos} shareToken={grupo.shareToken} />
      <Archivados items={grupo.items.filter((i) => i.estadoDueno !== 'activo')} grupo />

      <div className="mt-4 flex flex-col gap-1">
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

      <a href={`https://wa.me/?text=${waRegalar}`} target="_blank"
         className="gr-btn gr-btn--dark fixed bottom-[104px] left-1/2 z-10 h-[54px] -translate-x-1/2 -rotate-2 whitespace-nowrap rounded-[18px] border-[3px] px-[22px]">
        <Icon name="chat" size={20} strokeWidth={2.4} />
        Mandala por WhatsApp
      </a>
    </Seccion>
  )
}
