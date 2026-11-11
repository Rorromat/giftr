import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { amistades, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { guardarAliasPago, miAliasPago, tipoDeAlias, upsertUserFromGoogle, validarAliasPago } from '@/lib/users'
import { createItem } from '@/lib/items'
import { bandeja } from '@/lib/bandeja'
import { miGente } from '@/lib/gente'
import { perfilPublico, yo } from '@/lib/perfil'
import { comprarRegalo, iniciarRegaloGrupal, marcarPagado, misCuentas, regalosDeItem, sumarseARegalo } from '@/lib/regalos'

// "Tu alias o CVU": adónde te transfieren tu parte de un regalo grupal. Lo ve solo quien te debe, mientras te debe.

const usuario = (db: Db, nombre: string) => upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })

async function regalo(db: Db, duenoId: string, titulo: string, encargado: string, otros: string[], total?: number) {
  const item = (await createItem(db, duenoId, { tipo: 'exacto', titulo }))!
  const g = await iniciarRegaloGrupal(db, item.id, encargado)
  if (!g.ok) throw new Error(g.reason)
  for (const id of otros) await sumarseARegalo(db, g.giftId, id)
  if (total) await comprarRegalo(db, g.giftId, encargado, { total })
  return { item, giftId: g.giftId }
}

