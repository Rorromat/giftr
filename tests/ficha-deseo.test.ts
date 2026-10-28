import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { items } from '@/db/schema'
import { reserveItem } from '@/lib/claims'
import { sitioDeLaTienda } from '@/lib/links'

// La ficha del deseo: quien lo abre ve todo lo que cargó el dueño (la categoría, cuánto lo quiere, si sirve algo
// parecido, cuántos pide, su nota y de qué tienda es), y el dueño lo mismo con sus palabras.
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

import DetalleItem from '@/app/l/[token]/item/[itemId]/page'
import Deseo from '@/app/(menu)/deseo/[id]/page'

const deQuienRegala = async (itemId: string) =>
  renderToStaticMarkup(await DetalleItem({ params: Promise.resolve({ token: 'tok-euge', itemId }), searchParams: Promise.resolve({}) }))
const delDueno = async (id: string) => renderToStaticMarkup(await Deseo({ params: Promise.resolve({ id }) }))

test('quien regala ve la categoría, cuánto lo quiere, si tiene que ser este, cuántos quedan, la nota y la tienda', async () => {
  h.db = await createTestDb()
  const { owner, giver, list } = await seedOwnerAndGiver(h.db)
  const [auris, mate] = await h.db.insert(items).values([
    { listId: list.id, tipo: 'exacto', titulo: 'Auriculares', prioridad: 'mucho', categoria: 'Tecnología', cantidad: 2,
      notas: 'Los negros', linkTienda: 'https://articulo.mercadolibre.com.ar/MLA-1-auris' },
    { listId: list.id, tipo: 'idea', repetible: true, titulo: 'Un mate', prioridad: 'suelta', linkTienda: 'https://www.mates.com.ar/p/1' },
  ]).returning()
  await reserveItem(h.db, auris.id, { userId: giver.id })
  h.session = { userId: giver.id }

  const a = await deQuienRegala(auris.id)
  for (const texto of ['Lista de Euge', 'Tecnología', 'Lo quiere mucho', 'Este mismo', 'Pide 2', 'Quedan 1', 'Euge dice', 'Los negros', 'Ver en Mercado Libre']) {
    expect(a).toContain(texto)
  }
  const m = await deQuienRegala(mate.id)
  for (const texto of ['Idea suelta', 'Le sirve algo parecido', 'Se puede repetir', 'Ver en mates.com.ar']) expect(m).toContain(texto)
  expect(m).not.toContain('Euge dice')

  // el dueño, lo mismo con sus palabras (y nada de quién reservó)
  h.session = { userId: owner.id }
  const propio = await delDueno(auris.id)
  for (const texto of ['Tecnología', 'Lo quiero mucho', 'Este mismo', 'Quiero 2', 'Tu nota', 'Los negros']) expect(propio).toContain(texto)
  expect(propio).not.toContain('Quedan')
  expect(await delDueno(mate.id)).toContain('Me sirve algo parecido')
})

test('la tienda del botón: el sitio sin www, MercadoLibre por su nombre; un link que no se lee, ninguna', () => {
  expect(sitioDeLaTienda('https://www.zara.com/ar/es/remera-p1.html')).toBe('zara.com')
  expect(sitioDeLaTienda('https://articulo.mercadolibre.com.ar/MLA-123')).toBe('Mercado Libre')
  expect(sitioDeLaTienda('https://meli.la/abc')).toBe('Mercado Libre')
  expect(sitioDeLaTienda('https://m.tiendamia.com/p/1')).toBe('tiendamia.com')
  expect(sitioDeLaTienda('no es un link')).toBeNull()
})
