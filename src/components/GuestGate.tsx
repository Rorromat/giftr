'use client'

import { useRef } from 'react'
import { reserveAction } from '@/app/actions'

export function GuestGate({ token, itemId, identified }: { token: string; itemId: string; identified: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  if (identified) {
    return (
      <form action={reserveAction}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="itemId" value={itemId} />
        <button className="rounded-full bg-[#E2725B] px-4 py-2 text-sm font-semibold text-white">Reservar</button>
      </form>
    )
  }

  return (
    <>
      <button onClick={() => dialogRef.current?.showModal()}
              className="rounded-full bg-[#E2725B] px-4 py-2 text-sm font-semibold text-white">
        Reservar
      </button>
      <dialog ref={dialogRef} className="m-auto w-80 rounded-2xl p-6 backdrop:bg-black/40">
        <form action={reserveAction} className="space-y-3">
          <p className="font-semibold">¿Quién sos? Así los demás saben que este regalo ya tiene dueño.</p>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="itemId" value={itemId} />
          <input name="nombre" required placeholder="Tu nombre" className="w-full rounded-xl border border-stone-300 p-2" />
          <input name="email" type="email" placeholder="Email (opcional, para recuperar tu reserva)" className="w-full rounded-xl border border-stone-300 p-2" />
          <button className="w-full rounded-xl bg-[#E2725B] py-2 font-semibold text-white">Reservar 🤫</button>
          <button type="button" onClick={() => dialogRef.current?.close()} className="w-full text-sm text-stone-400">Cancelar</button>
        </form>
      </dialog>
    </>
  )
}
