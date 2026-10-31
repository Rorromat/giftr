'use client'

import { useActionState } from 'react'
import { noSugerirAction, sumarSugerenciaAction, type EstadoSugerencia } from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { AvatarSticker, Icon } from '@/components/ui'
import type { Persona } from '@/lib/amigos'

/**
 * Una persona de "Gente que quizás conocés" (amigos de tus amigos): quién es, los amigos en común, Sumar y "Ahora no" (la
 * saca de las sugerencias, ver noSugerirAction). La solicitud sale sin irse de la pantalla; la fila queda diciendo que se la
 * mandaste.
 */
export function SugerenciaAmigo({ p, enComun }: { p: Persona; enComun: string }) {
  const [estado, sumar] = useActionState<EstadoSugerencia, FormData>(sumarSugerenciaAction, null)
  return (
    <li className="flex min-h-[72px] items-center gap-3 py-2.5">
      <AvatarSticker nombre={p.nombre} foto={p.foto} size={44} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[15px] leading-tight font-semibold [overflow-wrap:anywhere]">{p.nombre}</p>
        <p className="text-[13px] font-medium leading-snug text-gr-muted">
          {estado && !estado.ok ? estado.texto : `Amigos en común: ${enComun}`}
        </p>
      </div>
      {estado?.ok ? (
        <p role="status" className="flex flex-none items-center gap-1 text-[13px] font-semibold">
          <Icon name="check" size={16} strokeWidth={2.6} className="text-gr-acento" />{estado.amigos ? '¡Amigos!' : 'Enviada'}
        </p>
      ) : (
        <div className="-mr-2 flex flex-none items-center">
          <form action={sumar}>
            <input type="hidden" name="para" value={p.id} />
            <BotonEnviar pendiente="Sumando…" aria-label={`Sumar a ${p.nombre} como amigo`} className="gr-btn-primary gr-btn--sm">Sumar</BotonEnviar>
          </form>
          <form action={noSugerirAction}>
            <input type="hidden" name="para" value={p.id} />
            <BotonEnviar aria-label={`Ahora no: no sugerir a ${p.nombre}`} title="Ahora no"
                         className="flex size-11 items-center justify-center rounded-xl text-gr-muted">
              <Icon name="close" size={18} strokeWidth={2.4} />
            </BotonEnviar>
          </form>
        </div>
      )}
    </li>
  )
}
