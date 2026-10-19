import { expect, test } from 'vitest'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { items } from '@/db/schema'

test('schema migra y acepta un item', async () => {
  const db = await createTestDb()
  const { list } = await seedOwnerAndGiver(db)
  const [item] = await db.insert(items).values({
    listId: list.id, tipo: 'exacto', titulo: 'Termo Stanley', precio: '$95.000',
  }).returning()
  expect(item.prioridad).toBe('gustaria')
  expect(item.cantidad).toBe(1)
  expect(item.estadoDueno).toBe('activo')
})
