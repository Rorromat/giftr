import { expect, test, vi } from 'vitest'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { saltearBienvenida } from '@/lib/bienvenida'

// Inicio es lo primero al entrar: con la base en PGlite y la sesión y las redirecciones de Next simuladas.
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
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))

import Inicio from '@/app/(menu)/inicio/page'
import Home from '@/app/page'

/** A dónde redirige (null si no redirige). */
async function redirige(p: Promise<unknown>): Promise<string | null> {
  try { await p } catch (e) { return (e as { url: string }).url }
  return null
}

test('al entrar con sesión va a Inicio; la primera vez, a la bienvenida; sin sesión, a la portada', async () => {
  h.db = await createTestDb()
  const { owner } = await seedOwnerAndGiver(h.db)
  expect(await redirige(Inicio({ searchParams: Promise.resolve({}) }))).toBe('/')
  h.session = { userId: owner.id }
  expect(await redirige(Home({ searchParams: Promise.resolve({}) }))).toBe('/inicio')
  expect(await redirige(Inicio({ searchParams: Promise.resolve({}) }))).toBe('/bienvenida')
  await saltearBienvenida(h.db, owner.id)
  expect(await redirige(Inicio({ searchParams: Promise.resolve({}) }))).toBeNull()
})
