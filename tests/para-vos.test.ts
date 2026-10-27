import { readFileSync } from 'node:fs'
import { createECDH, randomBytes } from 'node:crypto'
import { expect, test } from 'vitest'
import { eq, isNull, sql } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { avisos, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { createItem } from '@/lib/items'
import { comprarRegalo, iniciarRegaloGrupal, marcarPagado, saldarCon, sumarseARegalo } from '@/lib/regalos'
import { bandeja, DIAS_PARA_VOS, EN_PARA_VOS, guardarAviso, marcarBandejaVista, paraVos, type TipoEnBandeja } from '@/lib/bandeja'
import { guardarSuscripcion, mandarCodazo, type Aviso, type Enviar } from '@/lib/codazos'
import { pedirAmistad, responderSolicitud } from '@/lib/amigos'

// "Para vos", arriba en Inicio: lo nuevo de la campanita que te pide algo. Y los avisos de las cuentas de los regalos
// grupales, que antes no había: te toca tu parte (el que lo organiza lo compró) y te pagaron.

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}

/** Rodri arma el regalo de la bici de Mamá ($90.000) y Sofi y Ana se suman. */
async function conRegalo() {
  const db = await createTestDb()
  const [mama, rodri, sofi, ana] = [await usuario(db, 'Mamá'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi'), await usuario(db, 'Ana')]
  const bici = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Bici', precio: '$90.000' }))!
  const r = await iniciarRegaloGrupal(db, bici.id, rodri.id)
  if (!r.ok) throw new Error(r.reason)
  await sumarseARegalo(db, r.giftId, sofi.id)
  await sumarseARegalo(db, r.giftId, ana.id)
  return { db, mama, rodri, sofi, ana, bici, giftId: r.giftId }
}

const entradas = async (db: Db, userId: string) => (await bandeja(db, { userId })).entradas
const titulos = async (db: Db, userId: string) => (await entradas(db, userId)).map((e) => `${e.emoji} ${e.titulo}`)

const ecdh = createECDH('prime256v1')
const CLAVES = { p256dh: ecdh.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') }

test('el que organiza lo compra: a cada uno que le debe le llega su parte, a Cuentas, y va en Para vos', async () => {
  const { db, rodri, sofi, ana, mama, giftId } = await conRegalo()
  await guardarSuscripcion(db, sofi.id, { endpoint: `https://fcm.googleapis.com/fcm/send/${sofi.id}`, keys: CLAVES })
  const enviados: Aviso[] = []
  const enviar: Enviar = async (_, aviso) => { enviados.push(aviso); return 201 }
  // Ana queda en 0: no debe nada
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 90000, partes: { [rodri.id]: 60000, [sofi.id]: 30000, [ana.id]: 0 } }, enviar))
    .toEqual({ ok: true })

  const [deSofi] = await entradas(db, sofi.id)
  expect(deSofi).toMatchObject({
    emoji: '🧾', titulo: 'Rodri compró "Bici"', cuerpo: 'Tu parte del regalo para Mamá: $30.000. Cuando le pagues, marcalo en Cuentas.',
    href: '/cuentas', de: { nombre: 'Rodri' }, nuevo: true,
  })
  // al celular va lo de siempre (ni de quién es ni qué tipo)
  expect(enviados.map((a) => Object.keys(a).sort())).toEqual([['body', 'title', 'url']])
  expect(await paraVos(db, sofi.id)).toEqual([deSofi])
  expect(await entradas(db, ana.id)).toEqual([])
  expect(await entradas(db, rodri.id)).toEqual([])
  // a Mamá, nunca: es su regalo
  expect(await entradas(db, mama.id)).toEqual([])
})

test('"Ya le pagué": al que lo compró le llega que le pagaron, una vez; "Me pagó" lo marca él y no le avisa a nadie', async () => {
  const { db, rodri, sofi, ana, giftId } = await conRegalo()
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })
  expect(await marcarPagado(db, giftId, sofi.id, sofi.id)).toBe(true)
  expect(await entradas(db, rodri.id)).toMatchObject([{
    emoji: '💸', titulo: 'Sofi te pagó $30.000', cuerpo: 'Su parte de "Bici", el regalo para Mamá.', href: '/cuentas', de: { nombre: 'Sofi' },
  }])
  expect((await paraVos(db, rodri.id)).map((e) => e.titulo)).toEqual(['Sofi te pagó $30.000'])
  // tocarlo de nuevo (otra pestaña) no lo repite
  expect(await marcarPagado(db, giftId, sofi.id, sofi.id)).toBe(true)
  // "Me pagó": Rodri marca la de Ana
  expect(await marcarPagado(db, giftId, ana.id, rodri.id)).toBe(true)
  expect(await titulos(db, rodri.id)).toEqual(['💸 Sofi te pagó $30.000'])
  expect(await titulos(db, ana.id)).toEqual(['🧾 Rodri compró "Bici"'])
})

