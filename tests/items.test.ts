import { expect, test } from 'vitest'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { eq } from 'drizzle-orm'
import { claims, comments, items, lists, notifications, users } from '@/db/schema'
import { desmarcarComprado, getMyClaimWarnings, markBought, reserveItem } from '@/lib/claims'
import { archiveItem, createItem, restoreItem, updateItem } from '@/lib/items'
import { getUnreadNotifications, markNotificationsRead, textoDeAviso } from '@/lib/notifications'
import { addComment } from '@/lib/comments'
import { createGuest } from '@/lib/guest'
import { getListForViewer, getOwnList } from '@/lib/lists'
import { crearGrupo } from '@/lib/groups'

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
  expect((await getUnreadNotifications(db, { userId: giver.id })).map((n) => n.tipo)).toEqual(['item_editado'])
  // "fue editado, revisá los detalles" ya no vale sobre algo que salió de la lista
  await archiveItem(db, item!.id, owner.id, 'lo_tengo')

  const notifs = await getUnreadNotifications(db, { userId: giver.id })
  expect(notifs.map((n) => n.tipo)).toEqual(['item_baja'])
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

const DIA = 86400_000

/** Copas x3 de Euge: Rodri reservó una hace 10 días (le quedan 4), Caro compró otra y la abuela (invitada) reservó la tercera. */
async function conCopas() {
  const s = await setup()
  const [caro] = await s.db.insert(users).values({ googleId: 'g-caro', nombre: 'Caro', email: 'caro@test.com' }).returning()
  const abuela = await createGuest(s.db, 'Abuela')
  const copas = (await createItem(s.db, s.owner.id, { tipo: 'exacto', titulo: 'Copas', cantidad: 3 }))!
  await reserveItem(s.db, copas.id, { userId: s.giver.id })
  await s.db.update(claims).set({ createdAt: new Date(Date.now() - 10 * DIA), expiresAt: new Date(Date.now() + 4 * DIA) })
  const deCaro = await reserveItem(s.db, copas.id, { userId: caro.id })
  if (!deCaro.ok) throw new Error(deCaro.reason)
  await markBought(s.db, deCaro.claimId, { userId: caro.id })
  await reserveItem(s.db, copas.id, { guestId: abuela.id })
  return { ...s, caro, abuela, copas }
}

const estados = async (db: Awaited<ReturnType<typeof setup>>['db']) =>
  Object.fromEntries((await db.select().from(claims)).map((c) => [c.claimerUserId ?? c.claimerGuestId, c.estado]))

test('archivar: lo reservado sin comprar se libera y se avisa; lo comprado queda y con "Ya lo tengo" no se avisa', async () => {
  const { db, owner, giver, caro, abuela, copas } = await conCopas()
  expect(await getMyClaimWarnings(db, { userId: giver.id })).toHaveLength(1)
  expect(await archiveItem(db, copas.id, owner.id, 'lo_tengo')).toBe(true)
  expect(await estados(db)).toEqual({ [giver.id]: 'liberado', [abuela.id]: 'liberado', [caro.id]: 'comprado' })
  expect((await getUnreadNotifications(db, { userId: giver.id })).map((n) => n.tipo)).toEqual(['item_baja'])
  expect((await getUnreadNotifications(db, { guestId: abuela.id })).map((n) => n.tipo)).toEqual(['item_baja'])
  expect(await getUnreadNotifications(db, { userId: caro.id })).toEqual([])
  // ya no le pregunta "¿Conseguiste…?" por algo que no puede abrir
  expect(await getMyClaimWarnings(db, { userId: giver.id })).toEqual([])
  expect(await db.select().from(notifications).where(eq(notifications.userId, owner.id))).toEqual([])
})

test('"Ya no lo quiero" le avisa a quien ya lo compró, con su propio texto', async () => {
  const { db, owner, giver, caro, copas } = await conCopas()
  await archiveItem(db, copas.id, owner.id, 'no_lo_quiero')
  expect((await getUnreadNotifications(db, { userId: caro.id })).map((n) => n.tipo)).toEqual(['item_baja_comprado'])
  expect(textoDeAviso('item_baja_comprado', 'Copas')).toContain('ya no lo quiere')
  expect((await getUnreadNotifications(db, { userId: giver.id })).map((n) => n.tipo)).toEqual(['item_baja'])
})

