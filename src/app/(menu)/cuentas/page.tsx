import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { misCuentas, pesos, type CuentaPersona, type LineaCuenta } from '@/lib/regalos'
import { cancelGroupGiftAction, markPaidAction, settleUpAction } from '@/app/actions'
import { AvatarSticker, BackLink, Icon, Seccion, Starburst } from '@/components/ui'

/** Un link si lo hay; si no (cambiaron el link para regalar y no lo tiene), lo mismo sin link. */
function QuizasLink({ href, className, children }: { href: string | null; className: string; children: React.ReactNode }) {
  return href ? <Link href={href} className={className}>{children}</Link> : <div className={className}>{children}</div>
}

function Linea({ l }: { l: LineaCuenta }) {
  return (
    <li className="flex items-center gap-2 py-2">
      <QuizasLink href={l.href} className="min-w-0 flex-1 text-sm leading-snug">
        <span className={`font-bold [overflow-wrap:anywhere] ${l.href ? 'underline decoration-2 underline-offset-2' : ''}`}>{l.itemTitulo}</span>
        <span className="block text-xs font-medium text-gr-muted">para {l.para} · {l.tipo === 'debes' ? 'tu parte' : 'su parte'}</span>
      </QuizasLink>
      <span className="font-display text-lg font-extrabold tabular-nums">{pesos(l.monto)}</span>
      <form action={markPaidAction}>
        <input type="hidden" name="giftId" value={l.giftId} />
        <input type="hidden" name="deudorId" value={l.deudorId} />
        <input type="hidden" name="pagado" value="1" />
        <button className="gr-btn min-h-11 px-2.5 font-sans text-[13px] font-bold">{l.tipo === 'debes' ? 'Ya le pagué' : 'Me pagó'}</button>
      </form>
    </li>
  )
}

function Persona({ p }: { p: CuentaPersona }) {
  const leDebo = p.neto < 0
  const ambas = new Set(p.lineas.map((l) => l.tipo)).size > 1
  return (
    <li className="gr-sticker flex flex-col gap-1 p-3.5">
      <div className="flex items-center gap-3">
        <AvatarSticker nombre={p.nombre} size={44} />
        <p className="min-w-0 flex-1 font-display text-xl leading-tight font-extrabold [overflow-wrap:anywhere]">
          {p.neto === 0 ? `Con ${p.nombre} están a mano` : leDebo ? `Le debés ${pesos(-p.neto)} a ${p.nombre}` : `${p.nombre} te debe ${pesos(p.neto)}`}
        </p>
      </div>
      {ambas && <p className="text-xs font-semibold text-gr-muted">Ya está descontado lo que se deben entre los dos.</p>}
      <ul className="flex flex-col divide-y-2 divide-dashed divide-gr-dot">
        {p.lineas.map((l) => <Linea key={`${l.giftId}-${l.deudorId}`} l={l} />)}
      </ul>
      {p.lineas.length > 1 && (
        <form action={settleUpAction}>
          <input type="hidden" name="otroId" value={p.id} />
          <button className={`${leDebo ? 'gr-btn-primary' : 'gr-btn font-sans font-bold'} gr-btn--sm mt-1 w-full`}>
            {p.neto === 0 ? 'Marcar todo como saldado' : leDebo ? `Ya le pagué todo (${pesos(-p.neto)})` : `Me pagó todo (${pesos(p.neto)})`}
          </button>
        </form>
      )}
    </li>
  )
}

