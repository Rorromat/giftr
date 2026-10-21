import { expect, test, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { claims, items, users } from '@/db/schema'
import { reserveItem } from '@/lib/claims'

// Las acciones de deseos y reservas tal cual, con la base en PGlite y la sesión y las redirecciones de Next simuladas.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  session: null as { userId: string } | null,
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
}))

import { addItemAction, archiveItemAction, boughtAction, restoreItemAction, unboughtAction } from '@/app/actions'

async function preparar() {
  h.db = await createTestDb()
  const seed = await seedOwnerAndGiver(h.db)
  const [item] = await h.db.insert(items).values({ listId: seed.list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  return { ...seed, item }
}

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

async function redirigeA(p: Promise<unknown>): Promise<string> {
  try { await p } catch (e) { return (e as { url: string }).url }
  throw new Error('esperaba una redirección')
}

test('agregar un "Quiero ESTO" con "Se puede repetir" tildado lo guarda sin la marca; una idea, con ella', async () => {
  const { owner } = await preparar()
  h.session = { userId: owner.id }
  expect(await redirigeA(addItemAction(form({ titulo: 'Mate imperial', tipo: 'exacto', repetible: 'on' })))).toBe('/mi-lista')
  expect(await redirigeA(addItemAction(form({ titulo: 'Medias', tipo: 'idea', repetible: 'on' })))).toBe('/mi-lista')
  const filas = await h.db.select({ titulo: items.titulo, repetible: items.repetible }).from(items)
  expect(Object.fromEntries(filas.map((f) => [f.titulo, f.repetible]))).toEqual({ Termo: false, 'Mate imperial': false, Medias: true })
})

test('"Ya lo compré" sobre una reserva que venció y que ya tomó otro vuelve al deseo con el motivo', async () => {
  const { giver, item } = await preparar()
  const [vieja] = await h.db.insert(claims).values({ itemId: item.id, claimerUserId: giver.id, expiresAt: new Date(Date.now() - 1000) }).returning()
  const [caro] = await h.db.insert(users).values({ googleId: 'g-caro', nombre: 'Caro', email: 'caro@test.com' }).returning()
  expect((await reserveItem(h.db, item.id, { userId: caro.id })).ok).toBe(true)
  h.session = { userId: giver.id }
  const datos = { token: 'tok-euge', itemId: item.id, claimId: vieja.id }
  expect(await redirigeA(boughtAction(form(datos)))).toBe(`/l/tok-euge/item/${item.id}?reserva=vencida`)

  // la de Caro sale bien y se puede deshacer
  const [deCaro] = await h.db.select().from(claims).where(eq(claims.claimerUserId, caro.id))
  h.session = { userId: caro.id }
  await boughtAction(form({ ...datos, claimId: deCaro.id, nota: 'el negro' }))
  expect((await h.db.select().from(claims).where(eq(claims.id, deCaro.id)))[0]).toMatchObject({ estado: 'comprado', notaQueCompre: 'el negro' })
  await unboughtAction(form({ ...datos, claimId: deCaro.id }))
  expect((await h.db.select().from(claims).where(eq(claims.id, deCaro.id)))[0]).toMatchObject({ estado: 'reservado', notaQueCompre: null })
})

test('archivar y "Volver a mi lista" desde las acciones', async () => {
  const { owner, giver, item } = await preparar()
  h.session = { userId: giver.id }
  await archiveItemAction(form({ itemId: item.id, estado: 'no_lo_quiero' }))
  expect((await h.db.select().from(items))[0].estadoDueno).toBe('activo')
  h.session = { userId: owner.id }
  await archiveItemAction(form({ itemId: item.id, estado: 'no_lo_quiero' }))
  expect((await h.db.select().from(items))[0].estadoDueno).toBe('no_lo_quiero')
  await restoreItemAction(form({ itemId: item.id }))
  expect((await h.db.select().from(items))[0].estadoDueno).toBe('activo')
  // sin itemId o con uno inventado, no pasa nada (ni un error)
  await archiveItemAction(form({ estado: 'lo_tengo' }))
  await restoreItemAction(form({ itemId: 'no-es-uuid' }))
  expect((await h.db.select().from(items))[0].estadoDueno).toBe('activo')
})
