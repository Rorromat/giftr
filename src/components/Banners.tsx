import { db } from '@/db'
import { getViewer } from '@/lib/viewer'
import { getUnreadNotifications } from '@/lib/notifications'
import { getMyClaimWarnings } from '@/lib/claims'
import { markNotifsReadAction } from '@/app/actions'
import { Starburst } from '@/components/ui'

const COPY = {
  item_baja: (t: string) => `"${t}" fue dado de baja por su dueño — te conviene elegir otro regalo.`,
  item_editado: (t: string) => `"${t}" fue editado por su dueño — revisá los detalles.`,
} as const

export async function Banners() {
  const viewer = await getViewer()
  const [notifs, warnings] = await Promise.all([
    getUnreadNotifications(db, viewer),
    getMyClaimWarnings(db, viewer),
  ])
  if (!notifs.length && !warnings.length) return null

  return (
    <div className="flex flex-col gap-2.5">
      {notifs.map((n) => (
        <div key={n.id} className="rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface px-3.5 py-3 text-sm font-medium shadow-sticker-sm">
          {COPY[n.tipo](n.itemTitulo)}
        </div>
      ))}
      {warnings.map((w) => (
        <div key={w.claimId} className="relative rounded-2xl border-[2.5px] border-gr-ink bg-gr-ink py-3 pl-3.5 pr-12 text-sm font-medium text-gr-bg">
          {`¿Conseguiste "${w.itemTitulo}"? Te quedan `}
          <span className="font-bold text-gr-accent">{w.diasRestantes} {w.diasRestantes === 1 ? 'día' : 'días'}</span>
          {' de reserva.'}
          <Starburst size={40} fontSize={46} className="absolute -right-2 -top-3 rotate-12">!</Starburst>
        </div>
      ))}
      {notifs.length > 0 && (
        <form action={markNotifsReadAction}>
          <button className="min-h-11 text-xs font-bold underline decoration-2 underline-offset-4">Marcar como leídas</button>
        </form>
      )}
    </div>
  )
}
