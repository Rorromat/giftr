import { expect, test, vi } from 'vitest'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { lists } from '@/db/schema'
import { addComment } from '@/lib/comments'
import { reserveItem } from '@/lib/claims'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { archiveItem, createItem } from '@/lib/items'

// La pantalla de un deseo propio tal cual, con la base en PGlite y la sesión y las redirecciones de Next simuladas.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  session: null as { userId: string } | null,
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))

import Deseo from '@/app/(menu)/deseo/[id]/page'
import { OwnerItemsGrid } from '@/components/OwnerItemsGrid'

const html = async (id: string) => renderToStaticMarkup(await Deseo({ params: Promise.resolve({ id }) }))

async function preparar() {
  h.db = await createTestDb()
  const seed = await seedOwnerAndGiver(h.db)
  h.session = { userId: seed.owner.id }
  const item = (await createItem(h.db, seed.owner.id, {
    tipo: 'exacto', titulo: 'Termo Stanley', notas: 'el verde', precio: '$95.000', linkTienda: 'https://tienda.com/termo',
  }))!
  return { ...seed, item }
}

test('REGLA DE LA SORPRESA: el dueño ve su deseo y lo puede editar, sin nada de reservas ni comentarios', async () => {
  const { giver, item } = await preparar()
  const r = await reserveItem(h.db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error('no reservó')
  await addComment(h.db, item.id, { userId: giver.id }, '¿de qué color lo quiere?')

  const pagina = await html(item.id)
  for (const esta of ['Termo Stanley', 'el verde', '$95.000', 'https://tienda.com/termo', `href="/editar/${item.id}"`, 'href="/mi-lista"']) {
    expect(pagina).toContain(esta)
  }
  // el link para mandarlo es el de quien regala
  expect(pagina).toContain(encodeURIComponent(`/l/tok-euge/item/${item.id}`))
  for (const palabra of ['Rodri', 'reserv', 'compr', 'color lo quiere']) expect(pagina.toLowerCase()).not.toContain(palabra.toLowerCase())
})

test('el deseo de otro, uno archivado o sin sesión no se abre; el de un grupo vuelve al grupo', async () => {
  const { owner, giver, item } = await preparar()
  h.session = { userId: giver.id }
  await expect(html(item.id)).rejects.toThrow('NEXT_NOT_FOUND')
  await expect(html('no-es-uuid')).rejects.toThrow('NEXT_NOT_FOUND')
  h.session = null
  await expect(html(item.id)).rejects.toMatchObject({ url: '/' })

  // en un grupo lo abre cualquiera de los dueños
  const grupoId = await crearGrupo(h.db, owner.id, { nombre: 'Nuestra casa' })
  const [{ inviteToken }] = await h.db.select({ inviteToken: lists.inviteToken }).from(lists).where(eq(lists.id, grupoId))
  await unirseAGrupo(h.db, inviteToken!, giver.id)
  const deGrupo = (await createItem(h.db, owner.id, { tipo: 'idea', titulo: 'Plantas' }, grupoId))!
  h.session = { userId: giver.id }
  expect(await html(deGrupo.id)).toContain(`href="/grupos/${grupoId}"`)

  h.session = { userId: owner.id }
  await archiveItem(h.db, item.id, owner.id, 'lo_tengo')
  await expect(html(item.id)).rejects.toThrow('NEXT_NOT_FOUND')
})

test('en Mi lista, cada card abre su deseo', async () => {
  const { item } = await preparar()
  const grilla = renderToStaticMarkup(createElement(Fragment, null, OwnerItemsGrid({ items: [item], shareToken: 'tok-euge' })))
  expect(grilla).toContain(`href="/deseo/${item.id}"`)
})
