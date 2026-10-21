import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { createTestDb, seguir } from './helpers'
import { claims, groupGiftMembers, groupGifts, items, lists, notifications } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo, salirDeGrupo, unirseAGrupo } from '@/lib/groups'
import { archiveItem, createItem, restoreItem, updateItem } from '@/lib/items'
import { getMyClaimWarnings, markBought, releaseClaim, reserveItem } from '@/lib/claims'
import { cambiarLinkParaRegalar, getItemForViewer, getListForViewer, getOwnList } from '@/lib/lists'
import { getUnreadNotifications, markNotificationsRead } from '@/lib/notifications'
import { guardarCumple, hoyLocal, misEventos } from '@/lib/events'
import {
  cancelarRegalo, comprarRegalo, comprasParaCorregir, corregirCompra, dejarVolverARegalo, dividir, historialDeLista, iniciarRegaloGrupal,
  marcarPagado, misCuentas, parsePesos, pesos, posponerRecordatorio, regalosDeItem, regalosParaCerrar, sacarDeRegalo, salirDeRegalo, saldarCon,
  sumarseARegalo, ultimosRegalos,
} from '@/lib/regalos'
import { partePesos } from '@/lib/pesos'

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}

/** Lista de Mamá con una bici de $90.000 y un perfume. Rodri, Sofi y Ana le regalan; Martín mira de afuera. */
async function setup() {
  const db = await createTestDb()
  const [mama, rodri, sofi, ana, martin] = [
    await usuario(db, 'Mamá'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi'), await usuario(db, 'Ana'), await usuario(db, 'Martín'),
  ]
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, mama.id))
  const bici = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Bici', precio: '$90.000' }))!
  const perfume = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Perfume' }))!
  return { db, mama, rodri, sofi, ana, martin, lista, bici, perfume }
}

/** Rodri arma el regalo de la bici, Sofi y Ana se suman. */
async function conRegalo() {
  const s = await setup()
  const r = await iniciarRegaloGrupal(s.db, s.bici.id, s.rodri.id)
  if (!r.ok) throw new Error(r.reason)
  expect(await sumarseARegalo(s.db, r.giftId, s.sofi.id)).toBe(true)
  expect(await sumarseARegalo(s.db, r.giftId, s.ana.id)).toBe(true)
  return { ...s, giftId: r.giftId }
}

test('pesos: se leen del precio y se escriben con puntos', () => {
  expect(parsePesos('$90.000')).toBe(90000)
  expect(parsePesos('$20.000 - $30.000')).toBe(20000)
  expect(parsePesos('45k')).toBe(45000)
  // los centavos se redondean (antes se cortaban: daba 1250)
  expect(parsePesos('$ 1.250,50')).toBe(1251)
  expect(parsePesos('a consultar')).toBeNull()
  expect(parsePesos(null)).toBeNull()
  expect(pesos(90000)).toBe('$90.000')
  expect(pesos(1234567)).toBe('$1.234.567')
  expect(pesos(-500)).toBe('-$500')
  expect(dividir(90000, 3)).toEqual([30000, 30000, 30000])
  expect(dividir(100, 3)).toEqual([34, 33, 33])
})

test('armar un regalo grupal reserva el deseo sin vencimiento y los demás se suman', async () => {
  const { db, rodri, sofi, martin, lista, bici, giftId } = await conRegalo()
  const [claim] = await db.select().from(claims).where(eq(claims.itemId, bici.id))
  expect(claim).toMatchObject({ claimerUserId: rodri.id, estado: 'reservado', expiresAt: null })

  // nadie más lo puede reservar suelto
  expect(await reserveItem(db, bici.id, { userId: martin.id })).toEqual({ ok: false, reason: 'sin_stock' })
  // y la reserva del grupo no se compra ni se libera como si fuera suelta
  expect(await markBought(db, claim.id, { userId: rodri.id })).toMatchObject({ ok: false })
  expect(await releaseClaim(db, claim.id, { userId: rodri.id })).toBe(false)

  const vista = await getItemForViewer(db, lista.shareToken, bici.id, { userId: sofi.id })
  if (vista?.role !== 'giver') throw new Error('esperaba giver')
  expect(vista.item.claims[0].grupal).toEqual({ giftId, personas: ['Rodri', 'Sofi', 'Ana'], soyParte: true })
  expect(vista.regalos[0]).toMatchObject({ estado: 'abierto', encargado: { nombre: 'Rodri' }, soyParte: true, soyEncargado: false })
  expect(vista.regalos[0].miembros.map((m) => m.nombre)).toEqual(['Rodri', 'Sofi', 'Ana'])

  // Martín ve que hay un regalo grupal y quiénes están, pero no los montos
  const deAfuera = await regalosDeItem(db, bici.id, { userId: martin.id })
  expect(deAfuera[0]).toMatchObject({ soyParte: false, montoTotal: null })
  expect(await sumarseARegalo(db, giftId, sofi.id)).toBe(true) // idempotente
  expect((await regalosDeItem(db, bici.id, { userId: sofi.id }))[0].miembros).toHaveLength(3)
})

test('si ya lo tenías reservado, lo convertís en regalo grupal con la misma reserva', async () => {
  const { db, rodri, bici } = await setup()
  const r = await reserveItem(db, bici.id, { userId: rodri.id })
  if (!r.ok) throw new Error(r.reason)
  const g = await iniciarRegaloGrupal(db, bici.id, rodri.id)
  expect(g.ok).toBe(true)
  const filas = await db.select().from(claims).where(eq(claims.itemId, bici.id))
  expect(filas).toHaveLength(1)
  expect(filas[0]).toMatchObject({ id: r.claimId, expiresAt: null, estado: 'reservado' })
})

test('el encargado lo compra y se divide en partes iguales; su parte ya está paga', async () => {
  const { db, rodri, sofi, ana, bici, giftId } = await conRegalo()
  expect(await comprarRegalo(db, giftId, sofi.id, { total: 90000 })).toEqual({ ok: false, reason: 'no_permitido' })
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 0 })).toEqual({ ok: false, reason: 'monto_invalido' })
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 90000, nota: 'la roja' })).toEqual({ ok: true })

  const [claim] = await db.select().from(claims).where(eq(claims.itemId, bici.id))
  expect(claim).toMatchObject({ estado: 'comprado', notaQueCompre: 'la roja' })
  const [regalo] = await regalosDeItem(db, bici.id, { userId: ana.id })
  expect(regalo).toMatchObject({ estado: 'comprado', montoTotal: 90000 })
  expect(regalo.miembros.map((m) => [m.nombre, m.monto, m.pagado])).toEqual([['Rodri', 30000, true], ['Sofi', 30000, false], ['Ana', 30000, false]])
  // ya comprado: no se suma ni se baja nadie, y no se cancela
  expect(await sumarseARegalo(db, giftId, (await usuario(db, 'Caro')).id)).toBe(false)
  expect(await salirDeRegalo(db, giftId, sofi.id)).toBe(false)
  expect(await cancelarRegalo(db, giftId, rodri.id)).toBe(false)
})

test('partes a mano: tienen que sumar el total', async () => {
  const { db, rodri, sofi, ana, bici, giftId } = await conRegalo()
  const partes = { [rodri.id]: 40000, [sofi.id]: 30000, [ana.id]: 10000 }
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 90000, partes })).toEqual({ ok: false, reason: 'no_suma' })
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 90000, partes: { [rodri.id]: 90000 } })).toEqual({ ok: false, reason: 'no_permitido' })
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 90000, partes: { ...partes, [ana.id]: -10 } })).toEqual({ ok: false, reason: 'monto_invalido' })
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 90000, partes: { ...partes, [ana.id]: 20000 } })).toEqual({ ok: true })
  const [regalo] = await regalosDeItem(db, bici.id, { userId: rodri.id })
  expect(regalo.miembros.map((m) => m.monto)).toEqual([40000, 30000, 20000])
})

test('cuentas a lo Splitwise: quién le debe a quién, de qué regalo, y saldar', async () => {
  const { db, mama, rodri, sofi, ana, giftId } = await conRegalo()
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })

  const deSofi = await misCuentas(db, sofi.id)
  expect(deSofi).toMatchObject({ debes: 30000, teDeben: 0 })
  expect(deSofi.personas).toHaveLength(1)
  expect(deSofi.personas[0]).toMatchObject({ nombre: 'Rodri', neto: -30000 })
  expect(deSofi.personas[0].lineas[0]).toMatchObject({ itemTitulo: 'Bici', para: 'Mamá', monto: 30000, tipo: 'debes' })

  const deRodri = await misCuentas(db, rodri.id)
  expect(deRodri).toMatchObject({ debes: 0, teDeben: 60000 })
  expect(deRodri.personas.map((p) => [p.nombre, p.neto])).toEqual([['Sofi', 30000], ['Ana', 30000]])

  // Sofi le pagó (lo marca ella); Ana no puede marcar la de Sofi
  expect(await marcarPagado(db, giftId, sofi.id, ana.id)).toBe(false)
  expect(await marcarPagado(db, giftId, sofi.id, sofi.id)).toBe(true)
  expect(await marcarPagado(db, giftId, rodri.id, rodri.id)).toBe(false) // el encargado no se debe a sí mismo
  expect((await misCuentas(db, rodri.id)).teDeben).toBe(30000)
  expect((await misCuentas(db, sofi.id)).saldadas[0]).toMatchObject({ itemTitulo: 'Bici', con: 'Rodri', monto: 30000 })

  // Sofi arma otro regalo (el perfume) y Rodri se suma: entre ellos dos queda el neto
  const lista = (await db.select().from(lists).where(eq(lists.ownerId, mama.id)))[0]
  const perfume = (await db.select().from(items).where(eq(items.titulo, 'Perfume')))[0]
  expect(perfume.listId).toBe(lista.id)
  const otro = await iniciarRegaloGrupal(db, perfume.id, sofi.id)
  if (!otro.ok) throw new Error(otro.reason)
  await sumarseARegalo(db, otro.giftId, rodri.id)
  expect((await misCuentas(db, rodri.id)).enCurso[0]).toMatchObject({ itemTitulo: 'Perfume', encargado: 'Sofi', personas: ['Sofi', 'Rodri'] })
  await comprarRegalo(db, otro.giftId, sofi.id, { total: 20000 })
  await marcarPagado(db, giftId, sofi.id, sofi.id, false) // se equivocó: todavía no le pagó
  // Los totales salen de los netos, como las tarjetas: Sofi le debe 30.000 y él a ella 10.000, así que no "debe" nada (antes
  // decía "Debés $10.000 · Te deben $60.000" arriba de "Sofi te debe $20.000")
  const neto = await misCuentas(db, rodri.id)
  expect(neto).toMatchObject({ debes: 0, teDeben: 50000 })
  expect(neto.personas.find((p) => p.nombre === 'Sofi')).toMatchObject({ neto: 20000 })
  expect(await misCuentas(db, sofi.id)).toMatchObject({ debes: 20000, teDeben: 0 })

  // "Saldar todo" con Sofi deja las dos direcciones pagas; lo de Ana sigue
  expect(await saldarCon(db, rodri.id, sofi.id)).toBe(2)
  const despues = await misCuentas(db, rodri.id)
  expect(despues).toMatchObject({ debes: 0, teDeben: 30000 })
  expect(despues.personas.map((p) => p.nombre)).toEqual(['Ana'])
  expect(await marcarPagado(db, giftId, ana.id, rodri.id)).toBe(true) // "me pagó"
  expect((await misCuentas(db, rodri.id)).personas).toEqual([])
})

