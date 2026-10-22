import { expect, test, vi } from 'vitest'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { eq } from 'drizzle-orm'
import { claims, guestIdentities, items, lists, users } from '@/db/schema'
import { CUENTAS_COOKIE, firmarInvitado, GUEST_COOKIE, leerCuentas, sumarCuenta } from '@/lib/cookie-invitado'
import { createGuest } from '@/lib/guest'
import { reserveItem } from '@/lib/claims'

// El callback de Auth.js al entrar con Google, con la base en PGlite y las cookies del route handler simuladas.
type Jwt = (p: { token: Record<string, unknown>; account?: object; profile?: object }) => Promise<Record<string, unknown>>
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  jar: new Map<string, string>(),
  jwt: undefined as unknown as Jwt,
  romperCookies: false,
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('next/headers', () => ({
  cookies: async () => {
    if (h.romperCookies) throw new Error('cookies() fuera de un route handler')
    return {
      get: (k: string) => (h.jar.has(k) ? { name: k, value: h.jar.get(k)! } : undefined),
      set: (k: string, v: string) => { h.jar.set(k, v) },
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

test('al entrar con Google queda anotado que esa cuenta usó el navegador (sin olvidar las de antes)', async () => {
  const { ana } = await preparar()
  const antes = '8a1f3c2e-0000-4000-8000-000000000000'
  h.jar.set(CUENTAS_COOKIE, sumarCuenta(undefined, antes))
  h.jar.set(GUEST_COOKIE, firmarInvitado(ana.id))
  const token = await entrar()
  expect(leerCuentas(h.jar.get(CUENTAS_COOKIE))).toEqual([antes, token.userId])
  // el invitado sigue ahí, pero en las listas de esa cuenta ya no va a ver nada (ver accesoALista)
  expect(h.jar.get(GUEST_COOKIE)).toBe(firmarInvitado(ana.id))
})

test('si no se pueden anotar las cookies, se entra igual', async () => {
  await preparar()
  h.romperCookies = true
  try {
    expect((await entrar()).userId).toEqual(expect.any(String))
  } finally {
    h.romperCookies = false
  }
})

test('una sesión que ya existía (sin account) no toca cookies ni invitados', async () => {
  const { ana } = await preparar()
  h.jar.set(GUEST_COOKIE, firmarInvitado(ana.id))
  expect(await h.jwt({ token: { userId: 'u-1' } })).toEqual({ userId: 'u-1' })
  expect([...h.jar.keys()]).toEqual([GUEST_COOKIE])
})

test('un email que ya tenía otra cuenta de Google no traba el login ni la une a esa; si cambia en Google, se pone al día', async () => {
  await preparar()
  const conGoogle = (sub: string, email: string) =>
    h.jwt({ token: {}, account: { provider: 'google' }, profile: { sub, email, name: 'Ana' } })
  const vieja = await conGoogle('g-ana-vieja', 'ana@empresa.com')
  const [listaVieja] = await h.db.select().from(lists).where(eq(lists.ownerId, vieja.userId as string))
  const [deEuge] = await h.db.select({ listId: items.listId }).from(items)
  const [mate] = await h.db.insert(items).values({ listId: deEuge.listId, tipo: 'exacto', titulo: 'Mate' }).returning()
  expect((await reserveItem(h.db, mate.id, { userId: vieja.userId as string })).ok).toBe(true)

  // la cuenta de trabajo se borró y se volvió a crear, o la dirección pasó a otra persona: otro sub, el mismo email
  const nueva = await conGoogle('g-ana-nueva', 'ana@empresa.com')
  expect(nueva.userId).toEqual(expect.any(String))
  expect(nueva.userId).not.toBe(vieja.userId)
  // entra como alguien nuevo, con su propia lista: la de la otra cuenta y su reserva siguen siendo de la otra
  const [listaNueva] = await h.db.select().from(lists).where(eq(lists.ownerId, nueva.userId as string))
  expect(listaNueva.id).not.toBe(listaVieja.id)
  expect(await h.db.select({ id: claims.id }).from(claims).where(eq(claims.claimerUserId, nueva.userId as string))).toEqual([])
  expect(await h.db.select({ id: claims.id }).from(claims).where(eq(claims.claimerUserId, vieja.userId as string))).toHaveLength(1)
  // y vuelve a entrar sin problema
  expect((await conGoogle('g-ana-nueva', 'ana@empresa.com')).userId).toBe(nueva.userId)

  // la cuenta vieja cambia su email en Google: es la misma cuenta, con el email de ahora
  expect((await conGoogle('g-ana-vieja', 'ana.perez@empresa.com')).userId).toBe(vieja.userId)
  const [u] = await h.db.select().from(users).where(eq(users.id, vieja.userId as string))
  expect(u.email).toBe('ana.perez@empresa.com')
})
