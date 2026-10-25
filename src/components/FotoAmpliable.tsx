'use client'

import { useRef, useState } from 'react'
import { Icon } from '@/components/ui'

/**
 * La foto de un deseo, que se puede ver entera: en la tarjeta va recortada para que todas tengan el mismo alto y, según
 * cómo sea la foto, a veces no se ve bien. Tocándola se abre a pantalla completa, sin recortar, sobre fondo oscuro; se
 * cierra con la X, tocando afuera o con Esc. children es la foto como se ve en la tarjeta (con lo que lleve encima).
 */
export function FotoAmpliable({ src, titulo, className = '', children }: {
  src: string | null; titulo: string; className?: string; children: React.ReactNode
}) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const [rota, setRota] = useState(false)
  return (
    <div className={`relative ${className}`}>
      {children}
      {src && (
        <>
          <button type="button" onClick={() => dialogo.current?.showModal()} aria-label={`Ver la foto de ${titulo} entera`}
                  className="absolute inset-0 z-[1] cursor-zoom-in">
            <span aria-hidden className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-white/95 text-gr-ink shadow-[0_1px_4px_rgb(20_20_20/0.18)]">
              <Icon name="expandir" size={17} strokeWidth={2.2} />
            </span>
          </button>
          {/* data-sin-refrescar: tirar para abajo acá no actualiza la pantalla de atrás */}
          <dialog ref={dialogo} aria-label={titulo} data-sin-refrescar className="gr-foto-grande"
                  onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close() }}>
            {rota ? (
              <p className="px-8 text-center text-[15px] font-medium text-white">No se pudo cargar la foto.</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- fotos subidas o de tiendas externas, del tamaño que vengan
              <img src={src} alt={titulo} loading="lazy" onError={() => setRota(true)} className="gr-foto-grande__img" />
            )}
            <button type="button" onClick={() => dialogo.current?.close()} aria-label="Cerrar la foto"
                    className="gr-foto-grande__cerrar">
              <Icon name="close" size={22} strokeWidth={2.4} />
            </button>
          </dialog>
        </>
      )}
    </div>
  )
}
