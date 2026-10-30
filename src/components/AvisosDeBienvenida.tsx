'use client'

import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'
import { avisosPreguntadosAction } from '@/app/actions'
import { ActivarAvisos } from '@/components/ActivarAvisos'
import { Icon, Starburst } from '@/components/ui'
import type { EstadoAvisos } from '@/lib/avisos-del-navegador'

// La pregunta de los avisos: en la bienvenida (/bienvenida/avisos) y, a los que ya estaban, en un cartel de una sola vez.
// Es para que, cuando alguien quiera saber qué regalarte, te lo pueda pedir (un codazo) y te enteres al toque.

/** Con los avisos activados, o donde no se puede (o falta agregar GiftR a inicio), ya no hay nada que decir que no. */
const yaEsta = (e: EstadoAvisos) => e === 'activado' || e === 'no-soportado' || e === 'ios-instalar' || e === 'bloqueado'

/** Para qué son los avisos: la campanita, "¿Te avisamos?" y lo que llega (un codazo, lo de amigos). */
export function PorQueAvisos({ tituloId, Titulo = 'h1' }: { tituloId?: string; Titulo?: 'h1' | 'h2' }) {
  return (
    <>
      <div className="gr-hero flex flex-col items-center gap-3 px-5 pb-6 pt-7 text-center">
        <span className="relative flex items-center justify-center">
          <Starburst size={104} />
          <Icon name="bell" size={40} strokeWidth={2.2} className="absolute text-gr-ink" />
        </span>
        <Titulo id={tituloId} className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">¿Te avisamos?</Titulo>
        <p className="text-[15px] leading-snug text-gr-on-hero/75">
          Activá las notificaciones para que, cuando alguien quiera saber qué regalarte, te lo pueda pedir y te enteres al toque.
        </p>
      </div>
      <ul className="gr-card gr-rows flex flex-col">
        <li className="flex items-start gap-3 px-4 py-3.5">
          <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-full bg-gr-on-hero/10 text-lg">👉</span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug font-semibold">Un codazo</p>
            <p className="text-[13px] leading-snug text-gr-muted">Alguien quiere saber qué regalarte y te pide que cargues tu lista.</p>
          </div>
        </li>
        <li className="flex items-start gap-3 px-4 py-3.5">
          <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-full bg-gr-soft"><Icon name="users" size={19} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug font-semibold">Tus amigos</p>
            <p className="text-[13px] leading-snug text-gr-muted">Alguien te quiere sumar como amigo, o aceptó tu solicitud.</p>
          </div>
        </li>
      </ul>
      <p className="px-1 text-[13px] leading-snug text-gr-muted">Nada de publicidad. Los podés apagar cuando quieras desde Perfil.</p>
    </>
  )
}

/** La pregunta de los avisos en la bienvenida, y cómo seguir: "Seguir" si ya están activados (o no se puede), si no "Ahora no". */
export function AvisosDeBienvenida({ vapidPublica, siguiente }: { vapidPublica: string; siguiente: string }) {
  const [estado, setEstado] = useState<EstadoAvisos>('cargando')
  return (
    <div className="flex flex-col gap-3">
      <ActivarAvisos vapidPublica={vapidPublica} bienvenida alCambiar={setEstado} />
      <Link href={siguiente} className={yaEsta(estado) ? 'gr-btn-primary w-full' : 'gr-btn w-full'}>{yaEsta(estado) ? 'Seguir' : 'Ahora no'}</Link>
    </div>
  )
}

/**
 * El cartel de una sola vez, para los que ya estaban antes de que la bienvenida preguntara (ver preguntarAvisos). Se abre
 * solo si en este dispositivo se pueden activar (o hay que agregar GiftR a inicio para eso), y al abrirse queda anotado:
 * no vuelve a aparecer. Si ya están activados acá, se anota sin mostrar nada; si están bloqueados o el navegador no puede,
 * no se anota: quizás en otro dispositivo.
 */
export function PreguntaAvisos({ vapidPublica }: { vapidPublica: string }) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const decidido = useRef(false)
  const [estado, setEstado] = useState<EstadoAvisos>('cargando')
  const alCambiar = useCallback((e: EstadoAvisos) => {
    setEstado(e)
    if (decidido.current || e === 'cargando') return
    decidido.current = true
    if (e === 'apagado' || e === 'ios-instalar') {
      dialogo.current?.showModal()
      void avisosPreguntadosAction()
    } else if (e === 'activado') void avisosPreguntadosAction()
  }, [])
  return (
    // data-sin-refrescar: tirar para abajo acá no actualiza la pantalla de atrás
    <dialog ref={dialogo} aria-labelledby="pregunta-avisos" data-sin-refrescar
            className="m-auto max-h-[calc(100dvh-24px)] w-[min(26rem,calc(100%-24px))] overflow-y-auto rounded-[28px] bg-gr-bg p-3 pb-4 text-gr-ink shadow-float backdrop:bg-gr-ink/60">
      <div className="flex flex-col gap-3">
        <PorQueAvisos tituloId="pregunta-avisos" Titulo="h2" />
        <ActivarAvisos vapidPublica={vapidPublica} bienvenida alCambiar={alCambiar} />
        <button type="button" onClick={() => dialogo.current?.close()} className={yaEsta(estado) ? 'gr-btn-primary w-full' : 'gr-btn w-full'}>
          {yaEsta(estado) ? 'Seguir' : 'Ahora no'}
        </button>
      </div>
    </dialog>
  )
}