test('bajarse y cancelar: el encargado no se baja, cancela y libera el deseo', async () => {
  const { db, lista, rodri, sofi, martin, bici, giftId } = await conRegalo()
  expect(await salirDeRegalo(db, giftId, rodri.id)).toBe(false)
  expect(await salirDeRegalo(db, giftId, sofi.id)).toBe(true)
  expect(await cancelarRegalo(db, giftId, sofi.id)).toBe(false)
  expect(await cancelarRegalo(db, giftId, rodri.id)).toBe(true)
  expect(await regalosDeItem(db, bici.id, { userId: rodri.id })).toEqual([])
  const vista = await getListForViewer(db, lista.shareToken, { userId: martin.id })
  if (vista?.role !== 'giver') throw new Error('esperaba giver')
  expect(vista.items.find((i) => i.id === bici.id)).toMatchObject({ disponible: true, claims: [] })
  expect(await sumarseARegalo(db, giftId, martin.id)).toBe(false)
})

// Antes sacar el deseo dejaba el regalo abierto trabado (en Cuentas, hasta que el encargado lo cancelara, y los demás sin
// poder bajarse). Con "Ya no lo quiero" se cancela en el momento y se les avisa a todos (con "Ya lo tengo", abajo, no).
test('si la dueña ya no lo quiere, el regalo abierto se cancela y se les avisa a todos los que estaban', async () => {
  const { db, mama, rodri, sofi, ana, martin, lista, bici, giftId } = await conRegalo()
  expect(await archiveItem(db, bici.id, mama.id, 'no_lo_quiero')).toBe(true)
  for (const u of [rodri, sofi, ana]) {
    expect((await misCuentas(db, u.id)).enCurso).toEqual([])
    expect(await getUnreadNotifications(db, { userId: u.id })).toEqual([expect.objectContaining({ tipo: 'regalo_baja', itemTitulo: 'Bici' })])
  }
  const [claim] = await db.select().from(claims).where(eq(claims.itemId, bici.id))
  expect(claim.estado).toBe('liberado')
  expect(await cancelarRegalo(db, giftId, rodri.id)).toBe(false)
  // a la dueña no le llega nada, y si lo vuelve a poner está libre para cualquiera
  expect(await getUnreadNotifications(db, { userId: mama.id })).toEqual([])
  expect(await restoreItem(db, bici.id, mama.id)).toBe(true)
  const vista = await getListForViewer(db, lista.shareToken, { userId: martin.id })
  if (vista?.role !== 'giver') throw new Error('esperaba giver')
  expect(vista.items.find((i) => i.id === bici.id)).toMatchObject({ disponible: true, claims: [] })
  // el aviso de la baja ya no vale: ahora dice que se canceló el regalo, y lleva al deseo
  for (const u of [rodri, sofi, ana]) {
    expect(await getUnreadNotifications(db, { userId: u.id })).toEqual([
      expect.objectContaining({ tipo: 'regalo_cancelado', href: `/l/${lista.shareToken}/item/${bici.id}` }),
    ])
  }
})

// Mamá toca "Ya lo tengo" porque se la dieron en el cumple, pero Rodri todavía no había dividido lo que salió: el regalo
// no se cancela (se perderían los $90.000), lo termina desde Cuentas.
test('si la dueña ya lo tiene, el regalo abierto sigue: el encargado lo divide o lo cancela desde Cuentas', async () => {
  const { db, mama, rodri, sofi, ana, martin, lista, bici, giftId } = await conRegalo()
  expect(await archiveItem(db, bici.id, mama.id, 'lo_tengo')).toBe(true)
  for (const u of [rodri, sofi, ana]) {
    expect(await getUnreadNotifications(db, { userId: u.id })).toEqual([
      expect.objectContaining({ tipo: 'regalo_lo_tiene', itemTitulo: 'Bici', href: '/cuentas' }),
    ])
  }
  const [deRodri] = (await misCuentas(db, rodri.id)).enCurso
  expect(deRodri).toMatchObject({ giftId, sigueEnLaLista: false, soyEncargado: true, href: `/l/${lista.shareToken}` })
  expect(deRodri.dividirCon!.map((m) => m.nombre)).toEqual(['Rodri', 'Sofi', 'Ana'])
  expect((await misCuentas(db, sofi.id)).enCurso[0]).toMatchObject({ sigueEnLaLista: false, soyEncargado: false, dividirCon: null })
  // desde una pantalla vieja nadie se suma a algo que salió de la lista
  expect(await sumarseARegalo(db, giftId, martin.id)).toBe(false)
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 90000 })).toEqual({ ok: true })
  expect((await misCuentas(db, sofi.id)).debes).toBe(30000)
  expect((await misCuentas(db, rodri.id)).teDeben).toBe(60000)
  // a la dueña no le llega nada; si lo vuelve a poner, ya está comprado y el aviso de Cuentas no queda
  expect(await getUnreadNotifications(db, { userId: mama.id })).toEqual([])
  expect(await restoreItem(db, bici.id, mama.id)).toBe(true)
  expect(await getUnreadNotifications(db, { userId: sofi.id })).toEqual([])
  const vista = await getListForViewer(db, lista.shareToken, { userId: martin.id })
  if (vista?.role !== 'giver') throw new Error('esperaba giver')
  expect(vista.items.find((i) => i.id === bici.id)).toMatchObject({ disponible: false })
})

test('si la dueña vuelve a poner un deseo que "ya no quería", a los del regalo grupal comprado se les avisa que volvió', async () => {
  const { db, mama, rodri, sofi, ana, bici, giftId } = await conRegalo()
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })
  await archiveItem(db, bici.id, mama.id, 'no_lo_quiero')
  expect(await restoreItem(db, bici.id, mama.id)).toBe(true)
  for (const u of [rodri, sofi, ana]) {
    expect(await getUnreadNotifications(db, { userId: u.id })).toEqual([expect.objectContaining({ tipo: 'regalo_vuelve', itemTitulo: 'Bici' })])
  }
  expect(await getUnreadNotifications(db, { userId: mama.id })).toEqual([])
})

test('un regalo abierto de un deseo que salió de la lista antes de esto: el encargado lo cancela y los demás se bajan desde Cuentas', async () => {
  const { db, rodri, sofi, bici, giftId } = await conRegalo()
  await db.update(items).set({ estadoDueno: 'no_lo_quiero' }).where(eq(items.id, bici.id))
  const enCurso = (await misCuentas(db, rodri.id)).enCurso
  // también lo podría dividir, si lo había comprado
  expect(enCurso).toEqual([expect.objectContaining({ giftId, sigueEnLaLista: false, soyEncargado: true, dividirCon: expect.any(Array) })])
  expect(enCurso[0].href).not.toContain(bici.id) // el detalle ya no existe para quien regala
  expect((await misCuentas(db, sofi.id)).enCurso[0]).toMatchObject({ sigueEnLaLista: false, soyEncargado: false })
  expect(await salirDeRegalo(db, giftId, sofi.id)).toBe(true)
  expect((await misCuentas(db, sofi.id)).enCurso).toEqual([])
  expect(await cancelarRegalo(db, giftId, rodri.id)).toBe(true)
  expect((await misCuentas(db, rodri.id)).enCurso).toEqual([])
})

test('con un regalo grupal ya comprado, "Ya no lo quiero" les avisa a todos los que pusieron y "Ya lo tengo" no', async () => {
  const { db, mama, rodri, sofi, ana, bici, perfume, giftId } = await conRegalo()
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 90000 })).toEqual({ ok: true })
  await archiveItem(db, bici.id, mama.id, 'no_lo_quiero')
  for (const u of [rodri, sofi, ana]) {
    expect(await getUnreadNotifications(db, { userId: u.id })).toEqual([expect.objectContaining({ tipo: 'item_baja_comprado', itemTitulo: 'Bici' })])
  }
  // lo comprado queda como está, con sus deudas
  expect((await misCuentas(db, rodri.id)).teDeben).toBe(60000)

  const otro = await iniciarRegaloGrupal(db, perfume.id, sofi.id)
  if (!otro.ok) throw new Error(otro.reason)
  await sumarseARegalo(db, otro.giftId, ana.id)
  await comprarRegalo(db, otro.giftId, sofi.id, { total: 20000 })
  await archiveItem(db, perfume.id, mama.id, 'lo_tengo')
  for (const u of [sofi, ana]) {
    expect((await getUnreadNotifications(db, { userId: u.id })).map((n) => n.itemTitulo)).not.toContain('Perfume')
  }
})

test('los que se sumaron a un regalo grupal se enteran si el dueño edita el deseo o si el encargado lo cancela', async () => {
  const { db, mama, rodri, sofi, ana, bici, giftId } = await conRegalo()
  await updateItem(db, bici.id, mama.id, { notas: 'la quiero roja' })
  for (const u of [rodri, sofi, ana]) {
    expect(await getUnreadNotifications(db, { userId: u.id })).toEqual([expect.objectContaining({ tipo: 'item_editado', itemTitulo: 'Bici' })])
  }
  await markNotificationsRead(db, { userId: rodri.id })
  await markNotificationsRead(db, { userId: sofi.id })
  await markNotificationsRead(db, { userId: ana.id })
  expect(await cancelarRegalo(db, giftId, rodri.id)).toBe(true)
  for (const u of [sofi, ana]) {
    expect(await getUnreadNotifications(db, { userId: u.id })).toEqual([expect.objectContaining({ tipo: 'regalo_cancelado', itemTitulo: 'Bici' })])
  }
  // el que canceló ya sabe
  expect(await getUnreadNotifications(db, { userId: rodri.id })).toEqual([])
  expect(await getUnreadNotifications(db, { userId: mama.id })).toEqual([])
})

