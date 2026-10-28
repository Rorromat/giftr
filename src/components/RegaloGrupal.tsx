import Link from 'next/link'
import { signIn } from '@/auth'
import {
  cancelGroupGiftAction, joinGroupGiftAction, leaveGroupGiftAction, letBackGroupGiftMemberAction, markPaidAction, removeGroupGiftMemberAction,
  startGroupGiftAction,
} from '@/app/actions'
import { juntarNombres } from '@/lib/groups'
import { dividir, plata, type Moneda } from '@/lib/pesos'
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
      <button className="gr-btn w-full min-h-11 px-3.5 text-[15px]">{texto}</button>
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
          <BotonEnviar className="gr-btn w-full min-h-11 gap-2 px-3.5 text-[15px]">
            <Icon name="users" size={18} strokeWidth={2} />{texto}
          </BotonEnviar>
        </form>
      ) : <EntrarParaSumarte token={token} itemId={itemId} texto={texto} />}
      <p className="text-xs leading-snug text-gr-muted">Lo comprás vos, los demás se suman y te pagan su parte. Queda todo anotado en Cuentas.</p>
    </div>
  )
}

const linkSubrayado = 'flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold underline underline-offset-4 [&::-webkit-details-marker]:hidden'

/**
 * Para el encargado: sacar a alguien que se sumó por error (se le avisa y no se vuelve a sumar solo), y dejar volver a uno
 * que sacó. En el deseo, o desde Cuentas (sin token ni deseo) si no lo puede terminar ahí. comprado: el que sale deja su
 * parte (se vuelve a dividir, ver redividir); al que ya puso algo, primero se le deshace el pago.
 */
