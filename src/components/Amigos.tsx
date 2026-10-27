import { pedirAmistadAction, responderSolicitudAction } from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { AvatarSticker, Icon } from '@/components/ui'
import type { Persona, Relacion } from '@/lib/amigos'

// Las piezas de amigos: una persona (foto, nombre y @usuario), una solicitud que llegó, la invitación con el link de amigo,
// el cartel de cómo salió algo (?amigo=) y la tarjeta para sumar como amigo al dueño de una lista.

export function PersonaFila({ p, size = 48, children }: { p: Persona; size?: number; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <AvatarSticker nombre={p.nombre} foto={p.foto} size={size} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-base leading-tight font-semibold [overflow-wrap:anywhere]">{p.nombre}</p>
        {p.usuario && <p className="truncate text-[13px] font-medium text-gr-muted">@{p.usuario}</p>}
      </div>
      {children}
    </div>
  )
}

/** Una solicitud que me llegó: aceptar o rechazar (rechazar no se le dice al otro). */
export function SolicitudRecibida({ id, de, volver }: { id: string; de: Persona; volver?: 'avisos' }) {
  return (
    <li className="gr-card flex flex-col gap-3 p-3.5">
      <PersonaFila p={de} />
      <p className="text-[13px] leading-snug text-gr-muted">Quiere ser tu amigo: si aceptás, se ven las listas y los cumples.</p>
      <div className="grid grid-cols-2 gap-2">
        <form action={responderSolicitudAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="acepta" value="0" />
          {volver && <input type="hidden" name="volver" value={volver} />}
          <BotonEnviar className="gr-btn gr-btn--sm w-full">Rechazar</BotonEnviar>
        </form>
        <form action={responderSolicitudAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="acepta" value="1" />
          {volver && <input type="hidden" name="volver" value={volver} />}
          <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">Aceptar</BotonEnviar>
        </form>
      </div>
    </li>
  )
}

/** El link de amigo por WhatsApp: quien lo abre y acepta queda amigo, sin solicitud. */
/**
 * La invitación a GiftR por WhatsApp: qué es, cómo tenerla como app (es una web que se instala desde el navegador, sin
 * tienda) y el link de amigo, así al entrar ya quedan amigos.
 */
export function mensajeDeInvitacion(link: string) {
  return [
    '🎁 Te invito a GiftR: armás tu lista de deseos, ves la de tu gente y coordinan los regalos sin repetir y sin arruinar la sorpresa.',
    '',
    `1. Abrí este link y entrá con tu Google (así ya quedamos como amigos): ${link}`,
    '2. Para tenerla como app: en iPhone, tocá Compartir y "Agregar a inicio"; en Android, el menú ⋮ y "Instalar app".',
  ].join('\n')
}

/** "Invitar a un amigo a GiftR" (en Tu gente): por WhatsApp, con qué es la app, cómo instalarla y tu link de amigo. */
export function InvitarAmigos({ link, usuario }: { link: string; usuario: string | null }) {
  return (
    <section aria-labelledby="invitar-titulo" className="gr-card flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="gr-row__icon"><Icon name="gift" size={20} /></span>
        <div>
          <h2 id="invitar-titulo" className="text-base leading-tight font-semibold">Invitar a un amigo a GiftR</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-gr-muted">
            Le llega por WhatsApp qué es y cómo instalarla. Cuando entra, ya quedan amigos.
            {usuario && <> Si ya la usa, te encuentra por <span className="font-semibold text-gr-ink">@{usuario}</span>.</>}
          </p>
        </div>
      </div>
      <a href={`https://wa.me/?text=${encodeURIComponent(mensajeDeInvitacion(link))}`} target="_blank" className="gr-btn-primary gr-btn--sm gap-2">
        <Icon name="chat" size={18} strokeWidth={2} />Invitar por WhatsApp
      </a>
    </section>
  )
}

const MENSAJES: Record<string, { texto: string; bien: boolean }> = {
  enviada: { texto: 'Listo, le mandaste la solicitud. Cuando acepte, se ven las listas y los cumples.', bien: true },
  amigos: { texto: '¡Ya son amigos! Se ven las listas y los cumples.', bien: true },
  aceptada: { texto: '¡Listo, ahora son amigos! Ya se ven las listas y los cumples.', bien: true },
  link: {
    texto: '¡Listo, ya son amigos! Si usás GiftR desde el ícono de tu pantalla de inicio, abrilo y tirá para abajo: ya aparece ahí.',
    bien: true,
  },
  no_existe: { texto: 'No encontramos a nadie así. Fijate cómo lo escribió, o mandale tu link de amigo.', bien: false },
  formato: { texto: 'Escribí su @usuario o su mail.', bien: false },
  yo: { texto: 'Ese sos vos 🙂', bien: false },
  muchas: { texto: 'Mandaste muchas solicitudes hoy. Probá de nuevo mañana.', bien: false },
}

/** Cómo salió lo último (el ?amigo= con el que vuelve una acción). Solo los valores conocidos. */
export function AvisoAmigo({ amigo }: { amigo?: string }) {
  const m = amigo && Object.hasOwn(MENSAJES, amigo) ? MENSAJES[amigo] : null
  if (!m) return null
  return (
    <p role="status" className={`flex items-start gap-2.5 rounded-[18px] px-4 py-3 text-sm font-medium ${m.bien ? 'bg-gr-accent text-gr-ink' : 'bg-gr-soft'}`}>
      {m.bien && <Icon name="check" size={18} strokeWidth={2.6} className="mt-px flex-none" />}{m.texto}
    </p>
  )
}

/**
 * En la lista de alguien, con tu cuenta: sumarlo como amigo (le llega una solicitud), aceptar la suya, o que ya se la
 * mandaste. Si ya son amigos, nada.
 */
export function AmigoEnLista({ dueno, relacion, volver }: { dueno: Persona; relacion: Relacion; volver: string }) {
  if (relacion === 'amigos' || relacion === 'yo') return null
  const primer = dueno.nombre.split(' ')[0]
  if (relacion === 'enviada') {
    return (
      <p className="gr-card flex items-center gap-2.5 px-4 py-3 text-sm font-medium">
        <Icon name="clock" size={18} className="flex-none text-gr-muted" />Le mandaste una solicitud de amistad a {primer}.
      </p>
    )
  }
  return (
    <section className="gr-card flex items-center gap-3 p-3.5">
      <span className="gr-row__icon"><Icon name="users" size={20} /></span>
      <p className="min-w-0 flex-1 text-[13px] leading-snug">
        {relacion === 'recibida'
          ? <><span className="font-semibold">{primer} te mandó una solicitud.</span> Si aceptás, se ven las listas.</>
          : <><span className="font-semibold">¿Sumar a {primer} como amigo?</span> Le llega una solicitud; si acepta, se ven las listas.</>}
      </p>
      <form action={pedirAmistadAction} className="flex-none">
        <input type="hidden" name="para" value={dueno.id} />
        <input type="hidden" name="volver" value={volver} />
        <BotonEnviar className="gr-btn-primary gr-btn--sm">{relacion === 'recibida' ? 'Aceptar' : 'Sumar'}</BotonEnviar>
      </form>
    </section>
  )
}
