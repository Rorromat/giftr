'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui'

type Modo = 'yo' | 'dividimos'

const OPCIONES: { modo: Modo; titulo: string; sub: string; icono: 'gift' | 'users' }[] = [
  { modo: 'yo', titulo: 'Lo compro yo', sub: 'Lo reservás y nadie más lo elige.', icono: 'gift' },
  { modo: 'dividimos', titulo: 'Lo dividimos', sub: 'Lo comprás vos y lo dividen en partes iguales con los amigos que se sumen.', icono: 'users' },
]

/**
 * "Reservar", en el deseo: al tocarlo aparecen las dos formas de regalarlo, y cada una muestra lo suyo (compro: reservar;
 * dividimos: elegir amigos y armar el regalo). abierto: llegó desde otra pantalla tocando "Reservar" (?reservar=1). Sin
 * dividimos (un invitado sin cuenta que no puede armar un regalo grupal), solo reservar, como siempre.
 */
export function ComoLoRegalas({ abierto = false, compro, dividimos }: { abierto?: boolean; compro: React.ReactNode; dividimos: React.ReactNode }) {
  const [ver, setVer] = useState(abierto)
  const [modo, setModo] = useState<Modo | null>(null)
  if (!dividimos) return <>{compro}</>
  if (!ver) {
    return <button type="button" onClick={() => setVer(true)} className="gr-btn-primary w-full min-h-12">Reservar</button>
  }
  return (
    <section id="reservar" aria-labelledby="como-titulo" className="gr-card flex scroll-mt-6 flex-col gap-3 p-3.5">
      <h2 id="como-titulo" className="text-lg leading-tight font-semibold">¿Cómo lo regalás?</h2>
      <div role="radiogroup" aria-labelledby="como-titulo" className="flex flex-col gap-2">
        {OPCIONES.map((o) => {
          const elegida = modo === o.modo
          return (
            <button key={o.modo} type="button" role="radio" aria-checked={elegida} onClick={() => setModo(o.modo)}
                    className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-3 text-left transition-colors ${elegida ? 'border-gr-ink bg-gr-surface' : 'border-gr-line bg-gr-bg'}`}>
              <span aria-hidden className={`flex size-10 flex-none items-center justify-center rounded-full ${elegida ? 'bg-gr-accent' : 'bg-gr-soft'}`}>
                <Icon name={o.icono} size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-tight font-semibold">{o.titulo}</span>
                <span className="block text-[13px] leading-snug text-gr-muted">{o.sub}</span>
              </span>
              <span aria-hidden className={`flex size-5 flex-none items-center justify-center rounded-full border-2 ${elegida ? 'border-gr-ink bg-gr-ink' : 'border-gr-line'}`}>
                {elegida && <span className="size-2 rounded-full bg-gr-accent" />}
              </span>
            </button>
          )
        })}
      </div>
      {modo === 'yo' && compro}
      {modo === 'dividimos' && dividimos}
    </section>
  )
}
