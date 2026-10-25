import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { archiveItem, createItem } from '@/lib/items'
import { reserveItem } from '@/lib/claims'
import { pedirAmistad } from '@/lib/amigos'
import { hace, novedadesDeAmigos, robarDeseo } from '@/lib/novedades'

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}
const listaDe = async (db: Db, userId: string) => (await db.select().from(lists).where(eq(lists.ownerId, userId)))[0]
/** Un deseo con la fecha de carga que le digan (para el orden). */
async function deseo(db: Db, userId: string, titulo: string, minutosAtras: number, extra: Record<string, string> = {}) {
  const d = (await createItem(db, userId, { tipo: 'exacto', titulo, ...extra }))!
  await db.update(items).set({ createdAt: new Date(Date.now() - minutosAtras * 60_000) }).where(eq(items.id, d.id))
  return d
}

/** Euge y Sofi son amigas; Rodri no es amigo de nadie. */
async function setup() {
  const db = await createTestDb()
  const [euge, sofi, rodri] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi'), await usuario(db, 'Rodri')]
  await pedirAmistad(db, euge.id, sofi.id)
  await pedirAmistad(db, sofi.id, euge.id)
  return { db, euge, sofi, rodri }
}

test('lo nuevo de tus amigos: sus últimos deseos, del más nuevo al más viejo, de a páginas', async () => {
  const { db, euge, sofi, rodri } = await setup()
  await deseo(db, sofi.id, 'Mate', 30)
  await deseo(db, sofi.id, 'Vinilo', 10)
  const viejo = await deseo(db, sofi.id, 'Libro', 60)
  await deseo(db, sofi.id, 'Bici', 5)
  await archiveItem(db, (await deseo(db, sofi.id, 'Archivado', 1)).id, sofi.id, 'lo_tengo')
  await deseo(db, rodri.id, 'De Rodri', 2)
  await deseo(db, euge.id, 'Mío', 3)

  const p1 = await novedadesDeAmigos(db, euge.id, { limite: 2 })
  expect(p1.novedades.map((n) => n.item.titulo)).toEqual(['Bici', 'Vinilo'])
  expect(p1.novedades[0]).toMatchObject({ dueno: { id: sofi.id, nombre: 'Sofi' }, token: (await listaDe(db, sofi.id)).shareToken })
  expect(p1.siguiente).toBeTruthy()
  const p2 = await novedadesDeAmigos(db, euge.id, { limite: 2, despues: p1.siguiente! })
  expect(p2.novedades.map((n) => n.item.titulo)).toEqual(['Mate', 'Libro'])
  // eran las últimas: no hay siguiente
  expect(p2.siguiente).toBeNull()
  expect(p2.novedades[1].item.id).toBe(viejo.id)

  // a Sofi le aparecen los de Euge; a Rodri, que no es amigo de nadie, nada
  expect((await novedadesDeAmigos(db, sofi.id)).novedades.map((n) => n.item.titulo)).toEqual(['Mío'])
  expect(await novedadesDeAmigos(db, rodri.id)).toEqual({ novedades: [], siguiente: null })
  // un cursor roto empieza de nuevo
  expect((await novedadesDeAmigos(db, euge.id, { despues: 'cualquier-cosa' })).novedades).toHaveLength(4)
})

test('se ve lo que queda libre y lo que reservaste vos, como en su lista', async () => {
  const { db, euge, sofi, rodri } = await setup()
  const mate = await deseo(db, sofi.id, 'Mate', 10)
  const vinilo = await deseo(db, sofi.id, 'Vinilo', 5)
  await reserveItem(db, mate.id, { userId: rodri.id })
  await reserveItem(db, vinilo.id, { userId: euge.id })
  const { novedades } = await novedadesDeAmigos(db, euge.id)
  const [v, m] = novedades
  expect(v.item).toMatchObject({ titulo: 'Vinilo', disponible: false })
  expect(v.item.claims).toEqual([expect.objectContaining({ esMia: true })])
  expect(m.item).toMatchObject({ titulo: 'Mate', disponible: false })
  expect(m.item.claims).toEqual([expect.objectContaining({ esMia: false })])
})

test('Me lo robo: el deseo pasa a tu lista, sin las notas ni las reservas, y una sola vez', async () => {
  const { db, euge, sofi, rodri } = await setup()
  const mate = await deseo(db, sofi.id, 'Mate imperial', 5, { fotoUrl: 'https://x.test/mate.jpg', precio: '$45.000', notas: 'el de calabaza', linkTienda: 'https://tienda.test/mate' })
  await reserveItem(db, mate.id, { userId: rodri.id })
  const token = (await listaDe(db, sofi.id)).shareToken
  const r = await robarDeseo(db, euge.id, token, mate.id)
  expect(r).toMatchObject({ ok: true, yaLoTenias: false })
  const mias = await db.select().from(items).where(eq(items.listId, (await listaDe(db, euge.id)).id))
  expect(mias).toEqual([expect.objectContaining({
    titulo: 'Mate imperial', fotoUrl: 'https://x.test/mate.jpg', precio: '$45.000', linkTienda: 'https://tienda.test/mate', notas: null, estadoDueno: 'activo',
  })])
  // otra vez: es el mismo
  expect(await robarDeseo(db, euge.id, token, mate.id)).toEqual({ ok: true, itemId: mias[0].id, yaLoTenias: true })
  // lo propio, un link que no es o un deseo archivado, no
  expect(await robarDeseo(db, sofi.id, token, mate.id)).toEqual({ ok: false, reason: 'propio' })
  expect(await robarDeseo(db, euge.id, 'otro-token', mate.id)).toEqual({ ok: false, reason: 'no_existe' })
  await archiveItem(db, mate.id, sofi.id, 'lo_tengo')
  expect(await robarDeseo(db, rodri.id, token, mate.id)).toEqual({ ok: false, reason: 'no_existe' })
  // la lista de Sofi no cambió
  expect(await db.select().from(items).where(eq(items.listId, (await listaDe(db, sofi.id)).id))).toHaveLength(1)
})

test('hace: cuánto hace que lo cargó', () => {
  const ahora = new Date('2026-10-25T18:00:00Z')
  const antes = (min: number) => new Date(ahora.getTime() - min * 60_000)
  expect(hace(antes(0), ahora)).toBe('recién')
  expect(hace(antes(5), ahora)).toBe('hace 5 min')
  expect(hace(antes(180), ahora)).toBe('hace 3 h')
  expect(hace(antes(60 * 30), ahora)).toBe('ayer')
  expect(hace(antes(60 * 24 * 4), ahora)).toBe('hace 4 días')
  expect(hace(new Date('2026-10-01T12:00:00Z'), ahora)).toBe('el 1/10')
})