test('saldar todo: si el que salda debía, al otro le llega que le pagó el neto; si cobraba, nada', async () => {
  const { db, rodri, sofi, ana, giftId } = await conRegalo()
  await comprarRegalo(db, giftId, rodri.id, { total: 90000 })
  expect(await saldarCon(db, ana.id, rodri.id)).toBe(1)
  expect(await entradas(db, rodri.id)).toMatchObject([{
    emoji: '💸', titulo: 'Ana te pagó $30.000', cuerpo: 'Todo lo que te debía de los regalos grupales: ya quedó saldado en Cuentas.', de: { nombre: 'Ana' },
  }])
  // "Me pagó todo": lo marca Rodri
  expect(await saldarCon(db, rodri.id, sofi.id)).toBe(1)
  expect(await titulos(db, sofi.id)).toEqual(['🧾 Rodri compró "Bici"'])
  expect(await titulos(db, rodri.id)).toEqual(['💸 Ana te pagó $30.000'])
})

test('en dólares, los avisos van en dólares', async () => {
  const { db, rodri, sofi, ana, giftId } = await conRegalo()
  await comprarRegalo(db, giftId, rodri.id, { total: 300, moneda: 'USD' })
  expect((await entradas(db, sofi.id))[0].cuerpo).toBe('Tu parte del regalo para Mamá: US$ 100. Cuando le pagues, marcalo en Cuentas.')
  await marcarPagado(db, giftId, sofi.id, sofi.id)
  expect(await saldarCon(db, ana.id, rodri.id, -100, 'USD')).toBe(1)
  expect(await titulos(db, rodri.id)).toEqual(['💸 Ana te pagó US$ 100', '💸 Sofi te pagó US$ 100'])
})

test(`Para vos: lo nuevo que te pide algo, hasta ${EN_PARA_VOS} y de la última semana; al abrir la campanita se va`, async () => {
  const db = await createTestDb()
  const [yo, sofi] = [await usuario(db, 'Yo'), await usuario(db, 'Sofi')]
  const hace = (min: number) => new Date(Date.now() - min * 60_000)
  const aviso = (tipo: TipoEnBandeja | null, titulo: string, createdAt: Date) =>
    db.insert(avisos).values({ userId: yo.id, deUserId: sofi.id, tipo, titulo, cuerpo: '', url: '/', createdAt })
  await aviso('pago', '💸 Sofi te pagó $1', hace(60))
  await aviso('invisible_pregunta', '🤫 Tu amigo invisible te hizo una pregunta', hace(50))
  // lo que tiene su cartel en Inicio, lo que no pide nada y lo de antes de que hubiera tipos, no
  await aviso('codazo', '👉 ¡Codazo de Sofi!', hace(45))
  await aviso('amistad_aceptada', '🤝 Sofi aceptó', hace(40))
  await aviso(null, '🎁 Ya se sorteó "Viejo"', hace(35))
  await aviso('regalo_comprado', '🧾 Sofi compró "Termo"', hace(30))
  await aviso('invisible_sorteo', '🎁 Ya se sorteó "Navidad"', hace(20))
  // de hace más de una semana, tampoco
  await aviso('pago', '💸 Sofi te pagó $2', hace(DIAS_PARA_VOS * 24 * 60 + 1))

  expect((await paraVos(db, yo.id)).map((e) => [e.emoji, e.titulo, e.de?.nombre])).toEqual([
    ['🎁', 'Ya se sorteó "Navidad"', 'Sofi'], ['🧾', 'Sofi compró "Termo"', 'Sofi'], ['🤫', 'Tu amigo invisible te hizo una pregunta', 'Sofi'],
  ])
  await marcarBandejaVista(db, { userId: yo.id }, new Date())
  expect(await paraVos(db, yo.id)).toEqual([])
  await guardarAviso(db, yo.id, { tipo: 'pago', title: '💸 Sofi te pagó $3', body: '', url: '/cuentas' })
  expect((await paraVos(db, yo.id)).map((e) => e.titulo)).toEqual(['Sofi te pagó $3'])
})

test('cada aviso que se manda dice qué es', async () => {
  const db = await createTestDb()
  const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
  await pedirAmistad(db, euge.id, sofi.id)
  const [solicitud] = (await db.execute<{ id: string }>(sql`select id from amistades`)).rows
  await responderSolicitud(db, sofi.id, solicitud.id, true)
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  await mandarCodazo(db, lista.shareToken, { userId: sofi.id }, 'Sofi')
  expect((await db.select({ tipo: avisos.tipo }).from(avisos)).map((a) => a.tipo).sort()).toEqual(['amistad_aceptada', 'amistad_pedida', 'codazo'])
  expect(await db.select().from(avisos).where(isNull(avisos.tipo))).toEqual([])
})

test('la migración le agrega el tipo a los avisos (los de antes quedan sin tipo)', () => {
  expect(readFileSync('drizzle/0034_para_vos.sql', 'utf8').trim()).toBe('ALTER TABLE "avisos" ADD COLUMN "tipo" text;')
})
