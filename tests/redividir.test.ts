import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { groupGiftMembers, items, lists, notifications } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { pedirAmistad } from '@/lib/amigos'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { createItem } from '@/lib/items'
import {
  comprarRegalo, corregirCompra, iniciarRegaloGrupal, marcarPagado, misCuentas, regalosDeItem, sacarDeRegalo, salirDeRegalo, saldarCon,
  sumarseARegalo,
} from '@/lib/regalos'
import { invitacionesPendientes, invitadosDeRegalo, invitarARegalo, responderInvitacion } from '@/lib/invitaciones'

// Ya comprado, la gente del regalo sigue cambiando: se suma alguien ("sumame, después te pago"), se baja o lo sacan, y se
// vuelve a dividir. Lo que cada uno ya puso queda: si le toca menos, el encargado se lo devuelve.

const usuario = (db: Db, nombre: string) => upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
const amigos = async (db: Db, a: string, b: string) => { await pedirAmistad(db, a, b); await pedirAmistad(db, b, a) }
const sinAvisos = async () => 201

/** La bici de Mamá. Rodri la regala; Sofi, Juan, Caro y Ana son amigos suyos. */
async function setup() {
  const db = await createTestDb()
  const [mama, rodri, sofi, juan, caro, ana] = await Promise.all(['Mamá', 'Rodri', 'Sofi', 'Juan', 'Caro', 'Ana'].map((n) => usuario(db, n)))
  for (const o of [sofi, juan, caro, ana]) await amigos(db, rodri.id, o.id)
  const bici = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Bici', precio: '$90.000' }))!
  const g = await iniciarRegaloGrupal(db, bici.id, rodri.id)
  if (!g.ok) throw new Error(g.reason)
  return { db, mama, rodri, sofi, juan, caro, ana, bici, giftId: g.giftId }
}

/** Cómo quedó cada uno: [nombre, parte, saldo] (saldo: lo que le falta poner; negativo, lo que le devuelven). */
async function division(db: Db, itemId: string, userId: string) {
  const [r] = await regalosDeItem(db, itemId, { userId })
  return r.miembros.map((m) => [m.nombre, m.monto, m.saldo])
}

const avisos = async (db: Db, userId: string) =>
  (await db.select({ tipo: notifications.tipo }).from(notifications).where(eq(notifications.userId, userId))).map((n) => n.tipo)

test('hoy a 2, mañana a 1 más, uno no quiere, lo compra, y después contestan o se suman: se vuelve a dividir', async () => {
  const { db, rodri, sofi, juan, caro, ana, bici, giftId } = await setup()
  expect(await invitarARegalo(db, giftId, rodri.id, [sofi.id, juan.id], sinAvisos)).toBe(2)
  expect(await invitarARegalo(db, giftId, rodri.id, [caro.id], sinAvisos)).toBe(1)
  const contestar = async (userId: string, acepta: boolean) => {
    const [inv] = await invitacionesPendientes(db, userId)
    return responderInvitacion(db, userId, inv.id, acepta, sinAvisos)
  }
  await contestar(juan.id, false)
  await contestar(sofi.id, true)

  // lo compra antes de que Caro conteste
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 90000 })).toEqual({ ok: true })
  expect(await division(db, bici.id, rodri.id)).toEqual([['Rodri', 45000, 0], ['Sofi', 45000, 45000]])
  // a Caro la propuesta le sigue esperando, ahora con cuánto le toca; y se le puede proponer a alguien más
  expect(await invitacionesPendientes(db, caro.id)).toEqual([expect.objectContaining({ comprado: true, parte: 30000, somos: 2 })])
  expect(await invitarARegalo(db, giftId, rodri.id, [ana.id], sinAvisos)).toBe(1)

  // Caro dice que sí: tercios
  expect(await contestar(caro.id, true)).toMatchObject({ ok: true })
  expect(await division(db, bici.id, rodri.id)).toEqual([['Rodri', 30000, 0], ['Sofi', 30000, 30000], ['Caro', 30000, 30000]])
  // a los que les cambió la parte se les avisa; a la que se sumó, no
  expect(await avisos(db, sofi.id)).toEqual(['regalo_redividido'])
  expect(await avisos(db, rodri.id)).toEqual(['regalo_redividido'])
  expect(await avisos(db, caro.id)).toEqual([])

  // Ana, con el link, "Me sumo" (sin contestar la propuesta: ya no le espera)
  expect(await regalosDeItem(db, bici.id, { userId: ana.id })).toEqual([expect.objectContaining({ soyParte: false, parteSiTeSumas: 22500 })])
  expect(await sumarseARegalo(db, giftId, ana.id, bici.id)).toBe(true)
  expect(await invitacionesPendientes(db, ana.id)).toEqual([])
  expect(await division(db, bici.id, ana.id)).toEqual([['Rodri', 22500, 0], ['Sofi', 22500, 22500], ['Caro', 22500, 22500], ['Ana', 22500, 22500]])
  expect((await misCuentas(db, rodri.id)).teDeben).toBe(67500)
  expect((await invitadosDeRegalo(db, giftId)).map((i) => [i.persona.nombre, i.estado]))
    .toEqual([['Sofi', 'se_sumo'], ['Juan', 'no_puede'], ['Caro', 'se_sumo'], ['Ana', 'se_sumo']])

  // Juan dijo que no; Caro se baja (no puso nada): vuelve a tercios
  expect(await salirDeRegalo(db, giftId, caro.id)).toBe(true)
  expect(await division(db, bici.id, rodri.id)).toEqual([['Rodri', 30000, 0], ['Sofi', 30000, 30000], ['Ana', 30000, 30000]])
  // y si Rodri saca a Ana: mitades, y Ana no vuelve sola
  expect(await sacarDeRegalo(db, giftId, ana.id, rodri.id)).toBe(true)
  expect(await division(db, bici.id, rodri.id)).toEqual([['Rodri', 45000, 0], ['Sofi', 45000, 45000]])
  expect(await sumarseARegalo(db, giftId, ana.id, bici.id)).toBe(false)
  expect(await avisos(db, ana.id)).toContain('regalo_sacado')
})

