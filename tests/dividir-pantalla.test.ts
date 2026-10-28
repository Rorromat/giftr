import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { groupGifts, items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { pedirAmistad } from '@/lib/amigos'
import { comprarRegalo, iniciarRegaloGrupal } from '@/lib/regalos'
import { invitacionesPendientes, invitarARegalo, responderInvitacion } from '@/lib/invitaciones'
import { crearSorpresa } from '@/lib/sorpresas'

// "Lo dividimos", en el regalo: el que lo organiza ve a quiénes se lo propuso y qué contestaron, también una vez comprado.
// Con las páginas tal cual, la base en PGlite y la sesión y las redirecciones de Next simuladas.
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
import Sorpresa from '@/app/sorpresa/[token]/page'

const usuario = (nombre: string) => upsertUserFromGoogle(h.db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
const sinAvisos = async () => 201
/** Lo que se lee de la tarjeta del regalo grupal, sin etiquetas. */
const delRegalo = (html: string) => html.slice(html.indexOf('aria-label="Regalo grupal"')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

/** Rodri arma el regalo y se lo propone a Sofi, Juan y Caro: Sofi se suma, Juan no puede y Caro no contesta. */
async function propuesto(giftId: string, rodri: string, [sofi, juan, caro]: string[]) {
  await invitarARegalo(h.db, giftId, rodri, [sofi, juan, caro], sinAvisos)
  const [deSofi] = await invitacionesPendientes(h.db, sofi)
  await responderInvitacion(h.db, sofi, deSofi.id, true, sinAvisos)
  const [deJuan] = await invitacionesPendientes(h.db, juan)
  await responderInvitacion(h.db, juan, deJuan.id, false, sinAvisos)
}

async function setup() {
  h.db = await createTestDb()
  const [euge, rodri, sofi, juan, caro] = await Promise.all(['Euge', 'Rodri', 'Sofi', 'Juan', 'Caro'].map(usuario))
  for (const o of [euge, sofi, juan, caro]) { await pedirAmistad(h.db, rodri.id, o.id); await pedirAmistad(h.db, o.id, rodri.id) }
  return { euge, rodri, sofi, juan, caro }
}

test('en el deseo, el que lo organiza ve a quiénes se lo propuso y qué contestaron, antes y después de comprarlo', async () => {
  const { euge, rodri, sofi, juan, caro } = await setup()
  const [lista] = await h.db.select().from(lists).where(eq(lists.ownerId, euge.id))
  const [bici] = await h.db.insert(items).values({ listId: lista.id, tipo: 'exacto', titulo: 'Bici' }).returning()
  const deseo = async () => delRegalo(renderToStaticMarkup(await DetalleItem({
    params: Promise.resolve({ token: lista.shareToken, itemId: bici.id }), searchParams: Promise.resolve({}),
  })))
  const r = await iniciarRegaloGrupal(h.db, bici.id, rodri.id)
  if (!r.ok) throw new Error('no se armó el regalo')
  await propuesto(r.giftId, rodri.id, [sofi.id, juan.id, caro.id])

  h.session = { userId: rodri.id }
  const abierto = await deseo()
  expect(abierto).toContain('Les propusiste dividirlo S Sofi Se sumó ✓ J Juan No puede C Caro Esperando')
  // al dividirlo, que sepa que Caro queda afuera si no espera
  expect(abierto).toContain('Caro todavía no contestó: se divide entre los que ya están, así que si lo dividís ahora queda afuera.')
  // los que se sumaron no ven a quiénes les llegó la propuesta
  h.session = { userId: sofi.id }
  expect(await deseo()).not.toContain('Les propusiste')

  expect(await comprarRegalo(h.db, r.giftId, rodri.id, { total: 90000 })).toMatchObject({ ok: true })
  h.session = { userId: rodri.id }
  const comprado = await deseo()
  // la división, y a quiénes se lo propuso: Caro ya no puede contestar
  expect(comprado).toContain('Vos compraste el regalo $45.000 Puso Sofi $45.000 Debe')
  expect(comprado).toContain('Les propusiste dividirlo S Sofi Se sumó ✓ J Juan No puede C Caro No contestó')
  for (const no of ['Esperando', 'Proponérselo a más amigos', 'todavía no contestó']) expect(comprado).not.toContain(no)
})

test('en una sorpresa ya comprada, también', async () => {
  const { euge, rodri, sofi, juan, caro } = await setup()
  const s = await crearSorpresa(h.db, rodri.id, { para: { amigo: euge.id }, deseo: { tipo: 'exacto', titulo: 'Tocadiscos' }, invitar: [] })
  if (!s.ok) throw new Error('no se armó la sorpresa')
  const [l] = await h.db.select().from(lists).where(eq(lists.shareToken, s.token))
  const [gift] = await h.db.select({ id: groupGifts.id }).from(groupGifts).innerJoin(items, eq(groupGifts.itemId, items.id))
    .where(eq(items.listId, l.id))
  await propuesto(gift.id, rodri.id, [sofi.id, juan.id, caro.id])
  expect(await comprarRegalo(h.db, gift.id, rodri.id, { total: 120000 })).toMatchObject({ ok: true })

  h.session = { userId: rodri.id }
  const pagina = delRegalo(renderToStaticMarkup(await Sorpresa({ params: Promise.resolve({ token: s.token }), searchParams: Promise.resolve({}) })))
  expect(pagina).toContain('Les propusiste dividirlo S Sofi Se sumó ✓ J Juan No puede C Caro No contestó')
})
