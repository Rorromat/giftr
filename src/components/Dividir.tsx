import { dividirRegaloAction, invitarAmigosAction, responderInvitacionAction } from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { AvatarSticker, Icon, ItemPhoto } from '@/components/ui'
import type { Persona } from '@/lib/amigos'
import type { Invitacion, Invitado } from '@/lib/invitaciones'
import Link from 'next/link'
import { Buscador } from '@/components/Buscador'
import { paraBuscar } from '@/lib/buscar'

// "Lo dividimos": elegir amigos para proponerles dividir un regalo, a quiénes se invitó (para el que lo organiza) y las
// propuestas que te llegaron (Inicio). Siempre en partes iguales entre los que se sumen.

/** Con más amigos que esto, para elegir aparece el buscador. */
const BUSCAR_DESDE = 7

/** Los amigos para tildar: cada uno con su foto. Con muchos, un buscador arriba (lo tildado y escondido se manda igual). */
export function ElegirAmigos({ amigos, ambito }: { amigos: Persona[]; ambito: string }) {
  return (
    <>
      {amigos.length >= BUSCAR_DESDE && <Buscador ambito={ambito} placeholder="Buscar un amigo" vacio="No tenés un amigo con «%s»." />}
      <ul id={ambito} className="flex flex-col divide-y divide-gr-line rounded-2xl border border-gr-line bg-gr-surface px-3">
        {amigos.map((a) => (
          <li key={a.id} data-buscar={paraBuscar(`${a.nombre} ${a.usuario ?? ''}`)}>
          <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
            <AvatarSticker nombre={a.nombre} foto={a.foto} size={36} />
            <span className="min-w-0 flex-1 text-[15px] leading-tight font-semibold [overflow-wrap:anywhere]">{a.nombre}</span>
            <input type="checkbox" name="amigo" value={a.id} className="size-5 flex-none accent-[var(--gr-ink)]" />
          </label>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * "Lo dividimos", en el deseo: con quiénes (sus amigos, nunca los del cumple) y armarlo. Les llega la propuesta y cada uno
 * elige si se suma. Sin amigos en GiftR, se arma igual y se suman con el link.
 */
export function FormDividir({ token, itemId, amigos }: { token: string; itemId: string; amigos: Persona[] }) {
  return (
    <form action={dividirRegaloAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="itemId" value={itemId} />
      {amigos.length > 0 ? (
        <>
          <p className="text-sm font-semibold">¿Con quién lo dividís?</p>
          <ElegirAmigos amigos={amigos} ambito="amigos-dividir" />
          <p className="text-xs leading-snug text-gr-muted">
            A cada uno le llega la propuesta y elige si se suma. Se divide en partes iguales entre los que se sumen; también se
            pueden sumar otros con el link.
          </p>
        </>
      ) : (
        <p className="text-xs leading-snug text-gr-muted">
          Todavía no tenés amigos en GiftR para proponérselo: armalo igual y pasá el link (se divide en partes iguales entre
          los que se sumen), o <Link href="/gente/agregar" className="font-semibold underline underline-offset-2">sumá amigos</Link>.
        </p>
      )}
      <BotonEnviar pendiente="Armando…" className="gr-btn-primary w-full min-h-12">
        {amigos.length > 0 ? 'Proponerles dividirlo' : 'Armar el regalo'}
      </BotonEnviar>
    </form>
  )
}

const ESTADOS: Record<Invitado['estado'], string> = { esperando: 'Esperando', se_sumo: 'Se sumó ✓', no_puede: 'No puede', se_bajo: 'Se bajó' }

/** Para el que organiza: a quiénes les propuso dividirlo y qué contestaron; y proponérselo a más amigos. */
export function InvitadosDelRegalo({ token, itemId, giftId, invitados, paraInvitar }: {
  token: string; itemId: string; giftId: string; invitados: Invitado[]; paraInvitar: Persona[]
}) {
  if (!invitados.length && !paraInvitar.length) return null
  return (
    <div className="flex flex-col gap-2">
      {invitados.length > 0 && (
        <>
          <p className="gr-label">Les propusiste dividirlo</p>
          <ul className="flex flex-col divide-y divide-gr-line rounded-2xl border border-gr-line px-3">
            {invitados.map((i) => (
              <li key={i.persona.id} className="flex min-h-12 items-center gap-3 py-1.5">
                <AvatarSticker nombre={i.persona.nombre} foto={i.persona.foto} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{i.persona.nombre}</span>
                <span className={`flex-none text-[13px] font-semibold ${i.estado === 'se_sumo' ? '' : 'text-gr-muted'}`}>{ESTADOS[i.estado]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {paraInvitar.length > 0 && (
        <details className="group flex flex-col">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold underline underline-offset-4 [&::-webkit-details-marker]:hidden">
            <Icon name="users" size={17} />Proponérselo a más amigos
          </summary>
          <form action={invitarAmigosAction} className="mt-2 flex flex-col gap-2.5">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="giftId" value={giftId} />
            <ElegirAmigos amigos={paraInvitar} ambito="amigos-invitar" />
            <BotonEnviar pendiente="Mandando…" className="gr-btn gr-btn--sm w-full">Mandarles la propuesta</BotonEnviar>
          </form>
        </details>
      )}
    </div>
  )
}

/** Las propuestas de dividir un regalo que te llegaron (Inicio): de quién, qué y para quién; te sumás o no. */
export function InvitacionesRegalo({ invitaciones, noSePudo, volver }: { invitaciones: Invitacion[]; noSePudo: boolean; volver?: 'avisos' }) {
  if (!invitaciones.length && !noSePudo) return null
  return (
    <section id="invitaciones" aria-labelledby="invitaciones-titulo" className="flex scroll-mt-6 flex-col gap-2.5">
      <h2 id="invitaciones-titulo" className="gr-label">Te proponen dividir</h2>
      {noSePudo && (
        <p role="status" className="rounded-[18px] bg-gr-soft px-4 py-3 text-sm font-medium">
          No te pudimos sumar: el regalo ya no está abierto, o ese deseo ya lo tenías reservado vos.
        </p>
      )}
      {invitaciones.map((i) => (
        <article key={i.id} className="gr-card flex flex-col gap-3 p-3.5">
          <Link href={i.href} className="flex items-center gap-3">
            <div className="w-16 flex-none overflow-hidden rounded-2xl">
              <ItemPhoto src={i.foto} titulo={i.titulo} height={64} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug text-gr-muted">
                <span className="font-semibold text-gr-ink">{i.de.nombre.split(' ')[0]}</span>
                {i.sorpresa ? ' te propone una sorpresa 🤫' : ' te propone dividir'}
              </p>
              <p className="text-base leading-snug font-semibold [overflow-wrap:anywhere]">{i.titulo}</p>
              <p className="text-[13px] leading-snug text-gr-muted">
                Para {i.para}{i.sorpresa ? ' · no está en su lista' : ''} · en partes iguales{i.somos > 1 ? ` · ya son ${i.somos}` : ''}
              </p>
            </div>
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <form action={responderInvitacionAction}>
              <input type="hidden" name="id" value={i.id} />
              <input type="hidden" name="acepta" value="0" />
              {volver && <input type="hidden" name="volver" value={volver} />}
              <BotonEnviar className="gr-btn gr-btn--sm w-full">No puedo</BotonEnviar>
            </form>
            <form action={responderInvitacionAction}>
              <input type="hidden" name="id" value={i.id} />
              <input type="hidden" name="acepta" value="1" />
              {volver && <input type="hidden" name="volver" value={volver} />}
              <BotonEnviar pendiente="Sumándote…" className="gr-btn-primary gr-btn--sm w-full">Me sumo</BotonEnviar>
            </form>
          </div>
        </article>
      ))}
    </section>
  )
}
