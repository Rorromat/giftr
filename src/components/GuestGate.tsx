'use client'

import { useActionState, useRef } from 'react'
import { reserveAction } from '@/app/actions'
import { NOMBRE_INVITADO_MAXIMO, RESERVAS_POR_LISTA } from '@/lib/types'
import { BotonEnviar } from '@/components/BotonEnviar'

const BUTTON = {
  primary: 'gr-btn-primary gr-btn--sm w-full',
  secondary: 'gr-btn w-full min-h-11 px-3.5 text-[15px]',
} as const

// Si la reserva no sale, la acción vuelve a la página con ?reserva=<motivo> y la página muestra esto arriba.
const MOTIVOS: Record<string, string> = {
  sin_stock: 'Recién lo reservó otra persona: fijate en el resto de la lista.',
  archivado: 'Ese deseo ya no está en la lista.',
  no_existe: 'Ese deseo ya no está en la lista.',
  propio: 'En tu propia lista no podés reservar.',
  sin_identidad: 'Para reservar, decinos quién sos.',
  muchas: `Ya tenés ${RESERVAS_POR_LISTA} cosas reservadas de esta lista (cuentan también los regalos grupales en los que seguís solo). Marcá las que ya compraste o soltá alguna para reservar otra.`,
  // "Me equivoqué, todavía no lo compré" con el tope lleno: volvería a ser una reserva más
  muchas_deshacer: `Ya tenés ${RESERVAS_POR_LISTA} cosas reservadas de esta lista. Para que esta vuelva a quedar reservada, marcá las que ya compraste o soltá alguna.`,
  // "Ya lo compré" sobre una reserva que había vencido, cuando el lugar ya lo tomó otro
  vencida: 'Tu reserva ya había vencido y ahora no queda lugar. Si lo habías comprado, contalo en el hilo de abajo.',
}

/**
 * Por qué no salió la reserva. Lo que habla de otros (lo reservó alguien, se dio de baja) solo para el que ve la
 * coordinación: el link con ?reserva= lo puede abrir cualquiera, también el dueño sin su sesión.
 */
export function CartelReserva({ motivo, veTodo, conNombre }: { motivo?: string; veTodo: boolean; conNombre: boolean }) {
  if (!motivo || !Object.hasOwn(MOTIVOS, motivo)) return null
  if (motivo === 'sin_identidad' ? conNombre : !veTodo) return null
  return (
    <p role="status" className="rounded-2xl bg-gr-accent px-3.5 py-3 text-sm font-semibold">
      {MOTIVOS[motivo]}
    </p>
  )
}

export function GuestGate({ token, itemId, identified, variant = 'secondary', volver, conCartel = false, texto = 'Reservar' }: {
  token: string
  itemId: string
  identified: boolean
  variant?: keyof typeof BUTTON
  texto?: string
  /** La página donde está el botón, con sus filtros: si la reserva no sale, se vuelve ahí con el motivo. */
  volver: string
  /** Si la página muestra el cartel de una reserva que no salió: cuando esta sale, se vuelve sin él. */
  conCartel?: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [estado, reservar] = useActionState(reserveAction, null)
  const error = estado?.error && <p role="alert" className="text-sm font-semibold">{estado.error}</p>

  if (identified) {
    return (
      <form action={reservar} className="w-full">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="volver" value={volver} />
        {conCartel && <input type="hidden" name="conCartel" value="1" />}
        <BotonEnviar pendiente="Reservando…" className={BUTTON[variant]}>{texto}</BotonEnviar>
        {error}
      </form>
    )
  }

  return (
    <>
      <button onClick={() => dialogRef.current?.showModal()} className={BUTTON[variant]}>
        {texto}
      </button>
      <dialog ref={dialogRef}
              className="gr-sticker m-auto w-[min(22rem,calc(100%-36px))] p-5 text-gr-ink backdrop:bg-gr-ink/60">
        <form action={reservar} className="flex flex-col gap-3">
          <p className="font-display text-xl leading-tight font-extrabold tracking-[-0.03em]">
            ¿Quién sos? Así los demás saben que este regalo ya tiene dueño.
          </p>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="volver" value={volver} />
          {conCartel && <input type="hidden" name="conCartel" value="1" />}
          <input name="nombre" required maxLength={NOMBRE_INVITADO_MAXIMO} placeholder="Tu nombre" aria-label="Tu nombre" className="gr-input" />
          {error}
          <BotonEnviar pendiente="Reservando…" className="gr-btn-primary mt-1 w-full">Reservar</BotonEnviar>
          <button type="button" onClick={() => dialogRef.current?.close()}
                  className="min-h-11 text-sm font-bold underline decoration-2 underline-offset-4">
            Cancelar
          </button>
        </form>
      </dialog>
    </>
  )
}
