import { and, eq } from 'drizzle-orm'
import { comments, items } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { accesoALista } from '@/lib/acceso'
import { recienHecho } from '@/lib/repetido'
import { esUuid } from '@/lib/groups'
import { LARGO, recortar } from '@/lib/limites'

/** Un comentario en la coordinación de un deseo, de hasta 500 caracteres (lo que entra en el input). */
export async function addComment(db: Db, itemId: string, viewer: Viewer, comentario: string): Promise<boolean> {
  const texto = recortar(comentario, LARGO.comentario)
  if (!texto || !esUuid(itemId)) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // lock del deseo: dos envíos a la vez del mismo comentario no pasan juntos el control de abajo
    const [row] = await t.select({ listId: items.listId }).from(items).where(eq(items.id, itemId)).for('update')
    if (!row) return false
    // ningún dueño (tampoco un co-dueño del grupo, ni quien puede serlo sin su sesión) entra a la capa oculta
    if ((await accesoALista(t, row.listId, viewer)) !== 'regalador') return false
    const autor = viewer.userId ? eq(comments.authorUserId, viewer.userId) : eq(comments.authorGuestId, viewer.guestId!)
    // un doble toque en "Enviar" no lo deja dos veces en el hilo
    const [repetido] = await t.select({ id: comments.id }).from(comments)
      .where(and(eq(comments.itemId, itemId), autor, eq(comments.texto, texto), recienHecho(comments.createdAt)))
    if (repetido) return true
    await t.insert(comments).values({
      itemId, texto,
      authorUserId: viewer.userId ?? null,
      authorGuestId: viewer.guestId ?? null,
    })
    return true
  })
}
