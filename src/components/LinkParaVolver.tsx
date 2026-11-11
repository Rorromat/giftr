'use client'

import { useState } from 'react'

/**
 * Para quien reservó con su nombre, sin cuenta: el link que lo trae de vuelta a su reserva desde otro teléfono u otro
 * navegador (ver /l/[token]/volver/[clave]). Lo único que lo identifica es una cookie de este navegador: la abuela reservó
 * desde el navegador de WhatsApp, después abrió la lista en Chrome y ya no podía liberar ni marcar comprado. Copiarlo o
 * mandárselo a sí misma por WhatsApp (elige su propio chat). Va adentro del cartel de la reserva: hereda su color.
 */
export function LinkParaVolver({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).href)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permiso de portapapeles: queda "Mandármelo por WhatsApp".
    }
  }

  const accion = 'flex min-h-11 items-center font-semibold underline underline-offset-4'
  const texto = `Mi link para volver a lo que reservé en GiftR (es solo para mí):\n${url}`
  return (
    <div className="mt-2 border-t border-current/20 pt-2">
      <p>Guardate este link para volver a tu reserva desde otro teléfono. Es solo tuyo: no se lo pases a nadie.</p>
      <div className="flex flex-wrap gap-x-5">
        <button type="button" onClick={copiar} className={accion}>
          <span aria-live="polite">{copiado ? '¡Copiado!' : 'Copiar link'}</span>
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" className={accion}>
          Mandármelo por WhatsApp
        </a>
      </div>
    </div>
  )
}
