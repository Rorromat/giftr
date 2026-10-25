'use client'

import { useActionState, useState } from 'react'
import { buyGroupGiftAction, fixGroupGiftAction } from '@/app/actions'
import { dividir, parsePesos, partePesos, pesos, plata, type Moneda } from '@/lib/pesos'
import { BotonEnviar } from '@/components/BotonEnviar'
import { LARGO } from '@/lib/limites'

const soloDigitos = (v: string) => v.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
/** "45000" → "45.000" mientras se escribe. */
const conPuntos = (v: string) => (v ? pesos(Number(v)).slice(1) : '')

/**
 * "Lo compré": el encargado pone cuánto salió y cómo se divide.
 * Partes iguales por defecto (se ve en vivo cuánto pone cada uno); "A mano" para repartir distinto (una vacía es 0).
 * Manda con quiénes vio la división: si mientras tanto se sumó o se bajó alguien, el servidor le pide que la revise. Si no
 * sale, el mensaje queda acá, con lo cargado.
 * Sin token ni deseo (desde Cuentas, cuando no tiene el link de la lista), solo vuelve a armar Cuentas.
 * corregir: la compra ya hecha, para cambiar el total o las partes (arranca con las de ahora). Cómo salió va en la página
 * si el formulario se va (ver fixGroupGiftAction).
 * En pesos o en dólares (enteros): arranca en la de la compra, o en la del precio del deseo (monedaSugerida).
 */
export function CompraGrupalForm({ giftId, token, itemId, miembros, sugerido, monedaSugerida = 'ARS', corregir }: {
  giftId: string
  token?: string
  itemId?: string
  miembros: { userId: string; nombre: string; esYo: boolean }[]
  sugerido: number | null
  monedaSugerida?: Moneda
  corregir?: { total: number; moneda: Moneda; partes: Record<string, number>; nota: string | null }
}) {
  const [estado, enviar] = useActionState(corregir ? fixGroupGiftAction : buyGroupGiftAction, null)
  const [total, setTotal] = useState(String(corregir?.total ?? sugerido ?? ''))
  const [moneda, setMoneda] = useState<Moneda>(corregir?.moneda ?? monedaSugerida)
  const signo = moneda === 'USD' ? 'US$' : '$'
  const p = (n: number) => plata(n, moneda)
  // una compra repartida a mano se corrige a mano
  const [manual, setManual] = useState(() => !!corregir &&
    dividir(corregir.total, miembros.length).some((m, i) => m !== corregir.partes[miembros[i].userId]))
  const [partes, setPartes] = useState<Record<string, string>>(() =>
    (corregir ? Object.fromEntries(miembros.map((m) => [m.userId, String(corregir.partes[m.userId] ?? 0)])) : {}))
  // controlada como lo demás: al terminar la acción React vuelve el formulario a lo de entrada, también si salió con error
  const [nota, setNota] = useState(corregir?.nota ?? '')

  const totalN = parsePesos(total) ?? 0
  const iguales = totalN ? dividir(totalN, miembros.length) : miembros.map(() => 0)
  // vacía vale 0, igual que en el servidor
  const montos = manual ? miembros.map((m) => partePesos(partes[m.userId] ?? '') ?? 0) : iguales
  const suma = montos.reduce((a, b) => a + b, 0)
  const diferencia = totalN - suma
  const valido = totalN > 0 && diferencia === 0

  function pasarAMano() {
    // arranca de las partes iguales para que solo haya que tocar lo distinto
    setPartes(Object.fromEntries(miembros.map((m, i) => [m.userId, String(iguales[i])])))
    setManual(true)
  }

  return (
    <form action={enviar} className="flex flex-col gap-3">
      {estado?.error && <p role="alert" className="rounded-2xl bg-gr-brand px-3 py-2.5 text-sm font-semibold text-gr-bg">{estado.error}</p>}
      <input type="hidden" name="giftId" value={giftId} />
      {token && itemId && (
        <>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="itemId" value={itemId} />
        </>
      )}
      <input type="hidden" name="modo" value={manual ? 'manual' : 'iguales'} />
      <input type="hidden" name="moneda" value={moneda} />
      {miembros.map((m) => <input key={m.userId} type="hidden" name="miembro" value={m.userId} />)}

      <div className="flex items-center justify-between gap-3">
        <span className="gr-label">¿En qué moneda?</span>
        <div className="gr-segmented min-h-10 w-44 text-sm" role="group" aria-label="Moneda">
          <button type="button" aria-pressed={moneda === 'ARS'} onClick={() => setMoneda('ARS')} className="!text-sm">Pesos</button>
          <button type="button" aria-pressed={moneda === 'USD'} onClick={() => setMoneda('USD')} className="!text-sm">Dólares</button>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="gr-label">¿Cuánto salió en total?</span>
        <span className="flex items-center gap-1 rounded-2xl border border-gr-line bg-gr-surface px-3.5">
          <span className="text-xl font-semibold">{signo}</span>
          <input name="total" inputMode="numeric" required autoComplete="off" placeholder="90.000"
                 value={conPuntos(total)} onChange={(e) => setTotal(soloDigitos(e.target.value))}
                 className="min-h-[50px] w-full bg-transparent text-xl font-semibold outline-none" />
        </span>
      </label>

      <div className="gr-segmented" role="group" aria-label="Cómo se divide">
        <button type="button" aria-pressed={!manual} onClick={() => setManual(false)}>Partes iguales</button>
        <button type="button" aria-pressed={manual} onClick={pasarAMano}>A mano</button>
      </div>

      <ul className="flex flex-col divide-y divide-dashed divide-gr-dot rounded-2xl border border-gr-line bg-gr-surface px-3.5">
        {miembros.map((m, i) => (
          <li key={m.userId} className="flex min-h-12 items-center justify-between gap-3 py-1.5">
            <span className="min-w-0 text-[15px] font-semibold [overflow-wrap:anywhere]">{m.esYo ? 'Vos' : m.nombre}</span>
            {manual ? (
              <span className="flex items-center gap-1 rounded-xl border border-gr-line px-2">
                <span className="font-semibold">{signo}</span>
                <input name={`parte:${m.userId}`} inputMode="numeric" aria-label={`Parte de ${m.nombre}`} placeholder="0"
                       value={conPuntos(partes[m.userId] ?? '')} onChange={(e) => setPartes({ ...partes, [m.userId]: soloDigitos(e.target.value) })}
                       className="min-h-10 w-24 bg-transparent text-right text-lg font-semibold outline-none" />
              </span>
            ) : (
              <span className="text-lg font-semibold tabular-nums">{p(montos[i])}</span>
            )}
          </li>
        ))}
      </ul>

      <p aria-live="polite" className={`text-sm font-semibold ${valido || !totalN ? 'text-gr-muted' : ''}`}>
        {!totalN ? 'Poné el total y se divide solo.'
          : diferencia === 0 ? `Suma justo ${p(totalN)}. Tu parte ya cuenta como paga.`
          : diferencia > 0 ? `Faltan ${p(diferencia)} para llegar al total.`
          : `Te pasaste ${p(-diferencia)} del total.`}
      </p>

      <input name="nota" maxLength={LARGO.notaCompra} placeholder="¿Qué compraste? (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} className="gr-input shadow-none" />
      <BotonEnviar disabled={!valido} pendiente="Guardando…" className="gr-btn-primary gr-btn--sm w-full">
        {corregir ? (valido ? `Guardar · dividir ${p(totalN)}` : 'Guardar') : valido ? `Lo compré · dividir ${p(totalN)}` : 'Lo compré'}
      </BotonEnviar>
    </form>
  )
}
