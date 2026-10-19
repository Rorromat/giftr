import { and, eq } from 'drizzle-orm'
import { items, notifications } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'

function notifDe(viewer: Viewer) {
  return viewer.userId
    ? eq(notifications.userId, viewer.userId)
    : eq(notifications.guestId, viewer.guestId!)
}

export async function getUnreadNotifications(db: Db, viewer: Viewer) {
  if (!viewer.userId && !viewer.guestId) return []
  return await db.select({ id: notifications.id, tipo: notifications.tipo, itemTitulo: items.titulo })
    .from(notifications).innerJoin(items, eq(notifications.itemId, items.id))
    .where(and(eq(notifications.leida, false), notifDe(viewer)))
}

export async function markNotificationsRead(db: Db, viewer: Viewer) {
  if (!viewer.userId && !viewer.guestId) return
  await db.update(notifications).set({ leida: true }).where(notifDe(viewer))
}
