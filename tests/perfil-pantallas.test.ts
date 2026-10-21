import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { lists, users } from '@/db/schema'
import { guardarCumple, miCumple } from '@/lib/events'
import { guardarGustos, misGustos } from '@/lib/bienvenida'
import { sanitizarGustos } from '@/lib/gustos'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { CumpleCampos } from '@/components/CumpleCampos'

// Perfil, la bienvenida y el perfil público tal cual, con la base en PGlite y la sesión y las redirecciones de Next
// simuladas.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  session: null as { userId: string; user?: { name: string } } | null,
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))

import { saveBirthdayAction, saveGustosAction } from '@/app/actions'
import Listo from '@/app/bienvenida/listo/page'
import PerfilPublico from '@/app/l/[token]/perfil/page'

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

/** A dónde redirige (null si no redirige). */
async function redirige(p: Promise<unknown>): Promise<string | null> {
  try { await p } catch (e) { return (e as { url: string }).url }
  return null
}

async function preparar() {
  h.db = await createTestDb()
  const seed = await seedOwnerAndGiver(h.db)
  h.session = { userId: seed.owner.id, user: { name: 'Euge' } }
  return seed
}

const html = async (p: Promise<React.ReactNode>) => renderToStaticMarkup(await p as React.ReactElement)

test('Tu cumple en Perfil: se borra solo con "Quitar"; vacío, a medias o imposible vuelve con el aviso y no toca lo guardado', async () => {
  const { owner } = await preparar()
  expect(await redirige(saveBirthdayAction(form({ dia: '12', mes: '10' })))).toBeNull()
  expect(await miCumple(h.db, owner.id)).toEqual({ dia: 12, mes: 10 })
  // el segundo "Guardar" con los selects vueltos a vacío ya no lo borra
  for (const campos of [{ dia: '', mes: '' }, { dia: '15', mes: '' }, { dia: '', mes: '3' }, { dia: '30', mes: '2' }]) {
    expect(await redirige(saveBirthdayAction(form(campos)))).toBe('/perfil?cumple=invalido#cumple')
  }
  expect(await miCumple(h.db, owner.id)).toEqual({ dia: 12, mes: 10 })
  // con el aviso arriba, guardar bien lo saca
  expect(await redirige(saveBirthdayAction(form({ dia: '29', mes: '2', conAviso: '1' })))).toBe('/perfil#cumple')
  expect(await miCumple(h.db, owner.id)).toEqual({ dia: 29, mes: 2 })
  expect(await redirige(saveBirthdayAction(form({ dia: '', mes: '', quitar: '1' })))).toBeNull()
  expect(await miCumple(h.db, owner.id)).toBeNull()
})

test('bienvenida: un cumple a medias no se pierde en silencio: se guardan los gustos y vuelve al primer paso con el aviso', async () => {
  const { owner } = await preparar()
  await guardarCumple(h.db, owner.id, 3, 4)
  expect(await redirige(saveGustosAction(form({ deportes: 'Pádel', dia: '15', mes: '' })))).toBe('/bienvenida?paso=0&cumple=invalido')
  expect((await misGustos(h.db, owner.id))?.deportes).toEqual(['Pádel'])
  expect(await miCumple(h.db, owner.id)).toEqual({ dia: 3, mes: 4 })
  expect(await redirige(saveGustosAction(form({ dia: '31', mes: '4', volver: 'perfil', corte: '1' })))).toBe('/bienvenida?editar=1&paso=0&cumple=invalido')
  // los dos vacíos es que lo sacó (los campos vienen con el guardado)
  expect(await redirige(saveGustosAction(form({ dia: '', mes: '' })))).toBe('/bienvenida/listo')
  expect(await miCumple(h.db, owner.id)).toBeNull()
})

test('los días del cumple son los del mes elegido (29 en febrero)', () => {
  const opciones = (mes?: number) => (renderToStaticMarkup(createElement(CumpleCampos, { mes })).match(/<option value="\d+"/g) ?? []).length
  expect(opciones(2)).toBe(29 + 12)
  expect(opciones(4)).toBe(30 + 12)
  expect(opciones()).toBe(31 + 12)
  expect(renderToStaticMarkup(createElement(CumpleCampos, { exigir: true }))).toContain('required')
})

test('"¡Todo listo!" la primera vez: completar un paso sigue en la bienvenida, no pasa al modo de Perfil', async () => {
  await preparar()
  const primera = await html(Listo({ searchParams: Promise.resolve({}) }))
  expect(primera).toContain('href="/bienvenida?paso=1"')
  expect(primera).not.toContain('editar=1')
  expect(primera).toContain('Agregar mi primer deseo')
  const desdePerfil = await html(Listo({ searchParams: Promise.resolve({ desde: 'perfil' }) }))
  expect(desdePerfil).toContain('href="/bienvenida?editar=1&amp;paso=1"')
  expect(desdePerfil).toContain('Volver a Perfil')
})

test('perfil público: con talles o "lo que no" pero sin gustos, no dice que no cargó nada', async () => {
  const { owner, list } = await preparar()
  await guardarGustos(h.db, owner.id, sanitizarGustos({ talles: { remera: 'M' }, noRegalar: ['Perfumes'] }))
  h.session = null
  const ver = () => html(PerfilPublico({ params: Promise.resolve({ token: list.shareToken }), searchParams: Promise.resolve({}) }))
  let p = await ver()
  expect(p).not.toContain('todavía no cargó')
  expect(p).toContain('Perfumes')
  expect(p).not.toContain('Lo que le gusta')
  // sin nada de nada, sí
  await h.db.update(users).set({ gustos: null }).where(eq(users.id, owner.id))
  p = await ver()
  expect(p).toContain('Euge todavía no cargó sus gustos.')
})

test('perfil público visto por su dueño: no promete "ver mi lista como la ven", vuelve a su lista o a su grupo', async () => {
  const { owner, giver, list } = await preparar()
  const ver = (token: string, quien?: string) =>
    html(PerfilPublico({ params: Promise.resolve({ token }), searchParams: Promise.resolve(quien ? { quien } : {}) }))
  let p = await ver(list.shareToken)
  expect(p).not.toContain('como la ven</')
  expect(p).toContain('href="/mi-lista"')
  expect(p).toContain('Volver a mi lista')
  expect(p).toContain('href="/perfil"')

  // un co-dueño del grupo que mira el perfil del otro: al grupo
  const grupoId = await crearGrupo(h.db, owner.id, { nombre: 'Nuestra casa' })
  const [grupo] = await h.db.select().from(lists).where(eq(lists.id, grupoId))
  await unirseAGrupo(h.db, grupo.inviteToken!, giver.id)
  h.session = { userId: giver.id }
  p = await ver(grupo.shareToken, owner.id)
  expect(p).toContain(`href="/grupos/${grupoId}"`)
  expect(p).toContain('Volver al grupo')

  // el que regala, a la lista
  h.session = null
  p = await ver(list.shareToken)
  expect(p).toContain(`href="/l/${list.shareToken}"`)
  expect(p).toContain('Ver la lista de Euge')
})
