import Link from 'next/link'
import { signIn } from '@/auth'
import {
  cancelGroupGiftAction, joinGroupGiftAction, leaveGroupGiftAction, letBackGroupGiftMemberAction, markPaidAction, removeGroupGiftMemberAction,
  startGroupGiftAction,
} from '@/app/actions'
import { juntarNombres } from '@/lib/groups'
import { pesos } from '@/lib/pesos'
import type { RegaloView } from '@/lib/regalos'
import { CompraGrupalForm } from '@/components/CompraGrupalForm'
import { BotonEnviar } from '@/components/BotonEnviar'
import { Confirmar } from '@/components/Confirmar'
import { AvatarStack, Icon } from '@/components/ui'

type Ctx = { token: string; itemId: string }

/** Sin token ni deseo (desde Cuentas, que no pasa el link de la lista), solo vuelve a armar Cuentas. */
function Ocultos({ token, itemId, giftId }: Partial<Ctx> & { giftId?: string }) {
  return (
    <>
      {token && itemId && (
        <>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="itemId" value={itemId} />
        </>
      )}
      {giftId && <input type="hidden" name="giftId" value={giftId} />}
    </>
  )
}

/** Para entrar con Google y volver a este mismo deseo. */
function EntrarParaSumarte({ token, itemId, texto }: Ctx & { texto: string }) {
  return (
    <form action={async () => { 'use server'; await signIn('google', { redirectTo: `/l/${token}/item/${itemId}` }) }}>
      <button className="gr-btn w-full min-h-11 px-3.5 font-sans text-[15px] font-bold">{texto}</button>
      <p className="mt-1.5 text-xs text-gr-muted">Las cuentas del regalo necesitan saber quién sos: entrás con Google.</p>
    </form>
  )
}

/** "Armar regalo grupal" (o convertir la reserva propia en uno). */
export function ArmarRegaloGrupal({ token, itemId, logueado, convertir = false }: Ctx & { logueado: boolean; convertir?: boolean }) {
  const texto = convertir ? 'Hacerlo regalo grupal' : 'Armar regalo grupal'
  return (
    <div className="flex flex-col gap-1.5">
      {logueado ? (
        <form action={startGroupGiftAction}>
          <Ocultos token={token} itemId={itemId} />
          <BotonEnviar className="gr-btn w-full min-h-11 gap-2 px-3.5 font-sans text-[15px] font-bold">
            <Icon name="users" size={18} strokeWidth={2.4} />{texto}
          </BotonEnviar>
        </form>
      ) : <EntrarParaSumarte token={token} itemId={itemId} texto={texto} />}
      <p className="text-xs leading-snug text-gr-muted">Lo comprás vos, los demás se suman y te pagan su parte. Queda todo anotado en Cuentas.</p>
    </div>
  )
}

const linkSubrayado = 'flex min-h-11 cursor-pointer list-none items-center text-sm font-bold underline decoration-2 underline-offset-4 [&::-webkit-details-marker]:hidden'

/**
 * Para el encargado mientras está abierto: sacar a alguien que se sumó por error (se le avisa y no se vuelve a sumar solo),
 * y dejar volver a uno que sacó. En el deseo, o desde Cuentas (sin token ni deseo) si no lo puede terminar ahí.
 */
