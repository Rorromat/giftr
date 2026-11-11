'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { avisosPreguntadosAction } from '@/app/actions'
import { ActivarAvisos } from '@/components/ActivarAvisos'
import { useAgregado } from '@/components/Agregado'
import { Icon, Insignia } from '@/components/ui'
import type { EstadoAvisos } from '@/lib/avisos-del-navegador'

// La pregunta de los avisos, en un cartel de una sola vez: explica para qué son antes de que el sistema pida el permiso. Es
// para que, cuando alguien quiera saber qué regalarte, te lo pueda pedir (un codazo) y te enteres al toque. Sale cuando ya
// anotaste algo (ver preguntarAvisos): antes era un paso de la bienvenida, antes del primer deseo.

/** Con los avisos activados, o donde no se puede (o falta agregar GiftR a inicio), ya no hay nada que decir que no. */
const yaEsta = (e: EstadoAvisos) => e === 'activado' || e === 'no-soportado' || e === 'ios-instalar' || e === 'bloqueado'

/** Para qué son los avisos: la campanita, "¿Te avisamos?" y lo que llega (un codazo, lo de amigos). */
export function PorQueAvisos({ tituloId, Titulo = 'h1' }: { tituloId?: string; Titulo?: 'h1' | 'h2' }) {
  return (
    <>
      <div className="gr-hero flex flex-col items-center gap-3 px-5 pb-6 pt-7 text-center">
        <span className="relative flex items-center justify-center">
          <Insignia size={104} />
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

/** Lo que espera el cartel desde que puede salir (ver PreguntaAvisos). */
const ESPERA_MS = 700

/**
 * El cartel de una sola vez (ver preguntarAvisos). Se abre solo si en este dispositivo se pueden activar (o hay que agregar
 * GiftR a inicio para eso), y al abrirse queda anotado: no vuelve a aparecer. Si ya están activados acá, se anota sin
 * mostrar nada; si están bloqueados o el navegador no puede, no se anota: quizás en otro dispositivo.
 * Espera su momento: recién anotado un deseo está "¡Anotado!" en pantalla, con mandar la lista por WhatsApp, y el cartel
 * encima se lo tapaba. Sale cuando lo cierra (el ?agregado= de la dirección dura lo que "¡Anotado!", ver Agregado), y nunca
 * mientras elige cómo agregar otro ni en el formulario de Agregar.
 */
export function PreguntaAvisos({ vapidPublica }: { vapidPublica: string }) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const decidido = useRef(false)
  const [estado, setEstado] = useState<EstadoAvisos>('cargando')
  const { paso } = useAgregado()
  const path = usePathname()
  useEffect(() => {
    if (decidido.current || estado === 'cargando') return
    if (paso !== '' || path === '/agregar' || new URLSearchParams(location.search).has('agregado')) return
    // un momento después: al cerrar "¡Anotado!" el círculo vuelve al + y la lista va hasta el deseo nuevo
    const reloj = setTimeout(() => {
      decidido.current = true
      if (estado === 'apagado' || estado === 'ios-instalar') {
        dialogo.current?.showModal()
        void avisosPreguntadosAction()
      } else if (estado === 'activado') void avisosPreguntadosAction()
    }, ESPERA_MS)
    return () => clearTimeout(reloj)
  }, [estado, paso, path])
  return (
    // data-sin-refrescar: tirar para abajo acá no actualiza la pantalla de atrás
    <dialog ref={dialogo} aria-labelledby="pregunta-avisos" data-sin-refrescar
            className="m-auto max-h-[calc(100dvh-24px)] w-[min(26rem,calc(100%-24px))] overflow-y-auto rounded-gr-xl bg-gr-bg p-3 pb-4 text-gr-ink shadow-float backdrop:bg-gr-ink/60">
      <div className="flex flex-col gap-3">
        <PorQueAvisos tituloId="pregunta-avisos" Titulo="h2" />
        <ActivarAvisos vapidPublica={vapidPublica} bienvenida alCambiar={setEstado} />
        <button type="button" onClick={() => dialogo.current?.close()} className={yaEsta(estado) ? 'gr-btn-primary w-full' : 'gr-btn w-full'}>
          {yaEsta(estado) ? 'Seguir' : 'Ahora no'}
        </button>
      </div>
    </dialog>
  )
}
