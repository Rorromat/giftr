'use client'

import { useActionState } from 'react'
import { aportarAction, deshacerAporteAction } from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { CopiarAlias } from '@/components/CopiarAlias'
import { EsTuLista } from '@/components/Identidad'
import { Icon } from '@/components/ui'
import { tipoDeAlias } from '@/lib/alias-pago'
import { pesos } from '@/lib/pesos'
import { NOMBRE_INVITADO_MAXIMO } from '@/lib/types'

/** El aporte propio a un deseo de aporte en plata (ver aportar): cuánto anotó y si todavía se puede deshacer. */
export type MiAporte = { claimId: string; monto: number | null; deshacer: boolean }

/**
 * "Aportar", en un deseo de aporte en plata ("Luna de miel", "Cochecito"): no se reserva, porque no es de uno solo. Al
 * tocarlo se ve a qué alias o CVU transferir, con "Copiar alias", y abajo "Ya aporté", para dejarlo anotado con cuánto si
 * quiere decirlo. GiftR no mueve plata: la transferencia se hace desde el banco o la billetera.
 * Un <details>: el alias se ve sin esperar a que cargue la página (lo que necesita quien abrió el link en el navegador de
 * WhatsApp). abierto: en la página del deseo, donde es lo único que hay para hacer.
 * anotar: si el que mira puede dejar anotado su aporte. No, si puede ser de la lista (ver accesoALista): el alias lo ve
 * igual, como cualquiera con el link. identified: ya tiene nombre; si no, se lo pide acá, como al reservar.
 */
export function Aportar({ token, itemId, alias, mio, anotar, identified, para, plural = false, volver, abierto = false }: {
  token: string
  itemId: string
  alias: string
  mio: MiAporte | null
  anotar: boolean
  identified: boolean
  /** De quién es la lista ("Euge", "Delfina y Martín"): se dice que no se entera. plural: son varios. */
  para: string
  plural?: boolean
  volver: string
  abierto?: boolean
}) {
  const [estado, aportar] = useActionState(aportarAction, null)
  const tipo = tipoDeAlias(alias)
  const ocultos = (
    <>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="itemId" value={itemId} />
    </>
  )
  return (
    <details open={abierto} className="group flex flex-col">
      {/* ya anotado, deja de ser la acción principal: neutro, con el tilde */}
      <summary className={`${mio ? 'gr-btn' : 'gr-btn-primary'} min-h-12 w-full list-none gap-2 [&::-webkit-details-marker]:hidden`}>
        <Icon name={mio ? 'check' : 'wallet'} size={19} strokeWidth={2.2} />{mio ? 'Ya aportaste' : 'Aportar'}
      </summary>
      <div className="gr-card mt-2.5 flex flex-col gap-3 p-3.5">
        {mio && (
          <div role="status" className="flex flex-col gap-1">
            <p className="flex items-start gap-2 text-sm font-semibold">
              <Icon name="check" size={18} strokeWidth={2.6} className="mt-px flex-none" />
              {mio.monto ? `Anotado: aportaste ${pesos(mio.monto)}.` : 'Anotado: ya aportaste.'}
            </p>
            <p className="text-[13px] leading-snug text-gr-muted">
              {para} no {plural ? 'ven' : 've'} acá quién aportó ni cuánto: lo {plural ? 'ven' : 've'} en su cuenta.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">{mio ? `El ${tipo}, por si querés aportar de nuevo:` : `Transferí lo que quieras a este ${tipo}:`}</p>
          <div className="flex items-center gap-2 rounded-2xl bg-gr-soft py-1.5 pl-3.5 pr-1.5">
            <p className="min-w-0 flex-1 text-[15px] font-semibold [overflow-wrap:anywhere]">{alias}</p>
            <CopiarAlias alias={alias} texto={`Copiar ${tipo}`} />
          </div>
          <p className="text-xs leading-snug text-gr-muted">Lo hacés desde tu banco o tu billetera: GiftR no mueve plata.</p>
        </div>

        {mio?.deshacer && (
          <form action={deshacerAporteAction}>
            {ocultos}
            <input type="hidden" name="claimId" value={mio.claimId} />
            <BotonEnviar className="min-h-11 text-sm font-semibold underline underline-offset-4">Me equivoqué, todavía no aporté</BotonEnviar>
          </form>
        )}

        {!mio && anotar && (
          <form action={aportar} className="flex flex-col gap-2.5 border-t border-gr-line pt-3">
            {ocultos}
            <p className="text-sm font-medium leading-snug">
              Cuando transfieras, dejalo anotado: así los demás que regalan saben que ya aportaste. {para} no se{' '}
              {plural ? 'enteran' : 'entera'} por acá de quién aportó ni cuánto.
            </p>
            {!identified && (
              <input name="nombre" required maxLength={NOMBRE_INVITADO_MAXIMO} placeholder="Tu nombre" aria-label="Tu nombre" autoComplete="name"
                     className="gr-input shadow-none" />
            )}
            <input name="monto" inputMode="numeric" maxLength={20} placeholder="¿Cuánto aportaste? (opcional)" aria-label="¿Cuánto aportaste? (opcional)"
                   className="gr-input shadow-none" />
            {estado?.error && <p role="alert" className="text-sm font-semibold">{estado.error}</p>}
            <BotonEnviar pendiente="Anotando…" className="gr-btn gr-btn--dark min-h-12 w-full">Ya aporté</BotonEnviar>
            {/* la dueña sin su sesión (el navegador de WhatsApp): si pone su nombre, ve lo que no le toca */}
            {!identified && <EsTuLista volver={volver} className="text-center" />}
          </form>
        )}
      </div>
    </details>
  )
}
