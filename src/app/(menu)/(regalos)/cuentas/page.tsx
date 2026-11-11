import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import {
  comprasParaCorregir, misCuentas, type AjusteCuenta, type CompraParaCorregir, type CuentaPersona, type Cuentas as CuentasDe, type LineaCuenta,
  type PagoPorVos, type RegaloEnCurso, type RondaCuenta,
} from '@/lib/regalos'
import { plata, type Moneda } from '@/lib/pesos'
import { juntarNombres } from '@/lib/groups'
import { miAliasPago, tipoDeAlias } from '@/lib/users'
import { cancelGroupGiftAction, leaveGroupGiftAction, markPaidAction, settleRoundAction, settleUpAction } from '@/app/actions'
import { CompraGrupalForm } from '@/components/CompraGrupalForm'
import { PagoParcial } from '@/components/PagoParcial'
import { CartelCorreccion, SacarDelRegalo } from '@/components/RegaloGrupal'
import { BotonEnviar } from '@/components/BotonEnviar'
import { Confirmar } from '@/components/Confirmar'
import { CopiarAlias } from '@/components/CopiarAlias'
import { AvatarSticker, Icon, QuizasLink } from '@/components/ui'

/** Qué es la línea: la parte que falta (o lo que falta de ella), o lo que el que compró devuelve. */
function queEs(l: LineaCuenta) {
  if (l.devolucion) return l.tipo === 'debes' ? 'le devolvés' : 'te devuelve'
  const resto = l.monto < l.parte ? 'lo que falta de ' : ''
  return `${resto}${l.tipo === 'debes' ? 'tu parte' : 'su parte'}`
}

/** Una parte. conBoton: se salda sola (en una tarjeta simplificada, no: se salda con el botón de la tarjeta). */
function Linea({ l, conBoton }: { l: LineaCuenta; conBoton: boolean }) {
  return (
    <li className="flex items-center gap-2 py-2">
      <QuizasLink href={l.href} className="min-w-0 flex-1 text-sm leading-snug">
        <span className={`font-semibold [overflow-wrap:anywhere] ${l.href ? 'underline underline-offset-2' : ''}`}>{l.itemTitulo}</span>
        <span className="block text-xs font-medium text-gr-muted">para {l.para} · {queEs(l)}</span>
      </QuizasLink>
      <span className="text-base font-semibold tabular-nums">{plata(l.monto, l.moneda)}</span>
      {conBoton && <form action={markPaidAction}>
        <input type="hidden" name="giftId" value={l.giftId} />
        <input type="hidden" name="deudorId" value={l.deudorId} />
        <input type="hidden" name="pagado" value="1" />
        {/* la parte que ve: si justo la corrigieron, no queda paga una que no vio */}
        <input type="hidden" name="monto" value={l.parte} />
        <BotonEnviar className="gr-btn min-h-11 px-2.5 text-[13px]">
          {l.devolucion ? (l.tipo === 'debes' ? 'Ya le devolví' : 'Me devolvió') : l.tipo === 'debes' ? 'Ya le pagué' : 'Me pagó'}
        </BotonEnviar>
      </form>}
    </li>
  )
}

/** Lo que cambió al simplificar (ver AjusteCuenta): en el sentido de la tarjeta suma, al revés resta. */
function Ajuste({ a, neto, moneda }: { a: AjusteCuenta; neto: number; moneda?: Moneda }) {
  const resta = a.monto * (neto < 0 ? -1 : 1) < 0
  return (
    <li className="flex items-center gap-2 py-2">
      <span className="min-w-0 flex-1 text-sm leading-snug">
        <span className="font-semibold [overflow-wrap:anywhere]">{a.texto}</span>
        <span className="block text-xs font-medium text-gr-muted">simplificado</span>
      </span>
      <span className="text-base font-semibold tabular-nums">{resta ? '−' : ''}{plata(Math.abs(a.monto), moneda)}</span>
    </li>
  )
}

/**
 * Adónde mandarle la plata a alguien a quien le debés: su alias o CVU (ver CuentaPersona.alias), a la vista y con un botón
 * para copiarlo. Si no cargó ninguno, se dice: que no parezca que falta algo, y que se lo pida.
 */
