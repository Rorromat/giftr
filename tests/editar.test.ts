import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { items, lists, notifications } from '@/db/schema'
import { reserveItem } from '@/lib/claims'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { archiveItem, createItem, deseoParaEditar, updateItem } from '@/lib/items'

async function setup() {
  const db = await createTestDb()
  const seed = await seedOwnerAndGiver(db)
  const item = (await createItem(db, seed.owner.id, { tipo: 'exacto', titulo: 'Termo', notas: 'en negro', precio: '$30.000' }))!
  return { db, ...seed, item }
}

test('editar: solo el dueño (o un co-dueño del grupo) abre su deseo, y solo si sigue activo', async () => {
  const { db, owner, giver, item } = await setup()
  expect(await deseoParaEditar(db, item.id, owner.id)).toMatchObject({ deseo: { id: item.id, titulo: 'Termo' }, grupo: null })
  expect(await deseoParaEditar(db, item.id, giver.id)).toBeNull()
  expect(await deseoParaEditar(db, 'no-es-uuid', owner.id)).toBeNull()

  // en un grupo, cualquiera de los dueños, y vuelve al grupo
  const grupoId = await crearGrupo(db, owner.id, { nombre: 'Nuestra casa' })
  const [{ inviteToken }] = await db.select({ inviteToken: lists.inviteToken }).from(lists).where(eq(lists.id, grupoId))
  await unirseAGrupo(db, inviteToken!, giver.id)
  const deGrupo = (await createItem(db, owner.id, { tipo: 'idea', titulo: 'Plantas' }, grupoId))!
  expect(await deseoParaEditar(db, deGrupo.id, giver.id)).toMatchObject({ grupo: { id: grupoId, nombre: 'Nuestra casa' } })

  await archiveItem(db, item.id, owner.id, 'lo_tengo')
  expect(await deseoParaEditar(db, item.id, owner.id)).toBeNull()
})

test('editar: null borra los campos opcionales y se guardan los cambios', async () => {
  const { db, owner, item } = await setup()
  expect(await updateItem(db, item.id, owner.id, { titulo: 'Termo Stanley', notas: null, precio: null, fotoUrl: '/foto/deseo/6a1c701f-89b2-4797-ad8e-0bec5918fc9a' })).toBe(true)
  const [fila] = await db.select().from(items).where(eq(items.id, item.id))
  expect(fila).toMatchObject({ titulo: 'Termo Stanley', notas: null, precio: null, fotoUrl: '/foto/deseo/6a1c701f-89b2-4797-ad8e-0bec5918fc9a' })
})

test('REGLA DE LA SORPRESA: guardar sin cambios no avisa; un cambio real avisa a quien lo reservó', async () => {
  const { db, owner, giver, item } = await setup()
  await reserveItem(db, item.id, { userId: giver.id })
  expect(await updateItem(db, item.id, owner.id, { titulo: 'Termo', notas: 'en negro', precio: '$30.000' })).toBe(true)
  expect(await db.select().from(notifications)).toHaveLength(0)
  await updateItem(db, item.id, owner.id, { notas: 'en verde' })
  const avisos = await db.select().from(notifications)
  expect(avisos.map((n) => [n.tipo, n.userId])).toEqual([['item_editado', giver.id]])
  // el dueño no recibe nada
  expect(avisos.some((n) => n.userId === owner.id)).toBe(false)
})
