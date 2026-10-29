import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { amistades, groupGiftMembers, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { createItem } from '@/lib/items'
import { bandeja } from '@/lib/bandeja'
import {
  comprarRegalo, iniciarRegaloGrupal, marcarPagado, misCuentas, pagarParte, regalosDeItem, saldarCon, saldarRonda, sumarseARegalo,
} from '@/lib/regalos'
import { simplificar, type Deuda, type Reglas } from '@/lib/simplificar'

// Simplificar las deudas, a lo Splitwise (ver simplificar.ts): primero el plan solo, con ids sueltos; después Cuentas de
// verdad, con regalos, sorpresas y avisos.

const todosSeConocen: Reglas = { conocen: () => true, receptores: () => [] }
const deuda = (de: string, a: string, monto: number, regalos = [`${de}${a}`]): Deuda => ({ de, a, monto, regalos })

test('plan: una cadena se saltea (Ana le paga directo a Carla) y lo que sobra queda directo', () => {
  expect(simplificar([deuda('ana', 'bruno', 10), deuda('bruno', 'carla', 10)], todosSeConocen))
    .toEqual([{ monto: 10, camino: ['ana', 'bruno', 'carla'] }])
  expect(simplificar([deuda('ana', 'bruno', 15), deuda('bruno', 'carla', 10)], todosSeConocen)).toEqual([
    { monto: 5, camino: ['ana', 'bruno'] }, { monto: 10, camino: ['ana', 'bruno', 'carla'] },
  ])
  // dos le deben a Bruno y Bruno le debe todo a Dani: Bruno queda afuera
  expect(simplificar([deuda('ana', 'bruno', 10), deuda('carla', 'bruno', 10), deuda('bruno', 'dani', 20)], todosSeConocen)).toEqual([
    { monto: 10, camino: ['ana', 'bruno', 'dani'] }, { monto: 10, camino: ['carla', 'bruno', 'dani'] },
  ])
})

test('plan: lo que se deben en ronda se cancela, y si no es parejo queda lo de menos', () => {
  expect(simplificar([deuda('ana', 'bruno', 10), deuda('bruno', 'carla', 10), deuda('carla', 'ana', 10)], todosSeConocen))
    .toEqual([{ monto: 10, camino: ['ana', 'bruno', 'carla', 'ana'] }])
  // netos: Ana -5, Bruno -10, Carla +15. Dos pagos en vez de tres
  const plan = simplificar([deuda('ana', 'bruno', 10), deuda('bruno', 'carla', 20), deuda('carla', 'ana', 5)], todosSeConocen)
  expect(plan).toEqual([
    { monto: 5, camino: ['ana', 'bruno', 'carla'] }, { monto: 5, camino: ['ana', 'bruno', 'carla', 'ana'] }, { monto: 10, camino: ['bruno', 'carla'] },
  ])
})

test('plan: no se saltea a nadie entre desconocidos ni por un regalo para alguien del camino', () => {
  const cadena = [deuda('ana', 'bruno', 10, ['bici']), deuda('bruno', 'carla', 10, ['libro'])]
  const directo = [{ monto: 10, camino: ['ana', 'bruno'] }, { monto: 10, camino: ['bruno', 'carla'] }]
  // Ana y Carla no se conocen
  const conocen = (a: string, b: string) => [a, b].sort().join() !== 'ana,carla'
  expect(simplificar(cadena, { conocen, receptores: () => [] })).toEqual(directo)
  // el libro (lo que Bruno le debe a Carla) es para Ana: no puede terminar pagándole a Carla, ni enterarse
  expect(simplificar(cadena, { conocen: () => true, receptores: (g) => (g === 'libro' ? ['ana'] : []) })).toEqual(directo)
  // la bici es para Carla: tampoco
  expect(simplificar(cadena, { conocen: () => true, receptores: (g) => (g === 'bici' ? ['carla'] : []) })).toEqual(directo)
  // de alguien de afuera, sí
  expect(simplificar(cadena, { conocen: () => true, receptores: () => ['mama'] })).toEqual([{ monto: 10, camino: ['ana', 'bruno', 'carla'] }])
})

test('plan: el mismo para cualquiera que lo pida (no depende del orden de las deudas)', () => {
  const deudas = [deuda('ana', 'bruno', 7), deuda('bruno', 'carla', 12), deuda('carla', 'dani', 3), deuda('dani', 'ana', 9), deuda('eva', 'bruno', 4)]
  const plan = simplificar(deudas, todosSeConocen)
  expect(simplificar([...deudas].reverse(), todosSeConocen)).toEqual(plan)
  // cada uno termina con el mismo neto que antes
  const neto = (tramos: { monto: number; camino: string[] }[], p: string) =>
    tramos.reduce((s, t) => s + (t.camino.at(-1) === p ? t.monto : 0) - (t.camino[0] === p ? t.monto : 0), 0)
  const antes = deudas.map((d) => ({ monto: d.monto, camino: [d.de, d.a] }))
  for (const p of ['ana', 'bruno', 'carla', 'dani', 'eva']) expect(neto(plan, p)).toBe(neto(antes, p))
  // y son menos pagos (sin contar las rondas, que no se pagan)
  expect(plan.filter((t) => t.camino[0] !== t.camino.at(-1)).length).toBeLessThan(deudas.length)
})

// ---------------------------------------------------------------- Cuentas

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}

