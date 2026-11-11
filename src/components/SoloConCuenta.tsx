import { entrarConGoogleAction, nombresSoloConCuentaAction } from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'

/**
 * Para el invitado sin cuenta en una lista que muestra quién reservó solo a los que entran con cuenta (ver sinNombresPara):
 * por qué ve "Reservado" a secas, y cómo ver el resto. Reservar puede igual, con su nombre.
 */
export function SoloConCuenta({ volver }: { volver: string }) {
  return (
    <form action={entrarConGoogleAction} className="gr-card px-3.5 py-3 text-[13px] leading-snug font-medium">
      <input type="hidden" name="volver" value={volver} />
      {/* adentro del renglón: no lo agranda, pero se toca en 44 px */}
      <button className="relative font-semibold underline underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-3 after:content-['']">
        Entrá con Google
      </button>{' '}
      para ver quién reservó cada cosa. Sin cuenta ves qué está libre y podés reservar igual.
    </form>
  )
}

/**
 * El ajuste de la lista, para sus dueños (en Mi lista y en la lista en común): "Solo con cuenta se ve quién reservó".
 * Dice cómo está y qué cambia, y un botón lo prende o lo apaga. grupoId: de una lista en común (son varios).
 */
export function AjusteSoloConCuenta({ prendida, grupoId }: { prendida: boolean; grupoId?: string }) {
  const les = grupoId ? 'les' : 'te'
  return (
    <section aria-labelledby="solo-con-cuenta" className="gr-card flex flex-col gap-2.5 p-3.5">
      <div className="flex flex-col gap-1">
        <h2 id="solo-con-cuenta" className="text-base leading-tight font-semibold">Solo con cuenta se ve quién reservó</h2>
        <p className="text-[13px] leading-snug text-gr-muted">
          <span className="font-semibold text-gr-ink">{prendida ? 'Prendido.' : 'Apagado.'}</span>{' '}
          {prendida
            ? `Quien entra sin cuenta ve qué está libre y puede reservar con su nombre, pero no ve quién reservó cada cosa. Así nadie puede espiar quién ${les} regala qué entrando con un nombre inventado.`
            : `Cualquiera que abra el link y ponga un nombre ve quién reservó cada cosa. Si lo prendés, nadie puede espiar quién ${les} regala qué entrando con un nombre inventado.`}
        </p>
      </div>
      <form action={nombresSoloConCuentaAction}>
        {grupoId && <input type="hidden" name="grupoId" value={grupoId} />}
        <input type="hidden" name="prendida" value={prendida ? '0' : '1'} />
        <BotonEnviar className="gr-btn gr-btn--sm">{prendida ? 'Apagar' : 'Prender'}</BotonEnviar>
      </form>
    </section>
  )
}
