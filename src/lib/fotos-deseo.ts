import { and, count, eq, gt, lt, notExists, sql } from 'drizzle-orm'
import sharp from 'sharp'
import { fotosDeseo, idDeFotoDeseo, items, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { esUuid } from '@/lib/groups'

// Fotos de deseos subidas desde el teléfono (galería, cámara o pegadas). Se guardan en la base, como la foto
// de perfil, y el deseo las usa por su URL /foto/deseo/:id (que nunca cambia: cada subida es una foto nueva).

export const FOTO_DESEO_MAX_BYTES = 6_000_000
const LADO = 1200

export { esUrlFotoDeseo } from '@/lib/links'

/**
 * Deja cualquier imagen como JPEG de hasta 1200px de lado (sin recortar ni agrandar), derecha (EXIF) y sin
 * metadatos (nada de GPS). Tira error si no es una imagen.
 */
export async function procesarFotoDeseo(datos: Buffer): Promise<Buffer> {
  return sharp(datos, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize(LADO, LADO, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()
}

/** Cuántas fotos de deseos puede subir alguien en un día (cambiar la foto varias veces entra de sobra). */
export const FOTOS_POR_DIA = 40

const haceUnDia = sql`now() - interval '24 hours'`

/** Si todavía puede subir fotos hoy (en las últimas 24 horas). */
export async function quedanFotos(db: Db, userId: string): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(fotosDeseo)
    .where(and(eq(fotosDeseo.userId, userId), gt(fotosDeseo.createdAt, haceUnDia)))
  return n < FOTOS_POR_DIA
}

/**
 * Guarda la foto y devuelve la URL para el deseo; null si ya subió FOTOS_POR_DIA hoy. De paso borra sus fotos de más de
 * un día que ningún deseo usa (las que cambió, quitó o subió y no guardó): el día de margen es para un formulario que
 * sigue abierto. Se mira cualquier deseo, de cualquier lista y archivado o no: el link de una foto subida se puede usar
 * en otro deseo, también de otra persona, y como venga escrito (con el id en mayúsculas, o con "?…" después).
 */
export async function guardarFotoDeseo(db: Db, userId: string, jpeg: Buffer): Promise<string | null> {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // lock del usuario: dos subidas a la vez no pasan juntas el cupo. "No key update" alcanza para eso y no frena lo que
    // apunta a su fila mientras tanto (una reserva suya, un comentario, un aviso para él).
    await t.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('no key update')
    if (!(await quedanFotos(t, userId))) return null
    // por el índice de items sobre idDeFotoDeseo: las que siguen en uso se vuelven a mirar en cada subida
    const usada = t.select({ id: items.id }).from(items).where(sql`${idDeFotoDeseo(items.fotoUrl)} = ${fotosDeseo.id}::text`)
    await t.delete(fotosDeseo).where(and(eq(fotosDeseo.userId, userId), lt(fotosDeseo.createdAt, haceUnDia), notExists(usada)))
    const [f] = await t.insert(fotosDeseo).values({ userId, datos: jpeg }).returning({ id: fotosDeseo.id })
    return `/foto/deseo/${f.id}`
  })
}

export async function leerFotoDeseo(db: Db, id: string): Promise<Buffer | null> {
  if (!esUuid(id)) return null
  const [f] = await db.select({ datos: fotosDeseo.datos }).from(fotosDeseo).where(eq(fotosDeseo.id, id))
  return f?.datos ?? null
}