test('un doble toque en "Armar regalo grupal" no arma dos, y el que ya está en uno vuelve a ese', async () => {
  const { db, rodri, sofi, bici, giftId } = await conRegalo()
  expect(await iniciarRegaloGrupal(db, bici.id, rodri.id)).toEqual({ ok: true, giftId })
  expect(await iniciarRegaloGrupal(db, bici.id, sofi.id)).toEqual({ ok: true, giftId })
  expect(await db.select().from(groupGifts).where(eq(groupGifts.itemId, bici.id))).toHaveLength(1)
  expect(await db.select().from(claims).where(eq(claims.itemId, bici.id))).toHaveLength(1)
  // reservar suelto el que organiza tampoco ocupa otro lugar: es la reserva del regalo
  const [claim] = await db.select().from(claims).where(eq(claims.itemId, bici.id))
  expect(await reserveItem(db, bici.id, { userId: rodri.id })).toEqual({ ok: true, claimId: claim.id })
})

test('el que se sumó a un regalo grupal no ocupa otro lugar reservando suelto (una pestaña de antes), ni arma otro', async () => {
  const { db, rodri, sofi, martin, bici, giftId } = await conRegalo()
  await db.update(items).set({ cantidad: 3 }).where(eq(items.id, bici.id))
  const [delRegalo] = await db.select().from(claims).where(eq(claims.itemId, bici.id))
  expect(await reserveItem(db, bici.id, { userId: sofi.id })).toEqual({ ok: true, claimId: delRegalo.id })
  expect(await db.select().from(claims)).toHaveLength(1)
  // ya comprado, tampoco, y no arma otro regalo encima de la misma reserva
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })
  expect(await reserveItem(db, bici.id, { userId: sofi.id })).toEqual({ ok: true, claimId: delRegalo.id })
  expect(await iniciarRegaloGrupal(db, bici.id, sofi.id)).toEqual({ ok: false, reason: 'ya_comprado' })
  expect(await db.select().from(groupGifts)).toHaveLength(1)
  // Martín, que no está, sí reserva
  expect(await reserveItem(db, bici.id, { userId: martin.id })).toMatchObject({ ok: true })
  expect(await db.select().from(claims)).toHaveLength(2)
})

test('si ya lo compró suelto, no arma un regalo grupal encima', async () => {
  const { db, sofi, perfume } = await setup()
  await db.update(items).set({ cantidad: 2 }).where(eq(items.id, perfume.id))
  const r = await reserveItem(db, perfume.id, { userId: sofi.id })
  if (!r.ok) throw new Error(r.reason)
  await markBought(db, r.claimId, { userId: sofi.id })
  expect(await iniciarRegaloGrupal(db, perfume.id, sofi.id)).toEqual({ ok: false, reason: 'ya_comprado' })
  expect(await db.select().from(groupGifts)).toEqual([])
})

const DIA = 86400_000

test('en una idea que se puede repetir, un regalo grupal comprado para un evento anterior no sale en el deseo (como en la lista)', async () => {
  const { db, mama, rodri, ana, lista } = await setup()
  const medias = (await createItem(db, mama.id, { tipo: 'idea', titulo: 'Medias', repetible: true }))!
  const r = await iniciarRegaloGrupal(db, medias.id, rodri.id)
  if (!r.ok) throw new Error(r.reason)
  await sumarseARegalo(db, r.giftId, ana.id)
  await comprarRegalo(db, r.giftId, rodri.id, { total: 20000 })
  // fue para el cumple pasado (la lista no tiene fecha: cuenta el último año)
  const hace13Meses = new Date(Date.now() - 395 * DIA)
  const [gift] = await db.update(groupGifts).set({ compradoAt: hace13Meses }).where(eq(groupGifts.id, r.giftId)).returning()
  await db.update(claims).set({ updatedAt: hace13Meses }).where(eq(claims.id, gift.claimId))

  const vista = await getListForViewer(db, lista.shareToken, { userId: ana.id })
  if (vista?.role !== 'giver') throw new Error('esperaba giver')
  expect(vista.items.find((i) => i.id === medias.id)).toMatchObject({ disponible: true, claims: [] })
  const detalle = await getItemForViewer(db, lista.shareToken, medias.id, { userId: ana.id })
  if (detalle?.role !== 'giver') throw new Error('esperaba giver')
  expect(detalle.regalos).toEqual([])
  expect(detalle.item).toMatchObject({ disponible: true, claims: [] })
  // ya lo regalaron: lo que cambie ahora no les importa
  await updateItem(db, medias.id, mama.id, { notas: 'de lana' })
  for (const u of [rodri, ana]) expect(await getUnreadNotifications(db, { userId: u.id })).toEqual([])
  // y lo puede reservar o armar uno nuevo, como dice la lista; el de antes sigue en Cuentas y en el historial
  expect(await reserveItem(db, medias.id, { userId: ana.id })).toMatchObject({ ok: true })
  expect((await misCuentas(db, ana.id)).debes).toBe(10000)
  // uno de este evento, sí
  await db.update(claims).set({ updatedAt: new Date() }).where(eq(claims.id, gift.claimId))
  expect((await regalosDeItem(db, medias.id, { userId: ana.id })).map((g) => g.id)).toEqual([r.giftId])
})

// Lo que quedó en la base de cuando un doble toque en "Armar regalo grupal" armaba dos: la migración 0012 lo limpia.
// createTestDb ya la corrió sobre una base vacía; acá se arma el estado viejo a mano y se la vuelve a correr.
test('la migración cancela los regalos grupales repetidos del mismo encargado que no tienen a nadie más', async () => {
  const { db, rodri, sofi, ana, martin, bici, perfume, mama } = await setup()
  const vela = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Vela' }))!
  const repetido = async (itemId: string, organizador: string, hace: number) => {
    const [c] = await db.insert(claims).values({ itemId, claimerUserId: organizador, expiresAt: null, createdAt: new Date(Date.now() - hace * DIA) }).returning()
    const [g] = await db.insert(groupGifts).values({ itemId, claimId: c.id, organizerUserId: organizador, createdAt: new Date(Date.now() - hace * DIA) }).returning()
    await db.insert(groupGiftMembers).values({ giftId: g.id, userId: organizador })
    return g
  }
  // la bici: dos vacíos de Rodri; el perfume: uno vacío (el más viejo) y otro donde se sumó Sofi; la vela: Ana y Martín en
  // uno cada uno
  const [bici1, bici2] = [await repetido(bici.id, rodri.id, 3), await repetido(bici.id, rodri.id, 2)]
  const [perfume1, perfume2] = [await repetido(perfume.id, rodri.id, 3), await repetido(perfume.id, rodri.id, 2)]
  await db.insert(groupGiftMembers).values({ giftId: perfume2.id, userId: sofi.id })
  const [vela1, vela2] = [await repetido(vela.id, rodri.id, 3), await repetido(vela.id, rodri.id, 2)]
  await db.insert(groupGiftMembers).values([{ giftId: vela1.id, userId: ana.id }, { giftId: vela2.id, userId: martin.id }])

  const archivo = readFileSync('drizzle/0012_limpiar_regalos_repetidos.sql', 'utf8')
  for (let vez = 0; vez < 2; vez++) {
    for (const sentencia of archivo.split('--> statement-breakpoint')) await db.execute(sql.raw(sentencia))
  }
  const estado = async (g: typeof bici1) => {
    const [fila] = await db.select({ regalo: groupGifts.estado, reserva: claims.estado }).from(groupGifts)
      .innerJoin(claims, eq(groupGifts.claimId, claims.id)).where(eq(groupGifts.id, g.id))
    return `${fila.regalo}/${fila.reserva}`
  }
  expect(await Promise.all([bici1, bici2, perfume1, perfume2, vela1, vela2].map(estado))).toEqual([
    'abierto/reservado', 'cancelado/liberado', 'cancelado/liberado', 'abierto/reservado', 'abierto/reservado', 'abierto/reservado',
  ])
  expect((await regalosDeItem(db, bici.id, { userId: ana.id })).map((g) => g.id)).toEqual([bici1.id])
})

test('historial: quién se ocupó de cada regalo y cuántos compró cada uno', async () => {
  const { db, mama, lista, rodri, sofi, ana, perfume, giftId } = await conRegalo()
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })
  const suelta = await reserveItem(db, perfume.id, { userId: sofi.id })
  if (!suelta.ok) throw new Error(suelta.reason)
  await markBought(db, suelta.claimId, { userId: sofi.id }, 'el de siempre')
  const vela = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Vela' }))!
  const r2 = await reserveItem(db, vela.id, { userId: rodri.id })
  if (!r2.ok) throw new Error(r2.reason)
  await markBought(db, r2.claimId, { userId: rodri.id })
  // una reserva sin comprar no cuenta
  await reserveItem(db, (await createItem(db, mama.id, { tipo: 'idea', titulo: 'Libro' }))!.id, { userId: ana.id })

  const h = (await historialDeLista(db, lista.id, { userId: ana.id }))!
  expect(h.entradas.map((e) => [e.titulo, e.encargado])).toEqual([['Vela', 'Rodri'], ['Perfume', 'Sofi'], ['Bici', 'Rodri']])
  expect(h.entradas.find((e) => e.titulo === 'Bici')).toMatchObject({ grupal: true, con: ['Sofi', 'Ana'] })
  expect(h.entradas.find((e) => e.titulo === 'Perfume')).toMatchObject({ grupal: false, nota: 'el de siempre' })
  expect(h.ranking.map((r) => [r.nombre, r.cantidad, r.esYo])).toEqual([['Rodri', 2, false], ['Sofi', 1, false]])
  expect((await historialDeLista(db, lista.id, { userId: rodri.id }))!.ranking[0].esYo).toBe(true)

  expect((await ultimosRegalos(db, ana.id, [lista.id])).get(lista.id)).toMatchObject({ titulo: 'Vela', encargado: 'Rodri' })
  await guardarCumple(db, mama.id, 1, 1)
  await seguir(db, ana.id, lista.id)
  expect((await misEventos(db, ana.id))[0].ultimo).toMatchObject({ encargado: 'Rodri', titulo: 'Vela' })
})

const SPOILERS = ['grupal', 'giftId', 'encargado', 'monto', 'pagado', 'Rodri', 'Sofi', 'Ana', '90000', '30000', 'la roja', 'Vela']

