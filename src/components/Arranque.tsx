'use client'

import { useEffect, useRef, useState } from 'react'
import { Mono } from '@/components/ui'

/** La sombra del moño, toda en tinta. */
const SOMBRA = { claro: '#121216', medio: '#121216', oscuro: '#121216', nudo: '#121216' }

// la pantalla de carga entera, o solo lo de abajo de una sección con pestañas (ver SkeletonContenido)
const cargando = () => !!document.querySelector('main[aria-busy="true"], .gr-cargando[aria-busy="true"]')

/**
 * La animación de inicio: mientras la primera pantalla de la app está cargando, el moño del ícono se pega en el medio y
 * late; cuando llega, se achica y se va.
 * La maneja el CSS (.gr-arranque en tokens.css) mirando si está la pantalla de carga, así arranca antes que el JS.
 * Esto solo la saca cuando terminó: va en el layout de la raíz, que no se vuelve a montar, así que no aparece en las
 * pantallas de carga de después (las de cada navegación).
 */
export function Arranque() {
  const ref = useRef<HTMLDivElement>(null)
  const [fuera, setFuera] = useState(false)

  useEffect(() => {
    const telon = ref.current
    if (!telon) return
    let vigente = true
    // Ya llegó la primera pantalla: data-listo la deja escondida aunque después haya otra de carga, y se va cuando
    // terminan las transiciones de la salida (con "reducir movimiento" no hay: se va enseguida).
    const terminar = () => {
      telon.dataset.listo = ''
      Promise.allSettled(telon.getAnimations({ subtree: true }).map((a) => a.finished))
        .then(() => { if (vigente) setFuera(true) })
    }
    const observer = new MutationObserver(() => {
      if (cargando()) return
      observer.disconnect()
      terminar()
    })
    if (cargando()) observer.observe(document.body, { childList: true, subtree: true })
    else terminar()
    return () => {
      vigente = false
      observer.disconnect()
    }
  }, [])

  if (fuera) return null
  return (
    <div ref={ref} aria-hidden className="gr-arranque">
      <div className="gr-arranque__fondo" />
      <div className="gr-arranque__marco">
        <div className="gr-arranque__vuelo">
          <div className="gr-arranque__pegado">
            <div className="gr-arranque__sombra"><Mono tonos={SOMBRA} className="gr-arranque__latido" /></div>
            <Mono className="gr-arranque__latido" />
          </div>
        </div>
      </div>
    </div>
  )
}
