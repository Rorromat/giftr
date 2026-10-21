import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { items } from '@/db/schema'
import { getItemForViewer } from '@/lib/lists'
import { releaseClaim, reserveItem } from '@/lib/claims'
import { iniciarRegaloGrupal } from '@/lib/regalos'
import { itemParaCompartir } from '@/lib/compartir'

// Un id que no es UUID (un link cortado de WhatsApp, un formulario armado a mano) da 404 o no hace nada, nunca un error
// de la base. Con la base en PGlite y la sesión y las redirecciones de Next simuladas.
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
  notFound: () => { throw Object.assign(new Error('NEXT_NOT_FOUND'), { notFound: true }) },
}))

import {
  boughtAction, commentAction, joinGroupGiftAction, releaseAction, reserveAction, startGroupGiftAction, unboughtAction,
} from '@/app/actions'
import DetalleItem from '@/app/l/[token]/item/[itemId]/page'
import { Codazo } from '@/components/Codazo'
import NoEncontrado from '@/app/not-found'
import ErrorDePantalla from '@/app/error'

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

async function preparar() {
  h.db = await createTestDb()
  const seed = await seedOwnerAndGiver(h.db)
  const [item] = await h.db.insert(items).values({ listId: seed.list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  return { ...seed, item }
}

const RAROS = ['abc', '3f2a1c', '1234-5678', "x' or 1=1 --", '']

test('el detalle de un deseo con un id que no es UUID: null (y la página, 404), no un error de la base', async () => {
  const { giver, list } = await preparar()
  for (const id of RAROS) {
    expect(await getItemForViewer(h.db, list.shareToken, id, {})).toBeNull()
    expect(await getItemForViewer(h.db, list.shareToken, id, { userId: giver.id })).toBeNull()
    expect(await itemParaCompartir(h.db, list.shareToken, id)).toBeNull()
  }
  h.session = { userId: giver.id }
  await expect(DetalleItem({ params: Promise.resolve({ token: list.shareToken, itemId: 'abc' }), searchParams: Promise.resolve({}) }))
    .rejects.toMatchObject({ notFound: true })
})

test('reservar, liberar y armar un regalo con ids que no son UUID devuelven que no, sin error', async () => {
  const { giver } = await preparar()
  for (const id of RAROS) {
    expect(await reserveItem(h.db, id, { userId: giver.id })).toEqual({ ok: false, reason: 'no_existe' })
    expect(await releaseClaim(h.db, id, { userId: giver.id })).toBe(false)
    expect(await iniciarRegaloGrupal(h.db, id, giver.id)).toEqual({ ok: false, reason: 'no_existe' })
  }
})

test('las acciones de una lista con ids armados a mano no hacen nada (ni un error)', async () => {
  const { giver, list, item } = await preparar()
  h.session = { userId: giver.id }
  const token = list.shareToken
  for (const id of RAROS) {
    await expect(reserveAction(null, form({ token, itemId: id }))).resolves.toBeNull()
    await expect(commentAction(form({ token, itemId: id, texto: 'hola' }))).resolves.toBeUndefined()
    await expect(startGroupGiftAction(form({ token, itemId: id }))).resolves.toBeUndefined()
    await expect(releaseAction(form({ token, itemId: item.id, claimId: id }))).resolves.toBeUndefined()
    await expect(boughtAction(form({ token, itemId: id, claimId: id }))).resolves.toBeUndefined()
    await expect(unboughtAction(form({ token, itemId: item.id, claimId: id }))).resolves.toBeUndefined()
    await expect(joinGroupGiftAction(form({ token, itemId: item.id, giftId: id }))).resolves.toBeUndefined()
  }
  // sin los campos, tampoco
  await expect(releaseAction(form({}))).resolves.toBeUndefined()
  await expect(commentAction(form({}))).resolves.toBeUndefined()
})

test('?codazo= solo muestra los mensajes propios: __proto__, valueOf o toString no tiran abajo la lista', () => {
  const render = (resultado?: string) => renderToStaticMarkup(createElement(Codazo, { token: 'tok', para: 'Euge', plural: false, identified: true, resultado }))
  for (const raro of ['__proto__', 'valueOf', 'toString', 'constructor', 'hasOwnProperty', 'no_existe']) {
    const html = render(raro)
    expect(html, raro).not.toContain('role="status"')
    expect(html).not.toContain('[object')
  }
  expect(render('avisado')).toContain('¡Codazo enviado! A Euge le llegó un aviso.')
})

test('las pantallas de 404 y de error, en castellano y con salida al inicio', () => {
  const noEsta = renderToStaticMarkup(createElement(NoEncontrado))
  expect(noEsta).toContain('Esto no está')
  expect(noEsta).toContain('href="/"')
  const error = renderToStaticMarkup(createElement(ErrorDePantalla, { error: new Error('se cortó la base'), retry: () => {} }))
  expect(error).toContain('Probar de nuevo')
  expect(error).toContain('href="/"')
  // nunca muestra el detalle del error
  expect(error).not.toContain('se cortó la base')
})