test('EL TEST DE ORO, regalos grupales: la dueña no ve regalos, cuentas ni historial por ningún camino', async () => {
  const { db, mama, lista, rodri, sofi, bici, giftId } = await conRegalo()
  // la dueña no puede armar ni sumarse
  expect(await iniciarRegaloGrupal(db, bici.id, mama.id)).toEqual({ ok: false, reason: 'propio' })
  expect(await sumarseARegalo(db, giftId, mama.id)).toBe(false)
  await comprarRegalo(db, giftId, rodri.id, { total: 90000, nota: 'la roja' })
  const vela = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Vela' }))!
  const r = await reserveItem(db, vela.id, { userId: sofi.id })
  if (!r.ok) throw new Error(r.reason)
  await markBought(db, r.claimId, { userId: sofi.id })
  await guardarCumple(db, mama.id, 1, 1)

  const yo = { userId: mama.id }
  expect(await historialDeLista(db, lista.id, yo)).toBeNull()
  expect(await regalosDeItem(db, bici.id, yo)).toEqual([])
  // ni corrige, ni saca a nadie, ni le llegan carteles de regalos para cerrar
  expect(await corregirCompra(db, giftId, mama.id, { total: 10 })).toEqual({ ok: false, reason: 'no_permitido' })
  expect(await sacarDeRegalo(db, giftId, sofi.id, mama.id)).toBe(false)
  expect(await dejarVolverARegalo(db, giftId, sofi.id, mama.id)).toBe(false)
  expect(await posponerRecordatorio(db, giftId, mama.id)).toBe(false)
  expect(await comprasParaCorregir(db, mama.id)).toEqual([])
  expect(await regalosParaCerrar(db, mama.id)).toEqual([])
  expect((await ultimosRegalos(db, mama.id, [lista.id])).size).toBe(0)
  const cuentas = await misCuentas(db, mama.id)
  expect(cuentas).toEqual({ debes: 0, teDeben: 0, personas: [], enCurso: [], saldadas: [] })
  const eventos = await misEventos(db, mama.id)
  expect(eventos[0]).toMatchObject({ propio: true })
  expect(eventos[0].ultimo).toBeUndefined()

  const vistas = [
    await getListForViewer(db, lista.shareToken, yo),
    await getItemForViewer(db, lista.shareToken, bici.id, yo),
    await getOwnList(db, mama.id),
    eventos,
    // y sin su sesión (la app de inicio, el navegador de WhatsApp): sin identificarse no se ve la coordinación
    await getListForViewer(db, lista.shareToken, {}),
    await getItemForViewer(db, lista.shareToken, bici.id, {}),
    await historialDeLista(db, lista.id, {}),
    await regalosDeItem(db, bici.id, {}),
  ]
  for (const json of vistas.map((v) => JSON.stringify(v).toLowerCase())) {
    // "Vela" es un deseo suyo: solo se chequea que no aparezca como regalo en el historial (arriba)
    for (const palabra of SPOILERS.filter((p) => p !== 'Vela')) expect(json).not.toContain(palabra.toLowerCase())
  }
})

test('EL TEST DE ORO, co-dueños: si te sumás a un grupo después de entrar al regalo, deja de aparecerte', async () => {
  const db = await createTestDb()
  const [delfina, martin, rodri] = [await usuario(db, 'Delfina'), await usuario(db, 'Martín'), await usuario(db, 'Rodri')]
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Nuestra casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  const cafetera = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Cafetera' }, grupoId))!

  // Martín todavía no es co-dueño: se suma al regalo de Rodri
  const g = await iniciarRegaloGrupal(db, cafetera.id, rodri.id)
  if (!g.ok) throw new Error(g.reason)
  expect(await sumarseARegalo(db, g.giftId, martin.id)).toBe(true)
  await comprarRegalo(db, g.giftId, rodri.id, { total: 50000 })
  expect((await misCuentas(db, martin.id)).debes).toBe(25000)
  // y a otro que todavía está abierto
  const tostadora = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Tostadora' }, grupoId))!
  const abierto = await iniciarRegaloGrupal(db, tostadora.id, rodri.id)
  if (!abierto.ok) throw new Error(abierto.reason)
  await sumarseARegalo(db, abierto.giftId, martin.id)
  expect((await misCuentas(db, martin.id)).enCurso).toHaveLength(1)

  // ...y después Delfina lo invita al grupo
  await unirseAGrupo(db, grupo.inviteToken!, martin.id)
  expect(await misCuentas(db, martin.id)).toEqual({ debes: 0, teDeben: 0, personas: [], enCurso: [], saldadas: [] })
  expect(await regalosDeItem(db, cafetera.id, { userId: martin.id })).toEqual([])
  expect(await historialDeLista(db, grupoId, { userId: martin.id })).toBeNull()
  // para Rodri sigue todo igual
  expect((await misCuentas(db, rodri.id)).personas[0]).toMatchObject({ nombre: 'Martín', neto: 25000 })
  expect((await misCuentas(db, rodri.id)).personas[0].lineas[0]).toMatchObject({ para: 'Nuestra casa' })
})

test('si te unís como co-dueño, lo que tenías como regalador en esa lista no queda trabado', async () => {
  const db = await createTestDb()
  const [delfina, martin, sofi, ana, rodri] = [
    await usuario(db, 'Delfina'), await usuario(db, 'Martín'), await usuario(db, 'Sofi'), await usuario(db, 'Ana'), await usuario(db, 'Rodri'),
  ]
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Nuestra casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  const deseo = async (titulo: string) => (await createItem(db, delfina.id, { tipo: 'exacto', titulo }, grupoId))!
  const [copas, vela, cafetera, tostadora, heladera] = [
    await deseo('Copas'), await deseo('Vela'), await deseo('Cafetera'), await deseo('Tostadora'), await deseo('Heladera'),
  ]

  // Martín, todavía como regalador: reservó las copas (vencen mañana), compró la vela, organiza la cafetera (Sofi y Ana se
  // sumaron) y la tostadora (solo), y se sumó a la heladera de Rodri
  const copasMias = await reserveItem(db, copas.id, { userId: martin.id })
  const velaMia = await reserveItem(db, vela.id, { userId: martin.id })
  if (!copasMias.ok || !velaMia.ok) throw new Error('esperaba poder reservar')
  await db.update(claims).set({ createdAt: new Date(Date.now() - 13 * 86400_000), expiresAt: new Date(Date.now() + 86400_000) })
    .where(eq(claims.id, copasMias.claimId))
  await markBought(db, velaMia.claimId, { userId: martin.id })
  const [deCafetera, deTostadora, deHeladera] = [
    await iniciarRegaloGrupal(db, cafetera.id, martin.id), await iniciarRegaloGrupal(db, tostadora.id, martin.id),
    await iniciarRegaloGrupal(db, heladera.id, rodri.id),
  ]
  if (!deCafetera.ok || !deTostadora.ok || !deHeladera.ok) throw new Error('esperaba poder armar los regalos')
  await sumarseARegalo(db, deCafetera.giftId, sofi.id)
  await sumarseARegalo(db, deCafetera.giftId, ana.id)
  await sumarseARegalo(db, deHeladera.giftId, martin.id)
  expect(await getMyClaimWarnings(db, { userId: martin.id })).toHaveLength(1)

  expect(await unirseAGrupo(db, grupo.inviteToken!, martin.id)).toBe(grupoId)

  // las copas quedan libres para otro
  expect(await reserveItem(db, copas.id, { userId: ana.id })).toMatchObject({ ok: true })
  // la vela ya estaba comprada: queda como está
  const [compra] = await db.select().from(claims).where(eq(claims.id, velaMia.claimId))
  expect(compra).toMatchObject({ estado: 'comprado', claimerUserId: martin.id })
  // la cafetera pasa a Sofi, la primera que se sumó, con la reserva a su nombre; y la puede comprar
  const [regalo] = await regalosDeItem(db, cafetera.id, { userId: sofi.id })
  expect(regalo).toMatchObject({ estado: 'abierto', soyEncargado: true, encargado: { nombre: 'Sofi' } })
  expect(regalo.miembros.map((m) => m.nombre)).toEqual(['Sofi', 'Ana'])
  const [reserva] = await db.select().from(claims).where(eq(claims.itemId, cafetera.id))
  expect(reserva).toMatchObject({ claimerUserId: sofi.id, estado: 'reservado', expiresAt: null })
  // y se entera (si no, el regalo queda quieto hasta que entre a Cuentas); a Ana no le cambia nada
  expect(await getUnreadNotifications(db, { userId: sofi.id })).toEqual([expect.objectContaining({ tipo: 'regalo_encargo', itemTitulo: 'Cafetera' })])
  expect(await getUnreadNotifications(db, { userId: ana.id })).toEqual([])
  expect(await comprarRegalo(db, deCafetera.giftId, sofi.id, { total: 60000 })).toEqual({ ok: true })
  expect((await misCuentas(db, ana.id)).personas).toEqual([expect.objectContaining({ nombre: 'Sofi', neto: -30000 })])
  // la tostadora no tenía a nadie más: se cancela y se libera
  expect(await regalosDeItem(db, tostadora.id, { userId: ana.id })).toEqual([])
  expect(await reserveItem(db, tostadora.id, { userId: ana.id })).toMatchObject({ ok: true })
  // de la heladera de Rodri se baja: no le van a cobrar una parte que no puede ver
  const [deRodri] = await regalosDeItem(db, heladera.id, { userId: rodri.id })
  expect(deRodri.miembros.map((m) => m.nombre)).toEqual(['Rodri'])
  // y a él no le queda nada de eso a la vista
  expect(await getMyClaimWarnings(db, { userId: martin.id })).toEqual([])
  expect(await misCuentas(db, martin.id)).toEqual({ debes: 0, teDeben: 0, personas: [], enCurso: [], saldadas: [] })
  // ya como dueño no se vuelve a sumar ni a armar nada
  expect(await sumarseARegalo(db, deHeladera.giftId, martin.id)).toBe(false)
  expect(await iniciarRegaloGrupal(db, (await deseo('Mantel')).id, martin.id)).toEqual({ ok: false, reason: 'propio' })
})

