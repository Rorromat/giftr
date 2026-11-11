import { db } from '@/db'
import { getViewer } from '@/lib/viewer'
import { getUnreadNotifications, textoDeAviso } from '@/lib/notifications'
import { getMyClaimWarnings } from '@/lib/claims'
import { markNotifsReadAction } from '@/app/actions'
import { Icon, QuizasLink } from '@/components/ui'
import { CartelReserva, Listo } from '@/components/ParaVos'

/**
 * Los carteles de quien entró sin cuenta, en la lista que abrió (ver /l/[token]): no tiene Inicio ni campanita, así que
 * los avisos sobre lo que reservó (cambió el deseo, lo sacaron) y las reservas que están por vencer se le dicen ahí. Con
 * cuenta, lo mismo va en "Para vos" y en Avisos (ver ParaVos).
 * Los carteles llevan al deseo; si no hay link (cambiaron el de la lista y no lo tiene), el mismo cartel sin link (el de
 * una reserva, con sus botones ahí mismo).
 */
export async function Banners() {
  const viewer = await getViewer()
  const [todas, warnings] = await Promise.all([getUnreadNotifications(db, viewer), getMyClaimWarnings(db, viewer)])
  const notifs = todas.flatMap((n) => {
    const texto = textoDeAviso(n.tipo, n.itemTitulo, n.sorpresa)
    return texto ? [{ id: n.id, texto, href: n.href }] : []
  })
  if (!notifs.length && !warnings.length) return null

  return (
    <div className="flex flex-col gap-2.5">
      {notifs.map((n) => (
        <QuizasLink key={n.id} href={n.href}
                    className="gr-card flex items-center gap-3 px-4 py-3.5 text-sm font-medium">
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{n.texto}</span>
          {n.href && <Icon name="chevron" size={18} className="flex-none text-gr-muted" />}
        </QuizasLink>
      ))}
      {warnings.map((w) => <CartelReserva key={w.claimId} w={w} />)}
      {/* ya los leyó: se van de acá (los de las reservas no: se van al comprarlo o liberarlo) */}
      {notifs.length > 0 && <Listo action={markNotifsReadAction} de="ya leí estos avisos" />}
    </div>
  )
}
