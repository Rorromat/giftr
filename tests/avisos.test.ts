import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver, seguir } from './helpers'
import { items, notifications } from '@/db/schema'
import { reserveItem } from '@/lib/claims'
import { abrirListaAInvitado } from '@/lib/acceso'
import { createGuest } from '@/lib/guest'
import { archiveItem, createItem, updateItem } from '@/lib/items'
import { cambiarLinkParaRegalar } from '@/lib/lists'
import { getUnreadNotifications } from '@/lib/notifications'

async function setup() {
  const db = await createTestDb()
  const seed = await seedOwnerAndGiver(db)
  const termo = (await createItem(db, seed.owner.id, { tipo: 'exacto', titulo: 'Termo' }))!
  const mate = (await createItem(db, seed.owner.id, { tipo: 'exacto', titulo: 'Mate' }))!
  return { db, ...seed, termo, mate }
}

test('los avisos llevan al deseo; si salió de la lista, a la lista para elegir otro', async () => {
  const { db, owner, giver, termo, mate } = await setup()
  await reserveItem(db, termo.id, { userId: giver.id })
  await reserveItem(db, mate.id, { userId: giver.id })
  await updateItem(db, termo.id, owner.id, { notas: 'el verde' })
  await archiveItem(db, mate.id, owner.id, 'no_lo_quiero')
  const avisos = await getUnreadNotifications(db, { userId: giver.id })
  expect(avisos.map(({ tipo, itemTitulo, href }) => ({ tipo, itemTitulo, href })).sort((a, b) => a.tipo.localeCompare(b.tipo))).toEqual([
    { tipo: 'item_baja', itemTitulo: 'Mate', href: '/l/tok-euge' },
    { tipo: 'item_editado', itemTitulo: 'Termo', href: `/l/tok-euge/item/${termo.id}` },
  ])
})

test('si cambiaron el link para regalar, el aviso no le pasa el nuevo a quien no lo abrió después', async () => {
  const { db, owner, giver, list, termo } = await setup()
  await reserveItem(db, termo.id, { userId: giver.id })
  const abuela = await createGuest(db, 'Abuela')
  await db.update(items).set({ cantidad: 3 }).where(eq(items.id, termo.id))
  await reserveItem(db, termo.id, { guestId: abuela.id })
  const nuevo = await cambiarLinkParaRegalar(db, list.id, owner.id)
  await updateItem(db, termo.id, owner.id, { notas: 'el verde' })
  expect((await getUnreadNotifications(db, { userId: giver.id }))[0].href).toBeNull()
  expect((await getUnreadNotifications(db, { guestId: abuela.id }))[0].href).toBeNull()
  // la abrió con el link nuevo (la sigue): ahí sí
  await seguir(db, giver.id, list.id)
  expect((await getUnreadNotifications(db, { userId: giver.id }))[0].href).toBe(`/l/${nuevo}/item/${termo.id}`)
  // un invitado que se anotó con el link nuevo, también
  const tia = await createGuest(db, 'Tía')
  await abrirListaAInvitado(db, tia.id, list.id)
  await reserveItem(db, termo.id, { guestId: tia.id })
  await updateItem(db, termo.id, owner.id, { notas: 'el azul' })
  expect((await getUnreadNotifications(db, { guestId: tia.id }))[0].href).toBe(`/l/${nuevo}/item/${termo.id}`)
  expect((await getUnreadNotifications(db, { guestId: abuela.id }))[0].href).toBeNull()
  expect(await db.select().from(notifications).where(eq(notifications.userId, owner.id))).toEqual([])
})