export default async function Cuentas() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const c = await misCuentas(db, session.userId)
  const vacio = !c.personas.length && !c.enCurso.length && !c.saldadas.length

  return (
    <Seccion className="flex flex-col gap-4 pb-32 pt-[52px]">
      <div className="flex items-center gap-3.5">
        <BackLink href="/perfil" label="Volver a Perfil" />
        <div className="flex flex-col gap-0.5">
          <h1 className="gr-title">Cuentas</h1>
          <p className="text-[15px] font-medium">Los regalos grupales: quién le debe a quién.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 rounded-sticker border-[3px] border-gr-ink bg-gr-ink px-3.5 py-3 text-gr-bg">
          <span className="text-xs font-bold uppercase tracking-wide text-gr-accent">Debés</span>
          <span className="font-display text-[28px] leading-none font-extrabold tabular-nums">{pesos(c.debes)}</span>
        </div>
        <div className="gr-sticker flex flex-col gap-1 bg-gr-accent px-3.5 py-3">
          <span className="text-xs font-bold uppercase tracking-wide">Te deben</span>
          <span className="font-display text-[28px] leading-none font-extrabold tabular-nums">{pesos(c.teDeben)}</span>
        </div>
      </div>

      {vacio && (
        <div className="relative mt-2 flex flex-col gap-2 rounded-sticker border-[2.5px] border-dashed border-gr-ink px-5 py-7 text-center text-[15px] font-medium leading-snug">
          <Starburst size={52} fontSize={46} className="absolute -right-2 -top-6 rotate-12">$</Starburst>
          <p>Cuando arman un regalo entre varios, acá ves cuánto puso cada uno y a quién le falta pagar.</p>
          <p>Abrí un deseo de la lista de alguien y tocá “Armar regalo grupal”.</p>
        </div>
      )}

      {c.personas.length === 0 && !vacio && (
        <p className="gr-sticker flex items-center gap-2 px-4 py-3 font-display text-lg font-extrabold">
          <Icon name="check" size={20} strokeWidth={3} /> Están todos a mano
        </p>
      )}

      {c.personas.length > 0 && <ul className="flex flex-col gap-4">{c.personas.map((p) => <Persona key={p.id} p={p} />)}</ul>}

      {c.enCurso.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="font-display text-[22px] leading-none font-extrabold tracking-[-0.03em]">En curso</h2>
          <ul className="flex flex-col gap-2.5">
            {c.enCurso.map((r) => (
              <li key={r.giftId}>
                <QuizasLink href={r.href} className="flex min-h-14 items-center gap-3 rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface px-3 py-2.5">
                  <span className="min-w-0 flex-1 text-sm leading-snug">
                    <span className="font-bold [overflow-wrap:anywhere]">{r.itemTitulo}</span> para {r.para}
                    <span className="block text-xs font-medium text-gr-muted">
                      {r.soyEncargado ? 'Lo organizás vos' : `Lo organiza ${r.encargado}`} · {r.personas.length} {r.personas.length === 1 ? 'persona' : 'personas'} · todavía no se compró
                    </span>
                  </span>
                  {r.href && <Icon name="chevron" size={18} strokeWidth={2.6} />}
                </QuizasLink>
                {!r.sigueEnLaLista && (
                  <div className="mt-1.5 flex items-center gap-2 px-1 text-xs font-semibold">
                    <span className="flex-1">Lo sacaron de la lista: ya no hace falta comprarlo.</span>
                    {r.soyEncargado && (
                      <form action={cancelGroupGiftAction}>
                        <input type="hidden" name="giftId" value={r.giftId} />
                        <button className="min-h-11 font-bold underline decoration-2 underline-offset-4">Cancelar el regalo</button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.saldadas.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="font-display text-[22px] leading-none font-extrabold tracking-[-0.03em]">Ya saldado</h2>
          <ul className="flex flex-col gap-1.5">
            {c.saldadas.map((l) => (
              <li key={`${l.giftId}-${l.deudorId}`} className="flex items-center gap-2 text-sm">
                <Icon name="check" size={16} strokeWidth={3} className="flex-none" />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {l.tipo === 'debes' ? `Le pagaste a ${l.con}` : `${l.con} te pagó`} · {l.itemTitulo}
                </span>
                <span className="font-bold tabular-nums">{pesos(l.monto)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Seccion>
  )
}