test('archivar dos veces (un doble toque, una pantalla vieja) no repite avisos ni cambia el motivo', async () => {
  const { db, owner, giver, copas } = await conCopas()
  expect(await archiveItem(db, copas.id, owner.id, 'lo_tengo')).toBe(true)
  expect(await archiveItem(db, copas.id, owner.id, 'no_lo_quiero')).toBe(false)
  expect((await getOwnList(db, owner.id))!.items[0].estadoDueno).toBe('lo_tengo')
  expect(await getUnreadNotifications(db, { userId: giver.id })).toHaveLength(1)
})

test('"Volver a mi lista": vuelve con lo que tenía (lo comprado sigue a su nombre), y solo lo hace un dueño', async () => {
  const { db, owner, giver, caro, copas } = await conCopas()
  await archiveItem(db, copas.id, owner.id, 'lo_tengo')
  expect(await restoreItem(db, copas.id, giver.id)).toBe(false)
  expect(await restoreItem(db, 'no-es-uuid', owner.id)).toBe(false)
  expect(await restoreItem(db, copas.id, owner.id)).toBe(true)
  expect(await restoreItem(db, copas.id, owner.id)).toBe(false)
  const vista = await getListForViewer(db, 'tok-euge', { userId: giver.id })
  if (vista?.role !== 'giver') throw new Error('esperaba giver')
  expect(vista.items[0]).toMatchObject({ estadoDueno: 'activo', quedan: 2, disponible: true })
  expect(vista.items[0].claims).toEqual([expect.objectContaining({ claimerNombre: 'Caro', estado: 'comprado' })])
  // con "Ya lo tengo" a Caro no se le había dicho nada, y no se le dice; a Rodri, que se le liberó la reserva, que volvió
  expect(await getUnreadNotifications(db, { userId: caro.id })).toEqual([])
  expect(await getUnreadNotifications(db, { userId: giver.id })).toEqual([
    expect.objectContaining({ tipo: 'item_vuelve', href: `/l/tok-euge/item/${copas.id}` }),
  ])
})

test('"Volver a mi lista" después de "Ya no lo quiero": al que lo compró se le avisa que volvió, y lo puede deshacer', async () => {
  const { db, owner, giver, caro, abuela, copas } = await conCopas()
  await archiveItem(db, copas.id, owner.id, 'no_lo_quiero')
  expect(await restoreItem(db, copas.id, owner.id)).toBe(true)
  // el "cambialo" ya no vale (y ahora llevaría al deseo diciendo que salió): le llega que volvió y sigue a su nombre
  expect(await getUnreadNotifications(db, { userId: caro.id })).toEqual([
    expect.objectContaining({ tipo: 'compra_vuelve', href: `/l/tok-euge/item/${copas.id}` }),
  ])
  expect(textoDeAviso('compra_vuelve', 'Copas')).toContain('Me equivoqué')
  expect((await getUnreadNotifications(db, { guestId: abuela.id })).map((n) => n.tipo)).toEqual(['item_vuelve'])
  expect((await getUnreadNotifications(db, { userId: giver.id })).map((n) => n.tipo)).toEqual(['item_vuelve'])
  const [deCaro] = await db.select().from(claims).where(eq(claims.claimerUserId, caro.id))
  expect(await desmarcarComprado(db, deCaro.id, { userId: caro.id })).toBe(true)
  // un aviso que ya había leído queda leído; a la dueña, nada
  expect(await db.select().from(notifications).where(eq(notifications.userId, owner.id))).toEqual([])
})

