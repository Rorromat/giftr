'use client'

import { useRef, useState } from 'react'
import { updatePriorityAction } from '@/app/actions'
import { PRIORIDADES, type Prioridad } from '@/components/ui'

/**
 * Cuánto lo querés, para cambiarlo desde la tarjeta del deseo en tu lista. Lo que se ve es el texto chico con su flechita;
 * el <select> de verdad va encima, transparente: de 44 de alto (con el dedo, al de 28 se le erraba y se abría el deseo) y
 * con letra de 16 px (con menos, el iPhone hace zoom al tocarlo y deja la pantalla corrida).
 */
export function PrioritySelect({ itemId, prioridad }: { itemId: string; prioridad: Prioridad }) {
  const formRef = useRef<HTMLFormElement>(null)
  // lo recién elegido, mientras se guarda: vale hasta que llega otra prioridad guardada
  const [elegida, setElegida] = useState<{ sobre: Prioridad; valor: Prioridad } | null>(null)
  const visible = elegida?.sobre === prioridad ? elegida.valor : prioridad
  return (
    <form ref={formRef} action={updatePriorityAction}
          className="relative inline-flex min-h-7 items-center gap-1 rounded-md text-xs font-semibold text-gr-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gr-ink">
      <input type="hidden" name="itemId" value={itemId} />
      <span aria-hidden>{PRIORIDADES[visible].label}</span>
      <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2"
           strokeLinecap="round" strokeLinejoin="round" className="flex-none">
        <path d="M6 9l6 6 6-6" />
      </svg>
      {/* key: con lo guardado se arma de nuevo; si no, al terminar la acción React deja el formulario como estaba al
          montarse y el select volvía al valor viejo (la etiqueta de la foto decía otra cosa) */}
      <select
        key={prioridad}
        name="prioridad"
        aria-label="Cuánto lo querés"
        defaultValue={prioridad}
        onChange={(e) => {
          setElegida({ sobre: prioridad, valor: e.currentTarget.value as Prioridad })
          formRef.current?.requestSubmit()
        }}
        className="absolute left-0 top-1/2 h-11 w-full min-w-11 -translate-y-1/2 cursor-pointer appearance-none text-base opacity-0"
      >
        {Object.entries(PRIORIDADES).map(([value, { label }]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </form>
  )
}
