import { expect, test } from 'vitest'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { claims, groupGifts, guestIdentities, items, lists, users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import {
  desmarcarComprado, expireStaleClaims, getMyClaimWarnings, markBought, miReservaVencida, releaseClaim, reserveItem,
  vencimientoDeReserva,
} from '@/lib/claims'
import { guardarCumple, guardarFechaGrupo, hoyLocal, inicioDelDia } from '@/lib/events'
import { crearGrupo } from '@/lib/groups'
import { getItemForViewer, getListForViewer } from '@/lib/lists'
import { createGuest } from '@/lib/guest'
import { comprarRegalo, iniciarRegaloGrupal } from '@/lib/regalos'

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
  expect(await markBought(db, primera.claimId, { userId: giver.id })).toBe(true)
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
  expect(await markBought(db, vieja.id, { userId: giver.id }, 'el negro')).toBe(true)
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
  expect(await markBought(db, otra.id, { userId: giver.id })).toBe(false)
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
  expect(await markBought(db, r.claimId, { userId: giver.id }, 'set Batman')).toBe(true)
  await db.update(claims).set({ expiresAt: new Date(Date.now() - DIA) }) // el plazo de antes ya pasó
  const [comprada] = await db.select().from(claims)
  expect(await desmarcarComprado(db, comprada.id, { userId: otro.id })).toBe(false)
  expect(await desmarcarComprado(db, comprada.id, { userId: giver.id })).toBe(true)
  const [c] = await db.select().from(claims).where(eq(claims.id, comprada.id))
  expect(c).toMatchObject({ estado: 'reservado', notaQueCompre: null })
  expect(c.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 13 * DIA)
  // ya reservada: no hay nada que deshacer, y se puede liberar
  expect(await desmarcarComprado(db, comprada.id, { userId: giver.id })).toBe(false)
  expect(await releaseClaim(db, comprada.id, { userId: giver.id })).toBe(true)

  // la de un regalo grupal comprado tiene montos y deudas: no
  const [bici] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Bici' }).returning()
  const g = await iniciarRegaloGrupal(db, bici.id, giver.id)
  if (!g.ok) throw new Error(g.reason)
  await comprarRegalo(db, g.giftId, giver.id, { total: 1000 })
  const [delRegalo] = await db.select({ claimId: groupGifts.claimId }).from(groupGifts)
  expect(await desmarcarComprado(db, delRegalo.claimId, { userId: giver.id })).toBe(false)
  expect(await markBought(db, delRegalo.claimId, { userId: giver.id })).toBe(false)
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
