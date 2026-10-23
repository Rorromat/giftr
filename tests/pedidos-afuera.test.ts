import { expect, test } from 'vitest'
import { count, eq } from 'drizzle-orm'
import { conConsultas, createTestDb, seedOwnerAndGiver } from './helpers'
import { pedidosAfuera } from '@/db/schema'
import type { Db } from '@/db/types'
import { anotarPedidoAfuera, PEDIDOS_AFUERA_POR_DIA, PEDIDOS_AFUERA_POR_RATO } from '@/lib/pedidos-afuera'

// El tope de lo que cada usuario nos hace pedir afuera (leer el link de un producto, traer su foto): por día y por rato.

const hace = (ms: number) => new Date(Date.now() - ms)
const pedidos = async (db: Db, userId: string) =>
  (await db.select({ n: count() }).from(pedidosAfuera).where(eq(pedidosAfuera.userId, userId)))[0].n

test(`hasta ${PEDIDOS_AFUERA_POR_DIA} por día: lo rechazado no se anota`, async () => {
  const db = await createTestDb()
  const { owner } = await seedOwnerAndGiver(db)
  await db.insert(pedidosAfuera).values(Array.from({ length: PEDIDOS_AFUERA_POR_DIA - 1 }, () => ({ userId: owner.id, createdAt: hace(3600_000) })))
  expect(await anotarPedidoAfuera(db, owner.id)).toBe(true)
  for (let i = 0; i < 3; i++) expect(await anotarPedidoAfuera(db, owner.id)).toBe(false)
  expect(await pedidos(db, owner.id)).toBe(PEDIDOS_AFUERA_POR_DIA)
})

test(`hasta ${PEDIDOS_AFUERA_POR_RATO} cada 10 minutos (los de antes no cuentan para eso)`, async () => {
  const db = await createTestDb()
  const { owner } = await seedOwnerAndGiver(db)
  await db.insert(pedidosAfuera).values([
    ...Array.from({ length: 30 }, () => ({ userId: owner.id, createdAt: hace(11 * 60_000) })),
    ...Array.from({ length: PEDIDOS_AFUERA_POR_RATO - 1 }, () => ({ userId: owner.id, createdAt: hace(60_000) })),
  ])
  expect(await anotarPedidoAfuera(db, owner.id)).toBe(true)
  expect(await anotarPedidoAfuera(db, owner.id)).toBe(false)
  expect(await pedidos(db, owner.id)).toBe(30 + PEDIDOS_AFUERA_POR_RATO)
})

test('los de ayer no cuentan y se borran; el de otro tiene su propio tope', async () => {
  const db = await createTestDb()
  const { owner, giver } = await seedOwnerAndGiver(db)
  await db.insert(pedidosAfuera).values([
    ...Array.from({ length: 300 }, () => ({ userId: owner.id, createdAt: hace(25 * 3600_000) })),
    ...Array.from({ length: PEDIDOS_AFUERA_POR_DIA }, () => ({ userId: giver.id, createdAt: hace(3600_000) })),
  ])
  expect(await anotarPedidoAfuera(db, owner.id)).toBe(true)
  expect(await pedidos(db, owner.id)).toBe(1)
  expect(await anotarPedidoAfuera(db, giver.id)).toBe(false)
  expect(await pedidos(db, giver.id)).toBe(PEDIDOS_AFUERA_POR_DIA)
})

test('dos pedidos a la vez no pasan juntos el tope: lock del usuario (como las fotos) antes de contar', async () => {
  const base = await createTestDb()
  const { owner } = await seedOwnerAndGiver(base)
  const { db, consultas } = conConsultas(base)
  await anotarPedidoAfuera(db, owner.id)
  const lock = consultas.findIndex((q) => /from "users".*for no key update/i.test(q))
  const cuenta = consultas.findIndex((q) => /count\(\*\).*from "pedidos_afuera"/i.test(q))
  expect(lock).toBeGreaterThanOrEqual(0)
  expect(cuenta).toBeGreaterThan(lock)
  // de la base, solo eso: nada de deseos, reservas ni regalos (la Sorpresa)
  const tablas = new Set(consultas.flatMap((q) => [...q.matchAll(/(?:from|into|update|join)\s+"(\w+)"/gi)].map((m) => m[1])))
  expect([...tablas].sort()).toEqual(['pedidos_afuera', 'users'])
})
