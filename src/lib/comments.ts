import { eq } from 'drizzle-orm'
import { comments, items } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { accesoALista } from '@/lib/acceso'

export async function addComment(db: Db, itemId: string, viewer: Viewer, texto: string): Promise<boolean> {
  if (!texto.trim()) return false
  const [row] = await db.select({ listId: items.listId }).from(items).where(eq(items.id, itemId))
  if (!row) return false
  // ningún dueño (tampoco un co-dueño del grupo, ni quien puede serlo sin su sesión) entra a la capa oculta
  if ((await accesoALista(db, row.listId, viewer)) !== 'regalador') return false
  await db.insert(comments).values({
    itemId, texto: texto.trim(),
    authorUserId: viewer.userId ?? null,
    authorGuestId: viewer.guestId ?? null,
  })
  return true
}
