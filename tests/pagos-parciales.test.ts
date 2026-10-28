import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { groupGiftMembers } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { createItem } from '@/lib/items'
import { bandeja } from '@/lib/bandeja'
import { comprarRegalo, iniciarRegaloGrupal, marcarPagado, misCuentas, pagarParte, regalosDeItem, saldarCon, sumarseARegalo } from '@/lib/regalos'

// "Le pagué una parte": de lo que le debés a alguien, una parte (te paso la mitad ahora y la mitad después).

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}

/** Rodri compró la bici de Mamá ($90.000) con Sofi y Ana: cada una le debe $30.000. */
async function comprada() {
  const db = await createTestDb()
  const [mama, rodri, sofi, ana] = [await usuario(db, 'Mamá'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi'), await usuario(db, 'Ana')]
  const bici = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Bici' }))!
  const g = await iniciarRegaloGrupal(db, bici.id, rodri.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, sofi.id)
  await sumarseARegalo(db, g.giftId, ana.id)
  await comprarRegalo(db, g.giftId, rodri.id, { total: 90000 })
  return { db, mama, rodri, sofi, ana, bici, giftId: g.giftId }
}

const pagos = async (db: Db, userId: string) => (await bandeja(db, { userId })).entradas.filter((e) => e.emoji === '💸').map((e) => [e.titulo, e.cuerpo])

test('una parte: queda lo que falta, en Cuentas y en el regalo, y al que cobra le llega cuánto le falta', async () => {
  const { db, rodri, sofi, bici, giftId } = await comprada()
  expect(await pagarParte(db, sofi.id, rodri.id, 10000, -30000)).toEqual({ ok: true })
  const deSofi = await misCuentas(db, sofi.id)
  expect(deSofi.debes).toBe(20000)
  expect(deSofi.personas[0].lineas).toEqual([expect.objectContaining({ itemTitulo: 'Bici', monto: 20000, parte: 30000, tipo: 'debes' })])
  const [regalo] = await regalosDeItem(db, bici.id, { userId: sofi.id })
  expect(regalo.miembros.find((m) => m.esYo)).toMatchObject({ saldo: 20000, puso: true, pagado: false })
  expect(await pagos(db, rodri.id)).toEqual([['Sofi te pagó $10.000', 'Una parte de lo que te debía de los regalos grupales. Le falta pagarte $20.000.']])

  // después, el resto; y "Deshacer" vuelve a la parte que había pagado
  expect(await saldarCon(db, sofi.id, rodri.id, -20000)).toBe(1)
  expect((await misCuentas(db, sofi.id)).debes).toBe(0)
  expect(await marcarPagado(db, giftId, sofi.id, sofi.id, false)).toBe(true)
  expect((await misCuentas(db, sofi.id)).debes).toBe(20000)
})

test('una parte: más que 0, sin centavos, hasta lo que se debe y con el neto que se veía', async () => {
  const { db, rodri, sofi, ana } = await comprada()
  for (const monto of [0, -5, 1.5, 30001, Number.NaN]) {
    expect(await pagarParte(db, sofi.id, rodri.id, monto, -30000)).toEqual({ ok: false, reason: 'monto_invalido' })
  }
  expect(await pagarParte(db, sofi.id, rodri.id, 5000, -25000)).toEqual({ ok: false, reason: 'cambiaron' })
  expect(await pagarParte(db, sofi.id, ana.id, 5000)).toEqual({ ok: false, reason: 'no_permitido' })
  expect((await misCuentas(db, sofi.id)).debes).toBe(30000)
  // todo de una, por este camino, también
  expect(await pagarParte(db, sofi.id, rodri.id, 30000, -30000)).toEqual({ ok: true })
  expect((await misCuentas(db, sofi.id)).personas).toEqual([])
  // "Me pagó una parte" lo marca el que cobra: no le llega a nadie
  expect(await pagarParte(db, rodri.id, ana.id, 5000, 30000)).toEqual({ ok: true })
  expect((await misCuentas(db, ana.id)).debes).toBe(25000)
  expect(await pagos(db, ana.id)).toEqual([])
})

test('una parte con deudas de los dos lados: lo que se debía al revés queda cancelado y el resto sale de lo más viejo', async () => {
  const { db, mama, rodri, sofi, giftId } = await comprada()
  // Sofi arma otro regalo y Rodri le debe $10.000: el neto es $20.000 de Sofi a Rodri
  const perfume = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Perfume' }))!
  const g = await iniciarRegaloGrupal(db, perfume.id, sofi.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, rodri.id)
  await comprarRegalo(db, g.giftId, sofi.id, { total: 20000 })
  expect((await misCuentas(db, sofi.id)).personas[0]).toMatchObject({ nombre: 'Rodri', neto: -20000 })

  expect(await pagarParte(db, sofi.id, rodri.id, 5000, -20000)).toEqual({ ok: true })
  const parte = async (gift: string, userId: string) =>
    (await db.select().from(groupGiftMembers).where(eq(groupGiftMembers.giftId, gift))).find((m) => m.userId === userId)!
  expect(await parte(g.giftId, rodri.id)).toMatchObject({ pagado: true, pagadoMonto: 10000 })
  expect(await parte(giftId, sofi.id)).toMatchObject({ pagado: false, pagadoMonto: 15000 })
  expect((await misCuentas(db, rodri.id)).personas.find((p) => p.nombre === 'Sofi')).toMatchObject({ neto: 15000 })
})

test('una parte en dólares es otra tarjeta: no toca lo de pesos', async () => {
  const { db, mama, rodri, sofi } = await comprada()
  const tele = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Tele' }))!
  const g = await iniciarRegaloGrupal(db, tele.id, rodri.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, sofi.id)
  await comprarRegalo(db, g.giftId, rodri.id, { total: 600, moneda: 'USD' })
  expect(await pagarParte(db, sofi.id, rodri.id, 100, -300, 'USD')).toEqual({ ok: true })
  expect(await misCuentas(db, sofi.id)).toMatchObject({ debes: 30000, dolares: { debes: 200, teDeben: 0 } })
  expect((await pagos(db, rodri.id))[0][0]).toBe('Sofi te pagó US$ 100')
})
