import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { fotosDeseo } from '@/db/schema'
import type { Db } from '@/db/types'
import { esUuid } from '@/lib/groups'

// Fotos de deseos subidas desde el teléfono (galería, cámara o pegadas). Se guardan en la base, como la foto
// de perfil, y el deseo las usa por su URL /foto/deseo/:id (que nunca cambia: cada subida es una foto nueva).

export const FOTO_DESEO_MAX_BYTES = 6_000_000
const LADO = 1200

const RUTA = /^\/foto\/deseo\/([0-9a-f-]{36})$/i

/** Si el valor es la URL de una foto de deseo subida (y no un link cualquiera). */
export const esUrlFotoDeseo = (v: string) => RUTA.test(v)

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

/** Guarda la foto y devuelve la URL para el deseo. */
export async function guardarFotoDeseo(db: Db, userId: string, jpeg: Buffer): Promise<string> {
  const [f] = await db.insert(fotosDeseo).values({ userId, datos: jpeg }).returning({ id: fotosDeseo.id })
  return `/foto/deseo/${f.id}`
}

export async function leerFotoDeseo(db: Db, id: string): Promise<Buffer | null> {
  if (!esUuid(id)) return null
  const [f] = await db.select({ datos: fotosDeseo.datos }).from(fotosDeseo).where(eq(fotosDeseo.id, id))
  return f?.datos ?? null
}
