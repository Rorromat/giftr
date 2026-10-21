import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { claims, items, lists, notifications, users } from '@/db/schema'
import { reserveItem } from '@/lib/claims'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { archiveItem, createItem, deseoParaEditar, updateItem } from '@/lib/items'
import { getListForViewer } from '@/lib/lists'
import { getUnreadNotifications, markNotificationsRead } from '@/lib/notifications'

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

test('cambiar la prioridad o la categoría se guarda pero no le avisa a quien lo reservó', async () => {
  const { db, owner, giver, item } = await setup()
  await reserveItem(db, item.id, { userId: giver.id })
  expect(await updateItem(db, item.id, owner.id, { prioridad: 'mucho' })).toBe(true)
  expect(await updateItem(db, item.id, owner.id, { categoria: 'Casa' })).toBe(true)
  const [fila] = await db.select().from(items).where(eq(items.id, item.id))
  expect(fila).toMatchObject({ prioridad: 'mucho', categoria: 'Casa' })
  expect(await db.select().from(notifications)).toEqual([])
})

test('varias ediciones seguidas dejan un solo aviso sin leer; después de leerlo, la próxima avisa de nuevo', async () => {
  const { db, owner, giver, item } = await setup()
  await reserveItem(db, item.id, { userId: giver.id })
  await updateItem(db, item.id, owner.id, { titulo: 'Termo Stanley' })
  const [primero] = await db.select().from(notifications)
  await updateItem(db, item.id, owner.id, { precio: '$35.000' })
  await updateItem(db, item.id, owner.id, { fotoUrl: 'https://tienda.com/termo.jpg' })
  const avisos = await db.select().from(notifications)
  expect(avisos).toHaveLength(1)
  // el que había sube: es el más reciente
  expect(avisos[0].createdAt.getTime()).toBeGreaterThanOrEqual(primero.createdAt.getTime())
  await markNotificationsRead(db, { userId: giver.id })
  await updateItem(db, item.id, owner.id, { notas: 'el verde' })
  expect(await getUnreadNotifications(db, { userId: giver.id })).toHaveLength(1)
})

test('un deseo archivado no se edita ni avisa (una pantalla vieja, la prioridad desde Mi lista)', async () => {
  const { db, owner, item } = await setup()
  const [caro] = await db.insert(users).values({ googleId: 'g-caro', nombre: 'Caro', email: 'caro@test.com' }).returning()
  await db.update(items).set({ cantidad: 2 }).where(eq(items.id, item.id))
  await reserveItem(db, item.id, { userId: caro.id })
  await db.update(claims).set({ estado: 'comprado' })
  await archiveItem(db, item.id, owner.id, 'lo_tengo')
  expect(await updateItem(db, item.id, owner.id, { prioridad: 'mucho' })).toBe(false)
  expect(await updateItem(db, item.id, owner.id, { titulo: 'otro' })).toBe(false)
  const [fila] = await db.select().from(items).where(eq(items.id, item.id))
  expect(fila).toMatchObject({ titulo: 'Termo', prioridad: 'gustaria' })
  expect(await db.select().from(notifications)).toEqual([])
})

test('"Se puede repetir" es solo de las ideas: en "Quiero ESTO" se guarda sin la marca', async () => {
  const { db, owner, giver, list } = await setup()
  const exacto = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Mate imperial', repetible: true }))!
  expect(exacto.repetible).toBe(false)
  const idea = (await createItem(db, owner.id, { tipo: 'idea', titulo: 'Algo para el mate', repetible: true }))!
  expect(idea.repetible).toBe(true)
  // pasa a "Quiero ESTO" con el casillero tildado de antes: pierde la marca
  await updateItem(db, idea.id, owner.id, { tipo: 'exacto', titulo: 'Mate Stanley', repetible: true })
  const [fila] = await db.select().from(items).where(eq(items.id, idea.id))
  expect(fila).toMatchObject({ tipo: 'exacto', repetible: false })
  // y un "Quiero ESTO" no la recibe sola
  await updateItem(db, idea.id, owner.id, { repetible: true })
  expect((await db.select().from(items).where(eq(items.id, idea.id)))[0].repetible).toBe(false)

  // uno de antes con la marca: al cambiarle la prioridad la pierde, sin avisarle nada a quien lo reservó (no cambió nada)
  const [viejo] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo', repetible: true }).returning()
  await reserveItem(db, viejo.id, { userId: giver.id })
  await updateItem(db, viejo.id, owner.id, { prioridad: 'mucho' })
  expect((await db.select().from(items).where(eq(items.id, viejo.id)))[0]).toMatchObject({ prioridad: 'mucho', repetible: false })
  expect(await db.select().from(notifications)).toEqual([])
})

test('bajar la cantidad por debajo de lo reservado se puede: les avisa a los que reservaron y la lista lo muestra', async () => {
  const { db, owner, item } = await setup()
  await db.update(items).set({ titulo: 'Copas', cantidad: 3 }).where(eq(items.id, item.id))
  const amigos = []
  for (let i = 0; i < 3; i++) {
    const [u] = await db.insert(users).values({ googleId: `g-${i}`, nombre: `U${i}`, email: `u${i}@test.com` }).returning()
    await reserveItem(db, item.id, { userId: u.id })
    amigos.push(u)
  }
  expect(await updateItem(db, item.id, owner.id, { cantidad: 1 })).toBe(true)
  for (const u of amigos) expect((await getUnreadNotifications(db, { userId: u.id })).map((n) => n.tipo)).toEqual(['item_editado'])
  expect(await db.select().from(notifications).where(eq(notifications.userId, owner.id))).toEqual([])
  const vista = await getListForViewer(db, 'tok-euge', { userId: amigos[0].id })
  if (vista?.role !== 'giver') throw new Error('esperaba giver')
  expect(vista.items[0]).toMatchObject({ cantidad: 1, quedan: 0, disponible: false })
  expect(vista.items[0].claims).toHaveLength(3)
})
