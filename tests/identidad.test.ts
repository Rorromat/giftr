import { expect, test, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { claims, guestIdentities, items, lists } from '@/db/schema'
import { firmarInvitado, GUEST_COOKIE, NO_SOY_COOKIE } from '@/lib/cookie-invitado'
import { reserveItem } from '@/lib/claims'

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

import {
  codazoAction, entrarConGoogleAction, identificarseAction, noSoyElInvitadoAction, releaseAction, reserveAction, salirAction,
  unirInvitadoAction,
} from '@/app/actions'
import { getViewer, invitadoParaPreguntar } from '@/lib/viewer'
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
  await salirAction(form({ volver: '/' }))
  expect(h.signOut).toHaveBeenCalledWith({ redirectTo: '/' })
})

test('si la reserva no sale, vuelve a la página con el motivo (el nombre ya quedó anotado)', async () => {
  const { giver, item: termo, list } = await preparar()
  // Rodri ya compró el Termo; la abuela abre el link sin identificarse y lo ve como cualquier otro deseo
  const r = await reserveItem(h.db, termo.id, { userId: giver.id })
  if (!r.ok) throw new Error(r.reason)
  await h.db.update(claims).set({ estado: 'comprado' })
  expect(await redirigeA(reserveAction(null, form({ token: 'tok-euge', itemId: termo.id, nombre: 'Abuela' }))))
    .toBe('/l/tok-euge?reserva=sin_stock')
  const [abuela] = await h.db.select().from(guestIdentities)
  expect(await getViewer()).toEqual({ guestId: abuela.id })
  expect(await h.db.select().from(claims)).toHaveLength(1)

  // desde el detalle vuelve al detalle; si el deseo ya no está, a la lista
  expect(await redirigeA(reserveAction(null, form({ token: 'tok-euge', itemId: termo.id, desde: 'detalle' }))))
    .toBe(`/l/tok-euge/item/${termo.id}?reserva=sin_stock`)
  const [velas] = await h.db.insert(items).values({ listId: list.id, tipo: 'idea', titulo: 'Velas', estadoDueno: 'lo_tengo' }).returning()
  expect(await redirigeA(reserveAction(null, form({ token: 'tok-euge', itemId: velas.id, desde: 'detalle' }))))
    .toBe('/l/tok-euge?reserva=archivado')

  // la que sale no redirige
  const [mate] = await h.db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Mate' }).returning()
  expect(await reserveAction(null, form({ token: 'tok-euge', itemId: mate.id }))).toBeNull()
  expect(await h.db.select().from(claims).where(eq(claims.claimerGuestId, abuela.id))).toHaveLength(1)
})

test('con sesión en un navegador con un invitado se pregunta "¿Sos vos?" y solo se une si dice que sí', async () => {
  const { giver, item } = await preparar()
  await reserveAction(null, form({ token: 'tok-euge', itemId: item.id, nombre: 'Rodri' }))
  const [g] = await h.db.select().from(guestIdentities)

  // entra con Google ("Me sumo"): todavía no pasa nada, se le pregunta
  h.session = { userId: giver.id }
  expect(await invitadoParaPreguntar(giver.id)).toBe('Rodri')
  expect((await h.db.select().from(claims))[0].claimerGuestId).toBe(g.id)

  await unirInvitadoAction()
  const [c] = await h.db.select().from(claims)
  expect(c).toMatchObject({ claimerUserId: giver.id, claimerGuestId: null })
  expect(h.jar.has(GUEST_COOKIE)).toBe(false)
  expect(await invitadoParaPreguntar(giver.id)).toBeNull()
})

test('"No soy yo": lo del invitado queda como estaba, no se le pregunta más a esa cuenta y al salir vuelve a ser él', async () => {
  const { owner, giver, item } = await preparar()
  // Mamá, como invitada en la tablet de la casa, reserva el Termo de Euge
  await reserveAction(null, form({ token: 'tok-euge', itemId: item.id, nombre: 'Mamá' }))
  const [mama] = await h.db.select().from(guestIdentities)
  const cookieDeMama = h.jar.get(GUEST_COOKIE)

  // A Euge se le pregunta igual que a cualquiera (no importa qué reservó Mamá ni dónde): no le cuenta nada
  h.session = { userId: owner.id }
  expect(await invitadoParaPreguntar(owner.id)).toBe('Mamá')
  const [deRodri] = await h.db.insert(lists).values({ ownerId: giver.id, shareToken: 'tok-rodri' }).returning()
  const [mate] = await h.db.insert(items).values({ listId: deRodri.id, tipo: 'exacto', titulo: 'Mate' }).returning()
  await h.db.delete(claims)
  await reserveItem(h.db, mate.id, { guestId: mama.id })
  expect(await invitadoParaPreguntar(owner.id)).toBe('Mamá')

  await noSoyElInvitadoAction()
  expect(await invitadoParaPreguntar(owner.id)).toBeNull()
  // a otra cuenta en el mismo navegador sí se le pregunta
  expect(await invitadoParaPreguntar(giver.id)).toBe('Mamá')
  const [c] = await h.db.select().from(claims)
  expect(c).toMatchObject({ claimerGuestId: mama.id, claimerUserId: null })
  expect(h.jar.get(GUEST_COOKIE)).toBe(cookieDeMama)

  // Euge cierra sesión: la tablet vuelve a ser de Mamá, que sigue manejando su reserva
  await salirAction(form({ volver: '/' }))
  expect(h.signOut).toHaveBeenCalled()
  h.session = null
  expect(await getViewer()).toEqual({ guestId: mama.id })
  expect(h.jar.has(NO_SOY_COOKIE)).toBe(true)
  // y "¿No sos Mamá? Cambiar" borra todo
  await redirigeA(salirAction(form({ volver: '/' })))
  expect(h.jar.size).toBe(0)
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
