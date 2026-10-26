'use client'

import { useRef } from 'react'
import type { FechaEspecial } from '@/lib/fechas-especiales'

/**
 * "¿Es para una fecha especial?" al armar un amigo invisible: aparte (sin fecha especial) o una de las fechas. Al elegir una,
 * el día de los regalos pasa a ser ese (si estaba vacío o era el de la que estaba elegida: si lo cambiaron a mano, queda).
 * Sin JavaScript se elige igual; solo no se completa el día.
 */
export function ElegirFechaDelJuego({ opciones, inicial, propuestas }: {
  opciones: { id: FechaEspecial; nombre: string; emoji: string }[]
  inicial: FechaEspecial | null
  /** el día que se propone para cada fecha ('YYYY-MM-DD') */
  propuestas: Partial<Record<FechaEspecial, string>>
}) {
  const elegida = useRef<string>(inicial ?? '')
  const cambiar = (nueva: string) => {
    const dia = document.querySelector<HTMLInputElement>('input[name=fecha]')
    const propuesta = propuestas[nueva as FechaEspecial]
    if (dia && propuesta && (!dia.value || dia.value === propuestas[elegida.current as FechaEspecial])) dia.value = propuesta
    elegida.current = nueva
  }
  const chip = (valor: string, texto: string) => (
    <label key={valor} className="gr-chip">
      <input type="radio" name="fechaEspecial" value={valor} defaultChecked={(inicial ?? '') === valor} onChange={() => cambiar(valor)}
             className="sr-only" />
      {texto}
    </label>
  )
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="gr-label mb-2">¿Es para una fecha especial?</legend>
      <div className="flex flex-wrap gap-2">
        {chip('', '🎁 No, es aparte')}
        {opciones.map((o) => chip(o.id, `${o.emoji} ${o.nombre}`))}
      </div>
    </fieldset>
  )
}
