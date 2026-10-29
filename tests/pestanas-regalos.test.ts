import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestDb } from './helpers'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'

// Mis regalos y Cuentas: lo de arriba (el encabezado, el título y las pestañas) está en el layout que comparten, así al
// pasar de una a otra no se vuelve a armar toda la pantalla (ver (regalos)/layout.tsx y PestanasRegalos).
const h = vi.hoisted(() => ({ db: undefined as unknown as Db, session: null as { userId: string } | null, path: '/regalos' }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  usePathname: () => h.path,
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))

import Layout from '@/app/(menu)/(regalos)/layout'
import MisRegalos from '@/app/(menu)/(regalos)/regalos/page'
import Cuentas from '@/app/(menu)/(regalos)/cuentas/page'

test('lo de arriba va en el layout: el título y la pestaña marcada salen de la URL, y las páginas traen solo lo suyo', async () => {
  h.db = await createTestDb()
  const ana = await upsertUserFromGoogle(h.db, { googleId: 'g-ana', email: 'ana@test.com', nombre: 'Ana' })
  h.session = { userId: ana.id }
  const arriba = async (path: string) => {
    h.path = path
    return renderToStaticMarkup(await Layout({ children: createElement('p', null, 'lo de abajo') }))
  }

  const enCuentas = await arriba('/cuentas')
  expect(enCuentas).toContain('<h1 class="gr-title">Cuentas</h1>')
  expect(enCuentas).toContain('data-columna="1"')
  expect(enCuentas).toMatch(/<a [^>]*aria-current="page"[^>]*>Cuentas<\/a>/)
  expect(enCuentas).toContain('lo de abajo')
  const enRegalos = await arriba('/regalos')
  expect(enRegalos).toContain('<h1 class="gr-title">Tus regalos</h1>')
  expect(enRegalos).toContain('data-columna="0"')
  expect(enRegalos).toMatch(/<a [^>]*aria-current="page"[^>]*>Mis regalos<\/a>/)

  // si las páginas trajeran su encabezado o las pestañas, saldrían dos veces
  for (const html of [renderToStaticMarkup(await MisRegalos()), renderToStaticMarkup(await Cuentas({ searchParams: Promise.resolve({}) }))]) {
    expect(html).not.toContain('gr-title')
    expect(html).not.toContain('Regalos y cuentas')
    expect(html).toMatch(/^<div class="gr-fundido/)
  }

  // sin sesión, a la portada
  h.session = null
  await expect(Layout({ children: null })).rejects.toMatchObject({ url: '/' })
})