test('si organizabas un regalo y solo quedan los que tienen su propia reserva del deseo, se cancela y se les avisa', async () => {
  const db = await createTestDb()
  const [delfina, martin, sofi, ana] = [await usuario(db, 'Delfina'), await usuario(db, 'Martín'), await usuario(db, 'Sofi'), await usuario(db, 'Ana')]
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Nuestra casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  const copas = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Copas', cantidad: 2 }, grupoId))!
  // Martín arma el regalo de un juego de copas; Sofi reservó el otro suelto y además se sumó (de antes: ahora con su
  // reserva suelta no se suma, ver sumarseARegalo)
  const g = await iniciarRegaloGrupal(db, copas.id, martin.id)
  if (!g.ok) throw new Error(g.reason)
  expect(await reserveItem(db, copas.id, { userId: sofi.id })).toMatchObject({ ok: true })
  await db.insert(groupGiftMembers).values({ giftId: g.giftId, userId: sofi.id })

  await unirseAGrupo(db, grupo.inviteToken!, martin.id)
  // a Sofi no se lo pasa (tendría dos reservas del mismo deseo): se cancela, y no le desaparece sin explicación
  expect(await regalosDeItem(db, copas.id, { userId: sofi.id })).toEqual([])
  expect((await misCuentas(db, sofi.id)).enCurso).toEqual([])
  expect(await getUnreadNotifications(db, { userId: sofi.id })).toEqual([expect.objectContaining({ tipo: 'regalo_cancelado', itemTitulo: 'Copas' })])
  // su juego suelto sigue reservado y el del regalo queda libre para otro
  expect(await db.select({ estado: claims.estado }).from(claims).where(eq(claims.claimerUserId, sofi.id))).toEqual([{ estado: 'reservado' }])
  expect(await reserveItem(db, copas.id, { userId: ana.id })).toMatchObject({ ok: true })
  expect(await getUnreadNotifications(db, { userId: martin.id })).toEqual([])
})

test('si la dueña cambia el link para regalar, Cuentas no se lo pasa a quien solo tenía un regalo de antes', async () => {
  const { db, mama, rodri, sofi, ana, lista, bici, perfume, giftId } = await conRegalo()
  // la bici ya se compró; el perfume lo organiza Sofi y Rodri se sumó
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })
  const p = await iniciarRegaloGrupal(db, perfume.id, sofi.id)
  if (!p.ok) throw new Error(p.reason)
  await sumarseARegalo(db, p.giftId, rodri.id)
  expect((await misCuentas(db, ana.id)).personas[0].lineas[0].href).toBe(`/l/${lista.shareToken}/item/${bici.id}`)

  const nuevo = await cambiarLinkParaRegalar(db, lista.id, mama.id)
  const deRodri = await misCuentas(db, rodri.id)
  expect((await misCuentas(db, ana.id)).personas[0].lineas[0].href).toBeNull()
  expect(deRodri.personas.flatMap((x) => x.lineas).map((l) => l.href)).toEqual([null, null])
  // del perfume tampoco, ni a Rodri, que solo se sumó, ni a Sofi, que lo organiza: con el link nuevo volvería a abrir
  // (y a seguir) la lista. Sofi lo compra y lo divide desde Cuentas, con los mismos que vería en el deseo
  expect(deRodri.enCurso[0]).toMatchObject({ itemTitulo: 'Perfume', href: null, dividirCon: null })
  const deSofi = (await misCuentas(db, sofi.id)).enCurso[0]
  expect(deSofi).toMatchObject({ itemTitulo: 'Perfume', href: null, soyEncargado: true })
  expect(deSofi.dividirCon).toEqual([
    { userId: sofi.id, nombre: 'Sofi', esYo: true }, { userId: rodri.id, nombre: 'Rodri', esYo: false },
  ])
  expect(JSON.stringify(await misCuentas(db, sofi.id))).not.toContain(nuevo!)
  expect(await comprarRegalo(db, p.giftId, sofi.id, { total: 50000 })).toEqual({ ok: true })
  // le debe 25.000 del perfume, descontados de los 30.000 que Sofi le debe de la bici
  const conSofi = (await misCuentas(db, rodri.id)).personas.find((x) => x.nombre === 'Sofi')!
  expect(conSofi.neto).toBe(5000)
  expect(conSofi.lineas).toContainEqual(expect.objectContaining({ itemTitulo: 'Perfume', tipo: 'debes', monto: 25000 }))
  // cuando abre el link nuevo (y la sigue), vuelve a tenerlo
  await seguir(db, ana.id, lista.id)
  expect((await misCuentas(db, ana.id)).personas[0].lineas[0].href).toBe(`/l/${nuevo}/item/${bici.id}`)
})

test('"Saldar todo" salda solo lo que Cuentas muestra, no la deuda de un grupo al que te sumaste después', async () => {
  const db = await createTestDb()
  const [delfina, martin, rodri, sofi] = [await usuario(db, 'Delfina'), await usuario(db, 'Martín'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi')]
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Nuestra casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  const comprado = async (itemId: string, encargado: string, otro: string, total: number) => {
    const g = await iniciarRegaloGrupal(db, itemId, encargado)
    if (!g.ok) throw new Error(g.reason)
    await sumarseARegalo(db, g.giftId, otro)
    expect(await comprarRegalo(db, g.giftId, encargado, { total })).toEqual({ ok: true })
  }
  // Martín le debe $25.000 a Rodri por la cafetera de "Nuestra casa"; Rodri le debe $10.000 + $5.000 por dos de Sofi
  await comprado((await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Cafetera' }, grupoId))!.id, rodri.id, martin.id, 50000)
  await comprado((await createItem(db, sofi.id, { tipo: 'exacto', titulo: 'Libro' }))!.id, martin.id, rodri.id, 20000)
  await comprado((await createItem(db, sofi.id, { tipo: 'exacto', titulo: 'Taza' }))!.id, martin.id, rodri.id, 10000)
  expect((await misCuentas(db, rodri.id)).personas[0]).toMatchObject({ nombre: 'Martín', neto: 10000 })

  // Delfina lo invita al grupo: la cafetera le deja de aparecer y ve que Rodri le debe $15.000
  await unirseAGrupo(db, grupo.inviteToken!, martin.id)
  expect((await misCuentas(db, martin.id)).personas[0]).toMatchObject({ nombre: 'Rodri', neto: 15000 })
  // "Me pagó todo ($15.000)" salda esas dos y nada más
  expect(await saldarCon(db, martin.id, rodri.id)).toBe(2)
  expect(await misCuentas(db, martin.id)).toMatchObject({ debes: 0, teDeben: 0, personas: [] })
  const deRodri = await misCuentas(db, rodri.id)
  expect(deRodri).toMatchObject({ teDeben: 25000, debes: 0 })
  expect(deRodri.personas).toEqual([expect.objectContaining({ nombre: 'Martín', neto: 25000 })])
  // Rodri sí la ve, y la salda desde su lado
  expect(await saldarCon(db, rodri.id, martin.id)).toBe(1)
  expect((await misCuentas(db, rodri.id)).personas).toEqual([])
})

// Los formatos que se usan acá. Lo que no son pesos da null: sin estimación ("~$X cada uno") y con el total vacío, mejor
// que un número engañoso.
test.each([
  ['$45.000', 45000], ['45.000,50', 45001], ['45k', 45000], ['1,5k', 1500], ['1.5k', 1500], ['$ 45 000', 45000],
  ['$45,000', 45000], ['45 mil', 45000], ['2 x $10.000', 10000], ['$90.000 aprox.', 90000],
  // el ejemplo del rango que sugiere el formulario: la "k" vale para los dos números
  ['$10–30k', 10000], ['$10 a 30 mil', 10000], ['$500 - 2k', 500],
  // "lucas" son miles; sin "$", en "2 x 45.000" el primero es cuántos (pero "100 x 2" son 100)
  ['15 lucas', 15000], ['$20 lucas', 20000], ['1 luca', 1000], ['entre 10 y 15 lucas', 10000],
  ['2 x 45.000', 45000], ['2x45.000', 45000], ['45.000 x 2', 45000], ['100 x 2', 100], ['$100 x 2', 100],
  // los miles escritos solo en el de arriba valen para los dos, si así queda más chico
  ['$20-30.000', 20000], ['$2-3.000.000', 2000000], ['$500-1.500', 500], ['$20.000 - $30.000', 20000],
  // un guion entre palabras no es un menos
  ['Talle M - $30.000', 30000], ['Modelo XR-500, $80.000', 80000], ['Aprox. – $20.000', 20000],
  // sin "$", un número pelado detrás de una palabra es de esa palabra (talle, número, cuántos, año): no es el de abajo de
  // un rango; el precio es el que sigue. Si no hay otro, ese
  ['Talle 42 - 30.000', 30000], ['N° 3 - 45.000', 45000], ['Pack x 6 - 12.000', 12000], ['Modelo 2024 - 150.000', 150000],
  ['Talle 42 color 3 - 30.000', 30000], ['Juego de 6 copas 12.000', 12000], ['Zapatillas 30000', 30000],
  ['aprox. 20 - 30 mil', 20000], ['de 6 a 12 mil', 6000], ['Precio 45.000', 45000],
  ['US$ 300', null], ['USD 300', null], ['U$S 300', null], ['u$d 300', null], ['€ 50', null], ['50 euros', null], ['R$ 100', null],
  ['AR$ 100', 100],
  ['-$5.000', null], ['$ -5000', null], ['- 5000', null], ['aprox -5000', null], ['', null], ['   ', null],
] as const)('pesos: "%s" → %s', (texto, esperado) => {
  expect(parsePesos(texto)).toBe(esperado)
})

test('una parte "A mano" vacía vale 0, igual que en la pantalla', () => {
  expect(['', ' ', '0', '$ 0'].map(partePesos)).toEqual([0, 0, 0, 0])
  expect(partePesos('45.000')).toBe(45000)
  expect(partePesos('abc')).toBeNull()
  expect(partePesos('-5')).toBeNull()
})

test('una persona, una reserva por deseo: con una reserva o compra suelta, o en otro regalo del deseo, no se suma a este', async () => {
  const { db, rodri, sofi, ana, martin, bici, giftId } = await conRegalo()
  await db.update(items).set({ cantidad: 5 }).where(eq(items.id, bici.id))
  const [caro, leo, juli] = [await usuario(db, 'Caro'), await usuario(db, 'Leo'), await usuario(db, 'Juli')]
  // Caro la reservó suelta: se suma recién cuando la libera
  const suelta = await reserveItem(db, bici.id, { userId: caro.id })
  if (!suelta.ok) throw new Error(suelta.reason)
  expect(await sumarseARegalo(db, giftId, caro.id)).toBe(false)
  expect(await releaseClaim(db, suelta.claimId, { userId: caro.id })).toBe(true)
  expect(await sumarseARegalo(db, giftId, caro.id)).toBe(true)
  // Leo la compró suelta: tampoco
  const compra = await reserveItem(db, bici.id, { userId: leo.id })
  if (!compra.ok) throw new Error(compra.reason)
  await markBought(db, compra.claimId, { userId: leo.id })
  expect(await sumarseARegalo(db, giftId, leo.id)).toBe(false)
  // Martín arma otro regalo de la bici y Juli se suma: ninguno entra también en el de Rodri, ni uno de Rodri en ese
  const otro = await iniciarRegaloGrupal(db, bici.id, martin.id)
  if (!otro.ok) throw new Error(otro.reason)
  expect(await sumarseARegalo(db, otro.giftId, juli.id)).toBe(true)
  expect(await sumarseARegalo(db, giftId, martin.id)).toBe(false)
  expect(await sumarseARegalo(db, giftId, juli.id)).toBe(false)
  expect(await sumarseARegalo(db, otro.giftId, sofi.id)).toBe(false)
  // volver a tocar "Me sumo" en el propio, sí
  expect(await sumarseARegalo(db, giftId, ana.id)).toBe(true)
  expect((await regalosDeItem(db, bici.id, { userId: rodri.id }))[0].miembros.map((m) => m.nombre)).toEqual(['Rodri', 'Sofi', 'Ana', 'Caro'])
})

test('el encargado divide entre los que vio: si mientras tanto se sumó o se bajó alguien, tiene que revisar la división', async () => {
  const { db, rodri, sofi, ana, martin, bici, giftId } = await conRegalo()
  const vio = [rodri.id, sofi.id, ana.id]
  // Martín se suma desde WhatsApp antes de que Rodri toque "Lo compré · dividir $90.000": no le cobra una parte que nadie vio
  expect(await sumarseARegalo(db, giftId, martin.id)).toBe(true)
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 90000, miembros: vio })).toEqual({ ok: false, reason: 'cambiaron' })
  // y si Ana se baja, a los demás no les sube la parte sin que lo vea
  expect(await salirDeRegalo(db, giftId, ana.id)).toBe(true)
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 90000, miembros: [...vio, martin.id] })).toEqual({ ok: false, reason: 'cambiaron' })
  expect((await regalosDeItem(db, bici.id, { userId: rodri.id }))[0].estado).toBe('abierto')
  // con los de ahora (en cualquier orden), sí
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 90000, miembros: [martin.id, sofi.id, rodri.id] })).toEqual({ ok: true })
  expect((await regalosDeItem(db, bici.id, { userId: rodri.id }))[0].miembros.map((m) => m.monto)).toEqual([30000, 30000, 30000])
})

