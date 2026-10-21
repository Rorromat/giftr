import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { lists, users } from '@/db/schema'
import type { Db } from '@/db/types'

export function newShareToken(): string {
  return randomBytes(8).toString('base64url')
}

// El invitado que usaba este navegador se une a la cuenta al entrar (por la cookie, en src/auth.ts), no por email:
// el email que escribía un invitado nadie lo verificaba.
export async function upsertUserFromGoogle(
  db: Db,
  p: { googleId: string; email: string; nombre: string; avatarUrl?: string | null },
) {
  const [user] = await db.insert(users)
    .values({ googleId: p.googleId, email: p.email, nombre: p.nombre, avatarUrl: p.avatarUrl ?? null })
    .onConflictDoUpdate({ target: users.googleId, set: { nombre: p.nombre, avatarUrl: p.avatarUrl ?? null } })
    .returning()
  await db.insert(lists)
    .values({ ownerId: user.id, shareToken: newShareToken() })
    .onConflictDoNothing({ target: lists.ownerId })
  return user
}

/**
 * La lista personal del usuario. Si le falta (un usuario de antes o un alta que se cortó a la mitad), se la crea:
 * así nadie queda rebotando entre / y /mi-lista. Null solo si el usuario no existe (una sesión de una base vieja).
 */
export async function asegurarListaPropia(db: Db, userId: string) {
  const buscar = () => db.select({ id: lists.id, shareToken: lists.shareToken }).from(lists).where(eq(lists.ownerId, userId))
  const [lista] = await buscar()
  if (lista) return lista
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId))
  if (!user) return null
  await db.insert(lists).values({ ownerId: userId, shareToken: newShareToken() }).onConflictDoNothing({ target: lists.ownerId })
  const [creada] = await buscar()
  return creada ?? null
}

/** La foto subida (versionada para poder cachearla para siempre), si no la de Google, si no nada (iniciales). */
export function urlFoto(u: { id: string; fotoAt: Date | null; avatarUrl: string | null }): string | null {
  return u.fotoAt ? `/foto/${u.id}?v=${u.fotoAt.getTime()}` : u.avatarUrl
}
