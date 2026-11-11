'use client'

import { useActionState, useId, useRef } from 'react'
import { reserveAction } from '@/app/actions'
import { NOMBRE_INVITADO_MAXIMO, RESERVAS_POR_LISTA } from '@/lib/types'
import { BotonEnviar } from '@/components/BotonEnviar'
import { EsTuLista } from '@/components/Identidad'

// "Reservar" es lo que vino a hacer el que abrió el link: va en el verde de la marca, grande en la barra del deseo y chico
// en cada tarjeta de la lista. neutro: al lado de otra acción principal ("Ya lo compré" arriba de "Reservar de nuevo").
const BUTTON = {
  primary: 'gr-btn-primary w-full min-h-12',
  tarjeta: 'gr-btn-primary gr-btn--sm w-full',
  neutro: 'gr-btn gr-btn--sm w-full',
} as const

// Si la reserva no sale, la acción vuelve a la página con ?reserva=<motivo> y la página muestra esto arriba.
const MOTIVOS: Record<string, string> = {
  // se lo reservaron mientras miraba la lista (ya veía qué estaba libre)
  sin_stock: 'Recién lo reservó otra persona: fijate en el resto de la lista.',
  // nadie se lo ganó de mano: estaba reservado de antes y, hasta que dijo quién es, no se le mostraba (ver reserveAction)
  ya_elegido: 'Ese ya lo había elegido alguien. Ahora ves qué queda libre.',
  archivado: 'Ese deseo ya no está en la lista.',
  no_existe: 'Ese deseo ya no está en la lista.',
  propio: 'En tu propia lista no podés reservar.',
  sin_identidad: 'Para reservar, decinos quién sos.',
  muchas: `Ya tenés ${RESERVAS_POR_LISTA} cosas reservadas de esta lista (cuentan también los regalos grupales en los que seguís solo). Marcá las que ya compraste o liberá alguna para reservar otra.`,
  // "Me equivoqué, todavía no lo compré" con el tope lleno: volvería a ser una reserva más
  muchas_deshacer: `Ya tenés ${RESERVAS_POR_LISTA} cosas reservadas de esta lista. Para que esta vuelva a quedar reservada, marcá las que ya compraste o liberá alguna.`,
  // "Ya lo compré" sobre una reserva que había vencido, cuando el lugar ya lo tomó otro
  vencida: 'Tu reserva ya había vencido y ahora no queda lugar. Si lo habías comprado, contalo en el hilo de abajo.',
}

/**
 * Por qué no salió la reserva. Lo que habla de otros (lo reservó alguien, se dio de baja) solo para el que ve la
 * coordinación: el link con ?reserva= lo puede abrir cualquiera, también el dueño sin su sesión.
 */
export function CartelReserva({ motivo, veTodo, conNombre }: { motivo?: string; veTodo: boolean; conNombre: boolean }) {
  if (!motivo || !Object.hasOwn(MOTIVOS, motivo)) return null
  if (motivo === 'sin_identidad' ? conNombre : !veTodo) return null
  return (
    <p role="status" className="rounded-gr-md bg-gr-soft px-3.5 py-3 text-sm font-semibold">
      {MOTIVOS[motivo]}
    </p>
  )
}

export function GuestGate({ token, itemId, identified, variant = 'neutro', volver, conCartel = false, avisar = false, texto = 'Reservar', para, plural = false }: {
  token: string
  itemId: string
  identified: boolean
  variant?: keyof typeof BUTTON
  texto?: string
  /** La página donde está el botón, con sus filtros: si la reserva no sale, se vuelve ahí con el motivo. */
  volver: string
  /** Si la página muestra el cartel de una reserva que no salió: cuando esta sale, se vuelve sin él. */
  conCartel?: boolean
  /** En la lista: cuando sale, se vuelve parado en ese deseo con el cartel de hasta cuándo es suyo (ver reserveAction). */
  avisar?: boolean
  /** De quién es la lista ("Euge", "Delfina y Martín"): al pedir el nombre se dice que no se entera. plural: son varios. */
  para: string
  plural?: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titulo = useId()
  const [estado, reservar] = useActionState(reserveAction, null)
  const error = estado?.error && <p role="alert" className="text-sm font-semibold">{estado.error}</p>
  const ocultos = (
    <>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="volver" value={volver} />
      {conCartel && <input type="hidden" name="conCartel" value="1" />}
      {avisar && <input type="hidden" name="avisar" value="1" />}
    </>
  )

  if (identified) {
    return (
      <form action={reservar} className="w-full">
        {ocultos}
        <BotonEnviar pendiente="Reservando…" className={BUTTON[variant]}>{texto}</BotonEnviar>
        {error}
      </form>
    )
  }

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className={BUTTON[variant]}>
        {texto}
      </button>
      <dialog ref={dialogRef} aria-labelledby={titulo}
              className="gr-card m-auto w-[min(22rem,calc(100%-36px))] p-5 text-gr-ink backdrop:bg-gr-ink/50">
        <form action={reservar} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id={titulo} className="text-lg leading-snug font-semibold">¿Quién sos?</h2>
            {/* la regla de la sorpresa, justo donde aparece la duda: "si pongo mi nombre, ¿se entera?" */}
            <p className="text-sm font-medium leading-snug [overflow-wrap:anywhere]">
              Así los demás saben que ya está reservado. {para} no se {plural ? 'enteran' : 'entera'} de nada: solo lo ven los
              demás que regalan.
            </p>
          </div>
          {ocultos}
          <input name="nombre" required maxLength={NOMBRE_INVITADO_MAXIMO} placeholder="Tu nombre" aria-label="Tu nombre" autoComplete="name"
                 className="gr-input" />
          {error}
          <BotonEnviar pendiente="Reservando…" className="gr-btn-primary mt-1 w-full">Reservar</BotonEnviar>
          <button type="button" onClick={() => dialogRef.current?.close()}
                  className="min-h-11 text-sm font-semibold underline underline-offset-4">
            Cancelar
          </button>
        </form>
        {/* la dueña sin su sesión (el navegador de WhatsApp): si pone su nombre, ve quién le reservó qué */}
        <EsTuLista volver={volver} className="mt-1 border-t border-gr-line pt-3 text-center" />
      </dialog>
    </>
  )
}