export function SacarDelRegalo({ giftId, otros, sacados, token, itemId }: Partial<Ctx> & {
  giftId: string
  /** Los que se sumaron, sin el encargado. */
  otros: { userId: string; nombre: string }[]
  sacados: { id: string; nombre: string }[]
}) {
  if (!otros.length && !sacados.length) return null
  const fila = 'flex min-h-12 items-center justify-between gap-2 py-1'
  return (
    <details className="group flex flex-col">
      <summary className={linkSubrayado}>¿Se sumó alguien que no va?</summary>
      <div className="mt-1 flex flex-col gap-1 rounded-2xl border border-gr-line bg-gr-surface px-3 py-2.5">
        {otros.length > 0 && (
          <>
            <p className="text-[13px] font-medium leading-snug">
              {/* no promete "salvo que lo dejes": con el deseo fuera de la lista (Cuentas) no hay dónde dejarlo volver */}
              Si lo sacás, no entra en la división, le avisamos que ya no está y no se puede volver a sumar por su cuenta.
            </p>
            <ul className="flex flex-col divide-y divide-dashed divide-gr-dot">
              {otros.map((m) => (
                <li key={m.userId} className={fila}>
                  <span className="min-w-0 text-[15px] font-semibold [overflow-wrap:anywhere]">{m.nombre}</span>
                  <form action={removeGroupGiftMemberAction}>
                    <Ocultos token={token} itemId={itemId} giftId={giftId} />
                    <input type="hidden" name="miembroId" value={m.userId} />
                    <BotonEnviar className="gr-btn min-h-11 px-2.5 font-sans text-[13px] font-bold">Sacar</BotonEnviar>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}
        {sacados.length > 0 && (
          <>
            <p className="text-[13px] font-medium leading-snug">Los que sacaste. Si fue sin querer, dejalos volver y se pueden sumar de nuevo.</p>
            <ul className="flex flex-col divide-y divide-dashed divide-gr-dot">
              {sacados.map((m) => (
                <li key={m.id} className={fila}>
                  <span className="min-w-0 text-[15px] font-semibold [overflow-wrap:anywhere]">{m.nombre}</span>
                  <form action={letBackGroupGiftMemberAction}>
                    <Ocultos token={token} itemId={itemId} giftId={giftId} />
                    <input type="hidden" name="miembroId" value={m.id} />
                    <BotonEnviar className="min-h-11 px-1 text-[13px] font-bold underline underline-offset-2">Dejar que vuelva</BotonEnviar>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  )
}

const CORRECCION: Record<string, string> = {
  ok: 'Listo, corregiste la compra. Al que le cambió la parte le avisamos.',
  ya_pagaron: 'No se corrigió: alguien ya figura como que te pagó. Para corregir, primero deshacé ese pago.',
  nada_que_corregir: 'No se corrigió: ya nadie te debe nada de ese regalo.',
}

/**
 * Cómo salió "Corregir la compra" (?correccion=, ver fixGroupGiftAction): el formulario ya no está para decirlo. cerrar: la
 * misma página sin el cartel, que si no queda en la dirección y vuelve con cada cambio.
 */
export function CartelCorreccion({ motivo, cerrar }: { motivo?: string; cerrar: string }) {
  if (!motivo || !Object.hasOwn(CORRECCION, motivo)) return null
  return (
    <div role="status" className="flex items-start gap-2 rounded-2xl bg-gr-accent py-1.5 pl-3.5 pr-1.5 text-sm font-semibold">
      <p className="flex-1 py-1.5">{CORRECCION[motivo]}</p>
      <Link href={cerrar} replace scroll={false} aria-label="Cerrar" className="-my-1 flex size-11 flex-none items-center justify-center">
        <Icon name="close" size={16} strokeWidth={3} />
      </Link>
    </div>
  )
}

export function RegaloGrupal({ regalo, token, itemId, titulo, ownerNombre, precio, nota, logueado, ocupado }: Ctx & {
  regalo: RegaloView
  titulo: string
  ownerNombre: string
  precio: number | null
  /** Lo que anotó el encargado al comprarlo. */
  nota?: string | null
  logueado: boolean
  /** Por qué no se puede sumar (ya lo reservó o compró suelto, o está en otro regalo de este deseo). */
  ocupado?: string | null
}) {
  // al que sacó el encargado no se le ofrece volver con un toque (ver sumarseARegalo)
  const noSeSuma = regalo.meSacaron
    ? `${regalo.encargado.nombre} te sacó de este regalo. Si vas a poner, hablalo: te puede dejar volver.`
    : ocupado
  const n = regalo.miembros.length
  const nombres = regalo.miembros.map((m) => (m.esYo ? 'vos' : m.nombre))
  const encargado = regalo.soyEncargado ? 'Lo organizás vos' : `Lo organiza ${regalo.encargado.nombre}`
  // cambia con cada corrección: el formulario vuelve a arrancar cerrado y con lo nuevo
  const compra = `${regalo.montoTotal}:${regalo.miembros.map((m) => m.monto).join(',')}`

  if (regalo.estado === 'comprado' && !regalo.soyParte) {
    return (
      <p className="flex items-start gap-2 text-sm font-medium">
        <span className="mt-px flex size-5 flex-none items-center justify-center rounded-full bg-gr-accent">
          <Icon name="check" size={11} strokeWidth={3} />
        </span>
        Regalo grupal de {juntarNombres(nombres)}: ya lo compraron.
      </p>
    )
  }

  return (
    <section aria-label="Regalo grupal" className="gr-sticker flex flex-col gap-3 p-3.5">
      <div className="flex items-center gap-3">
        <AvatarStack nombres={regalo.miembros.map((m) => m.nombre)} size={36} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight font-extrabold">
            Regalo grupal{regalo.estado === 'comprado' && regalo.montoTotal ? ` · ${pesos(regalo.montoTotal)}` : ''}
          </p>
          <p className="text-[13px] font-medium leading-snug">
            {regalo.estado === 'comprado' ? (regalo.soyEncargado ? 'Lo compraste vos' : `Lo compró ${regalo.encargado.nombre}`) : encargado}
            {' · '}{n} {n === 1 ? 'persona' : 'personas'}
          </p>
        </div>
      </div>

      {regalo.estado === 'abierto' ? (
        <>
          <p className="text-sm font-medium leading-snug">
            {n === 1 ? `Por ahora ${nombres[0] === 'vos' ? 'estás solo vos' : `está ${nombres[0]}`}.` : `Están ${juntarNombres(nombres)}.`}
            {precio && (regalo.soyParte
              ? ` Si quedan así, sale ~${pesos(Math.ceil(precio / n))} cada uno.`
              : !noSeSuma && ` Si te sumás, son ${n + 1}: ~${pesos(Math.ceil(precio / (n + 1)))} cada uno.`)}
          </p>

          {!regalo.soyParte && (noSeSuma ? <p className="text-xs font-semibold leading-snug text-gr-muted">{noSeSuma}</p> : logueado ? (
            <form action={joinGroupGiftAction}>
              <Ocultos token={token} itemId={itemId} giftId={regalo.id} />
              <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">Me sumo</BotonEnviar>
            </form>
          ) : <EntrarParaSumarte token={token} itemId={itemId} texto="Me sumo" />)}

          {regalo.soyParte && !regalo.soyEncargado && (
            <>
              <p className="rounded-2xl bg-gr-soft px-3 py-2.5 text-sm leading-snug">
                Estás adentro. Cuando {regalo.encargado.nombre} lo compre, te va a aparecer cuánto le debés.
              </p>
              <form action={leaveGroupGiftAction}>
                <Ocultos token={token} itemId={itemId} giftId={regalo.id} />
                <BotonEnviar className="min-h-11 text-sm font-bold underline decoration-2 underline-offset-4">Me bajo</BotonEnviar>
              </form>
            </>
          )}

          {regalo.soyEncargado && (
            <>
              <a target="_blank" className="gr-btn min-h-11 gap-2 px-3.5 font-sans text-[15px] font-bold"
                 href={`https://wa.me/?text=${encodeURIComponent(`Armé un regalo grupal para ${ownerNombre}: "${titulo}". ¿Te sumás? ${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${token}/item/${itemId}`)}`}>
                <Icon name="chat" size={18} strokeWidth={2.4} />Invitar por WhatsApp
              </a>
              <details className="group flex flex-col">
                <summary className="gr-btn-primary gr-btn--sm flex w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  Ya lo compré: dividir
                </summary>
                <div className="mt-3 flex flex-col gap-2">
                  <CompraGrupalForm giftId={regalo.id} token={token} itemId={itemId} sugerido={precio}
                                    miembros={regalo.miembros.map(({ userId, nombre, esYo }) => ({ userId, nombre, esYo }))} />
                </div>
              </details>
              <SacarDelRegalo giftId={regalo.id} token={token} itemId={itemId} sacados={regalo.sacados}
                              otros={regalo.miembros.filter((m) => !m.esEncargado)} />
              {/* cancelarlo suelta el deseo (también si antes era una reserva suya): que no lo descubra después */}
              <Confirmar resumen="Cancelar el regalo grupal" boton="Sí, cancelarlo" action={cancelGroupGiftAction}
                         ocultos={{ token, itemId, giftId: regalo.id }}>
                El deseo vuelve a quedar libre para cualquiera{n > 1 ? ' y les avisamos a los que se sumaron' : ''}. Si lo
                querés regalar solo, después lo reservás de nuevo.
              </Confirmar>
            </>
          )}
        </>
      ) : (
        <>
          {/* Comprado: quién puso cuánto y quién ya le pagó al encargado, a lo Splitwise */}
          {nota && <p className="text-sm"><span className="font-bold">Compró:</span> {nota}</p>}
          <ul className="flex flex-col divide-y divide-dashed divide-gr-dot rounded-2xl border border-gr-line bg-gr-surface px-3">
            {regalo.miembros.map((m) => {
              const puedoMarcar = !m.esEncargado && (regalo.soyEncargado || m.esYo)
              return (
                <li key={m.userId} className="flex min-h-12 items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 text-[15px] font-semibold [overflow-wrap:anywhere]">
                    {m.esYo ? 'Vos' : m.nombre}
                    {m.esEncargado && <span className="block text-xs font-medium text-gr-muted">{m.esYo ? 'compraste el regalo' : 'compró el regalo'}</span>}
                  </span>
                  <span className="font-display text-lg font-extrabold tabular-nums">{pesos(m.monto ?? 0)}</span>
                  <span className={`flex-none rounded-full border border-gr-line px-2 py-0.5 text-xs font-bold ${m.pagado ? 'bg-gr-accent' : 'bg-gr-ink text-gr-bg'}`}>
                    {m.esEncargado ? 'Puso' : m.pagado ? 'Pagó ✓' : 'Debe'}
                  </span>
                  {puedoMarcar && (
                    <form action={markPaidAction}>
                      <Ocultos token={token} itemId={itemId} giftId={regalo.id} />
                      <input type="hidden" name="deudorId" value={m.userId} />
                      <input type="hidden" name="pagado" value={m.pagado ? '0' : '1'} />
                      {/* la parte que ve: si justo la corrigieron, no queda paga una que no vio */}
                      <input type="hidden" name="monto" value={m.monto ?? 0} />
                      <BotonEnviar className={m.pagado ? 'min-h-11 px-1 text-xs font-bold underline underline-offset-2'
                        : 'gr-btn min-h-11 px-2.5 font-sans text-[13px] font-bold'}>
                        {m.pagado ? 'Deshacer' : m.esYo ? 'Ya le pagué' : 'Me pagó'}
                      </BotonEnviar>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
          {/* un cero de más, o el precio de la lista que no era: mientras nadie le pagó, se arregla */}
          {regalo.corregible && (
            <details key={compra} className="group flex flex-col">
              <summary className={linkSubrayado}>Corregir la compra</summary>
              <div className="mt-1 flex flex-col gap-2">
                <p className="text-xs font-semibold text-gr-muted">Mientras nadie te pague, podés cambiar el total o cómo se dividió.</p>
                <CompraGrupalForm giftId={regalo.id} token={token} itemId={itemId} sugerido={null}
                                  miembros={regalo.miembros.map(({ userId, nombre, esYo }) => ({ userId, nombre, esYo }))}
                                  corregir={{
                                    total: regalo.montoTotal ?? 0, nota: nota ?? null,
                                    partes: Object.fromEntries(regalo.miembros.map((m) => [m.userId, m.monto ?? 0])),
                                  }} />
              </div>
            </details>
          )}
          <Link href="/cuentas" className="flex min-h-11 items-center gap-1 self-start text-sm font-bold underline decoration-2 underline-offset-4">
            Ver todas mis cuentas <Icon name="chevron" size={16} strokeWidth={2.6} />
          </Link>
        </>
      )}
    </section>
  )
}
