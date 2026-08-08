import { expect, test } from 'vitest'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { claims, items, users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { expireStaleClaims, getMyClaimWarnings, markBought, releaseClaim, reserveItem } from '@/lib/claims'

async function setup(extra: Partial<typeof items.$inferInsert> = {}) {
  const db = await createTestDb()
  const seed = await seedOwnerAndGiver(db)
  const [item] = await db.insert(items).values({
    listId: seed.list.id, tipo: 'exacto', titulo: 'Termo', ...extra,
  }).returning()
  return { db, item, ...seed }
}

test('reservar funciona y fija expiración a 14 días', async () => {
  const { db, item, giver } = await setup()
  const r = await reserveItem(db, item.id, { userId: giver.id })
  expect(r.ok).toBe(true)
  const [c] = await db.select().from(claims)
  expect(c.estado).toBe('reservado')
  const dias = (c.expiresAt!.getTime() - Date.now()) / 86400_000
  expect(dias).toBeGreaterThan(13.9)
  expect(dias).toBeLessThan(14.1)
})

test('el segundo en llegar recibe sin_stock', async () => {
  const { db, item, giver } = await setup()
  const [otro] = await db.insert(users).values({ googleId: 'g-otro', nombre: 'Caro', email: 'caro@test.com' }).returning()
  await reserveItem(db, item.id, { userId: giver.id })
  const r = await reserveItem(db, item.id, { userId: otro.id })
  expect(r).toEqual({ ok: false, reason: 'sin_stock' })
})

test('cantidad 6 admite 6 reservas y la séptima falla', async () => {
  const { db, item } = await setup({ titulo: 'Copas de vino', cantidad: 6 })
  for (let i = 0; i < 6; i++) {
    const [u] = await db.insert(users).values({ googleId: `g-${i}`, nombre: `U${i}`, email: `u${i}@test.com` }).returning()
    expect((await reserveItem(db, item.id, { userId: u.id })).ok).toBe(true)
  }
  const [u7] = await db.insert(users).values({ googleId: 'g-7', nombre: 'U7', email: 'u7@test.com' }).returning()
  expect(await reserveItem(db, item.id, { userId: u7.id })).toEqual({ ok: false, reason: 'sin_stock' })
})

test('idea repetible admite reservas en paralelo', async () => {
  const { db, item, giver } = await setup({ tipo: 'idea', titulo: 'Medias divertidas', repetible: true })
  const [otro] = await db.insert(users).values({ googleId: 'g-otro', nombre: 'Caro', email: 'caro@test.com' }).returning()
  expect((await reserveItem(db, item.id, { userId: giver.id })).ok).toBe(true)
  expect((await reserveItem(db, item.id, { userId: otro.id })).ok).toBe(true)
})

test('auto-regalo prohibido', async () => {
  const { db, item, owner } = await setup()
  expect(await reserveItem(db, item.id, { userId: owner.id })).toEqual({ ok: false, reason: 'propio' })
})

test('item archivado no se puede reservar', async () => {
  const { db, item, giver } = await setup()
  await db.update(items).set({ estadoDueno: 'lo_tengo' }).where(eq(items.id, item.id))
  expect(await reserveItem(db, item.id, { userId: giver.id })).toEqual({ ok: false, reason: 'archivado' })
})

test('viewer sin identidad no puede reservar', async () => {
  const { db, item } = await setup()
  expect(await reserveItem(db, item.id, {})).toEqual({ ok: false, reason: 'sin_identidad' })
})

test('comprar y liberar solo sobre claims propios', async () => {
  const { db, item, giver } = await setup()
  const [otro] = await db.insert(users).values({ googleId: 'g-otro', nombre: 'Otro', email: 'otro@test.com' }).returning()
  const r = await reserveItem(db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error('reserva falló')
  expect(await markBought(db, r.claimId, { userId: otro.id })).toBe(false)
  expect(await markBought(db, r.claimId, { userId: giver.id }, 'set Batman')).toBe(true)
  const [c] = await db.select().from(claims)
  expect(c.estado).toBe('comprado')
  expect(c.notaQueCompre).toBe('set Batman')
  // ya comprado: liberar no aplica
  expect(await releaseClaim(db, r.claimId, { userId: giver.id })).toBe(false)
})

test('liberar devuelve el item a disponible', async () => {
  const { db, item, giver } = await setup()
  const r = await reserveItem(db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error('reserva falló')
  expect(await releaseClaim(db, r.claimId, { userId: giver.id })).toBe(true)
  expect((await reserveItem(db, item.id, { userId: giver.id })).ok).toBe(true)
})

test('una reserva vencida expira al leer y libera el cupo', async () => {
  const { db, item, giver } = await setup()
  await db.insert(claims).values({
    itemId: item.id, claimerUserId: giver.id, expiresAt: new Date(Date.now() - 1000),
  })
  await expireStaleClaims(db, item.id)
  const [c] = await db.select().from(claims)
  expect(c.estado).toBe('expirado')
  expect((await reserveItem(db, item.id, { userId: giver.id })).ok).toBe(true)
})

test('warning a mitad de plazo', async () => {
  const { db, item, giver } = await setup()
  // reserva creada hace 8 días, vence en 6 → pasada la mitad
  await db.insert(claims).values({
    itemId: item.id, claimerUserId: giver.id,
    createdAt: new Date(Date.now() - 8 * 86400_000),
    expiresAt: new Date(Date.now() + 6 * 86400_000),
  })
  const warnings = await getMyClaimWarnings(db, { userId: giver.id })
  expect(warnings).toHaveLength(1)
  expect(warnings[0].itemTitulo).toBe('Termo')
  expect(warnings[0].diasRestantes).toBe(6)
})
