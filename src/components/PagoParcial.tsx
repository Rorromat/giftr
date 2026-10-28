'use client'

import { useActionState, useState } from 'react'
import { payPartAction } from '@/app/actions'
import { pesos, plata, type Moneda } from '@/lib/pesos'
import { BotonEnviar } from '@/components/BotonEnviar'

const soloDigitos = (v: string) => v.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
/** "45000" → "45.000" mientras se escribe. */
const conPuntos = (v: string) => (v ? pesos(Number(v)).slice(1) : '')

/**
 * "Le pagué una parte" / "Me pagó una parte", en la tarjeta de alguien en Cuentas: cuánto, de lo que dice la tarjeta (neto,
 * en su moneda). Manda el neto que se veía: si cambió mientras tanto, no anota nada (ver pagarParte). Va con key del neto:
 * después de anotar cambia la tarjeta y esto vuelve a arrancar cerrado y vacío. Si no sale, el mensaje queda acá.
 */
export function PagoParcial({ otroId, neto, moneda = 'ARS' }: { otroId: string; neto: number; moneda?: Moneda }) {
  const [estado, enviar] = useActionState(payPartAction, null)
  const [monto, setMonto] = useState('')
  const leDebo = neto < 0
  const todo = Math.abs(neto)
  const n = Number(monto || 0)
  return (
    <details className="group flex flex-col">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center text-sm font-semibold underline underline-offset-4 [&::-webkit-details-marker]:hidden">
        {leDebo ? 'Le pagué una parte' : 'Me pagó una parte'}
      </summary>
      <form action={enviar} className="flex flex-col gap-2">
        {estado?.error && <p role="alert" className="rounded-2xl bg-gr-brand px-3 py-2.5 text-sm font-semibold text-gr-bg">{estado.error}</p>}
        <input type="hidden" name="otroId" value={otroId} />
        <input type="hidden" name="moneda" value={moneda} />
        <input type="hidden" name="neto" value={neto} />
        <div className="flex items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1 rounded-2xl border border-gr-line bg-gr-surface px-3">
            <span className="font-semibold">{moneda === 'USD' ? 'US$' : '$'}</span>
            <input name="monto" inputMode="numeric" required autoComplete="off" placeholder="0"
                   aria-label={leDebo ? '¿Cuánto le pagaste?' : '¿Cuánto te pagó?'}
                   value={conPuntos(monto)} onChange={(e) => setMonto(soloDigitos(e.target.value))}
                   className="min-h-11 w-full min-w-0 bg-transparent text-lg font-semibold outline-none" />
          </span>
          <BotonEnviar disabled={!(n > 0 && n <= todo)} pendiente="Anotando…" className="gr-btn gr-btn--sm flex-none">Anotar</BotonEnviar>
        </div>
        <p aria-live="polite" className="text-xs font-semibold text-gr-muted">
          {n > todo ? `Es más de ${leDebo ? 'lo que le debés' : 'lo que te debe'} (${plata(todo, moneda)}).`
            : n === todo ? 'Con eso queda todo saldado.'
            : n > 0 ? `${leDebo ? 'Le vas a quedar debiendo' : 'Te va a quedar debiendo'} ${plata(todo - n, moneda)}.`
            : `De ${plata(todo, moneda)}: lo que falta queda en Cuentas.`}
        </p>
      </form>
    </details>
  )
}
