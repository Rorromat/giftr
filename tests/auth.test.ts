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
  jwt: undefined as unknown as Jwt,
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (h.jar.has(k) ? { name: k, value: h.jar.get(k)! } : undefined),
    delete: (k: string) => { h.jar.delete(k) },
  }),
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
  const { list } = await seedOwnerAndGiver(h.db)
  const [termo] = await h.db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  const ana = await createGuest(h.db, 'Ana')
  const r = await reserveItem(h.db, termo.id, { guestId: ana.id })
  if (!r.ok) throw new Error(r.reason)
  return { ana }
}

const entrar = () => h.jwt({ token: {}, account: { provider: 'google' }, profile: { sub: 'g-ana', email: 'ana@test.com', name: 'Ana' } })

test('al entrar con Google no se une solo el invitado del navegador: queda como estaba hasta que diga que es él', async () => {
  const { ana } = await preparar()
  h.jar.set(GUEST_COOKIE, firmarInvitado(ana.id))
  const token = await entrar()
  expect(token.userId).toEqual(expect.any(String))
  // en un dispositivo compartido puede ser otra persona: nada pasa a la cuenta ni se borra su cookie
  const [c] = await h.db.select().from(claims)
  expect(c).toMatchObject({ claimerGuestId: ana.id, claimerUserId: null })
  const [g] = await h.db.select().from(guestIdentities)
  expect(g.promotedToUserId).toBeNull()
  expect(h.jar.get(GUEST_COOKIE)).toBe(firmarInvitado(ana.id))
})

test('una sesión que ya existía (sin account) no toca cookies ni invitados', async () => {
  const { ana } = await preparar()
  h.jar.set(GUEST_COOKIE, firmarInvitado(ana.id))
  expect(await h.jwt({ token: { userId: 'u-1' } })).toEqual({ userId: 'u-1' })
  expect(h.jar.has(GUEST_COOKIE)).toBe(true)
})
