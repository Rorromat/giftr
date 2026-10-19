import { expect, test } from 'vitest'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { items, claims, comments } from '@/db/schema'
import { getListForViewer, getOwnList, getItemForViewer } from '@/lib/lists'

const OWNER_KEYS = ['categoria', 'cantidad', 'estadoDueno', 'fotoUrl', 'id', 'linkTienda', 'notas', 'precio', 'prioridad', 'rangoPrecio', 'repetible', 'tipo', 'titulo'].sort()

async function setup() {
  const db = await createTestDb()
  const seed = await seedOwnerAndGiver(db)
  const [item] = await db.insert(items).values({
    listId: seed.list.id, tipo: 'exacto', titulo: 'Termo Stanley', precio: '$95.000',
  }).returning()
  await db.insert(claims).values({
    itemId: item.id, claimerUserId: seed.giver.id,
    expiresAt: new Date(Date.now() + 14 * 86400_000),
  })
  await db.insert(comments).values({ itemId: item.id, authorUserId: seed.giver.id, texto: '¿de qué color lo quiere?' })
  return { db, item, ...seed }
}

test('EL TEST DE ORO: el dueño no puede ver estados de sus items por ningún endpoint', async () => {
  const { db, owner, item } = await setup()

  // por token compartido
  const porToken = await getListForViewer(db, 'tok-euge', { userId: owner.id })
  if (porToken?.role !== 'owner') throw new Error('esperaba owner')
  const json1 = JSON.stringify(porToken)
  for (const palabra of ['claim', 'reservado', 'comprado', 'disponible', 'comment', 'Rodri']) {
    expect(json1.toLowerCase()).not.toContain(palabra.toLowerCase())
  }
  expect(Object.keys(porToken.items[0]).sort()).toEqual(OWNER_KEYS)

  // por vista propia
  const propia = await getOwnList(db, owner.id)
  expect(JSON.stringify(propia).toLowerCase()).not.toContain('claim')
  expect(Object.keys(propia!.items[0]).sort()).toEqual(OWNER_KEYS)

  // por detalle de item directo (URL directa)
  const detalle = await getItemForViewer(db, 'tok-euge', item.id, { userId: owner.id })
  if (detalle?.role !== 'owner') throw new Error('esperaba owner')
  const json3 = JSON.stringify(detalle)
  for (const palabra of ['claim', 'reservado', 'comment', 'color']) {
    expect(json3.toLowerCase()).not.toContain(palabra.toLowerCase())
  }
  expect(Object.keys(detalle.item).sort()).toEqual(OWNER_KEYS)
})

test('el regalador ve claims, comentarios y disponibilidad', async () => {
  const { db, giver, item } = await setup()
  const vista = await getListForViewer(db, 'tok-euge', { userId: giver.id })
  if (vista?.role !== 'giver') throw new Error('esperaba vista giver')
  expect(vista.items[0].claims).toHaveLength(1)
  expect(vista.items[0].claims[0].claimerNombre).toBe('Rodri')
  expect(vista.items[0].claims[0].esMia).toBe(true)
  expect(vista.items[0].disponible).toBe(false) // cantidad 1, ya reservado

  const detalle = await getItemForViewer(db, 'tok-euge', item.id, { userId: giver.id })
  if (detalle?.role !== 'giver') throw new Error('esperaba detalle giver')
  expect(detalle.comments).toHaveLength(1)
})

test('un guest anónimo ve la vista giver', async () => {
  const { db } = await setup()
  const vista = await getListForViewer(db, 'tok-euge', {})
  expect(vista?.role).toBe('giver')
})

test('el dueño ve sus items archivados; el regalador no', async () => {
  const { db, owner, giver, list } = await setup()
  await db.insert(items).values({ listId: list.id, tipo: 'idea', titulo: 'Velas', estadoDueno: 'no_lo_quiero' })
  const propia = await getOwnList(db, owner.id)
  expect(propia!.items).toHaveLength(2)
  const ajena = await getListForViewer(db, 'tok-euge', { userId: giver.id })
  if (ajena?.role !== 'giver') throw new Error('esperaba giver')
  expect(ajena.items).toHaveLength(1)
})

test('giver con URL directa a item archivado obtiene null; dueño lo ve', async () => {
  const { db, owner, giver, list } = await setup()
  const [archived] = await db.insert(items).values({ listId: list.id, tipo: 'idea', titulo: 'Velas', estadoDueno: 'lo_tengo' }).returning()

  // Giver intenta ver item archivado via URL directa → null
  const giverView = await getItemForViewer(db, 'tok-euge', archived.id, { userId: giver.id })
  expect(giverView).toBeNull()

  // Guest anónimo intenta → null
  const guestView = await getItemForViewer(db, 'tok-euge', archived.id, {})
  expect(guestView).toBeNull()

  // Owner lo ve sin problemas
  const ownerView = await getItemForViewer(db, 'tok-euge', archived.id, { userId: owner.id })
  if (ownerView?.role !== 'owner') throw new Error('esperaba owner')
  expect(ownerView.item.titulo).toBe('Velas')
})
