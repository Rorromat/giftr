import { and, eq } from 'drizzle-orm'
import { items, lists, notifications } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { noEsDuenoSql } from '@/lib/groups'

function notifDe(viewer: Viewer) {
  return viewer.userId
    ? eq(notifications.userId, viewer.userId)
    : eq(notifications.guestId, viewer.guestId!)
}

export async function getUnreadNotifications(db: Db, viewer: Viewer) {
  if (!viewer.userId && !viewer.guestId) return []
  return await db.select({ id: notifications.id, tipo: notifications.tipo, itemTitulo: items.titulo })
    .from(notifications).innerJoin(items, eq(notifications.itemId, items.id)).innerJoin(lists, eq(items.listId, lists.id))
    // un aviso sobre un deseo propio le diría al dueño que alguien lo reservó
    .where(and(eq(notifications.leida, false), notifDe(viewer), viewer.userId ? noEsDuenoSql(db, viewer.userId) : undefined))
}

export async function markNotificationsRead(db: Db, viewer: Viewer) {
  if (!viewer.userId && !viewer.guestId) return
  await db.update(notifications).set({ leida: true }).where(notifDe(viewer))
}
