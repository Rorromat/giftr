'use client'

import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Icon } from '@/components/ui'
import { BarraDeLaFicha } from '@/components/FichaDeseo'

type Modo = 'yo' | 'dividimos'

const OPCIONES: { modo: Modo; titulo: string; sub: string; icono: 'gift' | 'users' }[] = [
  { modo: 'yo', titulo: 'Lo compro yo', sub: 'Lo reservás y nadie más lo elige.', icono: 'gift' },
  { modo: 'dividimos', titulo: 'Lo dividimos', sub: 'Lo comprás vos y lo dividen en partes iguales con los amigos que se sumen.', icono: 'users' },
]

/**
 * "Reservar", en la barra de abajo del deseo (con la tienda al lado, secundaria): al tocarlo aparecen, en el deseo, las
 * dos formas de regalarlo en un segmentado, y cada una muestra lo suyo (compro: reservar; dividimos: elegir amigos y armar
 * el regalo). abierto: llegó desde otra pantalla tocando "Reservar" (?reservar=1). Sin dividimos (un invitado sin cuenta
 * que no puede armar un regalo grupal), en la barra va directo reservar, como siempre.
 */
export function ComoLoRegalas({ abierto = false, compro, dividimos, secundaria }: {
  abierto?: boolean; compro: React.ReactNode; dividimos: React.ReactNode; secundaria?: React.ReactNode
}) {
  const [ver, setVer] = useState(abierto)
  const [modo, setModo] = useState<Modo | null>(null)
  const seccion = useRef<HTMLElement>(null)
  if (!dividimos) return <BarraDeLaFicha secundaria={secundaria}>{compro}</BarraDeLaFicha>

  const abrir = () => {
    flushSync(() => setVer(true))
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches
    seccion.current?.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'center' })
  }
  const elegida = OPCIONES.find((o) => o.modo === modo)
  return (
    <>
      {ver && (
        <section ref={seccion} id="reservar" aria-labelledby="como-titulo" className="gr-card flex scroll-mt-6 flex-col gap-3 p-3.5">
          <h2 id="como-titulo" className="text-lg leading-tight font-semibold">¿Cómo lo regalás?</h2>
          <div role="radiogroup" aria-labelledby="como-titulo" className="gr-segmented gr-segmented--grande">
            {OPCIONES.map((o) => (
              <button key={o.modo} type="button" role="radio" aria-checked={modo === o.modo} onClick={() => setModo(o.modo)} className="gap-2">
                <Icon name={o.icono} size={18} />{o.titulo}
              </button>
            ))}
          </div>
          <p className="text-[13px] leading-snug text-gr-muted">
            {elegida ? elegida.sub : 'Elegí si lo comprás vos solo o lo dividen entre varios.'}
          </p>
          {modo === 'yo' && compro}
          {modo === 'dividimos' && dividimos}
        </section>
      )}
      <BarraDeLaFicha secundaria={secundaria}>
        {!ver && <button type="button" onClick={abrir} className="gr-btn-primary">Reservar</button>}
      </BarraDeLaFicha>
    </>
  )
}
