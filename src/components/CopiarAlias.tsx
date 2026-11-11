'use client'

import { useState } from 'react'

/**
 * "Copiar alias" en Cuentas, al lado del alias de alguien a quien le debés: lo copia tal cual para pegarlo en la app del
 * banco o la billetera (como CopyLinkButton, pero un texto y no un link). texto: "Copiar alias" o "Copiar CVU".
 */
export function CopiarAlias({ alias, texto }: { alias: string; texto: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(alias)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permiso de portapapeles: el alias queda a la vista para copiarlo a mano.
    }
  }

  return (
    <button type="button" onClick={copiar} className="gr-btn min-h-11 flex-none px-3 text-[13px]">
      <span aria-live="polite">{copiado ? '¡Copiado!' : texto}</span>
    </button>
  )
}