test('REGLA DE LA SORPRESA: archivar y volver a poner le responden igual al dueño, haya o no reservas', async () => {
  const { db, owner, copas } = await conCopas()
  const libro = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Libro' }))!
  for (const deseo of [copas, libro]) {
    expect(await archiveItem(db, deseo.id, owner.id, 'no_lo_quiero')).toBe(true)
    expect(await archiveItem(db, deseo.id, owner.id, 'no_lo_quiero')).toBe(false)
  }
  const archivados = (await getOwnList(db, owner.id))!.items
  expect(JSON.stringify(archivados).toLowerCase()).not.toMatch(/claim|reserv|compr|caro|rodri|abuela/)
  for (const deseo of [copas, libro]) expect(await restoreItem(db, deseo.id, owner.id)).toBe(true)
  expect(await getUnreadNotifications(db, { userId: owner.id })).toEqual([])
  expect(await db.select().from(notifications).where(eq(notifications.userId, owner.id))).toEqual([])
})

const HACE_13_MESES = () => new Date(Date.now() - 395 * DIA)

test('lo comprado para un evento anterior ya se regaló: editar o "Ya no lo quiero" no le avisa a quien lo compró', async () => {
  const { db, owner, giver } = await setup()
  const [ana] = await db.insert(users).values({ googleId: 'g-ana', nombre: 'Ana', email: 'ana@test.com' }).returning()
  const medias = (await createItem(db, owner.id, { tipo: 'idea', titulo: 'Medias', repetible: true }))!
  const termo = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Termo', cantidad: 2 }))!
  // Rodri le regaló medias y un termo el cumple pasado (la lista no tiene fecha: cuenta el último año)
  for (const it of [medias, termo]) {
    await db.insert(claims).values({ itemId: it.id, claimerUserId: giver.id, estado: 'comprado', createdAt: HACE_13_MESES(), updatedAt: HACE_13_MESES() })
  }
  // y Ana reservó medias para este
  await reserveItem(db, medias.id, { userId: ana.id })
  for (const it of [medias, termo]) await updateItem(db, it.id, owner.id, { notas: 'otras' })
  expect(await getUnreadNotifications(db, { userId: giver.id })).toEqual([])
  expect((await getUnreadNotifications(db, { userId: ana.id })).map((n) => n.tipo)).toEqual(['item_editado'])
  for (const it of [medias, termo]) await archiveItem(db, it.id, owner.id, 'no_lo_quiero')
  expect(await getUnreadNotifications(db, { userId: giver.id })).toEqual([])
  // una de este evento, sí
  await db.update(claims).set({ updatedAt: new Date() }).where(eq(claims.claimerUserId, giver.id))
  await restoreItem(db, termo.id, owner.id)
  expect((await getUnreadNotifications(db, { userId: giver.id })).map((n) => n.tipo)).toEqual(['compra_vuelve'])
})

test('sacar, volver a poner y sacar otra vez: a cada uno le queda un solo aviso, el que vale', async () => {
  const { db, owner, giver, caro, copas } = await conCopas()
  const tipos = async (userId: string) => (await getUnreadNotifications(db, { userId })).map((n) => n.tipo).sort()
  await archiveItem(db, copas.id, owner.id, 'lo_tengo')
  await restoreItem(db, copas.id, owner.id)
  expect(await tipos(giver.id)).toEqual(['item_vuelve'])
  // la reserva de nuevo sin leer el aviso, y lo vuelven a sacar: "volvió, reservalo de nuevo" ya no vale
  await reserveItem(db, copas.id, { userId: giver.id })
  await archiveItem(db, copas.id, owner.id, 'lo_tengo')
  expect(await tipos(giver.id)).toEqual(['item_baja'])
  await restoreItem(db, copas.id, owner.id)
  expect(await tipos(giver.id)).toEqual(['item_vuelve'])

  // a Caro, que lo compró, "volvió y sigue a tu nombre" tampoco le queda al lado de "ya no lo quiere"
  await archiveItem(db, copas.id, owner.id, 'no_lo_quiero')
  await restoreItem(db, copas.id, owner.id)
  expect(await tipos(caro.id)).toEqual(['compra_vuelve'])
  await archiveItem(db, copas.id, owner.id, 'no_lo_quiero')
  expect(await tipos(caro.id)).toEqual(['item_baja_comprado'])
  // ni "fue editado" sobre algo que salió
  await restoreItem(db, copas.id, owner.id)
  await updateItem(db, copas.id, owner.id, { notas: 'de cristal' })
  await archiveItem(db, copas.id, owner.id, 'lo_tengo')
  expect(await tipos(caro.id)).toEqual([])
  expect(await db.select().from(notifications).where(eq(notifications.userId, owner.id))).toEqual([])
})

