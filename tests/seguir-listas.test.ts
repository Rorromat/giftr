import { expect, test, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { items, listFollows, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { guardarCumple, misEventos } from '@/lib/events'
import { miGente } from '@/lib/gente'
import { iniciarRegaloGrupal, sumarseARegalo } from '@/lib/regalos'

// Las páginas de una lista tal cual (sin dibujarlas): abrirlas con sesión sigue la lista, como la lista misma.
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
import Perfil from '@/app/l/[token]/perfil/page'

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}

/** Mamá cumple el 5/11 y tiene una bici; Rodri abrió su lista y armó el regalo grupal. */
async function preparar() {
  h.db = await createTestDb()
  const db = h.db
  const [mama, rodri, sofi] = [await usuario(db, 'Mamá'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi')]
  await guardarCumple(db, mama.id, 5, 11)
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, mama.id))
  const [bici] = await db.insert(items).values({ listId: lista.id, tipo: 'exacto', titulo: 'Bici' }).returning()
  h.session = { userId: rodri.id }
  await ListaAjena({ params: Promise.resolve({ token: lista.shareToken }), searchParams: Promise.resolve({}) })
  const r = await iniciarRegaloGrupal(db, bici.id, rodri.id)
  if (!r.ok) throw new Error('no se armó el regalo')
  return { db, mama, rodri, sofi, lista, bici, giftId: r.giftId }
}

const siguen = async (db: Db, listId: string) =>
  (await db.select({ userId: listFollows.userId }).from(listFollows).where(eq(listFollows.listId, listId))).map((f) => f.userId)

const abrirDeseo = (token: string, itemId: string) =>
  DetalleItem({ params: Promise.resolve({ token, itemId }), searchParams: Promise.resolve({}) })

test('el link del regalo grupal: abrir el deseo con sesión sigue la lista (Tu gente y Eventos), sin pasar por la lista', async () => {
  const { db, sofi, rodri, lista, bici, giftId } = await preparar()
  expect(await siguen(db, lista.id)).toEqual([rodri.id])
  // Sofi llega por WhatsApp al deseo (o vuelve ahí de entrar con Google desde "Me sumo") y se suma
  h.session = { userId: sofi.id }
  await abrirDeseo(lista.shareToken, bici.id)
  expect(await sumarseARegalo(db, giftId, sofi.id)).toBe(true)
  expect((await miGente(db, sofi.id)).map((c) => c.nombre)).toEqual(['Mamá'])
  expect((await misEventos(db, sofi.id)).map((e) => [e.titulo, e.misGrupales])).toEqual([['Cumple de Mamá', 1]])
})

test('el perfil de un dueño también sigue la lista; el dueño que mira lo suyo, no', async () => {
  const { db, mama, rodri, lista } = await preparar()
  const caro = await usuario(db, 'Caro')
  const perfil = (quien?: string) => Perfil({ params: Promise.resolve({ token: lista.shareToken }), searchParams: Promise.resolve({ quien }) })
  h.session = { userId: caro.id }
  await perfil()
  h.session = { userId: mama.id }
  await perfil()
  expect((await siguen(db, lista.id)).sort()).toEqual([rodri.id, caro.id].sort())

  // en un grupo, un co-dueño que mira el perfil del otro tampoco: es su lista
  const delfina = await usuario(db, 'Delfina')
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Nuestra casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  await unirseAGrupo(db, grupo.inviteToken!, caro.id)
  h.session = { userId: caro.id }
  await Perfil({ params: Promise.resolve({ token: grupo.shareToken }), searchParams: Promise.resolve({ quien: delfina.id }) })
  expect(await siguen(db, grupoId)).toEqual([])
})

test('sin sesión no se sigue nada, y el dueño que abre su deseo va a su lista sin seguirla', async () => {
  const { db, mama, rodri, lista, bici } = await preparar()
  h.session = null
  await abrirDeseo(lista.shareToken, bici.id)
  await Perfil({ params: Promise.resolve({ token: lista.shareToken }), searchParams: Promise.resolve({}) })
  h.session = { userId: mama.id }
  await expect(abrirDeseo(lista.shareToken, bici.id)).rejects.toMatchObject({ url: '/mi-lista' })
  expect(await siguen(db, lista.id)).toEqual([rodri.id])
})