test('pagó y después se sumó alguien: el encargado le devuelve la diferencia, y "Deshacer" vuelve paso a paso', async () => {
  const { db, rodri, sofi, caro, bici, giftId } = await setup()
  await sumarseARegalo(db, giftId, sofi.id)
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })
  expect(await marcarPagado(db, giftId, sofi.id, sofi.id, true, 45000)).toBe(true)
  // un doble toque no la vuelve a marcar
  expect(await marcarPagado(db, giftId, sofi.id, sofi.id, true, 45000)).toBe(false)

  expect(await sumarseARegalo(db, giftId, caro.id)).toBe(true)
  expect(await division(db, bici.id, sofi.id)).toEqual([['Rodri', 30000, 0], ['Sofi', 30000, -15000], ['Caro', 30000, 30000]])
  // en Cuentas: Rodri le devuelve a Sofi; Caro le debe a Rodri
  const deRodri = await misCuentas(db, rodri.id)
  expect(deRodri).toMatchObject({ debes: 15000, teDeben: 30000 })
  expect(deRodri.personas.map((p) => [p.nombre, p.neto, p.lineas.map((l) => [l.tipo, l.devolucion, l.monto, l.parte])])).toEqual([
    ['Sofi', -15000, [['debes', true, 15000, 30000]]],
    ['Caro', 30000, [['te_deben', false, 30000, 30000]]],
  ])
  const deSofi = await misCuentas(db, sofi.id)
  expect(deSofi).toMatchObject({ debes: 0, teDeben: 15000 })
  expect(deSofi.personas[0].lineas[0]).toMatchObject({ tipo: 'te_deben', devolucion: true, monto: 15000 })
  // con plata puesta no se baja ni la sacan: primero se la devuelven
  expect(await salirDeRegalo(db, giftId, sofi.id)).toBe(false)
  expect(await sacarDeRegalo(db, giftId, sofi.id, rodri.id)).toBe(false)

  // "Ya le devolví", y "Deshacer" vuelve a lo de antes: le devuelve 15.000
  expect(await marcarPagado(db, giftId, sofi.id, rodri.id, true, 30000)).toBe(true)
  expect(await division(db, bici.id, sofi.id)).toContainEqual(['Sofi', 30000, 0])
  expect(await marcarPagado(db, giftId, sofi.id, rodri.id, false)).toBe(true)
  expect(await division(db, bici.id, sofi.id)).toContainEqual(['Sofi', 30000, -15000])
  // "Saldar todo" desde Rodri también lo devuelve (el neto con Sofi es negativo: él le debe)
  expect(await saldarCon(db, rodri.id, sofi.id, 15000)).toBe(0)
  expect(await saldarCon(db, rodri.id, sofi.id, -15000)).toBe(1)
  expect(await division(db, bici.id, sofi.id)).toContainEqual(['Sofi', 30000, 0])
  // y si en realidad nunca había pagado: dos "Deshacer" y debe su parte entera
  await marcarPagado(db, giftId, sofi.id, sofi.id, false)
  expect(await division(db, bici.id, sofi.id)).toContainEqual(['Sofi', 30000, -15000])
  await marcarPagado(db, giftId, sofi.id, sofi.id, false)
  expect(await division(db, bici.id, sofi.id)).toContainEqual(['Sofi', 30000, 30000])
  expect(await marcarPagado(db, giftId, sofi.id, sofi.id, false)).toBe(false)

  // pagó sus 30.000 y Caro se baja: a Sofi le faltan 15.000
  await marcarPagado(db, giftId, sofi.id, sofi.id, true, 30000)
  expect(await salirDeRegalo(db, giftId, caro.id)).toBe(true)
  expect(await division(db, bici.id, sofi.id)).toEqual([['Rodri', 45000, 0], ['Sofi', 45000, 15000]])
  expect((await regalosDeItem(db, bici.id, { userId: sofi.id }))[0].miembros[1]).toMatchObject({ puso: true, pagado: false })
  const falta = (await misCuentas(db, sofi.id)).personas[0].lineas[0]
  expect(falta).toMatchObject({ tipo: 'debes', devolucion: false, monto: 15000, parte: 45000 })
})

