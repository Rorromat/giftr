import { and, eq, isNull } from 'drizzle-orm'
import { claims, comments, guestIdentities, notifications } from '@/db/schema'
import type { Db } from '@/db/types'

export async function createGuest(db: Db, nombre: string, email?: string) {
  const [g] = await db.insert(guestIdentities)
    .values({ nombre: nombre.trim(), email: email?.trim() || null })
    .returning({ id: guestIdentities.id })
  return g
}

export async function promoteGuest(db: Db, email: string, userId: string) {
  const guests = await db.select().from(guestIdentities)
    .where(and(eq(guestIdentities.email, email), isNull(guestIdentities.promotedToUserId)))
  for (const g of guests) {
    await db.update(claims).set({ claimerUserId: userId, claimerGuestId: null }).where(eq(claims.claimerGuestId, g.id))
    await db.update(comments).set({ authorUserId: userId, authorGuestId: null }).where(eq(comments.authorGuestId, g.id))
    await db.update(notifications).set({ userId, guestId: null }).where(eq(notifications.guestId, g.id))
    await db.update(guestIdentities).set({ promotedToUserId: userId }).where(eq(guestIdentities.id, g.id))
  }
}

// ponytail: promoción secuencial sin transacción; envolver en db.transaction si algún día importa la atomicidad parcial
