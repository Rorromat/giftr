'use client'

import { useState } from 'react'

export function CopyLinkButton({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).href)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permiso de portapapeles: el link queda visible para copiarlo a mano.
    }
  }

  return (
    <button type="button" onClick={copiar}
            className="h-11 flex-none rounded-full bg-white px-4 text-[15px] font-bold text-[#121216]">
      <span aria-live="polite">{copiado ? '¡Copiado!' : 'Copiar'}</span>
    </button>
  )
}
