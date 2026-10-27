import { expect, test } from 'vitest'
import { createECDH, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { avisos, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { guardarSuscripcion, mandarCodazo, probarAviso, type Aviso, type Enviar } from '@/lib/codazos'
import { pedirAmistad, pedirAmistadPorMail, reclamarSolicitudesPorMail, responderSolicitud } from '@/lib/amigos'
import { avisosSinLeer, bandeja, DIAS_EN_BANDEJA, guardarAviso, marcarBandejaVista, separarEmoji } from '@/lib/bandeja'
import { reserveItem } from '@/lib/claims'
import { createItem, updateItem } from '@/lib/items'
import { getUnreadNotifications } from '@/lib/notifications'
import { createGuest } from '@/lib/guest'

async function usuario(db: Db, nombre: string, email = `${nombre.toLowerCase()}@test.com`) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email, nombre })
}
const ecdh = createECDH('prime256v1')
const CLAVES = { p256dh: ecdh.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') }
function pushFalso() {
  const enviados: { para: string; aviso: Aviso }[] = []
  const enviar: Enviar = async (s, aviso) => { enviados.push({ para: s.endpoint.split('/').at(-1)!, aviso }); return 201 }
  return { enviados, enviar }
}
const sinLeer = (db: Db, userId: string) => avisosSinLeer(db, { userId })
const titulos = async (db: Db, userId: string) => (await bandeja(db, { userId })).entradas.map((e) => e.titulo)

test('el emoji del título va aparte; sin emoji, la campanita', () => {
  expect(separarEmoji('🤝 Euge aceptó')).toEqual({ emoji: '🤝', texto: 'Euge aceptó' })
  expect(separarEmoji('❤️‍🔥 Algo')).toEqual({ emoji: '❤️‍🔥', texto: 'Algo' })
  expect(separarEmoji('Sofi no se suma a "Termo"')).toEqual({ emoji: null, texto: 'Sofi no se suma a "Termo"' })
})

test('una solicitud de amistad queda en su bandeja con la foto de quien la manda, aunque no tenga los avisos activados', async () => {
  const db = await createTestDb()
  const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
  const push = pushFalso()
  await pedirAmistad(db, euge.id, sofi.id, push.enviar)
  // sin avisos activados no le llegó nada al celular, pero en la app sí
  expect(push.enviados).toEqual([])
  expect(await sinLeer(db, sofi.id)).toBe(1)
  const { entradas } = await bandeja(db, { userId: sofi.id })
  expect(entradas).toEqual([{
    id: expect.any(String), emoji: '🤝', titulo: 'Euge quiere ser tu amigo en GiftR', cuerpo: 'Si aceptás, se ven las listas y los cumples.',
    href: '/gente#solicitudes', de: { nombre: 'Euge', foto: null }, createdAt: expect.any(Date), nuevo: true,
  }])

  // contesta: a Euge le llega que aceptó, con la foto de Sofi
  await guardarSuscripcion(db, euge.id, { endpoint: `https://fcm.googleapis.com/fcm/send/${euge.id}`, keys: CLAVES })
  expect(await responderSolicitud(db, sofi.id, (await db.execute<{ id: string }>(sql`select id from amistades`)).rows[0].id, true, push.enviar)).toBe(true)
  expect(push.enviados.map((e) => e.aviso.title)).toEqual(['🤝 Sofi aceptó'])
  // al celular va lo de siempre (sin de quién es)
  expect(Object.keys(push.enviados[0].aviso).sort()).toEqual(['body', 'title', 'url'])
  expect((await bandeja(db, { userId: euge.id })).entradas).toMatchObject([{ emoji: '🤝', titulo: 'Sofi aceptó', de: { nombre: 'Sofi' }, nuevo: true }])
})

test('al abrirla deja de ser nuevo lo que había hasta que se armó, no lo que llegó después; y nunca va para atrás', async () => {
  const db = await createTestDb()
  const [euge, sofi, rodri] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi'), await usuario(db, 'Rodri')]
  await pedirAmistad(db, euge.id, sofi.id)
  const { hasta } = await bandeja(db, { userId: sofi.id })
  await new Promise((r) => setTimeout(r, 5))
  await pedirAmistad(db, rodri.id, sofi.id)
  await marcarBandejaVista(db, { userId: sofi.id }, hasta)
  expect(await sinLeer(db, sofi.id)).toBe(1)
  expect((await bandeja(db, { userId: sofi.id })).entradas.map((e) => [e.titulo, e.nuevo])).toEqual([
    ['Rodri quiere ser tu amigo en GiftR', true], ['Euge quiere ser tu amigo en GiftR', false],
  ])
  // una pestaña vieja no vuelve a marcar nuevo lo que ya vio; una fecha del futuro vale como ahora
  await marcarBandejaVista(db, { userId: sofi.id }, new Date(Date.now() + 3600_000))
  expect(await sinLeer(db, sofi.id)).toBe(0)
  await marcarBandejaVista(db, { userId: sofi.id }, new Date(0))
  expect(await sinLeer(db, sofi.id)).toBe(0)
  await guardarAviso(db, sofi.id, { title: '👉 ¡Codazo de Euge!', body: 'b', url: '/mi-lista' })
  expect(await sinLeer(db, sofi.id)).toBe(1)
  // una fecha que no es fecha no hace nada
  await marcarBandejaVista(db, { userId: sofi.id }, new Date('cualquier cosa'))
  expect(await sinLeer(db, sofi.id)).toBe(1)
})

test('los codazos llegan a la bandeja; el de un invitado, sin foto. La prueba de Perfil no', async () => {
  const db = await createTestDb()
  const { owner, giver } = await seedOwnerAndGiver(db)
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, owner.id))
  const push = pushFalso()
  await mandarCodazo(db, lista.shareToken, { userId: giver.id }, giver.nombre, push.enviar)
  const invitado = await createGuest(db, 'Tía Marta')
  await mandarCodazo(db, lista.shareToken, { guestId: invitado.id }, 'Tía Marta', push.enviar)
  const { entradas } = await bandeja(db, { userId: owner.id })
  expect(entradas.map((e) => [e.emoji, e.titulo, e.de?.nombre ?? null, e.href])).toEqual([
    ['👉', '¡Codazo de Tía!', null, '/mi-lista'], ['👉', `¡Codazo de ${giver.nombre.split(' ')[0]}!`, giver.nombre, '/mi-lista'],
  ])
  await probarAviso(db, owner.id, push.enviar)
  expect(await sinLeer(db, owner.id)).toBe(2)
})