/** Un regalo grupal comprado: lo arma encargado, se suman los demás y se divide en partes iguales. */
async function regalo(db: Db, duenoId: string, titulo: string, encargado: string, otros: string[], total: number) {
  const item = (await createItem(db, duenoId, { tipo: 'exacto', titulo }))!
  const g = await iniciarRegaloGrupal(db, item.id, encargado)
  if (!g.ok) throw new Error(g.reason)
  for (const o of otros) expect(await sumarseARegalo(db, g.giftId, o)).toBe(true)
  expect(await comprarRegalo(db, g.giftId, encargado, { total })).toEqual({ ok: true })
  return { giftId: g.giftId, itemId: item.id }
}

const amigos = (db: Db, a: string, b: string) => db.insert(amistades).values({ deUserId: a, paraUserId: b, estado: 'aceptada', respondidaAt: new Date() })
const titulos = async (db: Db, userId: string) => (await bandeja(db, { userId })).entradas.filter((e) => e.emoji !== '🧾').map((e) => [e.titulo, e.cuerpo])
const pendientes = async (db: Db, giftId: string) => (await db.select().from(groupGiftMembers).where(eq(groupGiftMembers.giftId, giftId)))
  .filter((m) => !m.pagado).map((m) => m.monto! - m.pagadoMonto)

/** Ana le debe $30.000 a Bruno (la bici de Mamá) y Bruno a Carla (el libro del Tío). */
async function cadena(montoLibro = 60000) {
  const db = await createTestDb()
  const [mama, tio, ana, bruno, carla] = [
    await usuario(db, 'Mamá'), await usuario(db, 'Tío'), await usuario(db, 'Ana'), await usuario(db, 'Bruno'), await usuario(db, 'Carla'),
  ]
  const bici = await regalo(db, mama.id, 'Bici', bruno.id, [ana.id], 60000)
  const libro = await regalo(db, tio.id, 'Libro', carla.id, [bruno.id], montoLibro)
  return { db, mama, tio, ana, bruno, carla, bici, libro }
}

test('cuentas: entre gente que se conoce, Ana le paga directo a Carla y Bruno queda a mano con los dos', async () => {
  const { db, ana, bruno, carla, bici, libro } = await cadena()
  // Ana y Carla no se conocen: cada uno le paga a quien le debe
  expect((await misCuentas(db, ana.id)).personas.map((p) => [p.nombre, p.neto])).toEqual([['Bruno', -30000]])

  await amigos(db, ana.id, carla.id)
  const deAna = await misCuentas(db, ana.id)
  expect(deAna).toMatchObject({ debes: 30000, teDeben: 0 })
  expect(deAna.personas).toEqual([expect.objectContaining({
    nombre: 'Carla', neto: -30000, lineas: [], ajustes: [{ monto: -30000, texto: 'En vez de pagarle a Bruno' }],
  })])
  const deBruno = await misCuentas(db, bruno.id)
  expect(deBruno).toMatchObject({ debes: 0, teDeben: 0, personas: [], rondas: [] })
  expect(deBruno.porVos).toEqual([{ de: 'Ana', a: 'Carla', antes: 'Ana', despues: 'Carla', monto: 30000 }])
  expect((await misCuentas(db, carla.id)).personas).toEqual([expect.objectContaining({
    nombre: 'Ana', neto: 30000, ajustes: [{ monto: 30000, texto: 'En vez de que te pague Bruno' }],
  })])

  // "Ya le pagué todo" a Carla: se saldan la parte de Ana en la bici y la de Bruno en el libro
  expect(await saldarCon(db, ana.id, carla.id, -30000)).toBe(2)
  for (const u of [ana, bruno, carla]) expect(await misCuentas(db, u.id)).toMatchObject({ debes: 0, teDeben: 0, personas: [], porVos: [] })
  expect(await pendientes(db, bici.giftId)).toEqual([])
  expect(await pendientes(db, libro.giftId)).toEqual([])
  expect((await regalosDeItem(db, libro.itemId, { userId: carla.id }))[0].miembros.map((m) => [m.nombre, m.pagado])).toEqual([['Carla', true], ['Bruno', true]])
  expect(await titulos(db, carla.id)).toEqual([[
    'Ana te pagó $30.000', 'Incluye lo que te debía Bruno: se simplificó para hacer menos transferencias. Ya quedó saldado en Cuentas.',
  ]])
  expect(await titulos(db, bruno.id)).toEqual([[
    'Ana le pagó $30.000 a Carla por vos', 'Ya no le debés eso a Carla, y Ana ya no te lo debe: se simplificó para hacer menos transferencias.',
  ]])
})

