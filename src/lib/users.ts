import { randomBytes } from 'node:crypto'
import { lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { promoteGuest } from '@/lib/guest'

export function newShareToken(): string {
  return randomBytes(8).toString('base64url')
}

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
  await promoteGuest(db, p.email, user.id)
  return user
}

/** La foto subida (versionada para poder cachearla para siempre), si no la de Google, si no nada (iniciales). */
export function urlFoto(u: { id: string; fotoAt: Date | null; avatarUrl: string | null }): string | null {
  return u.fotoAt ? `/foto/${u.id}?v=${u.fotoAt.getTime()}` : u.avatarUrl
}
