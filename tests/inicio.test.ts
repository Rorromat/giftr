import { expect, test, vi } from 'vitest'
import { createElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { saltearBienvenida } from '@/lib/bienvenida'
import { pedirAmistad } from '@/lib/amigos'
import { upsertUserFromGoogle } from '@/lib/users'

// Inicio es lo primero al entrar: con la base en PGlite y la sesión, las cookies y las redirecciones de Next simuladas.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  session: null as { userId: string } | null,
  cookies: new Map<string, string>(),
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (h.cookies.has(n) ? { value: h.cookies.get(n)! } : undefined),
    set: (n: string, v: string) => { h.cookies.set(n, v) },
    delete: (n: string) => { h.cookies.delete(n) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))

import Inicio from '@/app/(menu)/inicio/page'
import Gente from '@/app/(menu)/gente/page'
import Home from '@/app/page'
import { noSugerirAction } from '@/app/actions'
import { SugerenciaAmigo } from '@/components/Sugerencias'
import { SectionHeader } from '@/components/ui'
import { Portada } from '@/components/Portada'

type Props = { id?: string; p?: { nombre: string }; enComun?: string; href?: string; children?: ReactNode }

/** Los elementos de la pantalla, en orden, sin renderizar (las partes async, como los carteles, no se renderizan acá). */
function elementos(nodo: ReactNode): { type: unknown; props: Props }[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (!isValidElement<Props>(nodo)) return []
  return [{ type: nodo.type, props: nodo.props }, ...elementos(nodo.props.children)]
}

const sugeridos = (pantalla: ReactNode) => elementos(pantalla).filter((e) => e.type === SugerenciaAmigo).map((e) => `${e.props.p!.nombre} (${e.props.enComun})`)

const usuario = (nombre: string) => upsertUserFromGoogle(h.db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
/** Amigos sin pasar por la solicitud (los dos la mandan). */
const amigos = async (a: string, b: string) => { await pedirAmistad(h.db, a, b); await pedirAmistad(h.db, b, a) }

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

test('gente que quizás conocés: la primera en Inicio, con Ver más a Tu gente, donde van arriba; "Ahora no" la saca', async () => {
  h.db = await createTestDb()
  h.cookies.clear()
  const [yo, sofi, juan, ana, beto] = await Promise.all(['Yo', 'Sofi', 'Juan', 'Ana', 'Beto'].map(usuario))
  await saltearBienvenida(h.db, yo.id)
  await amigos(yo.id, sofi.id)
  await amigos(yo.id, juan.id)
  for (const o of [sofi, juan]) await amigos(o.id, ana.id)
  await amigos(sofi.id, beto.id)
  h.session = { userId: yo.id }
  const inicio = () => Inicio({ searchParams: Promise.resolve({}) })
  const gente = () => Gente({ searchParams: Promise.resolve({}) })
  const verMas = async () => elementos(await inicio()).find((e) => e.type === SectionHeader && e.props.id === 'quizas-conoces')?.props.href

  expect(sugeridos(await inicio())).toEqual(['Ana (Juan y Sofi)'])
  expect(await verMas()).toBe('/gente#sugerencias')
  // en Tu gente, todas (hasta 3) y antes que tu gente
  const enGente = elementos(await gente())
  expect(sugeridos(await gente())).toEqual(['Ana (Juan y Sofi)', 'Beto (Sofi)'])
  const [arriba, tuGente] = ['sugerencias', 'mi-gente'].map((id) => enGente.findIndex((e) => e.props.id === id))
  expect(arriba).toBeGreaterThan(-1)
  expect(arriba).toBeLessThan(tuGente)

  // "Ahora no" a Ana: queda Beto, sin Ver más; un id que no es de nadie o sin sesión, no anota nada
  const form = (para: string) => { const fd = new FormData(); fd.set('para', para); return fd }
  await noSugerirAction(form(ana.id))
  expect(sugeridos(await inicio())).toEqual(['Beto (Sofi)'])
  expect(await verMas()).toBeUndefined()
  expect(sugeridos(await gente())).toEqual(['Beto (Sofi)'])
  const antes = new Map(h.cookies)
  await noSugerirAction(form('cualquier-cosa'))
  h.session = null
  await noSugerirAction(form(beto.id))
  expect(h.cookies).toEqual(antes)

  // a otra cuenta en el mismo navegador sí se le sugiere Ana
  await saltearBienvenida(h.db, beto.id)
  h.session = { userId: beto.id }
  expect(sugeridos(await inicio())).toEqual(['Ana (Sofi)'])
})

test('la portada: una carta por función, arriba la primera, con las flechas y un puntito por carta para pasar a mano', () => {
  const html = renderToStaticMarkup(createElement(Portada))
  expect(html.startsWith('<section aria-label="Lo que hace GiftR"')).toBe(true)
  // arriba la primera, abajo la que sigue, la última "volada" (de ahí vuelve si van para atrás) y el resto escondidas
  expect([...html.matchAll(/data-lugar="(\w+)"/g)].map((m) => m[1])).toEqual(['arriba', 'abajo', 'escondida', 'escondida', 'fuera'])
  for (const titulo of ['Armá tu lista', 'Te lo regalan en secreto', 'Lo pagan entre todos', 'Amigo invisible sin papelitos', 'Cumples con tiempo']) {
    expect(html).toContain(`>${titulo}</p>`)
  }
  for (const nombre of ['Anterior', 'Siguiente', 'Tu lista', 'En secreto', 'Entre todos', 'Amigo invisible', 'Cumples']) {
    expect(html).toContain(`aria-label="${nombre}"`)
  }
  expect(html.match(/aria-current="true"/g)).toHaveLength(1)
  expect(html).toContain('aria-label="Tu lista" aria-current="true"')
  expect(html.match(/class="gr-sello gr-portada__sello /g)).toHaveLength(1)
})