export function SacarDelRegalo({ giftId, otros, sacados, token, itemId, comprado = false }: Partial<Ctx> & {
  giftId: string
  /** Los que se sumaron, sin el encargado. puso: ya le dio algo. */
  otros: { userId: string; nombre: string; puso?: boolean }[]
  sacados: { id: string; nombre: string }[]
  comprado?: boolean
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
              {comprado ? 'Si lo sacás, sale de la división y se vuelve a dividir entre los que quedan' : 'Si lo sacás, no entra en la división'}
              , le avisamos que ya no está y no se puede volver a sumar por su cuenta.
            </p>
            <ul className="flex flex-col divide-y divide-dashed divide-gr-dot">
              {otros.map((m) => (
                <li key={m.userId} className={fila}>
                  <span className="min-w-0 text-[15px] font-semibold [overflow-wrap:anywhere]">{m.nombre}</span>
                  {m.puso ? (
                    <span className="max-w-40 text-right text-xs font-semibold leading-snug text-gr-muted">Ya te dio plata: primero deshacé su pago</span>
                  ) : (
                    <form action={removeGroupGiftMemberAction}>
                      <Ocultos token={token} itemId={itemId} giftId={giftId} />
                      <input type="hidden" name="miembroId" value={m.userId} />
                      <BotonEnviar className="gr-btn min-h-11 px-2.5 text-[13px]">Sacar</BotonEnviar>
                    </form>
                  )}
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
                    <BotonEnviar className="min-h-11 px-1 text-[13px] font-semibold underline underline-offset-4">Dejar que vuelva</BotonEnviar>
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
  nada_que_corregir: 'No se corrigió: ya está todo saldado en ese regalo.',
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

/**
 * "Invitar por WhatsApp", abierto o ya comprado (se pueden sumar después: ver sumarseARegalo). El de una sorpresa, sin
 * decir qué es: el mensaje puede terminar en un chat donde está quien la recibe.
 */
function InvitarPorWhatsApp({ token, itemId, titulo, ownerNombre, sorpresa, comprado }: Ctx & {
  titulo: string; ownerNombre: string; sorpresa: boolean; comprado: boolean
}) {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? ''
  const texto = sorpresa
    ? `${comprado ? 'Compré' : 'Estoy armando'} una sorpresa para ${ownerNombre} en GiftR 🤫 ¿Te sumás? ${base}/sorpresa/${token}`
    : comprado
      ? `Compré "${titulo}" para ${ownerNombre} y lo dividimos entre los que se sumen. ¿Te sumás? ${base}/l/${token}/item/${itemId}`
      : `Armé un regalo grupal para ${ownerNombre}: "${titulo}". ¿Te sumás? ${base}/l/${token}/item/${itemId}`
  return (
    <a target="_blank" className="gr-btn min-h-11 gap-2 px-3.5 text-[15px]" href={`https://wa.me/?text=${encodeURIComponent(texto)}`}>
      <Icon name="chat" size={18} strokeWidth={2} />Invitar por WhatsApp
    </a>
  )
}

export function RegaloGrupal({
  regalo, token, itemId, titulo, ownerNombre, precio, monedaPrecio = 'ARS', nota, logueado, ocupado, invitar, sinContestar = [], sorpresa = false,
}: Ctx & {
  regalo: RegaloView
  titulo: string
  ownerNombre: string
  precio: number | null
  /** en qué está el precio del deseo (para la cuenta de cuánto sale cada uno y para arrancar la compra) */
  monedaPrecio?: Moneda
  /** Lo que anotó el encargado al comprarlo. */
  nota?: string | null
  logueado: boolean
  /** Por qué no se puede sumar (ya lo reservó o compró suelto, o está en otro regalo de este deseo). */
  ocupado?: string | null
  /** Para el que lo organiza: a quiénes les propuso dividirlo y qué contestaron, abierto o comprado (ver InvitadosDelRegalo). */
  invitar?: React.ReactNode
  /** Para el que lo organiza, mientras está abierto: a los que se lo propuso y no contestaron (si se suman después, se redivide). */
  sinContestar?: string[]
  /** El regalo de una sorpresa (ver sorpresas.ts): el link es el de la sorpresa, que no dice qué es, y cancelarlo la borra. */
  sorpresa?: boolean
}) {
  // al que sacó el encargado no se le ofrece volver con un toque (ver sumarseARegalo)
  const noSeSuma = regalo.meSacaron
    ? `${regalo.encargado.nombre} te sacó de este regalo. Si vas a poner, hablalo: te puede dejar volver.`
    : ocupado
  const n = regalo.miembros.length
  const nombres = regalo.miembros.map((m) => (m.esYo ? 'vos' : m.nombre))
  const encargado = regalo.soyEncargado ? 'Lo organizás vos' : `Lo organiza ${regalo.encargado.nombre}`
  const comprado = regalo.estado === 'comprado'
  const p = (x: number) => plata(x, regalo.moneda)
  // cambia con cada corrección: el formulario vuelve a arrancar cerrado y con lo nuevo
  const compra = `${regalo.montoTotal}:${regalo.moneda}:${regalo.miembros.map((m) => m.monto).join(',')}`
  // "A mano": el que llega entra sin parte y la del que se va queda para el encargado (ver redividir)
  const aMano = comprado && !!regalo.montoTotal && dividir(regalo.montoTotal, n).some((x, i) => x !== regalo.miembros[i].monto)
  const sinParte = aMano ? regalo.miembros.filter((m) => !m.esEncargado && !m.monto).map((m) => m.nombre) : []
  const yo = regalo.miembros.find((m) => m.esYo)
  const meSumo = !regalo.soyParte && (noSeSuma ? <p className="text-xs font-semibold leading-snug text-gr-muted">{noSeSuma}</p> : logueado ? (
    <form action={joinGroupGiftAction}>
      <Ocultos token={token} itemId={itemId} giftId={regalo.id} />
      <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">Me sumo</BotonEnviar>
    </form>
  ) : <EntrarParaSumarte token={token} itemId={itemId} texto="Me sumo" />)

  // ya comprado y no se puede sumar (ya tiene el suyo, o lo sacaron): en una línea
  if (comprado && !regalo.soyParte && noSeSuma) {
    return (
      <div className="flex flex-col gap-1">
        <p className="flex items-start gap-2 text-sm font-medium">
          <span className="mt-px flex size-5 flex-none items-center justify-center rounded-full bg-gr-accent">
            <Icon name="check" size={11} strokeWidth={3} />
          </span>
          Regalo grupal de {juntarNombres(nombres)}: ya lo compraron.
        </p>
        {regalo.meSacaron && <p className="text-xs font-semibold leading-snug text-gr-muted">{noSeSuma}</p>}
      </div>
    )
  }

  return (
    <section aria-label="Regalo grupal" className="gr-card flex flex-col gap-3 p-3.5">
      <div className="flex items-center gap-3">
        <AvatarStack nombres={regalo.miembros.map((m) => m.nombre)} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-tight font-semibold">
            Regalo grupal{comprado && regalo.montoTotal ? ` · ${p(regalo.montoTotal)}` : ''}
          </p>
          <p className="text-[13px] font-medium leading-snug">
            {comprado ? (regalo.soyEncargado ? 'Lo compraste vos' : `Lo compró ${regalo.encargado.nombre}`) : encargado}
            {' · '}{n} {n === 1 ? 'persona' : 'personas'}
          </p>
        </div>
      </div>

      {!comprado ? (
        <>
          <p className="text-sm font-medium leading-snug">
            {n === 1 ? `Por ahora ${nombres[0] === 'vos' ? 'estás solo vos' : `está ${nombres[0]}`}.` : `Están ${juntarNombres(nombres)}.`}
            {precio && (regalo.soyParte
              ? ` Si quedan así, sale ~${plata(Math.ceil(precio / n), monedaPrecio)} cada uno.`
              : !noSeSuma && ` Si te sumás, son ${n + 1}: ~${plata(Math.ceil(precio / (n + 1)), monedaPrecio)} cada uno.`)}
          </p>

          {meSumo}

          {regalo.soyParte && !regalo.soyEncargado && (
            <>
              <p className="rounded-2xl bg-gr-soft px-3 py-2.5 text-sm leading-snug">
                Estás adentro. Cuando {regalo.encargado.nombre} lo compre, te va a aparecer cuánto le debés.
              </p>
              <form action={leaveGroupGiftAction}>
                <Ocultos token={token} itemId={itemId} giftId={regalo.id} />
                <BotonEnviar className="min-h-11 text-sm font-semibold underline underline-offset-4">Me bajo</BotonEnviar>
              </form>
            </>
          )}

          {regalo.soyEncargado && (
            <>
              {invitar}
              <InvitarPorWhatsApp token={token} itemId={itemId} titulo={titulo} ownerNombre={ownerNombre} sorpresa={sorpresa} comprado={false} />
              <details className="group flex flex-col">
                <summary className="gr-btn-primary gr-btn--sm flex w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  Ya lo compré: dividir
                </summary>
                <div className="mt-3 flex flex-col gap-2">
                  {sinContestar.length > 0 && (
                    <p className="rounded-2xl bg-gr-soft px-3 py-2.5 text-sm leading-snug">
                      {juntarNombres(sinContestar)} todavía no {sinContestar.length === 1 ? 'contestó' : 'contestaron'}: se divide entre
                      los que ya están, y si después {sinContestar.length === 1 ? 'se suma' : 'se suman'}, se vuelve a dividir.
                    </p>
                  )}
                  <CompraGrupalForm giftId={regalo.id} token={token} itemId={itemId} sugerido={precio} monedaSugerida={monedaPrecio}
                                    miembros={regalo.miembros.map(({ userId, nombre, esYo }) => ({ userId, nombre, esYo }))} />
                </div>
              </details>
              <SacarDelRegalo giftId={regalo.id} token={token} itemId={itemId} sacados={regalo.sacados}
                              otros={regalo.miembros.filter((m) => !m.esEncargado)} />
              {/* cancelarlo suelta el deseo (también si antes era una reserva suya): que no lo descubra después */}
              {sorpresa ? (
                <Confirmar resumen="Cancelar la sorpresa" boton="Sí, cancelarla" action={cancelGroupGiftAction}
                           ocultos={{ token, itemId, giftId: regalo.id }}>
                  La sorpresa se borra{n > 1 ? ' y les avisamos a los que se sumaron' : ''}.
                </Confirmar>
              ) : (
                <Confirmar resumen="Cancelar el regalo grupal" boton="Sí, cancelarlo" action={cancelGroupGiftAction}
                           ocultos={{ token, itemId, giftId: regalo.id }}>
                  El deseo vuelve a quedar libre para cualquiera{n > 1 ? ' y les avisamos a los que se sumaron' : ''}. Si lo
                  querés regalar solo, después lo reservás de nuevo.
                </Confirmar>
              )}
            </>
          )}
        </>
      ) : !regalo.soyParte ? (
        <>
          {/* ya comprado: "sumame, después te pago" (ver sumarseARegalo), sabiendo cuánto le toca */}
          <p className="text-sm font-medium leading-snug">
            {n === 1 ? `Ya lo compró ${nombres[0]}.` : `Ya lo compraron ${juntarNombres(nombres)}.`}{' '}
            {regalo.parteSiTeSumas != null
              ? `Si te sumás, se vuelve a dividir entre ${n + 1}: te tocan ${p(regalo.parteSiTeSumas)}.`
              : `Lo dividieron a mano: si te sumás, ${regalo.encargado.nombre} te pone tu parte.`}
          </p>
          {meSumo}
        </>
      ) : (
        <>
          {/* Comprado: quién puso cuánto y quién ya le pagó al encargado (o a quién le devuelve), a lo Splitwise */}
          {nota && <p className="text-sm"><span className="font-semibold">Compró:</span> {nota}</p>}
          <ul className="flex flex-col divide-y divide-dashed divide-gr-dot rounded-2xl border border-gr-line bg-gr-surface px-3">
            {regalo.miembros.map((m) => {
              const puedoMarcar = !m.esEncargado && (regalo.soyEncargado || m.esYo)
              const saldo = m.saldo ?? 0
              // saldar lo que falta: lo paga el que se sumó, o se lo devuelve el encargado
              const saldar = saldo > 0 ? (m.esYo ? 'Ya le pagué' : 'Me pagó') : saldo < 0 ? (m.esYo ? 'Me devolvió' : 'Ya le devolví') : null
              const estado = m.esEncargado ? 'Puso' : saldo > 0 ? (m.puso ? `Debe ${p(saldo)}` : 'Debe') : saldo < 0 ? `A devolver ${p(-saldo)}` : 'Pagó ✓'
              const marcar = (pagado: boolean, texto: string) => (
                <form action={markPaidAction}>
                  <Ocultos token={token} itemId={itemId} giftId={regalo.id} />
                  <input type="hidden" name="deudorId" value={m.userId} />
                  <input type="hidden" name="pagado" value={pagado ? '1' : '0'} />
                  {/* la parte que ve: si justo la corrigieron o se volvió a dividir, no queda saldada una que no vio */}
                  <input type="hidden" name="monto" value={m.monto ?? 0} />
                  <BotonEnviar className={pagado ? 'gr-btn min-h-11 px-2.5 text-[13px]' : 'min-h-11 px-1 text-xs font-semibold underline underline-offset-4'}>
                    {texto}
                  </BotonEnviar>
                </form>
              )
              return (
                <li key={m.userId} className="flex flex-col py-1.5">
                  <div className="flex min-h-12 items-center gap-2">
                    <span className="min-w-0 flex-1 text-[15px] font-semibold [overflow-wrap:anywhere]">
                      {m.esYo ? 'Vos' : m.nombre}
                      {m.esEncargado && <span className="block text-xs font-medium text-gr-muted">{m.esYo ? 'compraste el regalo' : 'compró el regalo'}</span>}
                    </span>
                    <span className="text-lg font-semibold tabular-nums">{p(m.monto ?? 0)}</span>
                    <span className={`flex-none rounded-full border border-gr-line px-2 py-0.5 text-xs font-semibold ${m.pagado ? 'bg-gr-accent' : 'bg-gr-brand text-gr-bg'}`}>
                      {estado}
                    </span>
                    {puedoMarcar && (saldar ? marcar(true, saldar) : m.puso && marcar(false, 'Deshacer'))}
                  </div>
                  {/* pagó y después le cambió la parte: lo que figura que puso también se deshace */}
                  {puedoMarcar && saldar && m.puso && <div className="flex justify-end">{marcar(false, 'Deshacer el pago')}</div>}
                </li>
              )
            })}
          </ul>

          {regalo.soyParte && !regalo.soyEncargado && (yo?.puso ? (
            <p className="text-xs font-semibold leading-snug text-gr-muted">
              Si no vas a poner, que {regalo.encargado.nombre} te devuelva lo que le diste y deshagan el pago: después te podés bajar.
            </p>
          ) : (
            <Confirmar resumen="Me bajo" boton="Sí, me bajo" action={leaveGroupGiftAction} ocultos={{ token, itemId, giftId: regalo.id }}>
              {regalo.encargado.nombre} ya lo compró: si te bajás, {aMano ? `tu parte queda a cargo de ${regalo.encargado.nombre}` : 'se vuelve a dividir entre los que quedan'} y
              les avisamos.
            </Confirmar>
          ))}

          {regalo.soyEncargado && (
            <>
              {invitar}
              <InvitarPorWhatsApp token={token} itemId={itemId} titulo={titulo} ownerNombre={ownerNombre} sorpresa={sorpresa} comprado />
              <SacarDelRegalo giftId={regalo.id} token={token} itemId={itemId} sacados={regalo.sacados} comprado
                              otros={regalo.miembros.filter((m) => !m.esEncargado)} />
            </>
          )}
          {/* el que se sumó a uno dividido a mano entra en 0: que no quede así sin querer */}
          {regalo.soyEncargado && sinParte.length > 0 && (
            <p className="rounded-2xl bg-gr-soft px-3 py-2.5 text-sm leading-snug">
              {juntarNombres(sinParte)} en {p(0)}: lo dividiste a mano, así que si {sinParte.length === 1 ? 'va' : 'van'} a poner, corregí la compra.
            </p>
          )}
          {/* un cero de más, el precio de la lista que no era, la parte del que se sumó: se arregla */}
          {regalo.corregible && (
            <details key={compra} className="group flex flex-col">
              <summary className={linkSubrayado}>Corregir la compra</summary>
              <div className="mt-1 flex flex-col gap-2">
                <p className="text-xs font-semibold text-gr-muted">
                  Podés cambiar el total o cómo se dividió. Lo que ya te pagaron queda: si a alguien le toca menos, se lo devolvés.
                </p>
                <CompraGrupalForm giftId={regalo.id} token={token} itemId={itemId} sugerido={null}
                                  miembros={regalo.miembros.map(({ userId, nombre, esYo }) => ({ userId, nombre, esYo }))}
                                  corregir={{
                                    total: regalo.montoTotal ?? 0, moneda: regalo.moneda ?? 'ARS', nota: nota ?? null,
                                    partes: Object.fromEntries(regalo.miembros.map((m) => [m.userId, m.monto ?? 0])),
                                  }} />
              </div>
            </details>
          )}
          <Link href="/cuentas" className="flex min-h-11 items-center gap-1 self-start text-sm font-semibold underline underline-offset-4">
            Ver todas mis cuentas <Icon name="chevron" size={16} strokeWidth={2.2} />
          </Link>
        </>
      )}
    </section>
  )
}
