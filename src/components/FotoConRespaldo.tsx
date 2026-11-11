'use client'

import { useState } from 'react'

/**
 * La foto de un deseo que, si no carga (la tienda la sacó, o el link nunca fue una foto), muestra el respaldo en vez del
 * ícono de imagen rota. Se pide recién cuando se acerca a la pantalla (una lista de 60 deseos pedía las 60 fotos al
 * abrir, con datos móviles) y se decodifica aparte, sin trabar el scroll. pronto: la que está en lo primero que se ve
 * (la foto grande de un deseo), que cargue ya.
 */
export function FotoConRespaldo({ src, respaldo, alt = '', pronto = false, ...props }: React.ComponentProps<'img'> & {
  src: string; respaldo: React.ReactNode; pronto?: boolean
}) {
  const [fallo, setFallo] = useState<string | null>(null)
  if (fallo === src) return respaldo
  return (
    // loading va antes que src: si no, Firefox ya salió a buscarla.
    // eslint-disable-next-line @next/next/no-img-element -- fotos subidas o de tiendas externas
    <img loading={pronto ? undefined : 'lazy'} decoding="async" {...props} src={src} alt={alt} onError={() => setFallo(src)}
         // si falló antes de que cargue la página, onError no llega
         ref={(img) => { if (img?.complete && !img.naturalWidth) setFallo(src) }} />
  )
}
