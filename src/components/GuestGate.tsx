'use client'

import { useActionState, useRef } from 'react'
import { reserveAction } from '@/app/actions'
import { NOMBRE_INVITADO_MAXIMO } from '@/lib/types'

const BUTTON = {
  primary: 'gr-btn-primary gr-btn--sm w-full',
  secondary: 'gr-btn w-full min-h-11 px-3.5 text-[15px]',
} as const

export function GuestGate({ token, itemId, identified, variant = 'secondary' }: {
  token: string
  itemId: string
  identified: boolean
  variant?: keyof typeof BUTTON
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [estado, reservar] = useActionState(reserveAction, null)
  const error = estado?.error && <p role="alert" className="text-sm font-semibold">{estado.error}</p>

  if (identified) {
    return (
      <form action={reservar} className="w-full">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="itemId" value={itemId} />
        <button className={BUTTON[variant]}>Reservar</button>
        {error}
      </form>
    )
  }

  return (
    <>
      <button onClick={() => dialogRef.current?.showModal()} className={BUTTON[variant]}>
        Reservar
      </button>
      <dialog ref={dialogRef}
              className="gr-sticker m-auto w-[min(22rem,calc(100%-36px))] p-5 text-gr-ink backdrop:bg-gr-ink/60">
        <form action={reservar} className="flex flex-col gap-3">
          <p className="font-display text-xl leading-tight font-extrabold tracking-[-0.03em]">
            ¿Quién sos? Así los demás saben que este regalo ya tiene dueño.
          </p>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="itemId" value={itemId} />
          <input name="nombre" required maxLength={NOMBRE_INVITADO_MAXIMO} placeholder="Tu nombre" aria-label="Tu nombre" className="gr-input" />
          {error}
          <button className="gr-btn-primary mt-1 w-full">Reservar</button>
          <button type="button" onClick={() => dialogRef.current?.close()}
                  className="min-h-11 text-sm font-bold underline decoration-2 underline-offset-4">
            Cancelar
          </button>
        </form>
      </dialog>
    </>
  )
}
