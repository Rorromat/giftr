'use client'

import { useActionState } from 'react'
import { entrarConGoogleAction, identificarseAction, salirAction } from '@/app/actions'
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
      <form action={entrarConGoogleAction}>
        <input type="hidden" name="volver" value={volver} />
        <button className="gr-btn min-h-11 w-full gap-2 font-sans text-[15px] font-bold">
          <span aria-hidden className="flex size-6 items-center justify-center rounded-full border-2 border-gr-ink bg-gr-surface text-xs font-bold">G</span>
          Entrar con Google
        </button>
      </form>
    </section>
  )
}

/** "¿No sos X? Cambiar": en un dispositivo compartido, para dejar de ser el último que se anotó. */
export function NoSoyYo({ nombre, volver, conCuenta }: { nombre: string; volver: string; conCuenta: boolean }) {
  return (
    <form action={salirAction} className="flex flex-wrap items-center justify-center gap-x-1.5 text-[13px] font-medium">
      <input type="hidden" name="volver" value={volver} />
      <span className="[overflow-wrap:anywhere]">¿No sos {nombre}?</span>
      <button className="min-h-11 font-bold underline decoration-2 underline-offset-4">{conCuenta ? 'Salir' : 'Cambiar'}</button>
    </form>
  )
}
