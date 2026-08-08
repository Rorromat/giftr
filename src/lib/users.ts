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
