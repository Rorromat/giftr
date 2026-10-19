import { and, eq } from 'drizzle-orm'
import { comments, items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'

export async function addComment(db: Db, itemId: string, viewer: Viewer, texto: string): Promise<boolean> {
  if ((!viewer.userId && !viewer.guestId) || !texto.trim()) return false
  const [row] = await db.select({ ownerId: lists.ownerId })
    .from(items).innerJoin(lists, eq(items.listId, lists.id))
    .where(eq(items.id, itemId))
  if (!row) return false
  if (viewer.userId && viewer.userId === row.ownerId) return false // el dueño no entra a la capa oculta
  await db.insert(comments).values({
    itemId, texto: texto.trim(),
    authorUserId: viewer.userId ?? null,
    authorGuestId: viewer.guestId ?? null,
  })
  return true
}