test('el encargado saca a alguien que se sumó por error: no entra en la división y se entera', async () => {
  const { db, mama, lista, rodri, sofi, ana, bici, giftId } = await conRegalo()
  // solo el encargado, y a otro
  expect(await sacarDeRegalo(db, giftId, ana.id, sofi.id)).toBe(false)
  expect(await sacarDeRegalo(db, giftId, rodri.id, rodri.id)).toBe(false)
  expect(await sacarDeRegalo(db, 'no-es-un-id', ana.id, rodri.id)).toBe(false)
  expect(await sacarDeRegalo(db, giftId, ana.id, rodri.id)).toBe(true)
  expect(await sacarDeRegalo(db, giftId, ana.id, rodri.id)).toBe(false)
  expect((await regalosDeItem(db, bici.id, { userId: rodri.id }))[0].miembros.map((m) => m.nombre)).toEqual(['Rodri', 'Sofi'])
  expect(await getUnreadNotifications(db, { userId: ana.id })).toEqual([
    expect.objectContaining({ tipo: 'regalo_sacado', itemTitulo: 'Bici', href: `/l/${lista.shareToken}/item/${bici.id}` }),
  ])
  expect((await misCuentas(db, ana.id)).enCurso).toEqual([])
  expect(await getUnreadNotifications(db, { userId: mama.id })).toEqual([])
  // ya comprado, no: tiene su parte (eso se arregla corrigiendo la compra)
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })
  expect(await sacarDeRegalo(db, giftId, sofi.id, rodri.id)).toBe(false)
  expect((await misCuentas(db, sofi.id)).debes).toBe(45000)
})

test('corregir la compra: el encargado cambia el total o las partes mientras nadie le pagó', async () => {
  const { db, rodri, sofi, ana, bici, perfume, giftId } = await conRegalo()
  // un cero de más
  await comprarRegalo(db, giftId, rodri.id, { total: 900000, nota: 'la roja' })
  const [antes] = await db.select().from(groupGifts).where(eq(groupGifts.id, giftId))
  expect((await regalosDeItem(db, bici.id, { userId: rodri.id }))[0].corregible).toBe(true)
  expect((await regalosDeItem(db, bici.id, { userId: sofi.id }))[0].corregible).toBe(false)
  expect(await corregirCompra(db, giftId, sofi.id, { total: 90000 })).toEqual({ ok: false, reason: 'no_permitido' })
  const todos = [rodri.id, sofi.id, ana.id]
  expect(await corregirCompra(db, giftId, rodri.id, { total: 90000, miembros: todos, nota: 'la roja' })).toEqual({ ok: true })
  expect((await misCuentas(db, sofi.id)).debes).toBe(30000)
  // a mano: al final Ana no puso
  const partes = { [rodri.id]: 50000, [sofi.id]: 40000, [ana.id]: 0 }
  expect(await corregirCompra(db, giftId, rodri.id, { total: 90000, miembros: todos, partes: { ...partes, [ana.id]: 5 } }))
    .toEqual({ ok: false, reason: 'no_suma' })
  expect(await corregirCompra(db, giftId, rodri.id, { total: 90000, miembros: todos, partes, nota: 'la roja' })).toEqual({ ok: true })
  const [regalo] = await regalosDeItem(db, bici.id, { userId: rodri.id })
  expect(regalo.miembros.map((m) => [m.nombre, m.monto, m.pagado])).toEqual([['Rodri', 50000, true], ['Sofi', 40000, false], ['Ana', 0, true]])
  expect(await misCuentas(db, ana.id)).toMatchObject({ debes: 0, personas: [] })
  // la compra sigue siendo de cuando fue
  const [despues] = await db.select().from(groupGifts).where(eq(groupGifts.id, giftId))
  expect(despues).toMatchObject({ estado: 'comprado', montoTotal: 90000, compradoAt: antes.compradoAt })
  expect((await db.select().from(claims).where(eq(claims.id, antes.claimId)))[0]).toMatchObject({ estado: 'comprado', notaQueCompre: 'la roja' })
  // Sofi le pagó: ya no se corrige (pisaría su pago) hasta que se deshace
  expect(await marcarPagado(db, giftId, sofi.id, sofi.id)).toBe(true)
  expect((await regalosDeItem(db, bici.id, { userId: rodri.id }))[0].corregible).toBe(false)
  expect(await corregirCompra(db, giftId, rodri.id, { total: 80000, miembros: todos })).toEqual({ ok: false, reason: 'ya_pagaron' })
  expect(await marcarPagado(db, giftId, sofi.id, rodri.id, false)).toBe(true)
  expect(await corregirCompra(db, giftId, rodri.id, { total: 80000, miembros: todos })).toEqual({ ok: true })
  // uno abierto no se corrige: se compra
  const abierto = await iniciarRegaloGrupal(db, perfume.id, sofi.id)
  if (!abierto.ok) throw new Error(abierto.reason)
  expect(await corregirCompra(db, abierto.giftId, sofi.id, { total: 10000 })).toEqual({ ok: false, reason: 'no_permitido' })
})

test('si el deseo salió de la lista (se lo dieron), el encargado corrige la compra desde Cuentas', async () => {
  const { db, mama, rodri, sofi, ana, bici, giftId } = await conRegalo()
  await comprarRegalo(db, giftId, rodri.id, { total: 900000, nota: 'la roja' })
  // con el deseo en la lista se corrige ahí
  expect(await comprasParaCorregir(db, rodri.id)).toEqual([])
  await archiveItem(db, bici.id, mama.id, 'lo_tengo')
  const [c] = await comprasParaCorregir(db, rodri.id)
  expect(c).toMatchObject({ giftId, itemTitulo: 'Bici', para: 'Mamá', total: 900000, nota: 'la roja' })
  expect(c.miembros.map((m) => [m.nombre, m.esYo, m.monto])).toEqual([['Rodri', true, 300000], ['Sofi', false, 300000], ['Ana', false, 300000]])
  expect(await comprasParaCorregir(db, sofi.id)).toEqual([])
  expect(await corregirCompra(db, giftId, rodri.id, { total: 90000, miembros: c.miembros.map((m) => m.userId) })).toEqual({ ok: true })
  expect((await misCuentas(db, ana.id)).debes).toBe(30000)
  // cuando alguien le paga, ya no
  await marcarPagado(db, giftId, ana.id, ana.id)
  expect(await comprasParaCorregir(db, rodri.id)).toEqual([])
})

test('si nadie le debe nada al encargado, la compra se corrige solo el primer mes (y no queda para siempre en Cuentas)', async () => {
  const { db, mama, rodri, sofi, bici, perfume } = await setup()
  // la bici: Rodri lo armó, no se sumó nadie y la compró solo: no hay división que corregir
  const solo = await iniciarRegaloGrupal(db, bici.id, rodri.id)
  if (!solo.ok) throw new Error(solo.reason)
  await comprarRegalo(db, solo.giftId, rodri.id, { total: 90000 })
  expect((await regalosDeItem(db, bici.id, { userId: rodri.id }))[0].corregible).toBe(false)
  expect(await corregirCompra(db, solo.giftId, rodri.id, { total: 9000 })).toEqual({ ok: false, reason: 'nada_que_corregir' })
  // el perfume: Sofi se sumó, pero al final no puso ("A mano", en 0). Recién comprado se corrige (por si fue un error)
  const tele = await iniciarRegaloGrupal(db, perfume.id, rodri.id)
  if (!tele.ok) throw new Error(tele.reason)
  await sumarseARegalo(db, tele.giftId, sofi.id)
  await comprarRegalo(db, tele.giftId, rodri.id, { total: 50000, partes: { [rodri.id]: 50000, [sofi.id]: 0 } })
  expect((await regalosDeItem(db, perfume.id, { userId: rodri.id }))[0].corregible).toBe(true)
  // pasado el mes no: una parte en 0 que figuraba saldada no se vuelve deuda meses después
  await db.update(groupGifts).set({ compradoAt: new Date(Date.now() - 31 * DIA) }).where(eq(groupGifts.id, tele.giftId))
  expect((await regalosDeItem(db, perfume.id, { userId: rodri.id }))[0].corregible).toBe(false)
  expect(await corregirCompra(db, tele.giftId, rodri.id, { total: 50000, partes: { [rodri.id]: 25000, [sofi.id]: 25000 } }))
    .toEqual({ ok: false, reason: 'nada_que_corregir' })
  // se los dieron en el cumple: Cuentas sigue vacía
  await archiveItem(db, bici.id, mama.id, 'lo_tengo')
  await archiveItem(db, perfume.id, mama.id, 'lo_tengo')
  expect(await comprasParaCorregir(db, rodri.id)).toEqual([])
  expect(await misCuentas(db, rodri.id)).toEqual({ debes: 0, teDeben: 0, personas: [], enCurso: [], saldadas: [] })
  expect((await misCuentas(db, sofi.id)).personas).toEqual([])
})