function AdondeTransferir({ nombre, alias }: { nombre: string; alias?: string }) {
  if (!alias) return <p className="text-xs font-medium text-gr-muted">{nombre} todavía no cargó su alias para transferirle: pedíselo.</p>
  const tipo = tipoDeAlias(alias)
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-gr-soft py-1.5 pr-1.5 pl-3">
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <span className="block text-xs font-medium text-gr-muted">Transferile a su {tipo}</span>
        <span className="font-semibold select-all [overflow-wrap:anywhere]">{alias}</span>
      </p>
      <CopiarAlias alias={alias} texto={`Copiar ${tipo}`} />
    </div>
  )
}

function Persona({ p }: { p: CuentaPersona }) {
  const leDebo = p.neto < 0
  const ambas = new Set(p.lineas.map((l) => l.tipo)).size > 1
  // simplificada: las partes no suman lo que dice arriba, así que se salda todo junto
  const simplificada = p.ajustes.length > 0
  return (
    <li className="gr-card flex flex-col gap-1 p-4">
      <div className="flex items-center gap-3">
        <AvatarSticker nombre={p.nombre} size={44} />
        <p className="min-w-0 flex-1 text-base leading-snug font-semibold [overflow-wrap:anywhere]">
          {p.neto === 0 ? `Con ${p.nombre} están a mano` : leDebo ? `Le debés ${plata(-p.neto, p.moneda)} a ${p.nombre}` : `${p.nombre} te debe ${plata(p.neto, p.moneda)}`}
        </p>
      </div>
      {leDebo && <AdondeTransferir nombre={p.nombre} alias={p.alias} />}
      {ambas && <p className="text-xs font-semibold text-gr-muted">Ya está descontado lo que se deben entre los dos.</p>}
      {simplificada && (
        <p className="text-xs font-semibold text-gr-muted">Simplificado, como en Splitwise: menos transferencias y todos quedan igual.</p>
      )}
      <ul className="flex flex-col divide-y divide-gr-line">
        {p.lineas.map((l) => <Linea key={`${l.giftId}-${l.deudorId}`} l={l} conBoton={!simplificada} />)}
        {p.ajustes.map((a) => <Ajuste key={a.texto} a={a} neto={p.neto} moneda={p.moneda} />)}
      </ul>
      {(p.lineas.length > 1 || simplificada) && (
        <form action={settleUpAction}>
          <input type="hidden" name="otroId" value={p.id} />
          <input type="hidden" name="moneda" value={p.moneda ?? 'ARS'} />
          {/* lo que dice el botón: si cambió mientras tanto, no salda nada */}
          <input type="hidden" name="neto" value={p.neto} />
          <BotonEnviar className={`${leDebo ? 'gr-btn-primary' : 'gr-btn '} gr-btn--sm mt-1 w-full`}>
            {p.neto === 0 ? 'Marcar todo como saldado' : leDebo ? `Ya le pagué todo (${plata(-p.neto, p.moneda)})` : `Me pagó todo (${plata(p.neto, p.moneda)})`}
          </BotonEnviar>
        </form>
      )}
      {p.neto !== 0 && <PagoParcial key={p.neto} otroId={p.id} neto={p.neto} moneda={p.moneda} />}
    </li>
  )
}

/** Se deben lo mismo en círculo: nadie paga nada, alguno lo marca (ver saldarRonda). */
function Ronda({ r }: { r: RondaCuenta }) {
  const pasos = [`vos le debés a ${r.con[0]}`, ...r.con.slice(0, -1).map((n, i) => `${n} a ${r.con[i + 1]}`), `${r.con.at(-1)} a vos`]
  return (
    <li className="gr-card flex flex-col gap-2 p-4">
      <p className="text-base leading-snug font-semibold [overflow-wrap:anywhere]">Con {juntarNombres(r.con)} quedan a mano</p>
      <p className="text-sm leading-snug">
        Se deben {plata(r.monto, r.moneda)} en ronda: {juntarNombres(pasos)}. Se cancela sin que nadie pague nada.
      </p>
      <form action={settleRoundAction}>
        <input type="hidden" name="clave" value={r.clave} />
        <input type="hidden" name="monto" value={r.monto} />
        <input type="hidden" name="moneda" value={r.moneda ?? 'ARS'} />
        <BotonEnviar className="gr-btn gr-btn--sm w-full">Marcar como saldado</BotonEnviar>
      </form>
    </li>
  )
}

/** Un pago del plan que pasa por vos (ver PagoPorVos): no tenés que hacer nada. */
function PorVos({ x }: { x: PagoPorVos }) {
  return (
    <li className="flex flex-col gap-0.5 py-2 text-sm leading-snug">
      <span className="font-semibold [overflow-wrap:anywhere]">
        {x.de} le paga {plata(x.monto, x.moneda)} a {x.a} por vos
      </span>
      <span className="text-xs font-medium text-gr-muted">Así vos no le pagás eso a {x.despues} y {x.antes} no te lo paga a vos.</span>
    </li>
  )
}

