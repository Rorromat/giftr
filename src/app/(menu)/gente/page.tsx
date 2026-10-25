import Link from 'next/link'
import { BotonEnviar } from '@/components/BotonEnviar'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { miFoto } from '@/lib/perfil'
import { miGente, type Contacto } from '@/lib/gente'
import { juntarNombres } from '@/lib/groups'
import { anioSiEstaLejos, hoyLocal, MESES } from '@/lib/events'
import { cancelarSolicitudAction, dejarDeSerAmigosAction, pedirAmistadAction, unfollowAction } from '@/app/actions'
import { asegurarUsuario, miAmigoToken, misAmigos, personas, solicitudesEnviadas, solicitudesRecibidas, sugerenciasDeAmigos } from '@/lib/amigos'
import { paraBuscar } from '@/lib/buscar'
import { Buscador } from '@/components/Buscador'
import { AvisoAmigo, InvitarAmigos, SolicitudRecibida } from '@/components/Amigos'
import { SugerenciaAmigo } from '@/components/Sugerencias'
import { AvatarStack, AvatarSticker, Icon, Seccion, AppHeader } from '@/components/ui'

/**
 * "Cumple el 22 de agosto · en 14 días", "El 12 de octubre", "El 20 de noviembre de 2027" (a más de un año), "Sin cumple
 * cargado". La cuenta no se corta en dos renglones.
 */
function cuando(c: Contacto, hoy: Date) {
  if (!c.proxima) return c.tipo === 'personal' ? 'Sin cumple cargado' : null
  const { fecha, dias } = c.proxima
  const falta = dias === 0 ? '¡hoy!' : dias === 1 ? 'mañana' : dias <= 60 ? `en\u00a0${dias}\u00a0días` : null
  const anio = anioSiEstaLejos(fecha, hoy)
  const dia = `${fecha.getUTCDate()} de ${MESES[fecha.getUTCMonth()]}${anio ? ` de ${anio}` : ''}`
  return [`${c.tipo === 'personal' ? 'Cumple el' : 'El'} ${dia}`, falta].filter(Boolean).join(' · ')
}