test('una corrección que deja a los demás en 0 por error se arregla en el primer mes, también desde Cuentas', async () => {
  const { db, mama, rodri, sofi, ana, bici, giftId } = await conRegalo()
  const todos = [rodri.id, sofi.id, ana.id]
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })
  // "A mano", puso 90.000 en su parte y borró las de ellas: no queda fija para siempre
  expect(await corregirCompra(db, giftId, rodri.id, { total: 90000, miembros: todos, partes: { [rodri.id]: 90000, [sofi.id]: 0, [ana.id]: 0 } }))
    .toEqual({ ok: true })
  expect((await regalosDeItem(db, bici.id, { userId: rodri.id }))[0].corregible).toBe(true)
  // se lo dieron en el cumple: se corrige desde Cuentas
  await archiveItem(db, bici.id, mama.id, 'lo_tengo')
  const [c] = await comprasParaCorregir(db, rodri.id)
  expect(c.miembros.map((m) => [m.nombre, m.monto])).toEqual([['Rodri', 90000], ['Sofi', 0], ['Ana', 0]])
  expect(await corregirCompra(db, giftId, rodri.id, { total: 90000, miembros: todos })).toEqual({ ok: true })
  expect((await misCuentas(db, sofi.id)).debes).toBe(30000)
})

test('corregir la compra no le cambia la parte al que después se sumó al grupo de la lista (ya no la ve)', async () => {
  const db = await createTestDb()
  const [delfina, rodri, sofi, tia] = [await usuario(db, 'Delfina'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi'), await usuario(db, 'Tía')]
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  const tele = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Tele' }, grupoId))!
  const g = await iniciarRegaloGrupal(db, tele.id, rodri.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, sofi.id)
  await sumarseARegalo(db, g.giftId, tia.id)
  const todos = [rodri.id, sofi.id, tia.id]
  await comprarRegalo(db, g.giftId, rodri.id, { total: 90000, miembros: todos, partes: { [rodri.id]: 45000, [sofi.id]: 45000, [tia.id]: 0 } })
  // la Tía se suma al grupo: ya no ve el regalo, ni Cuentas, ni el aviso de una corrección
  await unirseAGrupo(db, grupo.inviteToken!, tia.id)
  expect(await corregirCompra(db, g.giftId, rodri.id, { total: 90000, miembros: todos }))
    .toEqual({ ok: false, reason: 'de_la_lista', nombre: 'Tía', monto: 0 })
  expect(await db.select().from(notifications).where(eq(notifications.userId, tia.id))).toEqual([])
  expect((await misCuentas(db, rodri.id)).personas.map((p) => [p.nombre, p.neto])).toEqual([['Sofi', 45000]])
  // dejándole la suya, sí
  expect(await corregirCompra(db, g.giftId, rodri.id, { total: 80000, miembros: todos, partes: { [rodri.id]: 40000, [sofi.id]: 40000, [tia.id]: 0 } }))
    .toEqual({ ok: true })
  expect((await misCuentas(db, sofi.id)).debes).toBe(40000)
  // y si salió del grupo, tampoco: sigue sin ver nada de la lista
  expect(await salirDeGrupo(db, grupoId, tia.id)).toBe(true)
  expect(await corregirCompra(db, g.giftId, rodri.id, { total: 90000, miembros: todos, partes: { [rodri.id]: 40000, [sofi.id]: 40000, [tia.id]: 10000 } }))
    .toMatchObject({ ok: false, reason: 'de_la_lista' })
  expect((await misCuentas(db, tia.id)).personas).toEqual([])
})

test('corregir la compra le avisa a quien le cambió la parte (y a nadie más)', async () => {
  const { db, mama, rodri, sofi, ana, bici, giftId } = await conRegalo()
  const todos = [rodri.id, sofi.id, ana.id]
  await comprarRegalo(db, giftId, rodri.id, { total: 90000, partes: { [rodri.id]: 50000, [sofi.id]: 40000, [ana.id]: 0 } })
  // la parte de Ana estaba en la fila de Sofi: con alguien que debe, se corrige, y Ana se entera de que ahora debe
  expect(await corregirCompra(db, giftId, rodri.id, { total: 90000, miembros: todos, partes: { [rodri.id]: 50000, [sofi.id]: 20000, [ana.id]: 20000 } }))
    .toEqual({ ok: true })
  for (const u of [sofi, ana]) {
    expect(await getUnreadNotifications(db, { userId: u.id })).toEqual([
      expect.objectContaining({ tipo: 'compra_corregida', itemTitulo: 'Bici', href: '/cuentas' }),
    ])
    await markNotificationsRead(db, { userId: u.id })
  }
  expect(await getUnreadNotifications(db, { userId: rodri.id })).toEqual([])
  expect(await getUnreadNotifications(db, { userId: mama.id })).toEqual([])
  expect((await misCuentas(db, ana.id)).debes).toBe(20000)
  // solo el total (la parte de Rodri): a ellas no les cambia nada
  expect(await corregirCompra(db, giftId, rodri.id, { total: 80000, miembros: todos, partes: { [rodri.id]: 40000, [sofi.id]: 20000, [ana.id]: 20000 } }))
    .toEqual({ ok: true })
  for (const u of [sofi, ana]) expect(await getUnreadNotifications(db, { userId: u.id })).toEqual([])
  expect((await regalosDeItem(db, bici.id, { userId: sofi.id }))[0].montoTotal).toBe(80000)
})

test('en una idea que se puede repetir, la compra de un evento anterior que nadie pagó se corrige desde Cuentas', async () => {
  const { db, mama, rodri, sofi } = await setup()
  const medias = (await createItem(db, mama.id, { tipo: 'idea', titulo: 'Medias', repetible: true }))!
  const r = await iniciarRegaloGrupal(db, medias.id, rodri.id)
  if (!r.ok) throw new Error(r.reason)
  await sumarseARegalo(db, r.giftId, sofi.id)
  await comprarRegalo(db, r.giftId, rodri.id, { total: 900000 }) // un cero de más
  expect(await comprasParaCorregir(db, rodri.id)).toEqual([]) // se corrige en el deseo
  // fue para el cumple pasado: el deseo ya no lo muestra (ver regalosDeItem), y Sofi le sigue debiendo
  const antes = new Date(Date.now() - 395 * DIA)
  const [gift] = await db.update(groupGifts).set({ compradoAt: antes }).where(eq(groupGifts.id, r.giftId)).returning()
  await db.update(claims).set({ updatedAt: antes }).where(eq(claims.id, gift.claimId))
  expect(await regalosDeItem(db, medias.id, { userId: rodri.id })).toEqual([])
  expect(await comprasParaCorregir(db, rodri.id)).toEqual([expect.objectContaining({ giftId: r.giftId, itemTitulo: 'Medias', total: 900000 })])
  expect(await corregirCompra(db, r.giftId, rodri.id, { total: 90000, miembros: [rodri.id, sofi.id] })).toEqual({ ok: true })
  expect((await misCuentas(db, sofi.id)).debes).toBe(45000)
})

test('"Ya le pagué" o "Saldar todo" justo cuando corrigen la compra no marcan pagada una parte que no vieron', async () => {
  const { db, rodri, sofi, ana, giftId } = await conRegalo()
  const todos = [rodri.id, sofi.id, ana.id]
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })
  // Sofi veía $30.000; Rodri la corrigió a $45.000 antes de que tocara
  await corregirCompra(db, giftId, rodri.id, { total: 90000, miembros: todos, partes: { [rodri.id]: 15000, [sofi.id]: 45000, [ana.id]: 30000 } })
  expect(await marcarPagado(db, giftId, sofi.id, sofi.id, true, 30000)).toBe(false)
  expect((await misCuentas(db, sofi.id)).debes).toBe(45000)
  expect(await marcarPagado(db, giftId, sofi.id, sofi.id, true, 45000)).toBe(true)
  // "Me pagó todo ($30.000)" de Ana, con la parte ya en $20.000: no salda; con lo que dice ahora, sí
  const nuevas = { [rodri.id]: 25000, [sofi.id]: 45000, [ana.id]: 20000 }
  expect(await corregirCompra(db, giftId, rodri.id, { total: 90000, miembros: todos, partes: nuevas })).toEqual({ ok: false, reason: 'ya_pagaron' })
  await marcarPagado(db, giftId, sofi.id, rodri.id, false)
  expect(await corregirCompra(db, giftId, rodri.id, { total: 90000, miembros: todos, partes: nuevas })).toEqual({ ok: true })
  expect(await saldarCon(db, rodri.id, ana.id, 30000)).toBe(0)
  expect((await misCuentas(db, ana.id)).debes).toBe(20000)
  expect(await saldarCon(db, rodri.id, ana.id, 20000)).toBe(1)
  // desde el lado del que debe, el neto es negativo
  expect(await saldarCon(db, sofi.id, rodri.id, -45000)).toBe(1)
  expect((await misCuentas(db, rodri.id)).personas).toEqual([])
})

