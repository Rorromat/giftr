'use client'

import { useActionState } from 'react'
import {
  entrarConGoogleAction, identificarseAction, noSoyElInvitadoAction, salirAction, unirInvitadoAction, verLoReservadoAction,
} from '@/app/actions'
import { NOMBRE_INVITADO_MAXIMO } from '@/lib/types'

/**
 * "¿Quién sos?" para el que abre una lista sin sesión ni nombre: hasta que diga quién es no ve nada de la
 * coordinación (puede ser el dueño sin su sesión). Con el nombre pasa a verla; el dueño entra con Google.
 */
export function QuienSos({ token, volver }: { token: string; volver: string }) {
  const [estado, identificarse] = useActionState(identificarseAction, null)
  return (
    <section aria-labelledby="quien-sos" className="gr-sticker flex flex-col gap-2.5 p-3.5">
      <div>
        <h2 id="quien-sos" className="font-display text-lg leading-tight font-extrabold">¿Quién sos?</h2>
        <p className="text-[13px] font-medium leading-snug">
          Decinos tu nombre para ver qué ya reservaron los demás. ¿Es tu lista? Entrá con Google: así no te enterás de nada.
        </p>
      </div>
      <form action={identificarse} className="flex gap-2">
        <input type="hidden" name="token" value={token} />
        <input name="nombre" required maxLength={NOMBRE_INVITADO_MAXIMO} placeholder="Tu nombre" aria-label="Tu nombre"
               className="gr-input min-w-0 flex-1 shadow-none" />
        <button className="gr-btn-primary gr-btn--sm flex-none rounded-[14px]">Listo</button>
      </form>
      {estado?.error && <p role="alert" className="text-sm font-semibold">{estado.error}</p>}
      <EntrarConGoogle volver={volver} />
    </section>
  )
}

function EntrarConGoogle({ volver }: { volver: string }) {
  return (
    <form action={entrarConGoogleAction}>
      <input type="hidden" name="volver" value={volver} />
      <button className="gr-btn min-h-11 w-full gap-2 font-sans text-[15px] font-bold">
        <span aria-hidden className="flex size-6 items-center justify-center rounded-full border-2 border-gr-ink bg-gr-surface text-xs font-bold">G</span>
        Entrar con Google
      </button>
    </form>
  )
}

/**
 * Un invitado que abre una lista donde todavía no dijo que no es suya. Su nombre vale para todo el navegador: puede ser
 * el dueño, que se anotó en la lista de otro desde un navegador sin su sesión. Hasta que lo diga, la ve como el dueño.
 */
export function ConfirmarLista({ token, nombre, volver }: { token: string; nombre: string; volver: string }) {
  return (
    <section aria-labelledby="confirmar-lista" className="gr-sticker flex flex-col gap-2.5 p-3.5">
      <div>
        <h2 id="confirmar-lista" className="font-display text-lg leading-tight font-extrabold [overflow-wrap:anywhere]">
          Estás como “{nombre}”. ¿Es tu lista?
        </h2>
        <p className="text-[13px] font-medium leading-snug">
          Si es tuya, entrá con Google: así no te enterás de nada. Si es de otra persona, mirá qué ya reservaron los demás.
        </p>
      </div>
      <form action={verLoReservadoAction}>
        <input type="hidden" name="token" value={token} />
        <button className="gr-btn-primary gr-btn--sm w-full rounded-[14px]">No es mía: ver lo reservado</button>
      </form>
      <EntrarConGoogle volver={volver} />
    </section>
  )
}

/**
 * Sin sesión, en un navegador donde ya entró con su cuenta alguien de esta lista (la tablet de la familia después de
 * "Cerrar sesión"): puede ser esa persona, así que acá no se ve la coordinación ni se reserva. Con su Google, sí.
 */
export function OtraCuenta({ volver }: { volver: string }) {
  return (
    <section aria-labelledby="otra-cuenta" className="gr-sticker flex flex-col gap-2.5 p-3.5">
      <div>
        <h2 id="otra-cuenta" className="font-display text-lg leading-tight font-extrabold">Para reservar, entrá con Google</h2>
        <p className="text-[13px] font-medium leading-snug">
          En este dispositivo ya entró con su cuenta alguien de esta lista, así que acá no se muestra qué reservaron los demás.
        </p>
      </div>
      <EntrarConGoogle volver={volver} />
    </section>
  )
}

/**
 * Con su cuenta, en un grupo del que salió: cargó esos deseos, así que la ve como el dueño (sin reservas) y no reserva.
 * Si vuelve a sumarse con la invitación, vuelve a editarla.
 */