function Persona({ c, hoy, amigo, usuario }: { c: Contacto; hoy: Date; amigo: boolean; usuario?: string | null }) {
  const dueno = c.tipo === 'personal' ? c.duenos[0] : undefined
  const detalle = [
    c.tipo === 'grupo' && `De ${juntarNombres(c.duenos.map((d) => d.nombre.split(' ')[0]))}`,
    `${c.deseos} ${c.deseos === 1 ? 'deseo' : 'deseos'}`,
  ].filter(Boolean).join(' · ')
  const fecha = cuando(c, hoy)
  return (
    <li data-buscar={paraBuscar([c.nombre, ...c.duenos.map((d) => d.nombre), ...(usuario ? [usuario] : [])].join(' '))}
        className="gr-card flex items-center gap-1 overflow-visible py-3 pl-3.5 pr-1.5">
      <Link href={c.href} className="flex min-w-0 flex-1 items-center gap-3">
        {c.tipo === 'personal'
          ? <AvatarSticker nombre={c.nombre} foto={c.duenos[0]?.foto} size={48} />
          : <AvatarStack nombres={c.duenos.map((d) => d.nombre).slice(0, 3)} fotos={c.duenos.map((d) => d.foto).slice(0, 3)} />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex flex-wrap items-center gap-x-2 text-base leading-tight font-semibold [overflow-wrap:anywhere]">
            {c.nombre}
            {amigo && <span className="rounded-full bg-gr-accent px-2 py-0.5 text-[11px] font-semibold">Amigos</span>}
          </p>
          {fecha && <p className="flex items-center gap-1.5 text-[13px] font-medium leading-snug"><Icon name="cake" size={14} className="flex-none" />{fecha}</p>}
          <p className="text-[13px] font-medium leading-snug text-gr-muted [overflow-wrap:anywhere]">{detalle}</p>
        </div>
      </Link>
      {/* Quitar pide dos toques: sin el link, no hay otra forma de volver a su lista */}
      <details className="relative flex-none">
        <summary aria-label={`Opciones de ${c.nombre}`}
                 className="flex size-11 cursor-pointer list-none items-center justify-center rounded-xl [&::-webkit-details-marker]:hidden">
          <Icon name="more" size={22} strokeWidth={2.2} />
        </summary>
        <div className="absolute right-0 top-full z-20 mt-1 flex w-64 flex-col gap-3 rounded-2xl border border-gr-line bg-gr-surface p-3 shadow-float">
          {amigo && dueno ? (
            <form action={dejarDeSerAmigosAction} className="flex flex-col gap-2">
              <input type="hidden" name="userId" value={dueno.id} />
              <p className="text-[13px] font-medium leading-snug">Ninguno de los dos va a ver más al otro acá ni en Eventos.</p>
              <BotonEnviar className="gr-btn gr-btn--sm min-h-11 text-sm">Dejar de ser amigos</BotonEnviar>
            </form>
          ) : (
            <>
              {dueno && (
                <form action={pedirAmistadAction} className="flex flex-col gap-2">
                  <input type="hidden" name="para" value={dueno.id} />
                  <p className="text-[13px] font-medium leading-snug">Le llega una solicitud: si acepta, también ve tu lista.</p>
                  <BotonEnviar className="gr-btn-primary gr-btn--sm min-h-11 text-sm">Sumar como amigo</BotonEnviar>
                </form>
              )}
              <form action={unfollowAction} className="flex flex-col gap-2">
                <input type="hidden" name="listId" value={c.listId} />
                <p className="text-[13px] font-medium leading-snug">Deja de aparecer acá y en Eventos. Si volvés a abrir su lista, vuelve.</p>
                <BotonEnviar className="gr-btn gr-btn--sm min-h-11 text-sm">Quitar de tu gente</BotonEnviar>
              </form>
            </>
          )}
        </div>
      </details>
    </li>
  )
}

export default async function Gente({ searchParams }: { searchParams: Promise<{ amigo?: string }> }) {
  const { amigo } = await searchParams
  const session = await auth()
  if (!session?.userId) redirect('/')
  const hoy = hoyLocal()
  const yo = session.userId
  const [gente, foto, amigos, recibidas, enviadas, usuario, token, sugerencias] = await Promise.all([
    miGente(db, yo, hoy), miFoto(db, yo), misAmigos(db, yo), solicitudesRecibidas(db, yo), solicitudesEnviadas(db, yo),
    asegurarUsuario(db, yo), miAmigoToken(db, yo), sugerenciasDeAmigos(db, yo),
  ])
  // el @usuario de cada uno, para encontrarlo también así en el buscador
  const usuarios = new Map((await personas(db, gente.flatMap((c) => (c.tipo === 'personal' && c.duenos[0] ? [c.duenos[0].id] : []))))
    .map((p) => [p.id, p.usuario]))
  const linkAmigo = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/amigo/${token ?? ''}`
  const esAmigo = (c: Contacto) => c.tipo === 'personal' && !!c.duenos[0] && amigos.has(c.duenos[0].id)

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <AppHeader nombre={session.user?.name ?? session.user?.email ?? 'Vos'} foto={foto} />
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="gr-title">Tu gente</h1>
          <p className="text-[15px] text-gr-muted">Tus amigos y las listas que abriste.</p>
        </div>
        <Link href="/gente/agregar" className="gr-btn gr-btn--sm flex-none gap-1.5"><Icon name="plus" size={18} strokeWidth={2.4} />Agregar</Link>
      </div>

      <AvisoAmigo amigo={amigo} />

      {recibidas.length > 0 && (
        <section id="solicitudes" aria-labelledby="solicitudes-titulo" className="flex scroll-mt-6 flex-col gap-2.5">
          <h2 id="solicitudes-titulo" className="gr-label">Solicitudes de amistad</h2>
          <ul className="flex flex-col gap-3">
            {recibidas.map((r) => <SolicitudRecibida key={r.id} id={r.id} de={r.de} />)}
          </ul>
        </section>
      )}

      {gente.length === 0 ? (
        <div className="gr-empty flex flex-col items-center gap-2 py-7 text-center">
          <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-gr-surface shadow-card"><Icon name="users" size={26} /></span>
          <p>Acá aparecen tus amigos y las listas que abrís con tu cuenta.</p>
          <p className="text-gr-muted">Tocá “Agregar” y buscalos por su @usuario o su mail.</p>
        </div>
      ) : (
        <>
          {/* buscar a alguien de tu gente (por su nombre o su @usuario); si no está, buscarlo para sumarlo */}
          {gente.length > 1 && (
            <Buscador ambito="mi-gente" placeholder="Buscar en tu gente" vacio="No hay nadie con «%s» en tu gente."
                      masAlla={{ href: '/gente/agregar?q=', texto: 'Buscarlo para sumarlo como amigo' }} />
          )}
          <ul id="mi-gente" className="flex flex-col gap-3">
            {gente.map((c) => (
              <Persona key={c.listId} c={c} hoy={hoy} amigo={esAmigo(c)} usuario={c.tipo === 'personal' ? usuarios.get(c.duenos[0]?.id ?? '') : null} />
            ))}
          </ul>
        </>
      )}

      {enviadas.length > 0 && (
        <section aria-labelledby="enviadas-titulo" className="flex flex-col gap-2.5">
          <h2 id="enviadas-titulo" className="gr-label">Esperando respuesta</h2>
          <ul className="gr-card flex flex-col divide-y divide-gr-line px-3.5">
            {enviadas.map((e) => (
              <li key={e.id} className="flex min-h-14 items-center gap-3 py-2">
                <Icon name="clock" size={18} className="flex-none text-gr-muted" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{e.a}</span>
                <form action={cancelarSolicitudAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <BotonEnviar className="min-h-11 px-2 text-[13px] font-semibold text-gr-muted underline underline-offset-4">Cancelar</BotonEnviar>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sugerencias.length > 0 && (
        <section aria-labelledby="sugerencias-titulo" className="flex flex-col gap-2.5">
          <h2 id="sugerencias-titulo" className="gr-label">Gente que quizás conocés</h2>
          <ul className="gr-card flex flex-col divide-y divide-gr-line px-3.5">
            {sugerencias.map((s) => (
              <SugerenciaAmigo key={s.p.id} p={s.p}
                               enComun={juntarNombres(s.enComun.length > 2 ? [...s.enComun.slice(0, 2), `${s.enComun.length - 2} más`] : s.enComun)} />
            ))}
          </ul>
        </section>
      )}

      {token && <InvitarAmigos link={linkAmigo} usuario={usuario} />}
    </Seccion>
  )
}
