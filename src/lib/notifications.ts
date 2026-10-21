import { and, eq, inArray } from 'drizzle-orm'
import { items, lists, notifications } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { listasAjenasSql } from '@/lib/acceso'

const TEXTOS = {
  item_baja: (t: string) => `"${t}" fue dado de baja por su dueño — te conviene elegir otro regalo.`,
  item_editado: (t: string) => `"${t}" fue editado por su dueño — revisá los detalles.`,
  regalo_encargo: (t: string) => `Ahora organizás vos el regalo grupal de "${t}" — cuando lo compres, dividí lo que salió (o cancelalo si ya no va).`,
  regalo_cancelado: (t: string) => `Se canceló el regalo grupal de "${t}" — si todavía querés regalarlo, podés reservarlo o armar otro.`,
} as const

/**
 * El texto del cartel de un aviso. Null si esta versión no conoce el tipo (lo escribió una más nueva y se volvió atrás el
 * deploy): ese no se muestra, en vez de tirar abajo la página donde está el botón para marcarlos como leídos.
 */
export function textoDeAviso(tipo: string, itemTitulo: string): string | null {
  return Object.hasOwn(TEXTOS, tipo) ? TEXTOS[tipo as keyof typeof TEXTOS](itemTitulo) : null
}

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