test('los avisos sobre deseos que regala también están, partidos en título y detalle; al abrirla quedan leídos', async () => {
  const db = await createTestDb()
  const { owner, giver } = await seedOwnerAndGiver(db)
  const termo = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Termo' }))!
  await reserveItem(db, termo.id, { userId: giver.id })
  await updateItem(db, termo.id, owner.id, { notas: 'el verde' })
  expect(await sinLeer(db, giver.id)).toBe(1)
  const { entradas, hasta } = await bandeja(db, { userId: giver.id })
  expect(entradas).toMatchObject([{ emoji: '✏️', titulo: '"Termo" fue editado por su dueño', cuerpo: 'Revisá los detalles.', de: null, nuevo: true }])
  expect(entradas[0].href).toMatch(/^\/l\/.+\/item\//)
  // al dueño nunca: le diría que alguien lo reservó
  expect((await bandeja(db, { userId: owner.id })).entradas).toEqual([])

  await marcarBandejaVista(db, { userId: giver.id }, hasta)
  expect(await getUnreadNotifications(db, { userId: giver.id })).toEqual([])
  expect(await sinLeer(db, giver.id)).toBe(0)
  // sigue en la bandeja, ya visto
  expect((await bandeja(db, { userId: giver.id })).entradas).toMatchObject([{ titulo: '"Termo" fue editado por su dueño', nuevo: false }])
})

test(`lo de hace más de ${DIAS_EN_BANDEJA} días se va`, async () => {
  const db = await createTestDb()
  const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
  await db.insert(avisos).values({ userId: sofi.id, titulo: '👉 ¡Codazo viejo!', cuerpo: '', url: '/mi-lista', createdAt: new Date(Date.now() - (DIAS_EN_BANDEJA + 1) * 86_400_000) })
  expect(await sinLeer(db, sofi.id)).toBe(0)
  expect(await titulos(db, sofi.id)).toEqual([])
  await pedirAmistad(db, euge.id, sofi.id)
  expect(await titulos(db, sofi.id)).toEqual(['Euge quiere ser tu amigo en GiftR'])
  expect((await db.select().from(avisos).where(eq(avisos.userId, sofi.id))).length).toBe(1)
})

test('la solicitud que esperaba a su mail le llega a la bandeja al entrar', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge')
  await pedirAmistadPorMail(db, euge.id, 'nueva@test.com')
  const nueva = await usuario(db, 'Nueva', 'nueva@test.com')
  await reclamarSolicitudesPorMail(db, nueva.id, 'nueva@test.com')
  expect((await bandeja(db, { userId: nueva.id })).entradas).toMatchObject([{ titulo: 'Euge quiere ser tu amigo en GiftR', de: { nombre: 'Euge' }, nuevo: true }])
  // entrar de nuevo no la repite
  await reclamarSolicitudesPorMail(db, nueva.id, 'nueva@test.com')
  expect(await sinLeer(db, nueva.id)).toBe(1)
})

test('la migración agrega la bandeja y cuándo la vio', () => {
  const m = readFileSync('drizzle/0033_bandeja_avisos.sql', 'utf8')
  expect(m).toContain('CREATE TABLE "avisos"')
  expect(m).toContain('"avisos_vistos_at"')
})
