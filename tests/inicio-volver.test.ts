import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'

// La portada con ?volver=: lo compartido desde otra app sin sesión (ver /agregar) vuelve ahí después de entrar con Google.
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

import Home from '@/app/page'

const ML = 'https://articulo.mercadolibre.com.ar/MLA-1418506688-mate-imperial-de-calabaza-_JM'
const VUELTA = `/agregar?link=${encodeURIComponent(ML)}&foto=no`
const LINEA = 'Entrá y lo sumamos a tu lista.'

const portada = async (volver?: string | string[]) =>
  renderToStaticMarkup(await Home({ searchParams: Promise.resolve(volver === undefined ? {} : { volver }) }))

/** A dónde redirige (null si no redirige). */
async function redirige(volver?: string): Promise<string | null> {
  try { await Home({ searchParams: Promise.resolve(volver === undefined ? {} : { volver }) }) } catch (e) { return (e as { url: string }).url }
  return null
}

/** El valor del campo oculto volver, tal cual lo manda el formulario. */
const volverDelForm = (html: string) => /<input type="hidden" name="volver" value="([^"]*)"/.exec(html)?.[1]?.replaceAll('&amp;', '&')

test('con un volver de agregar, el formulario de entrar vuelve ahí y lo dice arriba del botón', async () => {
  h.db = await createTestDb()
  h.session = null
  const html = await portada(VUELTA)
  expect(volverDelForm(html)).toBe(VUELTA)
  expect(html).toContain(LINEA)
  expect(html.indexOf(LINEA)).toBeLessThan(html.indexOf('Entrar con Google'))
})

test('un volver que no es de agregar, o que no entra en la cookie de Auth.js, se ignora: vuelve a Inicio, sin la línea', async () => {
  h.db = await createTestDb()
  h.session = null
  const larguisima = `/agregar?link=${'a'.repeat(1500)}`
  for (const v of [undefined, '//otro.com', '/mi-lista', 'https://otro.com/agregar', '/agregar?x=<b>', [VUELTA, VUELTA], larguisima]) {
    const html = await portada(v)
    expect(volverDelForm(html), String(v).slice(0, 40)).toBe('/inicio')
    expect(html, String(v).slice(0, 40)).not.toContain(LINEA)
  }
})

test('con sesión va directo a volver (sin volver, a Inicio)', async () => {
  h.db = await createTestDb()
  const { owner } = await seedOwnerAndGiver(h.db)
  h.session = { userId: owner.id }
  expect(await redirige(VUELTA)).toBe(VUELTA)
  expect(await redirige()).toBe('/inicio')
  expect(await redirige('//otro.com')).toBe('/inicio')
})
