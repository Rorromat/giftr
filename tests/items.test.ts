import { expect, test } from 'vitest'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { comments, items, notifications } from '@/db/schema'
import { reserveItem } from '@/lib/claims'
import { archiveItem, createItem, updateItem } from '@/lib/items'
import { getUnreadNotifications, markNotificationsRead } from '@/lib/notifications'
import { addComment } from '@/lib/comments'

async function setup() {
  const db = await createTestDb()
  const seed = await seedOwnerAndGiver(db)
  return { db, ...seed }
}

test('crear item requiere ser dueño de una lista', async () => {
  const { db, owner } = await setup()
  const item = await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Mate imperial', precio: '$30.000' })
  expect(item?.titulo).toBe('Mate imperial')
  expect(await createItem(db, 'no-existe', { tipo: 'idea', titulo: 'x' })).toBeNull()
})

test('archivar con reserva activa notifica al regalador; editar también', async () => {
  const { db, owner, giver } = await setup()
  const item = await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Termo' })
  await reserveItem(db, item!.id, { userId: giver.id })

  await updateItem(db, item!.id, owner.id, { notas: 'en negro' })
  await archiveItem(db, item!.id, owner.id, 'lo_tengo')

  const notifs = await getUnreadNotifications(db, { userId: giver.id })
  expect(notifs.map((n) => n.tipo).sort()).toEqual(['item_baja', 'item_editado'])
  expect(notifs[0].itemTitulo).toBe('Termo')

  await markNotificationsRead(db, { userId: giver.id })
  expect(await getUnreadNotifications(db, { userId: giver.id })).toHaveLength(0)
})

test('archivar sin reservas no genera notificaciones', async () => {
  const { db, owner } = await setup()
  const item = await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Libro' })
  await archiveItem(db, item!.id, owner.id, 'no_lo_quiero')
  expect(await db.select().from(notifications)).toHaveLength(0)
})

test('solo el dueño puede editar/archivar', async () => {
  const { db, owner, giver } = await setup()
  const item = await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Termo' })
  expect(await updateItem(db, item!.id, giver.id, { titulo: 'hackeado' })).toBe(false)
  expect(await archiveItem(db, item!.id, giver.id, 'lo_tengo')).toBe(false)
})

test('el dueño no puede comentar en sus items; el regalador y el guest sí', async () => {
  const { db, owner, giver } = await setup()
  const item = await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Termo' })
  expect(await addComment(db, item!.id, { userId: owner.id }, 'hola?')).toBe(false)
  expect(await addComment(db, item!.id, {}, 'anónimo')).toBe(false)
  expect(await addComment(db, item!.id, { userId: giver.id }, '¿talle?')).toBe(true)
  expect(await db.select().from(comments)).toHaveLength(1)
})