export function ExDueno() {
  return (
    <section aria-labelledby="ex-dueno" className="gr-sticker flex flex-col gap-1 p-3.5">
      <h2 id="ex-dueno" className="font-display text-lg leading-tight font-extrabold">Saliste de este grupo</h2>
      <p className="text-[13px] font-medium leading-snug">
        Como la armabas vos también, acá no se muestra qué reservaron los demás y no podés reservar.
      </p>
    </section>
  )
}

/**
 * "¿No sos X?": en un dispositivo compartido, para dejar de ser el último que se anotó (o cerrar la sesión de otro).
 * A un invitado se le pide confirmarlo: su cookie es lo único que lo identifica, y lo que reservó queda a su nombre sin
 * que nadie lo pueda manejar desde acá. Primero se le ofrece entrar con Google, que lo pasa a su cuenta.
 */
export function NoSoyYo({ nombre, volver, conCuenta }: { nombre: string; volver: string; conCuenta: boolean }) {
  if (conCuenta) {
    return (
      <form action={salirAction} className="flex flex-wrap items-center justify-center gap-x-1.5 text-[13px] font-medium">
        <input type="hidden" name="volver" value={volver} />
        <span className="[overflow-wrap:anywhere]">¿No sos {nombre}?</span>
        <button className="min-h-11 font-bold underline decoration-2 underline-offset-4">Salir</button>
      </form>
    )
  }
  return (
    <details className="group flex flex-col items-center text-center text-[13px] font-medium">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-center gap-x-1.5 [&::-webkit-details-marker]:hidden">
        <span className="[overflow-wrap:anywhere]">¿No sos {nombre}?</span>
        <span className="font-bold underline decoration-2 underline-offset-4">Salir de este dispositivo</span>
      </summary>
      <div className="gr-sticker mt-1 flex flex-col gap-2.5 p-3.5 text-left">
        <p className="leading-snug [overflow-wrap:anywhere]">
          Lo que se reservó como “{nombre}” queda a ese nombre y ya no se va a poder manejar desde este dispositivo.
          Si sos {nombre}, mejor entrá con Google: lo que reservaste pasa a tu cuenta.
        </p>
        <EntrarConGoogle volver={volver} />
        <form action={salirAction}>
          <input type="hidden" name="volver" value={volver} />
          <button className="min-h-11 w-full text-sm font-bold underline decoration-2 underline-offset-4">Salir igual</button>
        </form>
      </div>
    </details>
  )
}

/**
 * Ya con sesión, en un navegador donde había un invitado anotado: "¿Sos vos?". Nunca se une solo, porque en un
 * dispositivo compartido puede ser otra persona (la abuela que usó la tablet), y lo que reservó no es de esta cuenta.
 */
export function PreguntaInvitado({ nombre }: { nombre: string }) {
  return (
    <section aria-labelledby="pregunta-invitado" className="gr-sticker flex flex-col gap-2.5 p-3.5">
      <div>
        <h2 id="pregunta-invitado" className="font-display text-lg leading-tight font-extrabold [overflow-wrap:anywhere]">
          En este navegador se anotó “{nombre}”. ¿Sos vos?
        </h2>
        <p className="text-[13px] font-medium leading-snug">
          Si sos vos, lo que reservaste y comentaste pasa a tu cuenta. Si no, queda a su nombre, como estaba.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <form action={unirInvitadoAction}>
          <button className="gr-btn-primary gr-btn--sm rounded-[14px] px-4">Sí, soy yo</button>
        </form>
        <form action={noSoyElInvitadoAction}>
          <button className="min-h-11 text-sm font-bold underline decoration-2 underline-offset-4">No soy yo</button>
        </form>
      </div>
    </section>
  )
}

/**
 * En Perfil, mientras siga en este navegador un invitado que no se unió a ninguna cuenta: para unirlo aunque se haya
 * contestado "No soy yo" por error (la pregunta no vuelve a aparecer).
 */
export function UnirInvitado({ nombre }: { nombre: string }) {
  return (
    <section className="gr-sticker flex flex-col gap-2.5 p-3.5">
      <div>
        <p className="font-display text-lg font-extrabold [overflow-wrap:anywhere]">En este navegador está anotado “{nombre}”</p>
        <p className="text-[13px] font-medium leading-snug">
          Si eras vos, lo que reservaste y comentaste como {nombre} puede pasar a tu cuenta. Si es de otra persona, dejalo así.
        </p>
      </div>
      <form action={unirInvitadoAction}>
        <button className="gr-btn gr-btn--sm rounded-[14px] px-4 font-sans text-sm font-bold">Era yo: pasarlo a mi cuenta</button>
      </form>
    </section>
  )
}
