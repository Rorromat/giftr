import { and, eq, isNotNull } from 'drizzle-orm'
import { comments, guestIdentities, items, listFollows, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { accesoALista } from '@/lib/acceso'
import { avisar, type Enviar } from '@/lib/codazos'
import { genteDelDeseo } from '@/lib/items'
import { recienHecho } from '@/lib/repetido'
import { esUuid } from '@/lib/groups'
import { LARGO, recortar } from '@/lib/limites'

/**
 * Un comentario en la coordinación de un deseo, de hasta 500 caracteres (lo que entra en el input). A los demás del hilo
 * y a quienes regalan ese deseo les llega el aviso (ver avisarComentario).
 */
export async function addComment(db: Db, itemId: string, viewer: Viewer, comentario: string, enviar?: Enviar): Promise<boolean> {
  const texto = recortar(comentario, LARGO.comentario)
  if (!texto || !esUuid(itemId)) return false
  const r = await db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // lock del deseo: dos envíos a la vez del mismo comentario no pasan juntos el control de abajo
    const [row] = await t.select({ listId: items.listId }).from(items).where(eq(items.id, itemId)).for('update')
    if (!row) return 'no' as const
    // ningún dueño (tampoco un co-dueño del grupo, ni quien puede serlo sin su sesión) entra a la capa oculta
    if ((await accesoALista(t, row.listId, viewer)) !== 'regalador') return 'no' as const
    const autor = viewer.userId ? eq(comments.authorUserId, viewer.userId) : eq(comments.authorGuestId, viewer.guestId!)
    // un doble toque en "Enviar" no lo deja dos veces en el hilo
    const [repetido] = await t.select({ id: comments.id }).from(comments)
      .where(and(eq(comments.itemId, itemId), autor, eq(comments.texto, texto), recienHecho(comments.createdAt)))
    if (repetido) return 'repetido' as const
    await t.insert(comments).values({
      itemId, texto,
      authorUserId: viewer.userId ?? null,
      authorGuestId: viewer.guestId ?? null,
    })
    return 'nuevo' as const
  })
  // Ya fuera de la transacción, como los codazos: el deseo no queda bloqueado mientras contestan los servicios de push.
  // Si el aviso falla, el comentario quedó igual.
  if (r === 'nuevo') await avisarComentario(db, itemId, viewer, texto, enviar).catch(() => 0)
  return r !== 'no'
}

/** Cuánto del comentario entra en el aviso (el resto, en el hilo). */
const EN_EL_AVISO = 140

/**
 * "Caro comentó en Termo": a los demás que escribieron en el hilo y a quienes regalan ese deseo (lo reservaron, lo
 * compraron o están en su regalo grupal), en la bandeja y en el celular. Sin esto, "¿alguien sabe el talle?" quedaba ahí
 * hasta que el otro volviera a abrir justo ese deseo. Nunca a quien lo escribió ni a un dueño de la lista (tampoco al que
 * salió del grupo, ni a quien recibe la sorpresa: ver accesoALista): el hilo es de la capa oculta. Los invitados sin
 * cuenta no tienen bandeja ni dispositivo: lo ven al volver al deseo.
 * Lleva al deseo solo a quien tiene el link para regalar de ahora (lo sigue, o nunca lo cambiaron); si no, a su bandeja.
 * Devuelve a cuántos les avisó.
 */
async function avisarComentario(db: Db, itemId: string, viewer: Viewer, texto: string, enviar?: Enviar): Promise<number> {
  const [d] = await db.select({
    titulo: items.titulo, activo: items.estadoDueno, listId: lists.id, token: lists.shareToken, tokenAt: lists.shareTokenAt, tipo: lists.tipo,
  }).from(items).innerJoin(lists, eq(items.listId, lists.id)).where(eq(items.id, itemId))
  if (!d) return 0
  const [delHilo, regalan, [autor]] = await Promise.all([
    db.selectDistinct({ userId: comments.authorUserId }).from(comments).where(and(eq(comments.itemId, itemId), isNotNull(comments.authorUserId))),
    genteDelDeseo(db, itemId, d.listId),
    viewer.userId
      ? db.select({ nombre: users.nombre }).from(users).where(eq(users.id, viewer.userId))
      : db.select({ nombre: guestIdentities.nombre }).from(guestIdentities).where(eq(guestIdentities.id, viewer.guestId!)),
  ])
  const quien = (autor?.nombre ?? 'Alguien').trim().split(/\s+/)[0]
  const ids = new Set([...delHilo, ...regalan].flatMap((p) => (p.userId && p.userId !== viewer.userId ? [p.userId] : [])))
  const adonde = d.tipo === 'sorpresa' ? `/sorpresa/${d.token}` : d.activo === 'activo' ? `/l/${d.token}/item/${itemId}` : `/l/${d.token}`
  const cuerpo = texto.length > EN_EL_AVISO ? `${texto.slice(0, EN_EL_AVISO - 1).trimEnd()}…` : texto
  const avisados = await Promise.all([...ids].map(async (userId) => {
    if ((await accesoALista(db, d.listId, { userId })) !== 'regalador') return 0
    const [sigue] = d.tokenAt
      ? await db.select({ id: listFollows.listId }).from(listFollows).where(and(eq(listFollows.userId, userId), eq(listFollows.listId, d.listId)))
      : [true]
    await avisar(db, userId, {
      tipo: null, de: viewer.userId ?? null, title: `💬 ${quien} comentó en "${d.titulo}"`, body: cuerpo, url: sigue ? adonde : '/avisos',
    }, enviar)
    return 1
  }))
  return avisados.reduce((a: number, b) => a + b, 0)
}
