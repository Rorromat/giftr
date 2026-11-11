import Link from 'next/link'
import { entrarConGoogleAction } from '@/app/actions'
import { hoyLocal, MESES } from '@/lib/events'
import { Icon } from '@/components/ui'

/** El último día (en Argentina) de una reserva que dura hasta ese momento: "22 de agosto". Si termina a las 0 h, el anterior. */
export function ultimoDia(hasta: Date) {
  const d = hoyLocal(new Date(hasta.getTime() - 1))
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}

/**
 * Qué sigue después de reservar: hasta cuándo es suyo (la fecha de esa reserva, la que venga) y que cuando lo compre lo
 * marque. Antes quedaba solo "Ya lo reservaste" y que vencía se veía recién entrando al deseo: la tía reservaba el Termo,
 * no volvía a abrir el link y a las dos semanas quedaba libre de nuevo sin que se enterara.
 * deseo: en la lista, el link al deseo, que es donde se marca. entrar: un invitado sin cuenta (adónde vuelve después de
 * entrar): solo con su cuenta le aparece en Inicio que está por vencer. cartel: recién reservado, en la lista.
 */
export function ReservaConfirmada({ vence, deseo, entrar, cartel = false }: {
  vence: Date | null; deseo?: string; entrar?: string; cartel?: boolean
}) {
  const subrayado = 'font-semibold underline underline-offset-4'
  // adentro de un renglón: no lo agranda, pero se toca en 44 px
  const tocable = "relative after:absolute after:inset-x-0 after:-inset-y-3 after:content-['']"
  const texto = (
    <>
      <span className="font-semibold">{vence ? `Es tuyo hasta el ${ultimoDia(vence)}.` : 'Es tuyo.'}</span>{' '}
      Cuando lo compres, {deseo ? <Link href={deseo} className={subrayado}>marcalo como comprado</Link> : 'marcalo como comprado'}.
    </>
  )
  const conGoogle = entrar && (
    <form action={entrarConGoogleAction} className="mt-1.5">
      <input type="hidden" name="volver" value={entrar} />
      <button className={`${subrayado} ${tocable}`}>Entrá con Google</button> y te avisamos antes de que venza.
    </form>
  )
  if (!cartel) return <div className="text-sm leading-snug font-medium"><p>{texto}</p>{conGoogle}</div>
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-[18px] bg-gr-brand px-4 py-3 text-sm leading-snug font-medium text-gr-on-brand">
      <Icon name="check" size={18} strokeWidth={2.6} className="mt-px flex-none" />
      <div className="min-w-0 flex-1"><p>{texto}</p>{conGoogle}</div>
    </div>
  )
}
