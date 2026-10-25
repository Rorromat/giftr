import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { claims, items, users } from '@/db/schema'
import { markBought, reserveItem } from '@/lib/claims'
import { cambiarLinkParaRegalar } from '@/lib/lists'

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

import {
  addItemAction, archiveItemAction, boughtAction, reserveAction, restoreItemAction, startGroupGiftAction, unboughtAction,
} from '@/app/actions'
import { CartelReserva } from '@/components/GuestGate'
import { RESERVAS_POR_LISTA } from '@/lib/types'

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
  expect(await redirigeA(addItemAction(form({ titulo: 'Mate imperial', tipo: 'exacto', repetible: 'on' })))).toMatch(/^\/mi-lista\?agregado=/)
  expect(await redirigeA(addItemAction(form({ titulo: 'Medias', tipo: 'idea', repetible: 'on' })))).toMatch(/^\/mi-lista\?agregado=/)
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

test('"Ya lo compré" dos veces no dice que la reserva había vencido: la compra salió', async () => {
  const { giver, item } = await preparar()
  const r = await reserveItem(h.db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error(r.reason)
  h.session = { userId: giver.id }
  const datos = form({ token: 'tok-euge', itemId: item.id, claimId: r.claimId })
  await boughtAction(datos)
  await boughtAction(datos) // sin redirección
  expect((await h.db.select().from(claims))[0].estado).toBe('comprado')
})

test('"Ya lo compré" sobre una vencida con el link de antes no reserva de nuevo (le pasaría el link nuevo)', async () => {
  const { owner, giver, list, item } = await preparar()
  const [vieja] = await h.db.insert(claims).values({
    itemId: item.id, claimerUserId: giver.id, estado: 'expirado', expiresAt: new Date(Date.now() - 86400_000),
  }).returning()
  const nuevo = await cambiarLinkParaRegalar(h.db, list.id, owner.id)
  h.session = { userId: giver.id }
  await boughtAction(form({ token: 'tok-euge', itemId: item.id, claimId: vieja.id }))
  expect(await h.db.select().from(claims)).toEqual([expect.objectContaining({ id: vieja.id, estado: 'expirado' })])
  // ni después con "Me equivoqué": no hay nada suyo comprado
  await unboughtAction(form({ token: 'tok-euge', itemId: item.id, claimId: vieja.id }))
  expect(await h.db.select().from(claims)).toHaveLength(1)
  // con el de ahora, sí
  await boughtAction(form({ token: nuevo!, itemId: item.id, claimId: vieja.id }))
  expect((await h.db.select().from(claims)).map((c) => c.estado).sort()).toEqual(['comprado', 'expirado'])
  expect(await markBought(h.db, vieja.id, { userId: giver.id })).toEqual({ ok: false, reason: 'no_permitido' })
})

test('con 10 reservas sin comprar en la lista, reservar otra vuelve a la misma página y explica qué hacer', async () => {
  const { giver, list } = await preparar()
  const deseos = await h.db.insert(items).values(Array.from({ length: RESERVAS_POR_LISTA + 1 }, (_, n) => ({
    listId: list.id, tipo: 'exacto' as const, titulo: `Deseo ${n}`,
  }))).returning()
  for (const d of deseos.slice(0, RESERVAS_POR_LISTA)) expect((await reserveItem(h.db, d.id, { userId: giver.id })).ok).toBe(true)
  h.session = { userId: giver.id }
  const otro = deseos[RESERVAS_POR_LISTA]
  // desde el detalle se queda en el detalle (el deseo sigue ahí), desde la lista en la lista con sus filtros
  expect(await redirigeA(reserveAction(null, form({ token: 'tok-euge', itemId: otro.id, volver: `/l/tok-euge/item/${otro.id}` }))))
    .toBe(`/l/tok-euge/item/${otro.id}?reserva=muchas`)
  expect(await redirigeA(reserveAction(null, form({ token: 'tok-euge', itemId: otro.id, volver: '/l/tok-euge?disp=1' }))))
    .toBe('/l/tok-euge?disp=1&reserva=muchas')
  const cartel = renderToStaticMarkup(createElement(CartelReserva, { motivo: 'muchas', veTodo: true, conNombre: true }))
  expect(cartel).toContain(`Ya tenés ${RESERVAS_POR_LISTA} cosas reservadas de esta lista`)
  // el link con ?reserva=muchas abierto por la dueña sin su sesión no muestra nada
  expect(renderToStaticMarkup(createElement(CartelReserva, { motivo: 'muchas', veTodo: false, conNombre: false }))).toBe('')

  // armar un regalo grupal (en el que estaría solo) tampoco: vuelve al deseo con el mismo cartel
  expect(await redirigeA(startGroupGiftAction(form({ token: 'tok-euge', itemId: otro.id })))).toBe(`/l/tok-euge/item/${otro.id}?reserva=muchas`)
  // ni "Me equivoqué" sobre una compra: volvería a ser una reserva más
  const [primera] = await h.db.select().from(claims).where(eq(claims.itemId, deseos[0].id))
  expect(await markBought(h.db, primera.id, { userId: giver.id })).toEqual({ ok: true })
  expect((await reserveItem(h.db, otro.id, { userId: giver.id })).ok).toBe(true)
  expect(await redirigeA(unboughtAction(form({ token: 'tok-euge', itemId: deseos[0].id, claimId: primera.id }))))
    .toBe(`/l/tok-euge/item/${deseos[0].id}?reserva=muchas_deshacer`)
  expect((await h.db.select().from(claims).where(eq(claims.id, primera.id)))[0].estado).toBe('comprado')
  expect(renderToStaticMarkup(createElement(CartelReserva, { motivo: 'muchas_deshacer', veTodo: true, conNombre: true })))
    .toContain('Para que esta vuelva a quedar reservada')
  expect(renderToStaticMarkup(createElement(CartelReserva, { motivo: 'muchas_deshacer', veTodo: false, conNombre: false }))).toBe('')
})