// Antes archivar solo avisaba ('item_baja') y dejaba las reservas como estaban: hay deseos archivados así.
test('volver a poner un deseo que se archivó antes de esto no le dice "se liberó" a quien todavía lo tiene reservado', async () => {
  const { db, owner, giver } = await setup()
  const [ana] = await db.insert(users).values({ googleId: 'g-ana', nombre: 'Ana', email: 'ana@test.com' }).returning()
  const termo = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Termo', cantidad: 2 }))!
  const r = await reserveItem(db, termo.id, { userId: giver.id })
  if (!r.ok) throw new Error(r.reason)
  // a Ana sí se le había liberado (o le venció), y tampoco lo vio
  const deAna = await reserveItem(db, termo.id, { userId: ana.id })
  if (!deAna.ok) throw new Error(deAna.reason)
  await db.update(claims).set({ expiresAt: new Date(Date.now() - DIA) }).where(eq(claims.id, deAna.claimId))
  await db.update(items).set({ estadoDueno: 'lo_tengo' }).where(eq(items.id, termo.id))
  await db.insert(notifications).values([giver.id, ana.id].map((userId) => ({ userId, tipo: 'item_baja' as const, itemId: termo.id })))

  expect(await restoreItem(db, termo.id, owner.id)).toBe(true)
  expect(await getUnreadNotifications(db, { userId: giver.id })).toEqual([])
  expect((await db.select().from(claims).where(eq(claims.id, r.claimId)))[0].estado).toBe('reservado')
  expect((await getUnreadNotifications(db, { userId: ana.id })).map((n) => n.tipo)).toEqual(['item_vuelve'])
})

test('un doble toque antes de que cargue la página no duplica el deseo, el comentario ni el grupo', async () => {
  const { db, owner, giver } = await setup()
  const ps5 = await createItem(db, owner.id, { tipo: 'exacto', titulo: 'PS5' })
  expect(await createItem(db, owner.id, { tipo: 'exacto', titulo: 'PS5' })).toEqual(ps5)
  expect((await getOwnList(db, owner.id))!.items).toHaveLength(1)
  expect(await addComment(db, ps5!.id, { userId: giver.id }, 'la compro yo')).toBe(true)
  expect(await addComment(db, ps5!.id, { userId: giver.id }, 'la compro yo')).toBe(true)
  expect(await db.select().from(comments)).toHaveLength(1)
  const grupo = await crearGrupo(db, owner.id, { nombre: 'Casa' })
  expect(await crearGrupo(db, owner.id, { nombre: 'Casa' })).toBe(grupo)
  expect(await db.select().from(lists).where(eq(lists.tipo, 'grupo'))).toHaveLength(1)
  // otro deseo, otro comentario u otra persona, sí; y lo mismo un rato después, también
  expect((await createItem(db, owner.id, { tipo: 'idea', titulo: 'PS5' }))!.id).not.toBe(ps5!.id)
  expect(await addComment(db, ps5!.id, { userId: giver.id }, 'mañana')).toBe(true)
  await db.update(items).set({ createdAt: new Date(Date.now() - 60_000) })
  await db.update(comments).set({ createdAt: new Date(Date.now() - 60_000) })
  expect((await createItem(db, owner.id, { tipo: 'exacto', titulo: 'PS5' }))!.id).not.toBe(ps5!.id)
  expect(await addComment(db, ps5!.id, { userId: giver.id }, 'la compro yo')).toBe(true)
  expect(await db.select().from(comments)).toHaveLength(3)
})
