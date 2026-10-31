'use client'

import { useActionState } from 'react'
import {
  entrarConGoogleAction, identificarseAction, noSoyElInvitadoAction, salirAction, unirInvitadoAction, verLoReservadoAction,
} from '@/app/actions'
import { NOMBRE_INVITADO_MAXIMO } from '@/lib/types'
import { BotonEnviar } from '@/components/BotonEnviar'

/**
 * "¿Quién sos?" para el que abre una lista sin sesión ni nombre: hasta que diga quién es no ve nada de la
 * coordinación (puede ser el dueño sin su sesión). Con el nombre pasa a verla; el dueño entra con Google.
 */
export function QuienSos({ token, volver }: { token: string; volver: string }) {
  const [estado, identificarse] = useActionState(identificarseAction, null)
  return (
    <section aria-labelledby="quien-sos" className="gr-card flex flex-col gap-2.5 p-3.5">
      <div>
        <h2 id="quien-sos" className="text-lg leading-tight font-semibold">¿Quién sos?</h2>
        <p className="text-[13px] font-medium leading-snug">
          Decinos tu nombre para ver qué ya reservaron los demás. ¿Es tu lista? Entrá con Google: así no te enterás de nada.
        </p>
      </div>
      <form action={identificarse} className="flex gap-2">
        <input type="hidden" name="token" value={token} />
        <input name="nombre" required maxLength={NOMBRE_INVITADO_MAXIMO} placeholder="Tu nombre" aria-label="Tu nombre"
               className="gr-input min-w-0 flex-1 shadow-none" />
        <BotonEnviar className="gr-btn-primary gr-btn--sm flex-none rounded-[14px]">Listo</BotonEnviar>
      </form>
      {estado?.error && <p role="alert" className="text-sm font-semibold">{estado.error}</p>}
      <EntrarConGoogle volver={volver} />
    </section>
  )
}

export function EntrarConGoogle({ volver }: { volver: string }) {
  return (
    <form action={entrarConGoogleAction}>
      <input type="hidden" name="volver" value={volver} />
      <button className="gr-btn min-h-11 w-full gap-2 text-[15px]">
        <span aria-hidden className="flex size-6 items-center justify-center rounded-full border border-gr-line bg-gr-surface text-xs font-semibold">G</span>
        Entrar con Google
      </button>
    </form>
  )
}

/**
 * Un invitado que abre una lista donde todavía no dijo que no es suya. Su nombre vale para todo el navegador: puede ser
 * el dueño, que se anotó en la lista de otro desde un navegador sin su sesión. Hasta que lo diga, la ve como el dueño.
 * Si es otra persona usando la tablet, acá mismo puede dejar de ser ese nombre: si no, con "No es mía" reservaría a su
 * nombre. Solo sale sin sesión (o con la de un usuario que ya no está en la base, que salirAction trata igual).
 */
export function ConfirmarLista({ token, nombre, volver }: { token: string; nombre: string; volver: string }) {
  return (
    <section aria-labelledby="confirmar-lista" className="gr-card flex flex-col gap-2.5 p-3.5">
      <div>
        <h2 id="confirmar-lista" className="text-lg leading-tight font-semibold [overflow-wrap:anywhere]">
          Estás como “{nombre}”. ¿Es tu lista?
        </h2>
        <p className="text-[13px] font-medium leading-snug">
          Si es tuya, entrá con Google: así no te enterás de nada. Si es de otra persona, mirá qué ya reservaron los demás.
        </p>
      </div>
      <form action={verLoReservadoAction}>
        <input type="hidden" name="token" value={token} />
        <BotonEnviar className="gr-btn-primary gr-btn--sm w-full rounded-[14px]">No es mía: ver lo reservado</BotonEnviar>
      </form>
      <EntrarConGoogle volver={volver} />
      <NoSoyYo nombre={nombre} volver={volver} />
    </section>
  )
}

/**
 * Sin sesión, en un navegador donde ya entró con su cuenta alguien de esta lista (la tablet de la familia después de
 * "Cerrar sesión"): puede ser esa persona, así que acá no se ve la coordinación ni se reserva. Con su Google, sí.
 * Un invitado que ya había reservado acá (la abuela) tampoco ve lo suyo: el texto le dice cómo recuperarlo, igual para
 * todos (no depende de qué se reservó ni de si hay invitado, así que a la dueña no le cuenta nada).
 */
