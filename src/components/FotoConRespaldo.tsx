'use client'

import { useState } from 'react'

/**
 * La foto de un deseo que, si no carga (la tienda la sacó, o el link nunca fue una foto), muestra el respaldo en vez del
 * ícono de imagen rota.
 */
export function FotoConRespaldo({ src, respaldo, alt = '', ...props }: React.ComponentProps<'img'> & { src: string; respaldo: React.ReactNode }) {
  const [fallo, setFallo] = useState<string | null>(null)
  if (fallo === src) return respaldo
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fotos subidas o de tiendas externas
    <img {...props} src={src} alt={alt} onError={() => setFallo(src)}
         // si falló antes de que cargue la página, onError no llega
         ref={(img) => { if (img?.complete && !img.naturalWidth) setFallo(src) }} />
  )
}