test('cuentas: si Bruno le debe menos a Carla, Ana le paga eso a Carla y el resto a Bruno', async () => {
  const { db, ana, bruno, carla, bici } = await cadena(20000)
  await amigos(db, ana.id, carla.id)
  const deAna = await misCuentas(db, ana.id)
  expect(deAna.debes).toBe(30000)
  expect(deAna.personas.map((p) => [p.nombre, p.neto, p.ajustes.map((a) => [a.monto, a.texto])])).toEqual([
    ['Bruno', -20000, [[10000, 'Se lo pagás a Carla']]], ['Carla', -10000, [[-10000, 'En vez de pagarle a Bruno']]],
  ])
  expect((await misCuentas(db, bruno.id)).personas.map((p) => [p.nombre, p.neto, p.ajustes.map((a) => a.texto)]))
    .toEqual([['Ana', 20000, ['Ana le paga a Carla por vos']]])

  // le paga a Bruno lo suyo: los $10.000 de la bici que van a Carla siguen guardados para eso
  expect(await saldarCon(db, ana.id, bruno.id, -20000)).toBe(1)
  expect(await pendientes(db, bici.giftId)).toEqual([10000])
  expect((await misCuentas(db, ana.id)).personas.map((p) => [p.nombre, p.neto])).toEqual([['Carla', -10000]])
  expect(await saldarCon(db, carla.id, ana.id, 10000)).toBe(2)
  for (const u of [ana, bruno, carla]) expect((await misCuentas(db, u.id)).personas).toEqual([])
  // "Me pagó" lo marca Carla: a ella no le llega nada; a Bruno sí, se le saldó lo suyo
  expect(await titulos(db, carla.id)).toEqual([])
  expect((await titulos(db, bruno.id)).map(([t]) => t)).toEqual(['Ana le pagó $10.000 a Carla por vos', 'Ana te pagó $20.000'])
})

test('cuentas: una parte de lo simplificado salda esa parte de cada deuda del camino', async () => {
  const { db, ana, bruno, carla, bici, libro } = await cadena()
  await amigos(db, ana.id, carla.id)
  expect(await pagarParte(db, ana.id, carla.id, 10000, -30000)).toEqual({ ok: true })
  expect(await pendientes(db, bici.giftId)).toEqual([20000])
  expect(await pendientes(db, libro.giftId)).toEqual([20000])
  expect((await misCuentas(db, ana.id)).personas.map((p) => [p.nombre, p.neto])).toEqual([['Carla', -20000]])
  expect((await misCuentas(db, bruno.id)).porVos).toEqual([expect.objectContaining({ de: 'Ana', a: 'Carla', monto: 20000 })])
  expect(await titulos(db, carla.id)).toEqual([[
    'Ana te pagó $10.000', 'Incluye lo que te debía Bruno: se simplificó para hacer menos transferencias. Le falta pagarte $20.000.',
  ]])
  expect((await titulos(db, bruno.id)).map(([t]) => t)).toEqual(['Ana le pagó $10.000 a Carla por vos'])
})

