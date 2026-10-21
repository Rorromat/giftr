'use client'

import { useActionState, useRef } from 'react'
import { reserveAction } from '@/app/actions'
import { NOMBRE_INVITADO_MAXIMO } from '@/lib/types'

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
}

/**
 * Por qué no salió la reserva. Lo que habla de otros (lo reservó alguien, se dio de baja) solo para el que ya dijo
 * quién es: el link con ?reserva= lo puede abrir cualquiera, también el dueño sin su sesión.
 */
export function CartelReserva({ motivo, identified }: { motivo?: string; identified: boolean }) {
  if (!motivo || !Object.hasOwn(MOTIVOS, motivo)) return null
  if (motivo === 'sin_identidad' ? identified : !identified) return null
  return (
    <p role="status" className="rounded-2xl border-[2.5px] border-gr-ink bg-gr-accent px-3.5 py-3 text-sm font-semibold shadow-sticker-sm">
      {MOTIVOS[motivo]}
    </p>
  )
}

export function GuestGate({ token, itemId, identified, variant = 'secondary', desde = 'lista' }: {
  token: string
  itemId: string
  identified: boolean
  variant?: keyof typeof BUTTON
  /** Dónde está el botón: si la reserva no sale, se vuelve ahí con el motivo. */
  desde?: 'lista' | 'detalle'
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [estado, reservar] = useActionState(reserveAction, null)
  const error = estado?.error && <p role="alert" className="text-sm font-semibold">{estado.error}</p>

  if (identified) {
    return (
      <form action={reservar} className="w-full">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="desde" value={desde} />
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
          <input type="hidden" name="desde" value={desde} />
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
