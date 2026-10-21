import { expect, test, vi } from 'vitest'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { claims, guestIdentities, items } from '@/db/schema'
import { firmarInvitado, GUEST_COOKIE } from '@/lib/cookie-invitado'
import { createGuest } from '@/lib/guest'
import { reserveItem } from '@/lib/claims'

// El callback de Auth.js al entrar con Google, con la base en PGlite y las cookies del route handler simuladas.
type Jwt = (p: { token: Record<string, unknown>; account?: object; profile?: object }) => Promise<Record<string, unknown>>
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  jar: new Map<string, string>(),
  cookiesFallan: false,
  jwt: undefined as unknown as Jwt,
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('next/headers', () => ({
  cookies: async () => {
    if (h.cookiesFallan) throw new Error('sin cookies')
    return {
      get: (k: string) => (h.jar.has(k) ? { name: k, value: h.jar.get(k)! } : undefined),
      delete: (k: string) => { h.jar.delete(k) },
    }
  },
}))
vi.mock('next-auth/providers/google', () => ({ default: (opciones: object) => ({ id: 'google', opciones }) }))
vi.mock('next-auth', () => ({
  default: (config: { callbacks: { jwt: Jwt } }) => {
    h.jwt = config.callbacks.jwt
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }
  },
}))

await import('@/auth')

async function preparar() {
  h.db = await createTestDb()
  h.jar.clear()
  h.cookiesFallan = false
  const { list } = await seedOwnerAndGiver(h.db)
  const [termo] = await h.db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  const ana = await createGuest(h.db, 'Ana')
  const r = await reserveItem(h.db, termo.id, { guestId: ana.id })
  if (!r.ok) throw new Error(r.reason)
  return { ana }
}

const entrar = () => h.jwt({ token: {}, account: { provider: 'google' }, profile: { sub: 'g-ana', email: 'ana@test.com', name: 'Ana' } })

test('al entrar con Google en el navegador del invitado, se une a la cuenta y se borra su cookie', async () => {
  const { ana } = await preparar()
  h.jar.set(GUEST_COOKIE, firmarInvitado(ana.id))
  const token = await entrar()
  expect(token.userId).toEqual(expect.any(String))
  const [c] = await h.db.select().from(claims)
  expect(c).toMatchObject({ claimerUserId: token.userId, claimerGuestId: null })
  const [g] = await h.db.select().from(guestIdentities)
  expect(g.promotedToUserId).toBe(token.userId)
  expect(h.jar.has(GUEST_COOKIE)).toBe(false)
})

test('una cookie vieja sin firmar no une nada (y se borra)', async () => {
  const { ana } = await preparar()
  h.jar.set(GUEST_COOKIE, ana.id)
  await entrar()
  const [c] = await h.db.select().from(claims)
  expect(c).toMatchObject({ claimerGuestId: ana.id, claimerUserId: null })
  expect(h.jar.has(GUEST_COOKIE)).toBe(false)
})

test('si unir al invitado falla, igual entra', async () => {
  const { ana } = await preparar()
  h.cookiesFallan = true
  const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
  const token = await entrar()
  expect(token.userId).toEqual(expect.any(String))
  expect(errores).toHaveBeenCalled()
  errores.mockRestore()
  const [c] = await h.db.select().from(claims)
  expect(c.claimerGuestId).toBe(ana.id)
})

test('una sesión que ya existía (sin account) no toca cookies ni invitados', async () => {
  const { ana } = await preparar()
  h.jar.set(GUEST_COOKIE, firmarInvitado(ana.id))
  expect(await h.jwt({ token: { userId: 'u-1' } })).toEqual({ userId: 'u-1' })
  expect(h.jar.has(GUEST_COOKIE)).toBe(true)
})
