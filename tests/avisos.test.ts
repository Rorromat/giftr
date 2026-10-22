import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver, seguir } from './helpers'
import { items, lists, notifications } from '@/db/schema'
import { reserveItem } from '@/lib/claims'
import { abrirListaAInvitado } from '@/lib/acceso'
import { createGuest } from '@/lib/guest'
import { archiveItem, createItem, updateItem } from '@/lib/items'
import { cambiarLinkParaRegalar } from '@/lib/lists'
import { getUnreadNotifications } from '@/lib/notifications'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { cancelarRegalo, iniciarRegaloGrupal, misCuentas, sumarseARegalo } from '@/lib/regalos'
import { upsertUserFromGoogle } from '@/lib/users'

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

test('el encargo de un regalo grupal lleva a Cuentas si el deseo ya no se abre (salió de la lista o no tiene el link)', async () => {
  const db = await createTestDb()
  const usuario = (nombre: string) => upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre}@test.com`, nombre })
  const [delfina, martin, sofi] = [await usuario('Delfina'), await usuario('Martín'), await usuario('Sofi')]
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Casa' })
  const bici = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Bici' }, grupoId))!
  const mesa = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Mesa' }, grupoId))!
  // Martín organiza los dos regalos y Sofi se sumó; la Bici sale de la lista con "Ya lo tengo" (el regalo sigue abierto)
  for (const it of [bici, mesa]) {
    const g = await iniciarRegaloGrupal(db, it.id, martin.id)
    if (!g.ok) throw new Error(g.reason)
    expect(await sumarseARegalo(db, g.giftId, sofi.id)).toBe(true)
  }
  await archiveItem(db, bici.id, delfina.id, 'lo_tengo')
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  await seguir(db, sofi.id, grupoId)

  // Martín se suma al grupo: los dos encargos pasan a Sofi
  expect(await unirseAGrupo(db, grupo.inviteToken!, martin.id)).toBe(grupoId)
  const encargos = (await getUnreadNotifications(db, { userId: sofi.id })).filter((n) => n.tipo === 'regalo_encargo')
  expect(encargos.map(({ itemTitulo, href }) => ({ itemTitulo, href })).sort((a, b) => a.itemTitulo.localeCompare(b.itemTitulo))).toEqual([
    // la Bici no está en la lista: se divide o se cancela desde Cuentas, donde está
    { itemTitulo: 'Bici', href: '/cuentas' },
    { itemTitulo: 'Mesa', href: `/l/${grupo.shareToken}/item/${mesa.id}` },
  ])
  expect((await misCuentas(db, sofi.id)).enCurso.find((r) => r.itemTitulo === 'Bici')).toMatchObject({ soyEncargado: true, dividirCon: expect.any(Array) })

  // si cambiaron el link y no lo abrió después, tampoco al deseo: a Cuentas, que no pasa el link nuevo
  await cambiarLinkParaRegalar(db, grupoId, delfina.id)
  const mesaSinLink = (await getUnreadNotifications(db, { userId: sofi.id })).find((n) => n.tipo === 'regalo_encargo' && n.itemTitulo === 'Mesa')
  expect(mesaSinLink?.href).toBe('/cuentas')
  expect((await misCuentas(db, sofi.id)).enCurso.find((r) => r.itemTitulo === 'Mesa')).toMatchObject({ soyEncargado: true, dividirCon: expect.any(Array) })
})

test('cuando el regalo se cancela, al que quedó organizándolo no le queda "Ahora organizás vos"', async () => {
  const db = await createTestDb()
  const usuario = (nombre: string) => upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre}@test.com`, nombre })
  const [delfina, rodri, sofi] = [await usuario('Delfina'), await usuario('Rodri'), await usuario('Sofi')]
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Casa' })
  const bici = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Bici' }, grupoId))!
  const mesa = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Mesa' }, grupoId))!
  const regalos: string[] = []
  for (const it of [bici, mesa]) {
    const g = await iniciarRegaloGrupal(db, it.id, rodri.id)
    if (!g.ok) throw new Error(g.reason)
    expect(await sumarseARegalo(db, g.giftId, sofi.id)).toBe(true)
    regalos.push(g.giftId)
  }
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  await seguir(db, sofi.id, grupoId)
  // Rodri se suma al grupo: los dos regalos pasan a Sofi
  expect(await unirseAGrupo(db, grupo.inviteToken!, rodri.id)).toBe(grupoId)
  const tipos = async () => (await getUnreadNotifications(db, { userId: sofi.id })).map((n) => `${n.tipo} ${n.itemTitulo}`).sort()
  expect(await tipos()).toEqual(['regalo_encargo Bici', 'regalo_encargo Mesa'])

  // "Ya no lo quiero" cancela el de la bici: le queda la baja, no "cuando lo compres, dividí" (y Cuentas no tiene nada)
  await archiveItem(db, bici.id, delfina.id, 'no_lo_quiero')
  expect(await tipos()).toEqual(['regalo_baja Bici', 'regalo_encargo Mesa'])
  expect((await misCuentas(db, sofi.id)).enCurso.map((r) => r.itemTitulo)).toEqual(['Mesa'])
  // y si ella misma cancela el de la mesa, ese encargo tampoco queda
  expect(await cancelarRegalo(db, regalos[1], sofi.id)).toBe(true)
  expect(await tipos()).toEqual(['regalo_baja Bici'])
  for (const u of [delfina, rodri]) expect(await db.select().from(notifications).where(eq(notifications.userId, u.id))).toEqual([])
})
