import { and, eq, inArray } from 'drizzle-orm'
import { items, lists, notifications } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { listasAjenasSql } from '@/lib/acceso'

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
    .where(and(eq(notifications.leida, false), notifDe(viewer), listasAjenasSql(db, viewer)))
}

export async function markNotificationsRead(db: Db, viewer: Viewer) {
  if (!viewer.userId && !viewer.guestId) return
  // solo los que se mostraron: los que se esconden en este navegador (ver listasAjenasSql) quedan sin leer
  const ajenas = listasAjenasSql(db, viewer)
  const visibles = ajenas && inArray(notifications.itemId,
    db.select({ id: items.id }).from(items).innerJoin(lists, eq(items.listId, lists.id)).where(ajenas))
  await db.update(notifications).set({ leida: true }).where(and(notifDe(viewer), visibles))
}
