'use client'

import { useRef } from 'react'
import { borrarDeseoAction } from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { Icon } from '@/components/ui'

/**
 * Eliminar el deseo, al final de Editar: el botón rojo abre la confirmación y el de verdad está adentro, porque no se
 * deshace (ver borrarDeseo). Para sacarlo de la lista sin perderlo están "Ya lo tengo" y "Ya no lo quiero".
 */
export function EliminarDeseo({ itemId, titulo }: { itemId: string; titulo: string }) {
  const dialogo = useRef<HTMLDialogElement>(null)
  return (
    <>
      <button type="button" onClick={() => dialogo.current?.showModal()}
              className="gr-btn h-14 w-full gap-2 border-red-600 bg-red-600 text-[17px] text-white">
        <Icon name="basura" size={20} />Eliminar deseo
      </button>
      {/* data-sin-refrescar: tirar para abajo acá no actualiza la pantalla de atrás */}
      <dialog ref={dialogo} aria-labelledby="eliminar-titulo" data-sin-refrescar
              className="m-auto w-[min(26rem,calc(100%-24px))] rounded-[28px] bg-gr-bg p-5 text-gr-ink shadow-float backdrop:bg-gr-ink/60">
        <div className="flex flex-col gap-3">
          <span aria-hidden className="mx-auto flex size-14 items-center justify-center rounded-full bg-red-100 text-red-600">
            <Icon name="basura" size={26} />
          </span>
          <h2 id="eliminar-titulo" className="text-center text-[22px] leading-tight font-semibold [overflow-wrap:anywhere]">¿Eliminar «{titulo}»?</h2>
          <p className="text-center text-[15px] leading-snug text-gr-muted">
            Se borra de tu lista y no se puede deshacer. Si solo lo querés sacar, usá «Ya lo tengo» o «Ya no lo quiero»: esos se
            pueden volver a poner.
          </p>
          <form action={borrarDeseoAction} className="mt-1">
            <input type="hidden" name="itemId" value={itemId} />
            <BotonEnviar pendiente="Eliminando…" className="gr-btn h-12 w-full border-red-600 bg-red-600 text-white">Sí, eliminarlo</BotonEnviar>
          </form>
          <button type="button" onClick={() => dialogo.current?.close()} className="gr-btn h-12 w-full">Cancelar</button>
        </div>
      </dialog>
    </>
  )
}
