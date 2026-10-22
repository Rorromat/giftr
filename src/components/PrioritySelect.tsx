'use client'

import { useRef } from 'react'
import { updatePriorityAction } from '@/app/actions'
import { PRIORIDADES, type Prioridad } from '@/components/ui'

export function PrioritySelect({ itemId, prioridad }: { itemId: string; prioridad: Prioridad }) {
  const formRef = useRef<HTMLFormElement>(null)
  return (
    <form ref={formRef} action={updatePriorityAction} className="relative inline-flex items-center">
      <input type="hidden" name="itemId" value={itemId} />
      {/* key: con lo guardado se arma de nuevo; si no, al terminar la acción React deja el formulario como estaba al
          montarse y el select volvía al valor viejo (la etiqueta de la foto decía otra cosa) */}
      <select
        key={prioridad}
        name="prioridad"
        aria-label="Cuánto lo querés"
        defaultValue={prioridad}
        onChange={() => formRef.current?.requestSubmit()}
        className="min-h-7 cursor-pointer appearance-none bg-transparent pr-4 text-xs font-semibold text-gr-muted"
      >
        {Object.entries(PRIORIDADES).map(([value, { label }]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2"
           strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-0">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </form>
  )
}
