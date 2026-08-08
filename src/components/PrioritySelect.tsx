'use client'

import { useRef } from 'react'
import { updatePriorityAction } from '@/app/actions'

const OPCIONES = {
  mucho: '❤️❤️❤️ Lo quiero mucho',
  gustaria: '❤️❤️ Me gustaría',
  suelta: '❤️ Idea suelta',
} as const

export function PrioritySelect({ itemId, prioridad }: { itemId: string; prioridad: keyof typeof OPCIONES }) {
  const formRef = useRef<HTMLFormElement>(null)
  return (
    <form ref={formRef} action={updatePriorityAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <select
        name="prioridad"
        defaultValue={prioridad}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded border-none bg-transparent p-0 text-sm text-stone-500"
      >
        {Object.entries(OPCIONES).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </form>
  )
}
