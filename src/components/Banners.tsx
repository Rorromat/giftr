import { db } from '@/db'
import { getViewer } from '@/lib/viewer'
import { getUnreadNotifications } from '@/lib/notifications'
import { getMyClaimWarnings } from '@/lib/claims'
import { markNotifsReadAction } from '@/app/actions'

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
    <div className="mt-4 space-y-2">
      {notifs.map((n) => (
        <div key={n.id} className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm">
          {COPY[n.tipo](n.itemTitulo)}
        </div>
      ))}
      {warnings.map((w) => (
        <div key={w.claimId} className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm">
          ¿Conseguiste "{w.itemTitulo}"? Te quedan {w.diasRestantes} {w.diasRestantes === 1 ? 'día' : 'días'} de reserva.
        </div>
      ))}
      {notifs.length > 0 && (
        <form action={markNotifsReadAction}>
          <button className="text-xs text-stone-400 underline">Marcar como leídas</button>
        </form>
      )}
    </div>
  )
}