test('cuentas: un regalo que todavía es sorpresa no se simplifica a través de quien lo recibe', async () => {
  const db = await createTestDb()
  const [tio, ana, bruno, carla] = [await usuario(db, 'Tío'), await usuario(db, 'Ana'), await usuario(db, 'Bruno'), await usuario(db, 'Carla')]
  await amigos(db, ana.id, bruno.id)
  // Ana le debe a Carla (el libro del Tío) y Carla a Bruno por el perfume que le regalan a Ana
  await regalo(db, tio.id, 'Libro', carla.id, [ana.id], 60000)
  await regalo(db, ana.id, 'Perfume', bruno.id, [carla.id], 60000)
  // si Ana le pagara directo a Bruno se daría cuenta: cada uno le paga a quien le debe, y a Ana no le llega nada de Bruno
  const deAna = await misCuentas(db, ana.id)
  expect(deAna.personas.map((p) => [p.nombre, p.neto, p.ajustes])).toEqual([['Carla', -30000, []]])
  expect(JSON.stringify(deAna)).not.toContain('Bruno')
  expect(JSON.stringify(deAna)).not.toContain('Perfume')
  expect((await misCuentas(db, carla.id)).personas.map((p) => [p.nombre, p.neto, p.ajustes])).toEqual([['Bruno', -30000, []], ['Ana', 30000, []]])
  expect(await saldarCon(db, ana.id, carla.id, -30000)).toBe(1)
  expect((await misCuentas(db, carla.id)).personas.map((p) => p.nombre)).toEqual(['Bruno'])
})

test('cuentas: lo que se deben en ronda se marca saldado sin pagar nada, y a los demás les llega', async () => {
  const db = await createTestDb()
  const [mama, tio, tia, ana, bruno, carla] = [
    await usuario(db, 'Mamá'), await usuario(db, 'Tío'), await usuario(db, 'Tía'), await usuario(db, 'Ana'), await usuario(db, 'Bruno'),
    await usuario(db, 'Carla'),
  ]
  const regalos = [
    await regalo(db, mama.id, 'Bici', bruno.id, [ana.id], 60000), // Ana le debe a Bruno
    await regalo(db, tio.id, 'Libro', carla.id, [bruno.id], 60000), // Bruno a Carla
    await regalo(db, tia.id, 'Taza', ana.id, [carla.id], 60000), // Carla a Ana
  ]
  for (const u of [ana, bruno, carla]) {
    const c = await misCuentas(db, u.id)
    expect(c).toMatchObject({ debes: 0, teDeben: 0, personas: [], porVos: [] })
    expect(c.rondas).toHaveLength(1)
  }
  const [ronda] = (await misCuentas(db, bruno.id)).rondas
  expect(ronda).toMatchObject({ monto: 30000, con: ['Carla', 'Ana'] })
  // una pantalla vieja (otro monto u otra ronda) no marca nada
  expect(await saldarRonda(db, bruno.id, ronda.clave, 20000)).toBe(false)
  expect(await saldarRonda(db, bruno.id, 'otra', 30000)).toBe(false)
  expect(await saldarRonda(db, bruno.id, ronda.clave, 30000)).toBe(true)
  for (const r of regalos) expect(await pendientes(db, r.giftId)).toEqual([])
  for (const u of [ana, bruno, carla]) expect((await misCuentas(db, u.id)).rondas).toEqual([])
  expect(await titulos(db, ana.id)).toEqual([['Con Bruno y Carla quedaron a mano', 'Se debían $30.000 en ronda, así que se canceló sin que nadie pague.']])
  expect(await titulos(db, bruno.id)).toEqual([])
  // y se deshace como cualquier pago, desde el regalo
  expect(await marcarPagado(db, regalos[0].giftId, ana.id, ana.id, false)).toBe(true)
  expect((await misCuentas(db, ana.id)).personas.map((p) => [p.nombre, p.neto])).toEqual([['Bruno', -30000]])
})

test('cuentas: una lista de un grupo cuenta para todos sus dueños, también para el que salió', async () => {
  const db = await createTestDb()
  const [delfina, ana, bruno, carla] = [await usuario(db, 'Delfina'), await usuario(db, 'Ana'), await usuario(db, 'Bruno'), await usuario(db, 'Carla')]
  const { crearGrupo, unirseAGrupo, salirDeGrupo } = await import('@/lib/groups')
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  await amigos(db, ana.id, carla.id)
  // Ana le debe a Bruno (algo para Delfina) y Bruno a Carla por la tele de la casa
  await regalo(db, delfina.id, 'Bici', bruno.id, [ana.id], 60000)
  const item = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Tele' }, grupoId))!
  const g = await iniciarRegaloGrupal(db, item.id, carla.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, bruno.id)
  await comprarRegalo(db, g.giftId, carla.id, { total: 60000 })
  expect((await misCuentas(db, ana.id)).personas.map((p) => p.nombre)).toEqual(['Carla'])
  // Ana entra a la casa y sale: la tele era (y sigue siendo) también para ella
  await unirseAGrupo(db, grupo.inviteToken!, ana.id)
  await salirDeGrupo(db, grupoId, ana.id)
  expect((await misCuentas(db, ana.id)).personas.map((p) => [p.nombre, p.neto, p.ajustes])).toEqual([['Bruno', -30000, []]])
})
