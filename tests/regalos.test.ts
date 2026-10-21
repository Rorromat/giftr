import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { claims, items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { archiveItem, createItem } from '@/lib/items'
import { markBought, releaseClaim, reserveItem } from '@/lib/claims'
import { getItemForViewer, getListForViewer, getOwnList } from '@/lib/lists'
import { guardarCumple, misEventos, seguirLista } from '@/lib/events'
import {
  cancelarRegalo, comprarRegalo, dividir, historialDeLista, iniciarRegaloGrupal, marcarPagado, misCuentas,
  parsePesos, pesos, regalosDeItem, salirDeRegalo, saldarCon, sumarseARegalo, ultimosRegalos,
} from '@/lib/regalos'

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
  expect(parsePesos('$ 1.250,50')).toBe(1250)
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
  expect(await markBought(db, claim.id, { userId: rodri.id })).toBe(false)
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
  const neto = await misCuentas(db, rodri.id)
  expect(neto).toMatchObject({ debes: 10000, teDeben: 60000 })
  expect(neto.personas.find((p) => p.nombre === 'Sofi')).toMatchObject({ neto: 20000 })

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

test('si la dueña lo saca de la lista, el encargado lo ve en Cuentas y lo puede cancelar', async () => {
  const { db, mama, rodri, sofi, bici, giftId } = await conRegalo()
  await archiveItem(db, bici.id, mama.id, 'lo_tengo')
  const enCurso = (await misCuentas(db, rodri.id)).enCurso
  expect(enCurso).toEqual([expect.objectContaining({ giftId, sigueEnLaLista: false, soyEncargado: true })])
  expect(enCurso[0].href).not.toContain(bici.id) // el detalle ya no existe para quien regala
  expect((await misCuentas(db, sofi.id)).enCurso[0]).toMatchObject({ sigueEnLaLista: false, soyEncargado: false })
  expect(await cancelarRegalo(db, giftId, rodri.id)).toBe(true)
  expect((await misCuentas(db, sofi.id)).enCurso).toEqual([])
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
  await seguirLista(db, ana.id, lista.id)
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