/** Rodri compró la bici de Mamá ($90.000) con Sofi y Ana: cada una le debe $30.000. Rodri y Sofi cargaron su alias. */
async function comprada() {
  const db = await createTestDb()
  const [mama, rodri, sofi, ana] = [await usuario(db, 'Mamá'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi'), await usuario(db, 'Ana')]
  await guardarAliasPago(db, rodri.id, 'rodri.plata.mp')
  await guardarAliasPago(db, sofi.id, 'sofi.cobra')
  const { item, giftId } = await regalo(db, mama.id, 'Bici', rodri.id, [sofi.id, ana.id], 90000)
  return { db, mama, rodri, sofi, ana, bici: item, giftId }
}

test('qué se guarda: un alias en minúsculas o un CVU/CBU de 22 números; vacío lo borra y lo demás no entra', () => {
  expect(validarAliasPago('  Rodri.Plata-MP ')).toEqual({ ok: true, alias: 'rodri.plata-mp' })
  expect(validarAliasPago('casa perro gato')).toEqual({ ok: true, alias: 'casaperrogato' })
  expect(validarAliasPago('abc123')).toEqual({ ok: true, alias: 'abc123' })
  expect(validarAliasPago('a'.repeat(20))).toEqual({ ok: true, alias: 'a'.repeat(20) })
  // el CVU como lo muestra la billetera, con espacios o guiones
  expect(validarAliasPago('0000003100012345678901')).toEqual({ ok: true, alias: '0000003100012345678901' })
  expect(validarAliasPago('0000003 1000 1234-5678901')).toEqual({ ok: true, alias: '0000003100012345678901' })
  for (const vacio of ['', '   ', null, undefined, 42]) expect(validarAliasPago(vacio)).toEqual({ ok: true, alias: null })
  for (const malo of ['corto', 'a'.repeat(21), 'con_guion.bajo', 'señor.alias', 'rodri@mp.com', '000000310001234567890', '00000031000123456789012']) {
    expect(validarAliasPago(malo)).toEqual({ ok: false, error: 'formato' })
  }
  expect([tipoDeAlias('rodri.plata.mp'), tipoDeAlias('0000003100012345678901'), tipoDeAlias('0170099220000067797370')]).toEqual(['alias', 'CVU', 'CBU'])
})

test('en Perfil: se guarda normalizado, uno que no vale no pisa el de antes, y vacío lo borra', async () => {
  const db = await createTestDb()
  const rodri = await usuario(db, 'Rodri')
  expect(await miAliasPago(db, rodri.id)).toBeNull()
  expect(await guardarAliasPago(db, rodri.id, ' Rodri.Plata.MP ')).toEqual({ ok: true, alias: 'rodri.plata.mp' })
  expect(await miAliasPago(db, rodri.id)).toBe('rodri.plata.mp')
  expect(await guardarAliasPago(db, rodri.id, 'no vale!')).toEqual({ ok: false, error: 'formato' })
  expect(await miAliasPago(db, rodri.id)).toBe('rodri.plata.mp')
  expect(await guardarAliasPago(db, rodri.id, '')).toEqual({ ok: true, alias: null })
  expect(await miAliasPago(db, rodri.id)).toBeNull()
})

test('volver a entrar con Google no borra el alias', async () => {
  const db = await createTestDb()
  const rodri = await usuario(db, 'Rodri')
  await guardarAliasPago(db, rodri.id, 'rodri.plata.mp')
  await usuario(db, 'Rodri')
  expect(await miAliasPago(db, rodri.id)).toBe('rodri.plata.mp')
})

test('en Cuentas lo ve solo quien le debe: ni el que cobra ve el de quien le paga, ni los que deben ven el de otro que debe', async () => {
  const { db, mama, rodri, sofi, ana } = await comprada()
  const deSofi = await misCuentas(db, sofi.id)
  expect(deSofi.personas).toEqual([expect.objectContaining({ nombre: 'Rodri', neto: -30000, alias: 'rodri.plata.mp' })])
  expect((await misCuentas(db, ana.id)).personas[0].alias).toBe('rodri.plata.mp')
  // Rodri cobra: el alias de Sofi no le llega, aunque lo haya cargado
  const deRodri = await misCuentas(db, rodri.id)
  expect(deRodri.personas.map((p) => [p.nombre, p.alias])).toEqual([['Sofi', undefined], ['Ana', undefined]])
  expect(JSON.stringify(deRodri)).not.toContain('sofi.cobra')
  // Ana está en el mismo regalo que Sofi, pero no le debe nada a ella
  expect(JSON.stringify(await misCuentas(db, ana.id))).not.toContain('sofi.cobra')
  // la dueña de la lista no ve el regalo, y mucho menos un alias
  expect(JSON.stringify(await misCuentas(db, mama.id))).not.toContain('rodri.plata.mp')
})

test('en Cuentas se ve mientras le debés: pagada tu parte, ya no; y si lo borra o lo cambia, es el de ahora', async () => {
  const { db, rodri, sofi, ana, giftId } = await comprada()
  await guardarAliasPago(db, rodri.id, 'rodri.nuevo')
  expect((await misCuentas(db, sofi.id)).personas[0].alias).toBe('rodri.nuevo')
  expect(await marcarPagado(db, giftId, sofi.id, sofi.id)).toBe(true)
  expect(JSON.stringify(await misCuentas(db, sofi.id))).not.toContain('rodri.nuevo')
  await guardarAliasPago(db, rodri.id, '')
  const deAna = await misCuentas(db, ana.id)
  expect(deAna.personas[0]).toMatchObject({ nombre: 'Rodri', neto: -30000 })
  expect(deAna.personas[0]).not.toHaveProperty('alias')
})

test('antes de comprarlo nadie le debe nada: los que se sumaron todavía no ven el alias del encargado', async () => {
  const db = await createTestDb()
  const [mama, rodri, sofi] = [await usuario(db, 'Mamá'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi')]
  await guardarAliasPago(db, rodri.id, 'rodri.plata.mp')
  const { item } = await regalo(db, mama.id, 'Bici', rodri.id, [sofi.id])
  expect(JSON.stringify(await misCuentas(db, sofi.id))).not.toContain('rodri.plata.mp')
  expect(JSON.stringify(await regalosDeItem(db, item.id, { userId: sofi.id }))).not.toContain('rodri.plata.mp')
})

test('simplificado: ves el alias de a quien le pagás "en vez de" a otro, y el del medio no ve ninguno', async () => {
  // Ana le debe $30.000 a Bruno (la bici de Mamá) y Bruno $30.000 a Carla (el libro del Tío): Ana le paga directo a Carla
  const db = await createTestDb()
  const [mama, tio, ana, bruno, carla] = await Promise.all(['Mamá', 'Tío', 'Ana', 'Bruno', 'Carla'].map((n) => usuario(db, n)))
  await regalo(db, mama.id, 'Bici', bruno.id, [ana.id], 60000)
  await regalo(db, tio.id, 'Libro', carla.id, [bruno.id], 60000)
  await db.insert(amistades).values({ deUserId: ana.id, paraUserId: carla.id, estado: 'aceptada' })
  await guardarAliasPago(db, bruno.id, 'bruno.alias')
  await guardarAliasPago(db, carla.id, 'carla.alias')
  const deAna = await misCuentas(db, ana.id)
  expect(deAna.personas.filter((p) => p.neto < 0).map((p) => [p.nombre, p.alias])).toEqual([['Carla', 'carla.alias']])
  // a Bruno ya no le paga nada: su alias no hace falta
  expect(JSON.stringify(deAna)).not.toContain('bruno.alias')
  // Bruno no le paga a nadie (lo pagan por él): no ve el de Carla
  expect(JSON.stringify(await misCuentas(db, bruno.id))).not.toContain('carla.alias')
})

test('el alias no es parte del perfil: no sale en el perfil público, en la gente de nadie, en el regalo ni en "yo"', async () => {
  const { db, mama, rodri, sofi, bici } = await comprada()
  await guardarAliasPago(db, mama.id, 'mama.alias')
  await db.insert(amistades).values({ deUserId: sofi.id, paraUserId: rodri.id, estado: 'aceptada' })
  const [deRodri] = await db.select().from(lists).where(eq(lists.ownerId, rodri.id))
  const [deMama] = await db.select().from(lists).where(eq(lists.ownerId, mama.id))
  const fuera = JSON.stringify([
    await perfilPublico(db, deRodri.shareToken), await perfilPublico(db, deMama.shareToken), await perfilPublico(db, deMama.shareToken, mama.id),
    await miGente(db, sofi.id), await miGente(db, rodri.id),
    await regalosDeItem(db, bici.id, { userId: sofi.id }), await regalosDeItem(db, bici.id, { userId: rodri.id }),
    await yo(db, rodri.id), await yo(db, mama.id),
  ])
  expect(fuera).toContain('Rodri') // se armó algo: no es que esté vacío
  for (const alias of ['rodri.plata.mp', 'sofi.cobra', 'mama.alias']) expect(fuera).not.toContain(alias)
  // y sigue guardado, que no es que no esté
  expect((await db.select({ a: users.aliasPago }).from(users).where(eq(users.id, mama.id)))[0].a).toBe('mama.alias')
})

test('el aviso de la compra les lleva el alias a los que le deben (y a nadie más); sin alias, el de siempre', async () => {
  const { db, mama, rodri, sofi, ana } = await comprada()
  const avisos = async (userId: string) => (await bandeja(db, { userId })).entradas.map((e) => e.cuerpo)
  for (const u of [sofi, ana]) {
    expect(await avisos(u.id)).toEqual(['Tu parte del regalo para Mamá: $30.000. Transferile a rodri.plata.mp y marcalo en Cuentas.'])
  }
  expect(JSON.stringify([await bandeja(db, { userId: rodri.id }), await bandeja(db, { userId: mama.id })])).not.toContain('rodri.plata.mp')
  // Ana compra otro y no cargó alias: a Rodri le llega el aviso de siempre
  const tio = await usuario(db, 'Tío')
  await regalo(db, tio.id, 'Libro', ana.id, [rodri.id], 20000)
  expect((await avisos(rodri.id))[0]).toBe('Tu parte del regalo para Tío: $10.000. Cuando le pagues, marcalo en Cuentas.')
})