test('dividido a mano: el que llega entra en 0 y el encargado se entera; la parte del que se va queda para él', async () => {
  const { db, rodri, sofi, caro, ana, bici, giftId } = await setup()
  await sumarseARegalo(db, giftId, sofi.id)
  await comprarRegalo(db, giftId, rodri.id, { total: 90000, partes: { [rodri.id]: 60000, [sofi.id]: 30000 } })
  // al que todavía no está no se le dice un número que no es
  expect((await regalosDeItem(db, bici.id, { userId: caro.id }))[0].parteSiTeSumas).toBeNull()
  await invitarARegalo(db, giftId, rodri.id, [ana.id], sinAvisos)
  expect(await invitacionesPendientes(db, ana.id)).toEqual([expect.objectContaining({ comprado: true, parte: null })])

  expect(await sumarseARegalo(db, giftId, caro.id)).toBe(true)
  expect(await division(db, bici.id, rodri.id)).toEqual([['Rodri', 60000, 0], ['Sofi', 30000, 30000], ['Caro', 0, 0]])
  expect(await avisos(db, rodri.id)).toEqual(['regalo_a_mano'])
  expect(await avisos(db, sofi.id)).toEqual([])
  // Rodri le pone su parte
  const todos = [rodri.id, sofi.id, caro.id]
  expect(await corregirCompra(db, giftId, rodri.id, { total: 90000, miembros: todos, partes: { [rodri.id]: 40000, [sofi.id]: 30000, [caro.id]: 20000 } }))
    .toEqual({ ok: true })
  // Sofi se baja: lo suyo queda para Rodri, a Caro no le cambia nada
  expect(await salirDeRegalo(db, giftId, sofi.id)).toBe(true)
  expect(await division(db, bici.id, rodri.id)).toEqual([['Rodri', 70000, 0], ['Caro', 20000, 20000]])
  expect(await avisos(db, caro.id)).toEqual(['compra_corregida'])
})

test('comprado para un evento que ya pasó, ya se regaló: no se suma, no se baja ni se invita a nadie', async () => {
  const { db, rodri, sofi, caro, ana, bici, giftId } = await setup()
  await sumarseARegalo(db, giftId, sofi.id)
  await invitarARegalo(db, giftId, rodri.id, [ana.id], sinAvisos)
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })
  // Mamá lo volvió a poner en la lista (ver restoreItem): lo comprado antes ya no ocupa el deseo
  await db.update(items).set({ ocupaDesde: new Date(Date.now() + 1000) }).where(eq(items.id, bici.id))
  expect(await sumarseARegalo(db, giftId, caro.id)).toBe(false)
  expect(await salirDeRegalo(db, giftId, sofi.id)).toBe(false)
  expect(await invitarARegalo(db, giftId, rodri.id, [caro.id], sinAvisos)).toBe(0)
  expect(await invitacionesPendientes(db, ana.id)).toEqual([])
  expect((await db.select().from(groupGiftMembers).where(eq(groupGiftMembers.giftId, giftId))).map((m) => m.monto)).toEqual([45000, 45000])
})

test('al que después de la compra se sumó al grupo de la lista no se le cambia la parte: se reparte el resto', async () => {
  const db = await createTestDb()
  const [delfina, rodri, sofi, tia, caro] = await Promise.all(['Delfina', 'Rodri', 'Sofi', 'Tía', 'Caro'].map((n) => usuario(db, n)))
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  const tele = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Tele' }, grupoId))!
  const g = await iniciarRegaloGrupal(db, tele.id, rodri.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, sofi.id)
  await sumarseARegalo(db, g.giftId, tia.id)
  await comprarRegalo(db, g.giftId, rodri.id, { total: 90000 })
  // la Tía se suma al grupo: ya no ve el regalo
  await unirseAGrupo(db, grupo.inviteToken!, tia.id)
  expect(await sumarseARegalo(db, g.giftId, caro.id)).toBe(true)
  const filas = await db.select({ userId: groupGiftMembers.userId, monto: groupGiftMembers.monto }).from(groupGiftMembers)
    .where(eq(groupGiftMembers.giftId, g.giftId))
  expect(Object.fromEntries(filas.map((f) => [f.userId, f.monto]))).toEqual({ [rodri.id]: 20000, [sofi.id]: 20000, [tia.id]: 30000, [caro.id]: 20000 })
  expect(await avisos(db, tia.id)).toEqual([])
})
