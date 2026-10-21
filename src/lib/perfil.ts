import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { fotosPerfil, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { duenosDeLista, esUuid } from '@/lib/groups'
import { diasEntre, hoyLocal, proximaFecha } from '@/lib/events'
import { seccionesDeGustos, type SeccionGustos, type Talles } from '@/lib/gustos'
import { urlFoto } from '@/lib/users'

export { urlFoto }

// Foto de perfil y perfil público ("así te ven"): lo que ve quien abre tu lista. Nunca reservas.

export const FOTO_MAX_BYTES = 6_000_000
const FOTO_LADO = 400

/**
 * Deja cualquier imagen como un JPEG cuadrado de 400px, derecho (EXIF) y sin metadatos (nada de GPS).
 * Tira error si no es una imagen.
 */
export async function procesarFoto(datos: Buffer): Promise<Buffer> {
  return sharp(datos, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize(FOTO_LADO, FOTO_LADO, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()
}

export async function guardarFoto(db: Db, userId: string, jpeg: Buffer): Promise<Date> {
  const ahora = new Date()
  await db.insert(fotosPerfil).values({ userId, datos: jpeg, updatedAt: ahora })
    .onConflictDoUpdate({ target: fotosPerfil.userId, set: { datos: jpeg, updatedAt: ahora } })
  await db.update(users).set({ fotoAt: ahora }).where(eq(users.id, userId))
  return ahora
}

export async function borrarFoto(db: Db, userId: string) {
  await db.delete(fotosPerfil).where(eq(fotosPerfil.userId, userId))
  await db.update(users).set({ fotoAt: null }).where(eq(users.id, userId))
}

export async function leerFoto(db: Db, userId: string): Promise<Buffer | null> {
  if (!esUuid(userId)) return null
  const [f] = await db.select({ datos: fotosPerfil.datos }).from(fotosPerfil).where(eq(fotosPerfil.userId, userId))
  return f?.datos ?? null
}

export async function miFoto(db: Db, userId: string): Promise<string | null> {
  const [u] = await db.select({ id: users.id, fotoAt: users.fotoAt, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId))
  return u ? urlFoto(u) : null
}

export type PerfilPublico = {
  /** La lista del link (para seguirla al abrir el perfil con sesión). */
  listId: string
  id: string
  nombre: string
  foto: string | null
  cumple: { dia: number; mes: number; dias: number } | null
  /** Todas las secciones con algo cargado (para "Ver todo"). */
  secciones: SeccionGustos[]
  talles: Talles | null
  /** Otros dueños de la misma lista (en un grupo), para pasar de un perfil a otro. */
  otros: { id: string; nombre: string; foto: string | null }[]
}

/**
 * El perfil de un dueño de la lista, tal como lo ve cualquiera con el link: foto, cumple, gustos y talles.
 * En un grupo, `quien` elige el dueño (por defecto el primero). Null si el token o el dueño no existen.
 */
export async function perfilPublico(db: Db, token: string, quien?: string, hoy = hoyLocal()): Promise<PerfilPublico | null> {
  const [list] = await db.select({ id: lists.id, ownerId: lists.ownerId }).from(lists).where(eq(lists.shareToken, token))
  if (!list) return null
  const duenos = await duenosDeLista(db, list)
  const elegido = (quien && duenos.find((d) => d.id === quien)) || duenos[0]
  if (!elegido) return null
  const [u] = await db.select().from(users).where(eq(users.id, elegido.id))
  const cumple = u.cumpleDia && u.cumpleMes
    ? { dia: u.cumpleDia, mes: u.cumpleMes, dias: diasEntre(hoy, proximaFecha(u.cumpleDia, u.cumpleMes, hoy)) }
    : null
  const talles = u.gustos && Object.values(u.gustos.talles).some(Boolean) ? u.gustos.talles : null
  const otros = duenos.length > 1
    ? await Promise.all(duenos.filter((d) => d.id !== u.id).map(async (d) => ({ id: d.id, nombre: d.nombre, foto: await miFoto(db, d.id) })))
    : []
  return { listId: list.id, id: u.id, nombre: u.nombre, foto: urlFoto(u), cumple, secciones: seccionesDeGustos(u.gustos), talles, otros }
}
