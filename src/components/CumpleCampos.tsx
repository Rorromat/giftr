'use client'

import { useState } from 'react'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/**
 * Día y mes del cumple (Perfil y bienvenida). Los días son los del mes elegido (29 en febrero, como guardarCumple), así
 * no se elige uno que no existe. Lo que vale es lo que valida el servidor: esto es para que no haga falta.
 * exigir: los dos obligatorios (en Perfil, que tiene "Quitar" para borrarlo). En la bienvenida no: un campo obligatorio
 * en un paso escondido frena el envío sin que se vea por qué.
 */
export function CumpleCampos({ dia, mes, exigir = false, claseDia = '' }: { dia?: number; mes?: number; exigir?: boolean; claseDia?: string }) {
  const [elegido, setElegido] = useState(mes ?? 0)
  const dias = elegido ? new Date(Date.UTC(2024, elegido, 0)).getUTCDate() : 31
  return (
    <>
      <select name="dia" aria-label="Día" defaultValue={dia ?? ''} required={exigir} className={`gr-input min-w-0 ${claseDia}`}>
        <option value="">Día</option>
        {Array.from({ length: dias }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select name="mes" aria-label="Mes" defaultValue={mes ?? ''} required={exigir} onChange={(e) => setElegido(Number(e.target.value))}
              className="gr-input min-w-0 flex-1">
        <option value="">Mes</option>
        {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
    </>
  )
}
