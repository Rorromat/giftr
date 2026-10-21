import { expect, test } from 'vitest'
import { conConsultas, createTestDb, seedOwnerAndGiver } from './helpers'
import { claims, groupGifts, guestIdentities, items, lists, users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import {
  desmarcarComprado, expireStaleClaims, getMyClaimWarnings, markBought, miReservaVencida, releaseClaim, reserveItem,
  vencimientoDeReserva,
} from '@/lib/claims'
import { guardarCumple, guardarFechaGrupo, hoyLocal, inicioDelDia } from '@/lib/events'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { archiveItem } from '@/lib/items'
import { cambiarLinkParaRegalar, getItemForViewer, getListForViewer } from '@/lib/lists'
import { createGuest } from '@/lib/guest'
import { comprarRegalo, historialDeLista, iniciarRegaloGrupal, sumarseARegalo } from '@/lib/regalos'
import { RESERVAS_POR_LISTA } from '@/lib/types'

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
  expect(await markBought(db, r.claimId, { userId: otro.id })).toMatchObject({ ok: false })
  expect(await markBought(db, r.claimId, { userId: giver.id }, 'set Batman')).toEqual({ ok: true })
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

const DIA = 86400_000

async function vistaDe(db: Awaited<ReturnType<typeof setup>>['db'], userId: string, itemId: string) {
  const vista = await getListForViewer(db, 'tok-euge', { userId })
  if (vista?.role !== 'giver') throw new Error('esperaba giver')
  return vista.items.find((i) => i.id === itemId)!
}

test('una persona, una reserva por deseo: un doble toque devuelve la misma y no se come otro lugar', async () => {
  const { db, item, giver } = await setup({ titulo: 'Copas de vino', cantidad: 3 })
  const primera = await reserveItem(db, item.id, { userId: giver.id })
  expect(await reserveItem(db, item.id, { userId: giver.id })).toEqual(primera)
  expect(await db.select().from(claims)).toHaveLength(1)
  expect(await vistaDe(db, giver.id, item.id)).toMatchObject({ quedan: 2, disponible: true })

  // un invitado, igual
  const abuela = await createGuest(db, 'Abuela')
  const deLaAbuela = await reserveItem(db, item.id, { guestId: abuela.id })
  expect(await reserveItem(db, item.id, { guestId: abuela.id })).toEqual(deLaAbuela)
  expect(await vistaDe(db, giver.id, item.id)).toMatchObject({ quedan: 1 })

  // ya comprada, también: es la misma (no reserva otra copa)
  if (!primera.ok) throw new Error(primera.reason)
  expect(await markBought(db, primera.claimId, { userId: giver.id })).toEqual({ ok: true })
  expect(await reserveItem(db, item.id, { userId: giver.id })).toEqual(primera)
  expect(await db.select().from(claims)).toHaveLength(2)
})

test('en una idea que se puede repetir, una reserva por persona y sin "quedan X de Y"', async () => {
  const { db, item, giver } = await setup({ tipo: 'idea', titulo: 'Medias', repetible: true, cantidad: 2 })
  for (let i = 0; i < 3; i++) {
    const [u] = await db.insert(users).values({ googleId: `g-${i}`, nombre: `U${i}`, email: `u${i}@test.com` }).returning()
    expect((await reserveItem(db, item.id, { userId: u.id })).ok).toBe(true)
  }
  await reserveItem(db, item.id, { userId: giver.id })
  await reserveItem(db, item.id, { userId: giver.id })
  expect(await db.select().from(claims)).toHaveLength(4)
  expect(await vistaDe(db, giver.id, item.id)).toMatchObject({ repetible: true, quedan: null, disponible: true })
})

test('un "Quiero ESTO" con la marca de repetible (datos de antes) respeta la cantidad', async () => {
  const { db, item, giver } = await setup({ tipo: 'exacto', repetible: true })
  const [otro] = await db.insert(users).values({ googleId: 'g-otro', nombre: 'Caro', email: 'caro@test.com' }).returning()
  expect((await reserveItem(db, item.id, { userId: giver.id })).ok).toBe(true)
  expect(await reserveItem(db, item.id, { userId: otro.id })).toEqual({ ok: false, reason: 'sin_stock' })
  expect(await vistaDe(db, otro.id, item.id)).toMatchObject({ repetible: false, quedan: 0, disponible: false })
})

test('vencimiento: 14 días o 3 días antes del evento de la lista, lo que pase primero, pero nunca menos de 24 horas', async () => {
  const { db, owner, list } = await setup()
  // sábado 8 de agosto de 2026, mediodía en Argentina
  const ahora = new Date('2026-08-08T15:00:00Z')
  expect(inicioDelDia(new Date('2026-08-18T00:00:00Z'))).toEqual(new Date('2026-08-18T03:00:00Z'))
  // sin cumple: 14 días
  expect(await vencimientoDeReserva(db, list.id, ahora)).toEqual(new Date(ahora.getTime() + 14 * DIA))
  // cumple el 18: hasta el arranque del 15 (3 días antes del cumple), antes que los 14 días
  await guardarCumple(db, owner.id, 18, 8)
  expect(await vencimientoDeReserva(db, list.id, ahora)).toEqual(new Date('2026-08-15T03:00:00Z'))
  // cumple pasado mañana (o hoy): 24 horas, para que llegue a comprarlo
  await guardarCumple(db, owner.id, 10, 8)
  expect(await vencimientoDeReserva(db, list.id, ahora)).toEqual(new Date(ahora.getTime() + DIA))
  await guardarCumple(db, owner.id, 8, 8)
  expect(await vencimientoDeReserva(db, list.id, ahora)).toEqual(new Date(ahora.getTime() + DIA))
  // cumple en más de 17 días: 14 días
  await guardarCumple(db, owner.id, 1, 10)
  expect(await vencimientoDeReserva(db, list.id, ahora)).toEqual(new Date(ahora.getTime() + 14 * DIA))
  // la fecha de un grupo cuenta igual
  const grupo = await crearGrupo(db, owner.id, { nombre: 'Casa' })
  await guardarFechaGrupo(db, grupo, owner.id, '2026-08-13', false)
  expect(await vencimientoDeReserva(db, grupo, ahora)).toEqual(new Date('2026-08-10T03:00:00Z'))
})

test('al reservar, el vencimiento mira el cumple del dueño', async () => {
  const { db, item, owner, giver } = await setup()
  const enDiez = new Date(hoyLocal().getTime() + 10 * DIA)
  await guardarCumple(db, owner.id, enDiez.getUTCDate(), enDiez.getUTCMonth() + 1)
  const r = await reserveItem(db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error(r.reason)
  const [c] = await db.select().from(claims)
  expect(c.expiresAt).toEqual(new Date(inicioDelDia(enDiez).getTime() - 3 * DIA))
  // la de un regalo grupal no vence
  const [otro] = await db.insert(items).values({ listId: item.listId, tipo: 'exacto', titulo: 'Bici' }).returning()
  const g = await iniciarRegaloGrupal(db, otro.id, giver.id)
  if (!g.ok) throw new Error(g.reason)
  const [delRegalo] = await db.select().from(claims).where(eq(claims.itemId, otro.id))
  expect(delRegalo.expiresAt).toBeNull()
})

test('una reserva vencida no deja trabado: si sigue habiendo lugar, "Ya lo compré" vale; si lo tomó otro, no', async () => {
  const { db, item, giver, list } = await setup()
  const [vieja] = await db.insert(claims).values({
    itemId: item.id, claimerUserId: giver.id, createdAt: new Date(Date.now() - 15 * DIA), expiresAt: new Date(Date.now() - DIA),
  }).returning()
  // el detalle se la ofrece
  const detalle = await getItemForViewer(db, 'tok-euge', item.id, { userId: giver.id })
  if (detalle?.role !== 'giver') throw new Error('esperaba giver')
  expect(detalle.miVencida).toEqual({ claimId: vieja.id, vencio: vieja.expiresAt })
  expect(await miReservaVencida(db, item.id, { userId: giver.id })).toEqual({ claimId: vieja.id, vencio: vieja.expiresAt })
  // (con el deseo del link de ahora, como lo manda la acción: ver el test de abajo)
  expect(await markBought(db, vieja.id, { userId: giver.id }, 'el negro', item.id)).toEqual({ ok: true })
  const filas = await db.select().from(claims).where(eq(claims.itemId, item.id))
  expect(filas.map((c) => c.estado).sort()).toEqual(['comprado', 'expirado'])
  expect(filas.find((c) => c.estado === 'comprado')).toMatchObject({ claimerUserId: giver.id, notaQueCompre: 'el negro' })
  // con la compra hecha ya no se le ofrece nada de la vencida
  const despues = await getItemForViewer(db, 'tok-euge', item.id, { userId: giver.id })
  if (despues?.role !== 'giver') throw new Error('esperaba giver')
  expect(despues.miVencida).toBeNull()

  // otra vencida, pero el lugar ya lo tomó Caro
  const [mate] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Mate' }).returning()
  const [otra] = await db.insert(claims).values({ itemId: mate.id, claimerUserId: giver.id, expiresAt: new Date(Date.now() - DIA) }).returning()
  const [caro] = await db.insert(users).values({ googleId: 'g-caro', nombre: 'Caro', email: 'caro@test.com' }).returning()
  expect((await reserveItem(db, mate.id, { userId: caro.id })).ok).toBe(true)
  expect(await markBought(db, otra.id, { userId: giver.id }, undefined, mate.id)).toEqual({ ok: false, reason: 'sin_lugar' })
  expect(await db.select().from(claims).where(eq(claims.itemId, mate.id))).toHaveLength(2)
  // una reserva que venció hace mucho ya no se ofrece
  await db.update(claims).set({ expiresAt: new Date(Date.now() - 40 * DIA) }).where(eq(claims.id, otra.id))
  expect(await miReservaVencida(db, mate.id, { userId: giver.id })).toBeNull()
})

test('"Ya lo compré" se deshace: vuelve a reservado con un vencimiento nuevo; nunca el de otro ni el de un regalo grupal', async () => {
  const { db, item, giver, list } = await setup()
  const [otro] = await db.insert(users).values({ googleId: 'g-otro', nombre: 'Otro', email: 'otro@test.com' }).returning()
  const r = await reserveItem(db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error(r.reason)
  expect(await markBought(db, r.claimId, { userId: giver.id }, 'set Batman')).toEqual({ ok: true })
  await db.update(claims).set({ expiresAt: new Date(Date.now() - DIA) }) // el plazo de antes ya pasó
  const [comprada] = await db.select().from(claims)
  expect(await desmarcarComprado(db, comprada.id, { userId: otro.id })).toEqual({ ok: false, reason: 'no_permitido' })
  expect(await desmarcarComprado(db, comprada.id, { userId: giver.id })).toEqual({ ok: true })
  const [c] = await db.select().from(claims).where(eq(claims.id, comprada.id))
  expect(c).toMatchObject({ estado: 'reservado', notaQueCompre: null })
  expect(c.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 13 * DIA)
  // ya reservada: no hay nada que deshacer, y se puede liberar
  expect(await desmarcarComprado(db, comprada.id, { userId: giver.id })).toEqual({ ok: false, reason: 'no_permitido' })
  expect(await releaseClaim(db, comprada.id, { userId: giver.id })).toBe(true)

  // la de un regalo grupal comprado tiene montos y deudas: no
  const [bici] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Bici' }).returning()
  const g = await iniciarRegaloGrupal(db, bici.id, giver.id)
  if (!g.ok) throw new Error(g.reason)
  await comprarRegalo(db, g.giftId, giver.id, { total: 1000 })
  const [delRegalo] = await db.select({ claimId: groupGifts.claimId }).from(groupGifts)
  expect(await desmarcarComprado(db, delRegalo.claimId, { userId: giver.id })).toEqual({ ok: false, reason: 'no_permitido' })
  expect(await markBought(db, delRegalo.claimId, { userId: giver.id })).toMatchObject({ ok: false })
})

test('el cartel de vencimiento lleva al deseo, salvo que hayan cambiado el link después; de un deseo que salió de la lista, nada', async () => {
  const { db, item, giver, list } = await setup()
  const [c] = await db.insert(claims).values({
    itemId: item.id, claimerUserId: giver.id,
    createdAt: new Date(Date.now() - 8 * DIA), expiresAt: new Date(Date.now() + 6 * DIA),
  }).returning()
  expect(await getMyClaimWarnings(db, { userId: giver.id })).toEqual([
    { claimId: c.id, itemTitulo: 'Termo', diasRestantes: 6, href: `/l/tok-euge/item/${item.id}` },
  ])
  // cambiaron el link para regalar después de que reservó: el cartel no le pasa el nuevo
  await db.update(lists).set({ shareToken: 'tok-nuevo', shareTokenAt: new Date(Date.now() - DIA) }).where(eq(lists.id, list.id))
  expect(await getMyClaimWarnings(db, { userId: giver.id })).toEqual([expect.objectContaining({ claimId: c.id, href: null })])
  // un deseo archivado (de antes de que se liberara al archivar): ni cartel
  await db.update(items).set({ estadoDueno: 'no_lo_quiero' }).where(eq(items.id, item.id))
  expect(await getMyClaimWarnings(db, { userId: giver.id })).toEqual([])
  expect(await db.select().from(guestIdentities)).toEqual([])
})

test('una vencida se vuelve a reservar solo con el link para regalar de ahora y hasta 30 días después de vencer', async () => {
  const { db, item, giver, owner, list } = await setup()
  const abuela = await createGuest(db, 'Abuela')
  const vencida = async (viewer: { userId?: string; guestId?: string }, hace: number) => (await db.insert(claims).values({
    itemId: item.id, claimerUserId: viewer.userId, claimerGuestId: viewer.guestId,
    createdAt: new Date(Date.now() - (hace + 14) * DIA), expiresAt: new Date(Date.now() - hace * DIA), estado: 'expirado',
  }).returning())[0]
  const deRodri = await vencida({ userId: giver.id }, 2)
  const deLaAbuela = await vencida({ guestId: abuela.id }, 2)
  // la dueña cambió el link: la acción no le pasa el deseo a quien llega con el de antes, y sin eso no se crea nada (una
  // reserva nueva contaría como que tiene el link nuevo: ver cambiarLinkParaRegalar)
  expect(await cambiarLinkParaRegalar(db, list.id, owner.id)).not.toBeNull()
  expect(await markBought(db, deRodri.id, { userId: giver.id })).toEqual({ ok: false, reason: 'no_permitido' })
  expect(await markBought(db, deLaAbuela.id, { guestId: abuela.id })).toEqual({ ok: false, reason: 'no_permitido' })
  // ni con el de otro deseo
  const [mate] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Mate' }).returning()
  expect(await markBought(db, deRodri.id, { userId: giver.id }, undefined, mate.id)).toEqual({ ok: false, reason: 'no_permitido' })
  expect(await db.select().from(claims)).toHaveLength(2)
  // una que venció hace más de 30 días tampoco, aunque tenga el link
  await db.update(claims).set({ expiresAt: new Date(Date.now() - 40 * DIA) }).where(eq(claims.id, deRodri.id))
  expect(await markBought(db, deRodri.id, { userId: giver.id }, undefined, item.id)).toEqual({ ok: false, reason: 'no_permitido' })
  expect(await db.select().from(claims)).toHaveLength(2)
  // con el link de ahora y a tiempo, sí
  expect(await markBought(db, deLaAbuela.id, { guestId: abuela.id }, undefined, item.id)).toEqual({ ok: true })
  expect((await db.select().from(claims)).map((c) => c.estado).sort()).toEqual(['comprado', 'expirado', 'expirado'])
})

test('"Ya lo compré" dos veces (un doble toque, otra pestaña) sale bien las dos, también sobre una vencida', async () => {
  const { db, item, giver, list } = await setup()
  const r = await reserveItem(db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error(r.reason)
  expect(await markBought(db, r.claimId, { userId: giver.id }, 'el negro')).toEqual({ ok: true })
  expect(await markBought(db, r.claimId, { userId: giver.id })).toEqual({ ok: true })
  expect((await db.select().from(claims))[0]).toMatchObject({ estado: 'comprado', notaQueCompre: 'el negro' })

  const [mate] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Mate' }).returning()
  const [vieja] = await db.insert(claims).values({ itemId: mate.id, claimerUserId: giver.id, estado: 'expirado', expiresAt: new Date(Date.now() - DIA) }).returning()
  expect(await markBought(db, vieja.id, { userId: giver.id }, undefined, mate.id)).toEqual({ ok: true })
  expect(await markBought(db, vieja.id, { userId: giver.id }, undefined, mate.id)).toEqual({ ok: true })
  const delMate = await db.select().from(claims).where(eq(claims.itemId, mate.id))
  expect(delMate.map((c) => c.estado).sort()).toEqual(['comprado', 'expirado'])
})

test('con dos reservas de la misma persona (de antes de esto), "Ya lo compré" marca la que pidió y después la otra', async () => {
  const { db, item, giver } = await setup({ titulo: 'Copas', cantidad: 3 })
  const [c1, c2] = await db.insert(claims).values([
    { itemId: item.id, claimerUserId: giver.id, createdAt: new Date(Date.now() - 2000), expiresAt: new Date(Date.now() + 5 * DIA) },
    { itemId: item.id, claimerUserId: giver.id, createdAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 5 * DIA) },
  ]).returning()
  expect(await markBought(db, c2.id, { userId: giver.id })).toEqual({ ok: true })
  const estado = async (id: string) => (await db.select().from(claims).where(eq(claims.id, id)))[0].estado
  expect([await estado(c1.id), await estado(c2.id)]).toEqual(['reservado', 'comprado'])
  expect(await markBought(db, c1.id, { userId: giver.id })).toEqual({ ok: true })
  expect([await estado(c1.id), await estado(c2.id)]).toEqual(['comprado', 'comprado'])
})

test('si después de que venció la reservó de nuevo y la liberó, ya no se le ofrece la vencida (y puede armar un regalo)', async () => {
  const { db, item, giver } = await setup()
  await db.insert(claims).values({ itemId: item.id, claimerUserId: giver.id, estado: 'expirado', createdAt: new Date(Date.now() - 16 * DIA), expiresAt: new Date(Date.now() - 2 * DIA) })
  expect(await miReservaVencida(db, item.id, { userId: giver.id })).not.toBeNull()
  const r = await reserveItem(db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error(r.reason)
  expect(await releaseClaim(db, r.claimId, { userId: giver.id })).toBe(true)
  expect(await miReservaVencida(db, item.id, { userId: giver.id })).toBeNull()
  const detalle = await getItemForViewer(db, 'tok-euge', item.id, { userId: giver.id })
  if (detalle?.role !== 'giver') throw new Error('esperaba giver')
  expect(detalle.miVencida).toBeNull()
})

test('en una idea que se puede repetir, lo comprado para un evento anterior no ocupa: se reserva de nuevo y no se deshace', async () => {
  const { db, item, giver, list } = await setup({ tipo: 'idea', titulo: 'Medias', repetible: true })
  // Rodri le regaló medias rayadas hace un año y pico (la lista no tiene fecha: cuenta el último año)
  const [vieja] = await db.insert(claims).values({
    itemId: item.id, claimerUserId: giver.id, estado: 'comprado', notaQueCompre: 'rayadas',
    createdAt: new Date(Date.now() - 395 * DIA), updatedAt: new Date(Date.now() - 380 * DIA), expiresAt: new Date(Date.now() - 381 * DIA),
  }).returning()
  const vista = await vistaDe(db, giver.id, item.id)
  expect(vista.claims).toEqual([])
  const r = await reserveItem(db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error(r.reason)
  expect(r.claimId).not.toBe(vieja.id)
  expect((await vistaDe(db, giver.id, item.id)).claims).toEqual([expect.objectContaining({ id: r.claimId, estado: 'reservado', esMia: true })])
  // la de antes ya se regaló: no se deshace ni se pierde del historial, y no le sale "¿Conseguiste…?" por ella
  expect(await desmarcarComprado(db, vieja.id, { userId: giver.id })).toEqual({ ok: false, reason: 'no_permitido' })
  expect((await db.select().from(claims).where(eq(claims.id, vieja.id)))[0]).toMatchObject({ estado: 'comprado', notaQueCompre: 'rayadas' })
  expect((await historialDeLista(db, list.id, { userId: giver.id }))!.entradas).toHaveLength(1)
  expect(await getMyClaimWarnings(db, { userId: giver.id })).toEqual([])
})

test('lo de "este evento" empieza el día después del último cumple: lo comprado antes es de ese', async () => {
  const { db, item, giver, owner } = await setup({ tipo: 'idea', titulo: 'Medias', repetible: true })
  const [termo] = await db.insert(items).values({ listId: item.listId, tipo: 'exacto', titulo: 'Termo', cantidad: 2 }).returning()
  const hace10 = new Date(hoyLocal().getTime() - 10 * DIA)
  await guardarCumple(db, owner.id, hace10.getUTCDate(), hace10.getUTCMonth() + 1)
  const compra = async (itemId: string, hace: number) => (await db.insert(claims).values({
    itemId, claimerUserId: giver.id, estado: 'comprado', createdAt: new Date(Date.now() - (hace + 1) * DIA), updatedAt: new Date(Date.now() - hace * DIA),
  }).returning())[0]
  // las medias que compró para ese cumple ya no ocupan; las que compró después, sí (es la misma)
  const paraElCumple = await compra(item.id, 20)
  expect((await vistaDe(db, giver.id, item.id)).claims).toEqual([])
  await db.update(claims).set({ updatedAt: new Date(Date.now() - 5 * DIA) }).where(eq(claims.id, paraElCumple.id))
  expect(await reserveItem(db, item.id, { userId: giver.id })).toEqual({ ok: true, claimId: paraElCumple.id })
  expect((await vistaDe(db, giver.id, item.id)).claims).toEqual([expect.objectContaining({ id: paraElCumple.id, deshacer: true })])
  // un "Quiero ESTO" comprado para el cumple sigue comprado (no se repite), pero ya no se deshace
  const delTermo = await compra(termo.id, 20)
  expect(await reserveItem(db, termo.id, { userId: giver.id })).toEqual({ ok: true, claimId: delTermo.id })
  expect((await vistaDe(db, giver.id, termo.id)).claims).toEqual([expect.objectContaining({ id: delTermo.id, deshacer: false })])
  expect(await desmarcarComprado(db, delTermo.id, { userId: giver.id })).toEqual({ ok: false, reason: 'no_permitido' })
  // la de este evento, sí; y el "¿Conseguiste…?" cuenta desde que la deshizo, no desde que la reservó
  expect(await desmarcarComprado(db, paraElCumple.id, { userId: giver.id })).toEqual({ ok: true })
  expect(await getMyClaimWarnings(db, { userId: giver.id })).toEqual([])
})

test('"Me equivoqué" no vale para un co-dueño que lo compró antes de sumarse, ni sobre un deseo que salió de la lista', async () => {
  const { db, item, owner, giver } = await setup()
  const grupoId = await crearGrupo(db, owner.id, { nombre: 'Casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  const [vela] = await db.insert(items).values({ listId: grupoId, tipo: 'exacto', titulo: 'Vela' }).returning()
  const comprar = async (itemId: string) => {
    const r = await reserveItem(db, itemId, { userId: giver.id })
    if (!r.ok) throw new Error(r.reason)
    expect(await markBought(db, r.claimId, { userId: giver.id })).toEqual({ ok: true })
    return r.claimId
  }
  const deLaVela = await comprar(vela.id)
  const delTermo = await comprar(item.id)
  // Rodri se suma al grupo: su compra queda como está, pero no la vuelve una reserva de un dueño que nadie libera
  expect(await unirseAGrupo(db, grupo.inviteToken!, giver.id)).toBe(grupoId)
  expect(await desmarcarComprado(db, deLaVela, { userId: giver.id })).toEqual({ ok: false, reason: 'no_permitido' })
  // Euge ya lo tiene: tampoco
  expect(await archiveItem(db, item.id, owner.id, 'lo_tengo')).toBe(true)
  expect(await desmarcarComprado(db, delTermo, { userId: giver.id })).toEqual({ ok: false, reason: 'no_permitido' })
  expect((await db.select({ estado: claims.estado }).from(claims)).map((c) => c.estado)).toEqual(['comprado', 'comprado'])
})

test('deshacer una compra de antes de que cambiaran el link para regalar no le pasa el nuevo', async () => {
  const { db, item, giver, owner, list } = await setup()
  const r = await reserveItem(db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error(r.reason)
  await markBought(db, r.claimId, { userId: giver.id })
  await db.update(claims).set({ createdAt: new Date(Date.now() - 20 * DIA) })
  await cambiarLinkParaRegalar(db, list.id, owner.id)
  expect(await desmarcarComprado(db, r.claimId, { userId: giver.id })).toEqual({ ok: true })
  // queda con la fecha de antes: el cartel sale, pero sin el link nuevo
  const [c] = await db.select().from(claims)
  expect(c.createdAt.getTime()).toBeLessThan(Date.now() - 19 * DIA)
  expect(await getMyClaimWarnings(db, { userId: giver.id })).toEqual([expect.objectContaining({ claimId: r.claimId, href: null })])
})

test('una persona no deja tomada la lista entera: como mucho 10 reservas sin comprar por lista', async () => {
  const { db, list, owner, giver } = await setup()
  const deseos = await db.insert(items).values(Array.from({ length: RESERVAS_POR_LISTA + 3 }, (_, n) => ({
    listId: list.id, tipo: 'exacto' as const, titulo: `Deseo ${n}`,
  }))).returning()
  const pepe = await createGuest(db, 'Pepe')
  const reservar = (n: number, viewer: { guestId?: string; userId?: string } = { guestId: pepe.id }) => reserveItem(db, deseos[n].id, viewer)
  for (let n = 0; n < RESERVAS_POR_LISTA; n++) expect((await reservar(n)).ok, String(n)).toBe(true)
  expect(await reservar(RESERVAS_POR_LISTA)).toEqual({ ok: false, reason: 'muchas' })
  // un doble toque sobre una que ya tiene sigue devolviendo la suya
  expect((await reservar(0)).ok).toBe(true)
  // los demás reservan lo que quedó libre
  expect((await reservar(RESERVAS_POR_LISTA, { userId: giver.id })).ok).toBe(true)

  // lo comprado no cuenta: marca una y puede reservar otra
  const [primera] = await db.select().from(claims).where(eq(claims.itemId, deseos[0].id))
  expect(await markBought(db, primera.id, { guestId: pepe.id })).toEqual({ ok: true })
  expect((await reservar(RESERVAS_POR_LISTA + 1)).ok).toBe(true)
  expect(await reservar(RESERVAS_POR_LISTA + 2)).toEqual({ ok: false, reason: 'muchas' })
  // soltar una, o que venza, también deja lugar
  const [segunda] = await db.select().from(claims).where(eq(claims.itemId, deseos[1].id))
  expect(await releaseClaim(db, segunda.id, { guestId: pepe.id })).toBe(true)
  expect((await reservar(RESERVAS_POR_LISTA + 2)).ok).toBe(true)
  const [tercera] = await db.select().from(claims).where(eq(claims.itemId, deseos[2].id))
  await db.update(claims).set({ expiresAt: new Date(Date.now() - DIA) }).where(eq(claims.id, tercera.id))
  expect((await reservar(1)).ok).toBe(true)

  // es por lista: en otra lista reserva aparte
  const [otraLista] = await db.insert(lists).values({ ownerId: giver.id, shareToken: 'tok-rodri' }).returning()
  const [deRodri] = await db.insert(items).values({ listId: otraLista.id, tipo: 'exacto', titulo: 'Taza' }).returning()
  expect((await reserveItem(db, deRodri.id, { guestId: pepe.id })).ok).toBe(true)
  // "Ya lo compré" sobre la vencida no queda tomada: no lo frena el tope
  expect(await markBought(db, tercera.id, { guestId: pepe.id }, undefined, deseos[2].id)).toEqual({ ok: true })
  // a la dueña no le cambia nada (no reserva en su lista, con o sin tope)
  expect(await reserveItem(db, deseos[0].id, { userId: owner.id })).toEqual({ ok: false, reason: 'propio' })
})

test('el tope no se saltea con regalos grupales en los que sigue sola: no vencen y solo ella los cancela', async () => {
  const { db, list, giver } = await setup()
  const [caro] = await db.insert(users).values({ googleId: 'g-caro', nombre: 'Caro', email: 'caro@test.com' }).returning()
  const [grande, otra] = await db.insert(items).values([
    { listId: list.id, tipo: 'exacto', titulo: 'Bici' }, { listId: list.id, tipo: 'exacto', titulo: 'Casco' },
  ]).returning()
  const deCaro = await db.insert(items).values(Array.from({ length: RESERVAS_POR_LISTA }, (_, n) => ({
    listId: list.id, tipo: 'exacto' as const, titulo: `Para Caro ${n}`,
  }))).returning()
  for (const d of deCaro) expect((await reserveItem(db, d.id, { userId: caro.id })).ok).toBe(true)
  expect(await reserveItem(db, grande.id, { userId: caro.id })).toEqual({ ok: false, reason: 'muchas' })
  expect(await iniciarRegaloGrupal(db, grande.id, caro.id)).toEqual({ ok: false, reason: 'muchas' })
  // convertir una reserva suya en regalo sí: sigue teniendo las mismas tomadas (y no por eso le queda lugar)
  const regalo = await iniciarRegaloGrupal(db, deCaro[0].id, caro.id)
  if (!regalo.ok) throw new Error(regalo.reason)
  expect(await reserveItem(db, grande.id, { userId: caro.id })).toEqual({ ok: false, reason: 'muchas' })
  // una vencida no se convierte sin pasar por el tope: se reserva de nuevo
  const [vieja] = await db.select().from(claims).where(eq(claims.itemId, deCaro[1].id))
  await db.update(claims).set({ expiresAt: new Date(Date.now() - DIA) }).where(eq(claims.id, vieja.id))
  expect((await iniciarRegaloGrupal(db, deCaro[1].id, caro.id)).ok).toBe(true)
  expect((await db.select().from(claims).where(eq(claims.id, vieja.id)))[0].estado).toBe('expirado')
  expect(await iniciarRegaloGrupal(db, deCaro[2].id, caro.id)).toEqual({ ok: true, giftId: expect.any(String) })
  expect(await iniciarRegaloGrupal(db, grande.id, caro.id)).toEqual({ ok: false, reason: 'muchas' })
  // cuando se suma alguien ya no es algo que tomó ella sola: le deja lugar
  expect(await sumarseARegalo(db, regalo.giftId, giver.id)).toBe(true)
  expect((await iniciarRegaloGrupal(db, grande.id, caro.id)).ok).toBe(true)
  expect(await reserveItem(db, otra.id, { userId: caro.id })).toEqual({ ok: false, reason: 'muchas' })
})

test('"Me equivoqué" no saltea el tope: marcar compradas, reservar otras y deshacer las compras', async () => {
  const { db, list } = await setup()
  const deseos = await db.insert(items).values(Array.from({ length: 2 * RESERVAS_POR_LISTA }, (_, n) => ({
    listId: list.id, tipo: 'exacto' as const, titulo: `Deseo ${n}`,
  }))).returning()
  const pepe = { guestId: (await createGuest(db, 'Pepe')).id }
  const compradas: string[] = []
  for (const d of deseos.slice(0, RESERVAS_POR_LISTA)) {
    const r = await reserveItem(db, d.id, pepe)
    if (!r.ok) throw new Error(r.reason)
    expect(await markBought(db, r.claimId, pepe)).toEqual({ ok: true })
    compradas.push(r.claimId)
  }
  const otras = []
  for (const d of deseos.slice(RESERVAS_POR_LISTA)) {
    const r = await reserveItem(db, d.id, pepe)
    if (!r.ok) throw new Error(r.reason)
    otras.push(r.claimId)
  }
  for (const id of compradas) expect(await desmarcarComprado(db, id, pepe)).toEqual({ ok: false, reason: 'muchas' })
  const reservadas = async () => (await db.select().from(claims).where(eq(claims.estado, 'reservado'))).length
  expect(await reservadas()).toBe(RESERVAS_POR_LISTA)
  // soltando una, una compra vuelve a ser reserva; la siguiente, no
  expect(await releaseClaim(db, otras[0], pepe)).toBe(true)
  expect(await desmarcarComprado(db, compradas[0], pepe)).toEqual({ ok: true })
  expect(await desmarcarComprado(db, compradas[1], pepe)).toEqual({ ok: false, reason: 'muchas' })
  expect(await reservadas()).toBe(RESERVAS_POR_LISTA)
})

test('el tope de reservas se cuenta bajo un lock por persona y lista (PGlite no deja probar dos pedidos a la vez)', async () => {
  const { db, item, giver } = await setup()
  // En Postgres dos reservas de la misma persona sobre deseos distintos corren a la vez: sin este lock las dos contaban 9
  // y quedaban 11. Acá las transacciones van de a una, así que se fija que el lock se toma antes de contar.
  const lockAntesDeContar = (consultas: string[]) => {
    const lock = consultas.findIndex((q) => q.includes('pg_advisory_xact_lock'))
    const cuenta = consultas.findIndex((q) => /count\(/i.test(q) && q.includes('"group_gift_members"'))
    return lock >= 0 && lock < cuenta
  }
  const reservar = conConsultas(db)
  const r = await reserveItem(reservar.db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error(r.reason)
  expect(lockAntesDeContar(reservar.consultas)).toBe(true)
  await markBought(db, r.claimId, { userId: giver.id })
  const deshacer = conConsultas(db)
  expect(await desmarcarComprado(deshacer.db, r.claimId, { userId: giver.id })).toEqual({ ok: true })
  expect(lockAntesDeContar(deshacer.consultas)).toBe(true)
})