test('al que sacó el encargado no vuelve a sumarse con un toque: lo deja volver el encargado', async () => {
  const { db, mama, rodri, sofi, ana, bici, giftId } = await conRegalo()
  expect(await sacarDeRegalo(db, giftId, ana.id, rodri.id)).toBe(true)
  expect(await sumarseARegalo(db, giftId, ana.id)).toBe(false)
  // la pantalla no le ofrece "Me sumo", y el encargado ve a quién sacó (los demás, no)
  expect((await regalosDeItem(db, bici.id, { userId: ana.id }))[0]).toMatchObject({ soyParte: false, meSacaron: true, sacados: [] })
  expect((await regalosDeItem(db, bici.id, { userId: rodri.id }))[0]).toMatchObject({ meSacaron: false, sacados: [{ id: ana.id, nombre: 'Ana' }] })
  expect((await regalosDeItem(db, bici.id, { userId: sofi.id }))[0]).toMatchObject({ meSacaron: false, sacados: [] })
  // se lo sacaron por error: solo el encargado lo deja volver, y ella se vuelve a sumar
  expect(await dejarVolverARegalo(db, giftId, ana.id, sofi.id)).toBe(false)
  expect(await dejarVolverARegalo(db, giftId, ana.id, rodri.id)).toBe(true)
  expect((await regalosDeItem(db, bici.id, { userId: ana.id }))[0].meSacaron).toBe(false)
  expect(await sumarseARegalo(db, giftId, ana.id)).toBe(true)
  // si la vuelve a sacar, no ve cuánto puso cada uno al comprarse
  expect(await sacarDeRegalo(db, giftId, ana.id, rodri.id)).toBe(true)
  expect(await sumarseARegalo(db, giftId, ana.id)).toBe(false)
  await comprarRegalo(db, giftId, rodri.id, { total: 90000, miembros: [rodri.id, sofi.id] })
  const [comprado] = await regalosDeItem(db, bici.id, { userId: ana.id })
  expect(comprado).toMatchObject({ estado: 'comprado', soyParte: false, montoTotal: null, meSacaron: false })
  expect(comprado.miembros.map((m) => [m.nombre, m.monto])).toEqual([['Rodri', null], ['Sofi', null]])
  expect(await dejarVolverARegalo(db, giftId, ana.id, rodri.id)).toBe(false) // ya no está abierto
  // en Cuentas, si el encargado lo termina desde ahí (Mamá dijo "Ya lo tengo"), también ve a quién sacó
  const otro = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Casco' }))!
  const g = await iniciarRegaloGrupal(db, otro.id, rodri.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, sofi.id)
  await sumarseARegalo(db, g.giftId, ana.id)
  await sacarDeRegalo(db, g.giftId, ana.id, rodri.id)
  await archiveItem(db, otro.id, mama.id, 'lo_tengo')
  const [enCurso] = (await misCuentas(db, rodri.id)).enCurso
  expect(enCurso).toMatchObject({ itemTitulo: 'Casco', sacados: [{ id: ana.id, nombre: 'Ana' }] })
  expect(enCurso.dividirCon!.map((m) => m.nombre)).toEqual(['Rodri', 'Sofi'])
  expect((await misCuentas(db, sofi.id)).enCurso[0].sacados).toEqual([])
})

test('cuentas: con alguien a mano los totales dan 0, pero las partes siguen ahí para marcarlas saldadas', async () => {
  const { db, rodri, sofi, bici, perfume } = await setup()
  const comprado = async (itemId: string, encargado: string, otro: string) => {
    const g = await iniciarRegaloGrupal(db, itemId, encargado)
    if (!g.ok) throw new Error(g.reason)
    await sumarseARegalo(db, g.giftId, otro)
    await comprarRegalo(db, g.giftId, encargado, { total: 30000 })
  }
  await comprado(bici.id, rodri.id, sofi.id)
  await comprado(perfume.id, sofi.id, rodri.id)
  const c = await misCuentas(db, rodri.id)
  expect(c).toMatchObject({ debes: 0, teDeben: 0 })
  expect(c.personas).toEqual([expect.objectContaining({ nombre: 'Sofi', neto: 0 })])
  expect(await saldarCon(db, rodri.id, sofi.id)).toBe(2)
  expect((await misCuentas(db, sofi.id)).personas).toEqual([])
})

test('un regalo grupal no vence solo, pero al que lo organiza se le recuerda cerrarlo cuando una reserva ya habría vencido', async () => {
  const { db, mama, lista, rodri, sofi, martin, bici, perfume, giftId } = await conRegalo()
  expect(await regalosParaCerrar(db, rodri.id)).toEqual([])
  await db.update(groupGifts).set({ createdAt: new Date(Date.now() - 15 * DIA) }).where(eq(groupGifts.id, giftId))
  expect(await regalosParaCerrar(db, rodri.id)).toEqual([{ giftId, itemTitulo: 'Bici', href: `/l/${lista.shareToken}/item/${bici.id}` }])
  // a los que se sumaron no (no lo cierran ellos), y el deseo sigue ocupado: no se le cae a nadie
  expect(await regalosParaCerrar(db, sofi.id)).toEqual([])
  expect(await reserveItem(db, bici.id, { userId: martin.id })).toEqual({ ok: false, reason: 'sin_stock' })
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })
  expect(await regalosParaCerrar(db, rodri.id)).toEqual([])

  // con el cumple de Mamá en 2 días, uno armado hace 2 ya está (3 días antes del evento); recién armado, no (24 horas)
  const enDos = new Date(hoyLocal().getTime() + 2 * DIA)
  await guardarCumple(db, mama.id, enDos.getUTCDate(), enDos.getUTCMonth() + 1)
  const p = await iniciarRegaloGrupal(db, perfume.id, sofi.id)
  if (!p.ok) throw new Error(p.reason)
  expect(await regalosParaCerrar(db, sofi.id)).toEqual([])
  await db.update(groupGifts).set({ createdAt: new Date(Date.now() - 2 * DIA) }).where(eq(groupGifts.id, p.giftId))
  expect((await regalosParaCerrar(db, sofi.id)).map((r) => r.itemTitulo)).toEqual(['Perfume'])
  // si Mamá dijo "Ya lo tengo", se termina en Cuentas
  await archiveItem(db, perfume.id, mama.id, 'lo_tengo')
  expect(await regalosParaCerrar(db, sofi.id)).toEqual([expect.objectContaining({ itemTitulo: 'Perfume', href: '/cuentas' })])
  expect(await cancelarRegalo(db, p.giftId, sofi.id)).toBe(true)
  expect(await regalosParaCerrar(db, sofi.id)).toEqual([])
})

test('el recordatorio de cerrar un regalo grupal espera al evento, y "Sigue en pie" lo saca por 2 semanas', async () => {
  const { db, mama, rodri, sofi, giftId } = await conRegalo()
  // el cumple de Mamá es en 3 meses: a las 2 semanas de armarlo todavía no
  const en90 = new Date(hoyLocal().getTime() + 90 * DIA)
  await guardarCumple(db, mama.id, en90.getUTCDate(), en90.getUTCMonth() + 1)
  await db.update(groupGifts).set({ createdAt: new Date(Date.now() - 15 * DIA) }).where(eq(groupGifts.id, giftId))
  expect(await regalosParaCerrar(db, rodri.id)).toEqual([])
  // ya a 2 días del cumple, sí
  const enDos = new Date(hoyLocal().getTime() + 2 * DIA)
  await guardarCumple(db, mama.id, enDos.getUTCDate(), enDos.getUTCMonth() + 1)
  expect(await regalosParaCerrar(db, rodri.id)).toEqual([expect.objectContaining({ giftId, itemTitulo: 'Bici' })])
  // "Sigue en pie": solo el encargado, y vuelve a las 2 semanas
  expect(await posponerRecordatorio(db, giftId, sofi.id)).toBe(false)
  expect(await posponerRecordatorio(db, giftId, rodri.id)).toBe(true)
  expect(await regalosParaCerrar(db, rodri.id)).toEqual([])
  await db.update(groupGifts).set({ recordatorioAt: new Date(Date.now() - 13 * DIA) }).where(eq(groupGifts.id, giftId))
  expect(await regalosParaCerrar(db, rodri.id)).toEqual([])
  await db.update(groupGifts).set({ recordatorioAt: new Date(Date.now() - 15 * DIA) }).where(eq(groupGifts.id, giftId))
  expect(await regalosParaCerrar(db, rodri.id)).toEqual([expect.objectContaining({ giftId })])
  // uno comprado no se pospone
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })
  expect(await posponerRecordatorio(db, giftId, rodri.id)).toBe(false)
})

test('un regalo armado al poco de pasar el cumple ("se nos pasó") se recuerda a las 2 semanas, y ninguno espera más de 6', async () => {
  const { db, mama, rodri, giftId } = await conRegalo()
  const recordados = async (cumpleHace: number, armadoHace: number) => {
    const cumple = new Date(hoyLocal().getTime() - cumpleHace * DIA)
    await guardarCumple(db, mama.id, cumple.getUTCDate(), cumple.getUTCMonth() + 1)
    await db.update(groupGifts).set({ createdAt: new Date(Date.now() - armadoHace * DIA) }).where(eq(groupGifts.id, giftId))
    return (await regalosParaCerrar(db, rodri.id)).map((r) => r.giftId)
  }
  // el cumple fue hace 30 días y lo armaron 5 días después: es de ese cumple, no del año que viene
  expect(await recordados(30, 25)).toEqual([giftId])
  // armado hace 10, unos días después del cumple: como una reserva, todavía no
  expect(await recordados(20, 10)).toEqual([])
  // armado casi 3 semanas después del cumple, para el que viene: no espera hasta 3 días antes, sale a las 6 semanas
  expect(await recordados(60, 40)).toEqual([])
  expect(await recordados(60, 43)).toEqual([giftId])
})

test('un regalo grupal en el que no se sumó nadie se recuerda cuando su reserva habría vencido, aunque el cumple esté lejos', async () => {
  const { db, mama, rodri, sofi, martin, bici } = await setup()
  const en90 = new Date(hoyLocal().getTime() + 90 * DIA)
  await guardarCumple(db, mama.id, en90.getUTCDate(), en90.getUTCMonth() + 1)
  // Rodri lo había reservado y lo hizo regalo grupal: no se sumó nadie
  const r = await reserveItem(db, bici.id, { userId: rodri.id })
  if (!r.ok) throw new Error(r.reason)
  const g = await iniciarRegaloGrupal(db, bici.id, rodri.id)
  if (!g.ok) throw new Error(g.reason)
  const armado = (dias: number) => db.update(groupGifts).set({ createdAt: new Date(Date.now() - dias * DIA) }).where(eq(groupGifts.id, g.giftId))
  await armado(13)
  expect(await regalosParaCerrar(db, rodri.id)).toEqual([])
  // a las 2 semanas, como la reserva suelta: no se queda con el deseo meses sin que nadie le pregunte
  await armado(15)
  expect(await regalosParaCerrar(db, rodri.id)).toEqual([expect.objectContaining({ giftId: g.giftId, itemTitulo: 'Bici' })])
  expect(await reserveItem(db, bici.id, { userId: martin.id })).toEqual({ ok: false, reason: 'sin_stock' })
  // con Sofi adentro sí espera (al cumple, hasta 6 semanas); si se baja, vuelve a ser como una reserva
  await sumarseARegalo(db, g.giftId, sofi.id)
  expect(await regalosParaCerrar(db, rodri.id)).toEqual([])
  await salirDeRegalo(db, g.giftId, sofi.id)
  expect(await regalosParaCerrar(db, rodri.id)).toEqual([expect.objectContaining({ giftId: g.giftId })])
})
