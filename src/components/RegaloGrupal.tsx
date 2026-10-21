import Link from 'next/link'
import { signIn } from '@/auth'
import {
  cancelGroupGiftAction, joinGroupGiftAction, leaveGroupGiftAction, markPaidAction, removeGroupGiftMemberAction, startGroupGiftAction,
} from '@/app/actions'
import { juntarNombres } from '@/lib/groups'
import { pesos } from '@/lib/pesos'
import type { RegaloView } from '@/lib/regalos'
import { CompraGrupalForm } from '@/components/CompraGrupalForm'
import { BotonEnviar } from '@/components/BotonEnviar'
import { Confirmar } from '@/components/Confirmar'
import { AvatarStack, Icon } from '@/components/ui'

type Ctx = { token: string; itemId: string }

function Ocultos({ token, itemId, giftId }: Ctx & { giftId?: string }) {
  return (
    <>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="itemId" value={itemId} />
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

/** Para el encargado mientras está abierto: sacar a alguien que se sumó por error (se le avisa). */
function SacarDelRegalo({ regalo, token, itemId }: Ctx & { regalo: RegaloView }) {
  return (
    <details className="group flex flex-col">
      <summary className={linkSubrayado}>¿Se sumó alguien que no va?</summary>
      <div className="mt-1 flex flex-col gap-1 rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface px-3 py-2.5">
        <p className="text-[13px] font-medium leading-snug">Si lo sacás, no entra en la división y le avisamos que ya no está.</p>
        <ul className="flex flex-col divide-y-2 divide-dashed divide-gr-dot">
          {regalo.miembros.filter((m) => !m.esEncargado).map((m) => (
            <li key={m.userId} className="flex min-h-12 items-center justify-between gap-2 py-1">
              <span className="min-w-0 text-[15px] font-semibold [overflow-wrap:anywhere]">{m.nombre}</span>
              <form action={removeGroupGiftMemberAction}>
                <Ocultos token={token} itemId={itemId} giftId={regalo.id} />
                <input type="hidden" name="miembroId" value={m.userId} />
                <BotonEnviar className="gr-btn min-h-11 px-2.5 font-sans text-[13px] font-bold">Sacar</BotonEnviar>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </details>
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
  const n = regalo.miembros.length
  const nombres = regalo.miembros.map((m) => (m.esYo ? 'vos' : m.nombre))
  const encargado = regalo.soyEncargado ? 'Lo organizás vos' : `Lo organiza ${regalo.encargado.nombre}`
  // cambia con cada corrección: el formulario vuelve a arrancar cerrado y con lo nuevo
  const compra = `${regalo.montoTotal}:${regalo.miembros.map((m) => m.monto).join(',')}`

  if (regalo.estado === 'comprado' && !regalo.soyParte) {
    return (
      <p className="flex items-start gap-2 text-sm font-medium">
        <span className="mt-px flex size-5 flex-none items-center justify-center rounded-full border-2 border-gr-ink bg-gr-accent">
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
              : !ocupado && ` Si te sumás, son ${n + 1}: ~${pesos(Math.ceil(precio / (n + 1)))} cada uno.`)}
          </p>

          {!regalo.soyParte && (ocupado ? <p className="text-xs font-semibold leading-snug text-gr-muted">{ocupado}</p> : logueado ? (
            <form action={joinGroupGiftAction}>
              <Ocultos token={token} itemId={itemId} giftId={regalo.id} />
              <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">Me sumo</BotonEnviar>
            </form>
          ) : <EntrarParaSumarte token={token} itemId={itemId} texto="Me sumo" />)}

          {regalo.soyParte && !regalo.soyEncargado && (
            <>
              <p className="rounded-2xl border-[2.5px] border-dashed border-gr-ink px-3 py-2.5 text-sm leading-snug">
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
              {n > 1 && <SacarDelRegalo regalo={regalo} token={token} itemId={itemId} />}
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
          <ul className="flex flex-col divide-y-2 divide-dashed divide-gr-dot rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface px-3">
            {regalo.miembros.map((m) => {
              const puedoMarcar = !m.esEncargado && (regalo.soyEncargado || m.esYo)
              return (
                <li key={m.userId} className="flex min-h-12 items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 text-[15px] font-semibold [overflow-wrap:anywhere]">
                    {m.esYo ? 'Vos' : m.nombre}
                    {m.esEncargado && <span className="block text-xs font-medium text-gr-muted">{m.esYo ? 'compraste el regalo' : 'compró el regalo'}</span>}
                  </span>
                  <span className="font-display text-lg font-extrabold tabular-nums">{pesos(m.monto ?? 0)}</span>
                  <span className={`flex-none rounded-full border-2 border-gr-ink px-2 py-0.5 text-xs font-bold ${m.pagado ? 'bg-gr-accent' : 'bg-gr-ink text-gr-bg'}`}>
                    {m.esEncargado ? 'Puso' : m.pagado ? 'Pagó ✓' : 'Debe'}
                  </span>
                  {puedoMarcar && (
                    <form action={markPaidAction}>
                      <Ocultos token={token} itemId={itemId} giftId={regalo.id} />
                      <input type="hidden" name="deudorId" value={m.userId} />
                      <input type="hidden" name="pagado" value={m.pagado ? '0' : '1'} />
                      <button className={m.pagado ? 'min-h-11 px-1 text-xs font-bold underline underline-offset-2'
                        : 'gr-btn min-h-11 px-2.5 font-sans text-[13px] font-bold'}>
                        {m.pagado ? 'Deshacer' : m.esYo ? 'Ya le pagué' : 'Me pagó'}
                      </button>
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