export function OtraCuenta({ volver }: { volver: string }) {
  return (
    <section aria-labelledby="otra-cuenta" className="gr-card flex flex-col gap-2.5 p-3.5">
      <div>
        <h2 id="otra-cuenta" className="text-lg leading-tight font-semibold">Para reservar, entrá con Google</h2>
        <p className="text-[13px] font-medium leading-snug">
          En este dispositivo ya entró con su cuenta alguien de esta lista, así que acá no se muestra qué reservaron los demás.
          Si ya habías reservado algo acá con tu nombre, entrá con tu Google y tocá “Sí, soy yo”: pasa a tu cuenta y lo
          manejás desde ahí.
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
    <section aria-labelledby="ex-dueno" className="gr-card flex flex-col gap-1 p-3.5">
      <h2 id="ex-dueno" className="text-lg leading-tight font-semibold">Ya no sos parte de este grupo</h2>
      <p className="text-[13px] font-medium leading-snug">
        Como la armabas vos también, acá no se muestra qué reservaron los demás y no podés reservar. Si tenías algo
        reservado de esta lista, se liberó.
      </p>
    </section>
  )
}

/**
 * "¿No sos X?", solo para un invitado (sin cuenta): en un dispositivo compartido, para dejar de ser el último que se anotó.
 * Con cuenta no va: la sesión se cierra desde Perfil, abajo de todo. Se le pide confirmarlo: su cookie es lo único que lo
 * identifica, y lo que reservó queda a su nombre sin que nadie lo pueda manejar desde acá. Primero se le ofrece entrar con
 * Google, que lo pasa a su cuenta.
 */
export function NoSoyYo({ nombre, volver }: { nombre: string; volver: string }) {
  return (
    <details className="group flex flex-col items-center text-center text-[13px] font-medium">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-center gap-x-1.5 [&::-webkit-details-marker]:hidden">
        <span className="[overflow-wrap:anywhere]">¿No sos {nombre}?</span>
        <span className="font-semibold underline underline-offset-4">Salir de este dispositivo</span>
      </summary>
      <div className="gr-card mt-1 flex flex-col gap-2.5 p-3.5 text-left">
        <p className="leading-snug [overflow-wrap:anywhere]">
          Lo que se reservó como “{nombre}” queda a ese nombre y ya no se va a poder manejar desde este dispositivo.
          Si sos {nombre}, mejor entrá con Google: lo que reservaste pasa a tu cuenta.
        </p>
        <EntrarConGoogle volver={volver} />
        <form action={salirAction}>
          <input type="hidden" name="volver" value={volver} />
          <button className="min-h-11 w-full text-sm font-semibold underline underline-offset-4">Salir igual</button>
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
    <section aria-labelledby="pregunta-invitado" className="gr-card flex flex-col gap-2.5 p-3.5">
      <div>
        <h2 id="pregunta-invitado" className="text-lg leading-tight font-semibold [overflow-wrap:anywhere]">
          En este navegador se anotó “{nombre}”. ¿Sos vos?
        </h2>
        <p className="text-[13px] font-medium leading-snug">
          Si sos vos, lo que reservaste y comentaste pasa a tu cuenta. Si no, queda a su nombre, como estaba.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <form action={unirInvitadoAction}>
          <BotonEnviar className="gr-btn-primary gr-btn--sm rounded-[14px] px-4">Sí, soy yo</BotonEnviar>
        </form>
        <form action={noSoyElInvitadoAction}>
          <button className="min-h-11 text-sm font-semibold underline underline-offset-4">No soy yo</button>
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
    <section className="gr-card flex flex-col gap-2.5 p-3.5">
      <div>
        <p className="text-lg font-semibold [overflow-wrap:anywhere]">En este navegador está anotado “{nombre}”</p>
        <p className="text-[13px] font-medium leading-snug">
          Si eras vos, lo que reservaste y comentaste como {nombre} puede pasar a tu cuenta. Si es de otra persona, dejalo así.
        </p>
      </div>
      <form action={unirInvitadoAction}>
        <button className="gr-btn gr-btn--sm rounded-[14px] px-4 text-sm">Era yo: pasarlo a mi cuenta</button>
      </form>
    </section>
  )
}
