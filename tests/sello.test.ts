import { expect, test, vi } from 'vitest'
import { createElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { claims, items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { markBought, reserveItem } from '@/lib/claims'
import { comprarRegalo, iniciarRegaloGrupal, sumarseARegalo } from '@/lib/regalos'

// El sello sobre lo que te toca regalar: en el deseo (grande) y en la lista (chico), con las páginas tal cual.
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

import ListaAjena from '@/app/l/[token]/page'
import DetalleItem from '@/app/l/[token]/item/[itemId]/page'
import { Sello } from '@/components/Sello'

type Props = { tipo?: string; chico?: boolean; clave?: string; children?: ReactNode }

/** Los elementos de la pantalla, en orden, sin dibujarlos. */
function elementos(nodo: ReactNode): { type: unknown; props: Props }[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (!isValidElement<Props>(nodo)) return []
  return [{ type: nodo.type, props: nodo.props }, ...elementos(nodo.props.children)]
}
/** Los sellos de una pantalla: "tuyo", "chico listo de <id>"… */
const sellos = (pantalla: ReactNode) => elementos(pantalla).filter((e) => e.type === Sello)
  .map((e) => `${e.props.chico ? 'chico ' : ''}${e.props.tipo} de ${e.props.clave}`)

const usuario = (nombre: string) => upsertUserFromGoogle(h.db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })

test('el sello: "¡Es tuyo!" al reservar, "¡Ya está!" al comprar, en el deseo y chico en la lista; lo de otro, no', async () => {
  h.db = await createTestDb()
  const [euge, rodri, sofi] = await Promise.all(['Euge', 'Rodri', 'Sofi'].map(usuario))
  const [lista] = await h.db.select().from(lists).where(eq(lists.ownerId, euge.id))
  const [mate, termo] = await h.db.insert(items).values([
    { listId: lista.id, tipo: 'exacto', titulo: 'Mate', prioridad: 'mucho' },
    { listId: lista.id, tipo: 'exacto', titulo: 'Termo' },
  ]).returning()
  const deseo = (itemId: string) => DetalleItem({ params: Promise.resolve({ token: lista.shareToken, itemId }), searchParams: Promise.resolve({}) })
  const enLista = () => ListaAjena({ params: Promise.resolve({ token: lista.shareToken }), searchParams: Promise.resolve({}) })

  h.session = { userId: rodri.id }
  expect(sellos(await deseo(mate.id))).toEqual([])
  await reserveItem(h.db, mate.id, { userId: rodri.id })
  // el termo lo reserva Sofi: Rodri no ve sello
  await reserveItem(h.db, termo.id, { userId: sofi.id })
  expect(sellos(await deseo(mate.id))).toEqual([`tuyo de ${mate.id}`])
  expect(sellos(await deseo(termo.id))).toEqual([])
  expect(sellos(await enLista())).toEqual([`chico tuyo de ${mate.id}`])

  const [claim] = await h.db.select().from(claims).where(eq(claims.itemId, mate.id))
  await markBought(h.db, claim.id, { userId: rodri.id })
  expect(sellos(await deseo(mate.id))).toEqual([`listo de ${mate.id}`])
  expect(sellos(await enLista())).toEqual([`chico listo de ${mate.id}`])
  // a Sofi le toca el termo, no el mate
  h.session = { userId: sofi.id }
  expect(sellos(await enLista())).toEqual([`chico tuyo de ${termo.id}`])
})

test('el regalo grupal: "¡Entre todos!" para los que están, recién cuando se compra', async () => {
  h.db = await createTestDb()
  const [euge, rodri, sofi, caro] = await Promise.all(['Euge', 'Rodri', 'Sofi', 'Caro'].map(usuario))
  const [lista] = await h.db.select().from(lists).where(eq(lists.ownerId, euge.id))
  const [bici] = await h.db.insert(items).values({ listId: lista.id, tipo: 'exacto', titulo: 'Bici' }).returning()
  const deseo = () => DetalleItem({ params: Promise.resolve({ token: lista.shareToken, itemId: bici.id }), searchParams: Promise.resolve({}) })
  const r = await iniciarRegaloGrupal(h.db, bici.id, rodri.id)
  if (!r.ok) throw new Error('no se armó el regalo')
  await sumarseARegalo(h.db, r.giftId, sofi.id)

  h.session = { userId: sofi.id }
  expect(sellos(await deseo())).toEqual([])
  await comprarRegalo(h.db, r.giftId, rodri.id, { total: 300000 })
  expect(sellos(await deseo())).toEqual([`todos de ${bici.id}`])
  h.session = { userId: rodri.id }
  expect(sellos(await deseo())).toEqual([`todos de ${bici.id}`])
  // Caro no está en el regalo
  h.session = { userId: caro.id }
  expect(sellos(await deseo())).toEqual([])
})

test('cómo se dibuja: la estrella con su texto (o un tilde, el chico), de adorno y torcida', () => {
  const grande = renderToStaticMarkup(createElement(Sello, { tipo: 'tuyo', clave: 'x', size: 112 }))
  expect(grande).toContain('aria-hidden="true"')
  expect(grande).toContain('class="gr-sello ')
  expect(grande).toContain('>¡Es</text>')
  expect(grande).toContain('>tuyo!</text>')
  expect(renderToStaticMarkup(createElement(Sello, { tipo: 'todos', clave: 'x', size: 112 }))).toContain('>¡Entre</text>')
  // en el servidor no cae: la animación la pone el navegador cuando aparece
  expect(grande).not.toContain('gr-sello--cae')
  const chico = renderToStaticMarkup(createElement(Sello, { tipo: 'listo', clave: 'x', size: 44, chico: true }))
  expect(chico).not.toContain('<text')
  expect(chico).toContain('<path')
})
