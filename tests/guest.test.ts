import { expect, test } from 'vitest'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { claims, items, lists } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { reserveItem } from '@/lib/claims'
import { createGuest } from '@/lib/guest'
import { upsertUserFromGoogle } from '@/lib/users'

test('un guest puede reservar', async () => {
  const db = await createTestDb()
  const { list } = await seedOwnerAndGiver(db)
  const [item] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  const guest = await createGuest(db, 'Abuela', 'abuela@test.com')
  const r = await reserveItem(db, item.id, { guestId: guest.id })
  expect(r.ok).toBe(true)
})

test('al registrarse con el email del guest hereda sus claims', async () => {
  const db = await createTestDb()
  const { list } = await seedOwnerAndGiver(db)
  const [item] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  const guest = await createGuest(db, 'Abuela', 'abuela@test.com')
  await reserveItem(db, item.id, { guestId: guest.id })

  const user = await upsertUserFromGoogle(db, { googleId: 'g-abu', email: 'abuela@test.com', nombre: 'Abuela' })
  const [c] = await db.select().from(claims)
  expect(c.claimerUserId).toBe(user.id)
  expect(c.claimerGuestId).toBeNull()
})

test('upsert crea usuario con lista y es idempotente', async () => {
  const db = await createTestDb()
  const u1 = await upsertUserFromGoogle(db, { googleId: 'g-1', email: 'a@test.com', nombre: 'Ana' })
  const u2 = await upsertUserFromGoogle(db, { googleId: 'g-1', email: 'a@test.com', nombre: 'Ana María' })
  expect(u1.id).toBe(u2.id)
  const listas = await db.select().from(lists).where(eq(lists.ownerId, u1.id))
  expect(listas).toHaveLength(1)
  expect(listas[0].shareToken.length).toBeGreaterThanOrEqual(8)
})
