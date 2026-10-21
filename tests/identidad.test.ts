import { expect, test, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { claims, guestIdentities, items } from '@/db/schema'
import { firmarInvitado, GUEST_COOKIE } from '@/lib/cookie-invitado'

// Las acciones de identidad tal cual, con la base en PGlite y las cookies, la sesión y las redirecciones de Next simuladas.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  jar: new Map<string, string>(),
  session: null as { userId: string } | null,
  signIn: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: h.signIn, signOut: h.signOut }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (h.jar.has(k) ? { name: k, value: h.jar.get(k)! } : undefined),
    set: (k: string, v: string) => { h.jar.set(k, v) },
    delete: (k: string) => { h.jar.delete(k) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
}))

import { codazoAction, entrarConGoogleAction, identificarseAction, releaseAction, reserveAction, salirAction } from '@/app/actions'
import { getViewer } from '@/lib/viewer'
import { getListForViewer } from '@/lib/lists'

async function preparar() {
  h.db = await createTestDb()
  h.jar.clear()
  h.session = null
  h.signIn.mockReset()
  h.signOut.mockReset()
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

test('"¿Quién sos?": con un nombre se anota como invitado (cookie firmada) y pasa a ver la coordinación', async () => {
  const { giver } = await preparar()
  expect(await getViewer()).toEqual({})
  expect((await getListForViewer(h.db, 'tok-euge', await getViewer()))?.role).toBe('anonimo')

  expect(await identificarseAction(null, form({ token: 'tok-euge', nombre: '  Abuela ' }))).toBeNull()
  const [g] = await h.db.select().from(guestIdentities)
  expect(g.nombre).toBe('Abuela')
  expect(h.jar.get(GUEST_COOKIE)).toBe(firmarInvitado(g.id))
  expect(await getViewer()).toEqual({ guestId: g.id })
  expect((await getListForViewer(h.db, 'tok-euge', await getViewer()))?.role).toBe('giver')

  // ya identificado (o con sesión) no se anota de nuevo
  await identificarseAction(null, form({ token: 'tok-euge', nombre: 'Otra' }))
  h.jar.clear()
  h.session = { userId: giver.id }
  await identificarseAction(null, form({ token: 'tok-euge', nombre: 'Otra más' }))
  expect(await h.db.select().from(guestIdentities)).toHaveLength(1)
})

test('un nombre vacío o de más de 60 caracteres vuelve con un mensaje y no anota a nadie', async () => {
  const { item } = await preparar()
  expect(await identificarseAction(null, form({ token: 'tok-euge', nombre: '   ' }))).toEqual({ error: expect.stringContaining('nombre') })
  expect(await identificarseAction(null, form({ token: 'tok-euge', nombre: 'a'.repeat(61) }))).toEqual({ error: expect.stringContaining('60') })
  // reservar desde el diálogo del nombre
  expect(await reserveAction(null, form({ token: 'tok-euge', itemId: item.id, nombre: '  ' }))).toEqual({ error: expect.any(String) })
  // el codazo vuelve con su motivo
  expect(await redirigeA(codazoAction(form({ token: 'tok-euge', nombre: 'a'.repeat(61) })))).toBe('/l/tok-euge?codazo=nombre_largo#codazo')
  expect(await redirigeA(codazoAction(form({ token: 'tok-euge', nombre: ' ' })))).toBe('/l/tok-euge?codazo=sin_identidad#codazo')
  // un token inventado tampoco anota a nadie
  expect(await identificarseAction(null, form({ token: 'no-existe', nombre: 'Abuela' }))).toBeNull()
  expect(await redirigeA(codazoAction(form({ token: 'no-existe', nombre: 'Abuela' })))).toBe('/')

  expect(await h.db.select().from(guestIdentities)).toEqual([])
  expect(await h.db.select().from(claims)).toEqual([])
  expect(h.jar.size).toBe(0)
})

test('con el id de un invitado (sin su firma) no se puede hacer pasar por él', async () => {
  const { item } = await preparar()
  expect(await reserveAction(null, form({ token: 'tok-euge', itemId: item.id, nombre: 'Abuela' }))).toBeNull()
  const [c] = await h.db.select().from(claims)
  expect(c.claimerGuestId).not.toBeNull()

  // otro navegador con la cookie vieja (el id pelado) de la abuela
  h.jar.set(GUEST_COOKIE, c.claimerGuestId!)
  expect(await getViewer()).toEqual({})
  await releaseAction(form({ token: 'tok-euge', itemId: item.id, claimId: c.id }))
  const [despues] = await h.db.select().from(claims).where(eq(claims.id, c.id))
  expect(despues.estado).toBe('reservado')
})

test('"¿No sos X? Cambiar" borra la cookie de invitado y "Cerrar sesión" cierra la de Google', async () => {
  await preparar()
  await identificarseAction(null, form({ token: 'tok-euge', nombre: 'Abuelo' }))
  expect(h.jar.has(GUEST_COOKIE)).toBe(true)
  expect(await redirigeA(salirAction(form({ volver: '/l/tok-euge' })))).toBe('/l/tok-euge')
  expect(h.jar.has(GUEST_COOKIE)).toBe(false)
  expect(h.signOut).not.toHaveBeenCalled()
  expect(await getViewer()).toEqual({})

  h.session = { userId: 'u-1' }
  await redirigeA(salirAction(form({ volver: '/' })))
  expect(h.signOut).toHaveBeenCalledWith({ redirectTo: '/' })
})

test('salir y entrar con Google solo vuelven a páginas de la app', async () => {
  await preparar()
  for (const afuera of ['https://otro.com', '//otro.com', '/\\otro.com', '']) {
    expect(await redirigeA(salirAction(form({ volver: afuera })))).toBe('/')
    await entrarConGoogleAction(form({ volver: afuera }))
    expect(h.signIn).toHaveBeenLastCalledWith('google', { redirectTo: '/' })
  }
  await entrarConGoogleAction(form({ volver: '/l/tok-euge/item/123' }))
  expect(h.signIn).toHaveBeenLastCalledWith('google', { redirectTo: '/l/tok-euge/item/123' })
})