const linkSubrayado = 'min-h-11 font-semibold underline underline-offset-4'

/** Un total de arriba: en pesos, y lo de dólares abajo y aparte (si solo hay dólares, va eso solo). */
function Total({ pesos, dolares, className = '' }: { pesos: number; dolares: number; className?: string }) {
  const soloDolares = !pesos && dolares > 0
  return (
    <>
      <span className={`gr-number text-[30px] tabular-nums ${className}`}>{soloDolares ? plata(dolares, 'USD') : plata(pesos)}</span>
      {!soloDolares && dolares > 0 && <span className={`gr-number text-xl tabular-nums ${className}`}>+ {plata(dolares, 'USD')}</span>}
    </>
  )
}

/**
 * Cancelarlo no se deshace y les avisa a los demás: primero dice qué pasa, como en el deseo (ver RegaloGrupal). Acá el
 * deseo puede no estar más en la lista ("Ya lo tengo"): ahí no queda libre para nadie.
 */
function CancelarRegalo({ r }: { r: RegaloEnCurso }) {
  const aLosDemas = r.personas.length > 1 ? ' y les avisamos a los que se sumaron' : ''
  if (r.sorpresa) {
    return (
      <Confirmar resumen="Cancelar la sorpresa" boton="Sí, cancelarla" action={cancelGroupGiftAction} ocultos={{ giftId: r.giftId }}>
        La sorpresa se borra{aLosDemas}. Todavía no se compró: nadie le queda debiendo nada a nadie.
      </Confirmar>
    )
  }
  return (
    <Confirmar resumen="Cancelar el regalo grupal" boton="Sí, cancelarlo" action={cancelGroupGiftAction} ocultos={{ giftId: r.giftId }}>
      {r.sigueEnLaLista
        ? `El deseo vuelve a quedar libre para cualquiera${aLosDemas}.`
        : `El regalo grupal se termina acá${aLosDemas}: el deseo ya no está en la lista.`}{' '}
      Todavía no se compró: nadie le queda debiendo nada a nadie.
    </Confirmar>
  )
}

/**
 * "Deshacer" en una fila de Ya saldado: el "Me pagó todo" (o "Ya le pagué") que se tocó de más. Lo deshace cualquiera de los
 * dos, como en el deseo (ver marcarPagado): vuelve a lo que había antes de lo último que se anotó. Cambia plata y al otro
 * no le llega nada, así que primero dice cuánto vuelve a figurar y que le avise.
 */
function DeshacerSaldado({ l }: { l: CuentasDe['saldadas'][number] }) {
  // nada que deshacer: lo último que se anotó no cambió lo que debía
  if (!l.vuelve) return null
  const monto = plata(Math.abs(l.vuelve), l.moneda)
  // soyElQueSeSumo: la parte es la mía (ver LineaCuenta.tipo en las saldadas)
  const soyElQueSeSumo = l.tipo === 'debes'
  const queVuelve = l.vuelve > 0
    ? (soyElQueSeSumo ? `le debés ${monto} a ${l.con}` : `${l.con} te debe ${monto}`)
    : (soyElQueSeSumo ? `${l.con} te tiene que devolver ${monto}` : `le tenés que devolver ${monto} a ${l.con}`)
  return (
    <Confirmar resumen="Deshacer" boton="Sí, deshacer" action={markPaidAction} className="items-end"
               ocultos={{ giftId: l.giftId, deudorId: l.deudorId, pagado: '0' }}>
      Vuelve a figurar que {queVuelve} por {l.itemTitulo}. A {l.con} no le llega ningún aviso: contale vos.
    </Confirmar>
  )
}

function MeBajo({ giftId }: { giftId: string }) {
  return (
    <form action={leaveGroupGiftAction}>
      <input type="hidden" name="giftId" value={giftId} />
      <BotonEnviar className={linkSubrayado}>Me bajo</BotonEnviar>
    </form>
  )
}

/**
 * Un regalo abierto que no se puede terminar en el deseo: lo sacaron de la lista ("Ya lo tengo": quizás ya se lo dieron)
 * o cambiaron el link y no lo tiene. Lo que haría en el deseo lo hace desde acá, sin pasar por la lista: el encargado lo
 * compra, saca a alguien que se sumó por error o lo cancela; los demás se pueden bajar.
 */
