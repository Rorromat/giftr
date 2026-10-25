import { expect, test } from 'vitest'
import { createTestDb } from './helpers'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { createItem } from '@/lib/items'
import { comprarRegalo, corregirCompra, iniciarRegaloGrupal, misCuentas, regalosDeItem, saldarCon, sumarseARegalo } from '@/lib/regalos'
import { misRegalos } from '@/lib/mis-regalos'
import { enDolares, parseDolares, plata } from '@/lib/pesos'

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}

test('plata: pesos o dólares, siempre enteros con puntos', () => {
  expect(plata(45000)).toBe('$45.000')
  expect(plata(1200, 'USD')).toBe('US$ 1.200')
  expect(plata(-300, 'USD')).toBe('-US$ 300')
  expect(enDolares('US$ 300')).toBe(true)
  expect(enDolares('USD 50')).toBe(true)
  expect(enDolares('300 dólares')).toBe(true)
  expect(enDolares('$45.000')).toBe(false)
  expect(parseDolares('US$ 1.200')).toBe(1200)
  expect(parseDolares('$45.000')).toBeNull()
})

/** Mamá tiene una bici y un perfume; Rodri y Sofi le regalan entre los dos. */
async function setup() {
  const db = await createTestDb()
  const [mama, rodri, sofi] = [await usuario(db, 'Mamá'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi')]
  const bici = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Bici' }))!
  const perfume = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Perfume' }))!
  /** Rodri arma el regalo, Sofi se suma y Rodri lo compra. */
  const comprado = async (itemId: string, total: number, moneda?: 'ARS' | 'USD') => {
    const r = await iniciarRegaloGrupal(db, itemId, rodri.id)
    if (!r.ok) throw new Error(r.reason)
    await sumarseARegalo(db, r.giftId, sofi.id)
    expect(await comprarRegalo(db, r.giftId, rodri.id, { total, moneda })).toEqual({ ok: true })
    return r.giftId
  }
  return { db, mama, rodri, sofi, bici, perfume, comprado }
}

test('un regalo en dólares: la compra, el deseo, Cuentas y Mis regalos en dólares; los pesos aparte', async () => {
  const { db, rodri, sofi, bici, perfume, comprado } = await setup()
  await comprado(bici.id, 300, 'USD')
  await comprado(perfume.id, 80000)
  const [enElDeseo] = await regalosDeItem(db, bici.id, { userId: sofi.id })
  expect(enElDeseo).toMatchObject({ moneda: 'USD', montoTotal: 300 })
  // uno en pesos no dice moneda (como siempre)
  expect((await regalosDeItem(db, perfume.id, { userId: sofi.id }))[0].moneda).toBeUndefined()

  const deSofi = await misCuentas(db, sofi.id)
  expect(deSofi).toMatchObject({ debes: 40000, teDeben: 0, dolares: { debes: 150, teDeben: 0 } })
  // con Rodri hay dos tarjetas: no se mezclan pesos con dólares
  expect(deSofi.personas.map((p) => [p.nombre, p.moneda, p.neto])).toEqual([['Rodri', undefined, -40000], ['Rodri', 'USD', -150]])
  expect(deSofi.personas[1].lineas).toEqual([expect.objectContaining({ itemTitulo: 'Bici', monto: 150, moneda: 'USD' })])
  expect(await misCuentas(db, rodri.id)).toMatchObject({ teDeben: 40000, dolares: { teDeben: 150 } })
  expect((await misRegalos(db, sofi.id)).comprados.map((r) => [r.titulo, r.miParte, r.moneda]).sort())
    .toEqual([['Bici', 150, 'USD'], ['Perfume', 40000, 'ARS']])
})

test('saldar todo con alguien es en una moneda: los dólares no saldan los pesos', async () => {
  const { db, rodri, sofi, bici, perfume, comprado } = await setup()
  await comprado(bici.id, 300, 'USD')
  await comprado(perfume.id, 80000)
  // el neto visto tiene que ser el de esa moneda
  expect(await saldarCon(db, sofi.id, rodri.id, -40000, 'USD')).toBe(0)
  expect(await saldarCon(db, sofi.id, rodri.id, -150, 'USD')).toBe(1)
  const c = await misCuentas(db, sofi.id)
  expect(c).toMatchObject({ debes: 40000 })
  expect(c.dolares).toBeUndefined()
  expect(c.saldadas).toEqual([expect.objectContaining({ itemTitulo: 'Bici', moneda: 'USD', monto: 150 })])
  // sin decir la moneda, pesos (como hasta ahora)
  expect(await saldarCon(db, sofi.id, rodri.id, -40000)).toBe(1)
  expect((await misCuentas(db, sofi.id)).personas).toEqual([])
})

test('corregir la compra puede cambiar la moneda; sin decirla queda la que tenía', async () => {
  const { db, rodri, sofi, bici, comprado } = await setup()
  const giftId = await comprado(bici.id, 90000)
  expect(await corregirCompra(db, giftId, rodri.id, { total: 100, moneda: 'USD' })).toEqual({ ok: true })
  expect(await misCuentas(db, sofi.id)).toMatchObject({ debes: 0, dolares: { debes: 50 } })
  expect(await corregirCompra(db, giftId, rodri.id, { total: 120 })).toEqual({ ok: true })
  expect(await misCuentas(db, sofi.id)).toMatchObject({ debes: 0, dolares: { debes: 60 } })
})
