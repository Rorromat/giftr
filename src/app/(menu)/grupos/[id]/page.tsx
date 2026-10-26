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
import { DeseoEliminado, RecienAgregado } from '@/components/RecienAgregado'
import { Buscador } from '@/components/Buscador'
import { BUSCAR_DESDE } from '@/lib/buscar'
import { AvatarStack, Icon, PageHeader, Seccion, SectionHeader } from '@/components/ui'
import { ListaHero } from '@/components/ListaHero'
import { BotonEnviar } from '@/components/BotonEnviar'

// Después de cambiar un link o sacar a alguien (?nuevo=…), arriba se confirma qué pasó.
const AVISOS: Record<string, string> = {
  invitacion: 'Listo: el link de invitación es nuevo. El de antes ya no sirve para sumarse.',
  regalar: 'Listo: el link para regalar es nuevo. El de antes ya no anda: volvé a mandarlo por WhatsApp.',
  sacado: 'Listo: ya no es parte del grupo. El link de invitación cambió para que no vuelva a sumarse: si falta alguien, mandale el nuevo.',
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
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <PageHeader title="Lista en común" titulo="p" back="/mi-lista" backLabel="Volver a Mi lista"
                  action={<Link href={`/agregar?lista=${grupo.id}`} aria-label="Agregar deseo al grupo" className="gr-icon-btn bg-gr-accent"><Icon name="plus" size={20} strokeWidth={2.4} /></Link>} />

      <ListaHero etiqueta={grupo.descripcion ?? 'Lista en común'} titulo={grupo.nombre} cantidad={activos.length}
                 waHref={`https://wa.me/?text=${waRegalar}`} fecha={null}>
        {/* Fecha del grupo: aparece en Eventos de los dueños y de quienes siguen la lista */}
        {/* key: al cambiar la fecha se vuelve a montar cerrado (si no, queda abierto tras guardar) */}
        <details key={`${grupo.eventoFecha}-${grupo.eventoAnual}-${fechaInvalida}`} open={fechaInvalida} className="group flex flex-col">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 self-start rounded-full bg-gr-on-hero/10 py-1.5 pl-2.5 pr-3.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <Icon name="calendar" size={16} className="flex-none text-gr-accent" />
            {rotuloFechaGrupo(grupo.eventoFecha, grupo.eventoAnual, hoyLocal())}
          </summary>
          <form action={setGroupDateAction} className="mt-2 flex flex-col gap-2 rounded-2xl bg-gr-surface p-3 text-gr-ink">
            <input type="hidden" name="grupoId" value={grupo.id} />
            {fechaInvalida && <p role="alert" className="text-sm font-semibold">Esa fecha no existe en el calendario: elegí otra.</p>}
            <input name="fecha" type="date" required min={`${ANIO_MINIMO}-01-01`} max={`${ANIO_MAXIMO}-12-31`}
                   defaultValue={fechaParaEditar(grupo.eventoFecha, grupo.eventoAnual, hoyLocal())} aria-label="Fecha del grupo" className="gr-input" />
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
              <input type="checkbox" name="anual" defaultChecked={grupo.eventoAnual} className="size-[22px] accent-gr-ink" /> Se repite todos los años
            </label>
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
        <p role="status" className="rounded-2xl bg-gr-accent px-3.5 py-3 text-sm font-medium">{aviso}</p>
      )}

      {/* Dueños e invitación. Este link da permiso para editar: es solo para quien arma la lista. */}
      <section className="gr-card flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <AvatarStack nombres={grupo.duenos.map((d) => d.nombre)} fotos={grupo.duenos.map((d) => d.foto)} />
          <div className="min-w-0 flex-1">
            <p className="text-base leading-tight font-semibold">
              {otros.length ? `Con ${juntarNombres(otros)}` : 'Solo vos por ahora'}
            </p>
            <p className="text-[13px] leading-snug text-gr-muted">Invitá a quien arma la lista con vos: va a poder agregar y editar.</p>
          </div>
        </div>
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
      {agregado && activos.some((i) => i.id === agregado) && <RecienAgregado id={agregado} otro={`/agregar?lista=${grupo.id}`} />}
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