function DesdeAca({ r }: { r: RegaloEnCurso }) {
  if (r.dividirCon) {
    return (
      <div className="mt-1.5 flex flex-col gap-2 px-1 text-xs font-semibold">
        <span>
          {r.sigueEnLaLista
            ? 'Ya no tenés el link de esta lista: el regalo lo terminás desde acá.'
            : 'Lo sacaron de la lista: si ya lo compraste, dividí lo que salió; si no, cancelalo.'}
        </span>
        <details className="group flex flex-col">
          <summary className="gr-btn-primary gr-btn--sm flex w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            Ya lo compré: dividir
          </summary>
          <div className="mt-3">
            <CompraGrupalForm giftId={r.giftId} miembros={r.dividirCon} sugerido={null} />
          </div>
        </details>
        <SacarDelRegalo giftId={r.giftId} otros={r.dividirCon.filter((m) => !m.esYo)} sacados={r.sacados} />
        <CancelarRegalo r={r} />
      </div>
    )
  }
  if (r.soyEncargado) return null
  return (
    <div className="mt-1.5 flex items-center gap-2 px-1 text-xs font-semibold">
      <span className="flex-1">
        {r.sigueEnLaLista ? 'Ya no tenés el link de esta lista' : 'Lo sacaron de la lista'}. Si no vas a poner, bajate desde acá.
      </span>
      <MeBajo giftId={r.giftId} />
    </div>
  )
}

/**
 * Lo que compró en un regalo y no puede corregir en el deseo (lo sacaron de la lista, o cambiaron el link): desde acá,
 * mientras quede algo por saldar (o el primer mes: ver sePuedeCorregir). Cambia con cada corrección: el formulario vuelve
 * a arrancar cerrado y con lo nuevo.
 */
function Corregir({ c }: { c: CompraParaCorregir }) {
  const alguienPone = c.miembros.some((m) => !m.esYo && m.monto > 0)
  return (
    <li className="rounded-2xl border border-gr-line bg-gr-surface px-3 py-2.5">
      <p className="text-sm leading-snug">
        <span className="font-semibold [overflow-wrap:anywhere]">{c.itemTitulo}</span> para {c.para}
        <span className="block text-xs font-medium text-gr-muted">
          Lo compraste por {plata(c.total, c.moneda)}{alguienPone ? '' : ` · los demás quedaron en ${plata(0, c.moneda)}`}
        </span>
      </p>
      <details key={`${c.total}:${c.moneda}:${c.miembros.map((m) => m.monto).join(',')}`} className="group mt-1 flex flex-col">
        <summary className={`${linkSubrayado} flex cursor-pointer list-none items-center text-sm [&::-webkit-details-marker]:hidden`}>
          Corregir la compra
        </summary>
        <div className="mt-2">
          <CompraGrupalForm giftId={c.giftId} miembros={c.miembros} sugerido={null}
                            corregir={{ total: c.total, moneda: c.moneda ?? 'ARS', nota: c.nota, partes: Object.fromEntries(c.miembros.map((m) => [m.userId, m.monto])) }} />
        </div>
      </details>
    </li>
  )
}

