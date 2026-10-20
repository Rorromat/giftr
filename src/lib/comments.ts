import { and, eq } from 'drizzle-orm'
import { comments, items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { esDuenoDeLista } from '@/lib/groups'

export async function addComment(db: Db, itemId: string, viewer: Viewer, texto: string): Promise<boolean> {
  if ((!viewer.userId && !viewer.guestId) || !texto.trim()) return false
  const [row] = await db.select({ listId: lists.id })
    .from(items).innerJoin(lists, eq(items.listId, lists.id))
    .where(eq(items.id, itemId))
  if (!row) return false
  // ningún dueño (tampoco un co-dueño del grupo) entra a la capa oculta
  if (viewer.userId && await esDuenoDeLista(db, row.listId, viewer.userId)) return false
  await db.insert(comments).values({
    itemId, texto: texto.trim(),
    authorUserId: viewer.userId ?? null,
    authorGuestId: viewer.guestId ?? null,
  })
  return true
}
