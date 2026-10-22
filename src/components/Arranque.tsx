'use client'

import { useEffect, useRef, useState } from 'react'
import { Starburst } from '@/components/ui'

const cargando = () => !!document.querySelector('main[aria-busy="true"]')

/**
 * La animación de inicio: mientras la primera pantalla de la app está cargando, la estrella del ícono se pega en el
 * medio y gira a golpecitos; cuando llega, vuela a ser el contador de Mi lista (o se achica en las demás pantallas).
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
            <div className="gr-arranque__sombra"><Starburst size={150} className="gr-arranque__giro" /></div>
            <Starburst size={150} className="gr-arranque__giro" />
            <svg viewBox="0 0 100 100" className="gr-arranque__letra">
              <text x="50" y="50" dy="0.35em" textAnchor="middle" fontSize={56} fontWeight={800}
                    fill="var(--gr-ink)" style={{ fontFamily: 'var(--gr-font-display)' }}>G</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