export default async function Cuentas({ searchParams }: { searchParams: Promise<{ correccion?: string }> }) {
  const { correccion } = await searchParams
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [c, aCorregir, miAlias] = await Promise.all([
    misCuentas(db, session.userId), comprasParaCorregir(db, session.userId), miAliasPago(db, session.userId),
  ])
  const vacio = !c.personas.length && !c.rondas.length && !c.porVos.length && !c.enCurso.length && !c.saldadas.length && !aCorregir.length

  // lo de arriba (el encabezado, el título y las pestañas) está en el layout, compartido con Mis regalos
  return (
    <div className="gr-fundido flex flex-col gap-5">

      <div className="grid grid-cols-2 gap-3">
        <div className="gr-hero flex flex-col gap-1.5 p-4">
          <span className="text-xs font-semibold tracking-[0.08em] text-gr-on-hero/60 uppercase">Debés</span>
          <Total pesos={c.debes} dolares={c.dolares?.debes ?? 0} className="text-gr-hero-detail" />
        </div>
        <div className="flex flex-col gap-1.5 rounded-[26px] border border-gr-line bg-gr-surface p-4">
          <span className="text-xs font-semibold tracking-[0.08em] text-gr-muted uppercase">Te deben</span>
          <Total pesos={c.teDeben} dolares={c.dolares?.teDeben ?? 0} />
        </div>
      </div>

      <CartelCorreccion motivo={correccion} cerrar="/cuentas" />

      {vacio && (
        <div className="gr-empty flex flex-col items-center gap-2 py-7 text-center">
          <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-gr-surface shadow-card"><Icon name="wallet" size={26} /></span>
          <p>Las cuentas salen de los regalos grupales: acá ves cuánto puso cada uno y a quién le falta pagar.</p>
          {/* El botón está en el deseo de otro, no acá: se dice dónde y se lo lleva a su gente, de donde se llega a las listas */}
          <p className="text-gr-muted">Para armar uno, abrí un deseo de la lista de alguien de tu gente: ahí está “Armar regalo grupal”.</p>
          <Link href="/gente" className="gr-btn gr-btn--sm mt-1">Ir a Tu gente</Link>
        </div>
      )}

      {/* Le deben y no dijo adónde: sin alias, cada uno se lo tiene que pedir por WhatsApp antes de pagarle */}
      {!miAlias && c.personas.some((p) => p.neto > 0) && (
        <Link href="/perfil#alias" className="gr-card flex min-h-14 items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1 text-sm leading-snug">
            <span className="font-semibold">Poné tu alias así te transfieren</span>
            <span className="block text-xs font-medium text-gr-muted">Lo ve solo quien te debe, acá en Cuentas.</span>
          </span>
          <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
        </Link>
      )}

      {c.personas.length === 0 && !c.rondas.length && !c.porVos.length && !vacio && (
        <p className="gr-card flex items-center gap-2 px-4 py-3.5 text-base font-semibold">
          <Icon name="check" size={20} strokeWidth={3} /> Están todos a mano
        </p>
      )}

      {c.personas.length > 0 && <ul className="flex flex-col gap-4">{c.personas.map((p) => <Persona key={`${p.id}-${p.moneda}`} p={p} />)}</ul>}

      {c.rondas.length > 0 && <ul className="flex flex-col gap-4">{c.rondas.map((r) => <Ronda key={`${r.clave}-${r.moneda}`} r={r} />)}</ul>}

      {c.porVos.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h2 className="gr-heading">Lo pagan por vos</h2>
          <p className="text-[13px] leading-snug text-gr-muted">Se simplificó para hacer menos transferencias: cuando lo marquen, quedás a mano.</p>
          <ul className="flex flex-col divide-y divide-gr-line">
            {c.porVos.map((x) => <PorVos key={`${x.de}-${x.a}-${x.antes}-${x.despues}-${x.moneda}`} x={x} />)}
          </ul>
        </section>
      )}

      {c.enCurso.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="gr-heading">En curso</h2>
          <ul className="flex flex-col gap-2.5">
            {c.enCurso.map((r) => (
              <li key={r.giftId}>
                <QuizasLink href={r.href} className="gr-card flex min-h-14 items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 text-sm leading-snug">
                    <span className="font-semibold [overflow-wrap:anywhere]">{r.itemTitulo}</span> para {r.para}
                    <span className="block text-xs font-medium text-gr-muted">
                      {r.soyEncargado ? 'Lo organizás vos' : `Lo organiza ${r.encargado}`} · {r.personas.length} {r.personas.length === 1 ? 'persona' : 'personas'} · todavía no se compró
                    </span>
                  </span>
                  {r.href && <Icon name="chevron" size={18} className="flex-none text-gr-muted" />}
                </QuizasLink>
                {(!r.sigueEnLaLista || !r.href) && <DesdeAca r={r} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {aCorregir.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="gr-heading">Lo que compraste</h2>
          <p className="text-[13px] leading-snug text-gr-muted">Podés cambiar el total o cómo se dividió: lo que ya te pagaron queda, y la diferencia se ve acá.</p>
          <ul className="flex flex-col gap-2.5">{aCorregir.map((x) => <Corregir key={x.giftId} c={x} />)}</ul>
        </section>
      )}

      {c.saldadas.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="gr-heading">Ya saldado</h2>
          <ul className="flex flex-col gap-1.5">
            {c.saldadas.map((l) => (
              <li key={`${l.giftId}-${l.deudorId}`} className="flex flex-col text-sm">
                <div className="flex items-center gap-2">
                  <Icon name="check" size={16} strokeWidth={3} className="flex-none" />
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    {l.tipo === 'debes' ? `Le pagaste a ${l.con}` : `${l.con} te pagó`} · {l.itemTitulo}
                  </span>
                  <span className="font-semibold tabular-nums">{plata(l.monto, l.moneda)}</span>
                </div>
                <DeshacerSaldado l={l} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
