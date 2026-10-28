import { readFileSync } from 'node:fs'
import { createECDH, randomBytes } from 'node:crypto'
import { expect, test } from 'vitest'
import { eq, isNull } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { amistades, avisos, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { createItem } from '@/lib/items'
import { comprarRegalo, iniciarRegaloGrupal, marcarPagado, saldarCon, sumarseARegalo } from '@/lib/regalos'
import {
  avisosSinLeer, bandeja, DIAS_PARA_VOS, EN_PARA_VOS, guardarAviso, limpiarParaVos, marcarAvisoVisto, marcarBandejaVista, paraVos,
  type TipoEnBandeja,
} from '@/lib/bandeja'
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
    href: '/cuentas', de: { nombre: 'Rodri' }, tipo: 'regalo_comprado', nuevo: true,
  })
  // al celular va lo de siempre (ni de quién es ni qué tipo)
  expect(enviados.map((a) => Object.keys(a).sort())).toEqual([['body', 'title', 'url']])
  expect(await paraVos(db, sofi.id)).toEqual({ entradas: [deSofi], total: 1, hasta: expect.any(Date) })
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
  expect((await paraVos(db, rodri.id)).entradas.map((e) => e.titulo)).toEqual(['Sofi te pagó $30.000'])
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

  const { entradas: primeros, total } = await paraVos(db, yo.id)
  expect(primeros.map((e) => [e.tipo, e.titulo, e.de?.nombre])).toEqual([
    ['invisible_sorteo', 'Ya se sorteó "Navidad"', 'Sofi'], ['regalo_comprado', 'Sofi compró "Termo"', 'Sofi'],
    ['invisible_pregunta', 'Tu amigo invisible te hizo una pregunta', 'Sofi'],
  ])
  // el de $1 no entra, pero se cuenta
  expect(total).toBe(4)
  await marcarBandejaVista(db, { userId: yo.id }, new Date())
  expect((await paraVos(db, yo.id)).total).toBe(0)
  await guardarAviso(db, yo.id, { tipo: 'pago', title: '💸 Sofi te pagó $3', body: '', url: '/cuentas' })
  expect((await paraVos(db, yo.id)).entradas.map((e) => e.titulo)).toEqual(['Sofi te pagó $3'])
})

test('cada aviso que se manda dice qué es', async () => {
  const db = await createTestDb()
  const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
  await pedirAmistad(db, euge.id, sofi.id)
  const [solicitud] = await db.select({ id: amistades.id }).from(amistades)
  await responderSolicitud(db, sofi.id, solicitud.id, true)
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  await mandarCodazo(db, lista.shareToken, { userId: sofi.id }, 'Sofi')
  expect((await db.select({ tipo: avisos.tipo }).from(avisos)).map((a) => a.tipo).sort()).toEqual(['amistad_aceptada', 'amistad_pedida', 'codazo'])
  expect(await db.select().from(avisos).where(isNull(avisos.tipo))).toEqual([])
})

test('"Limpiar" saca de Para vos lo que había (también lo que no entraba) y ya no es nuevo en la campanita; lo demás, sí', async () => {
  const db = await createTestDb()
  const [yo, sofi] = [await usuario(db, 'Yo'), await usuario(db, 'Sofi')]
  const aviso = (tipo: TipoEnBandeja, titulo: string, min: number) =>
    db.insert(avisos).values({ userId: yo.id, deUserId: sofi.id, tipo, titulo, cuerpo: '', url: '/', createdAt: new Date(Date.now() - min * 60_000) })
  for (const n of [1, 2, 3, 4]) await aviso('pago', `💸 Sofi te pagó $${n}`, 10 - n)
  await aviso('codazo', '👉 ¡Codazo de Sofi!', 1)
  const { entradas: antes, hasta } = await paraVos(db, yo.id)
  expect(antes).toHaveLength(EN_PARA_VOS)
  expect(await avisosSinLeer(db, { userId: yo.id })).toBe(5)

  // mientras miraba Inicio, llegó otro: ese queda
  await guardarAviso(db, yo.id, { tipo: 'pago', title: '💸 Sofi te pagó $5', body: '', url: '/cuentas' })
  await limpiarParaVos(db, yo.id, hasta)
  expect((await paraVos(db, yo.id)).entradas.map((e) => e.titulo)).toEqual(['Sofi te pagó $5'])
  // en la campanita siguen, ya vistos; el codazo y el nuevo, nuevos
  expect(await avisosSinLeer(db, { userId: yo.id })).toBe(2)
  expect((await bandeja(db, { userId: yo.id })).entradas.map((e) => [e.titulo, e.nuevo])).toEqual([
    ['Sofi te pagó $5', true], ['¡Codazo de Sofi!', true],
    ['Sofi te pagó $4', false], ['Sofi te pagó $3', false], ['Sofi te pagó $2', false], ['Sofi te pagó $1', false],
  ])
  // una fecha que no es fecha no limpia nada; una del futuro, hasta ahora
  await limpiarParaVos(db, yo.id, new Date('cualquier cosa'))
  expect((await paraVos(db, yo.id)).total).toBe(1)
  await limpiarParaVos(db, yo.id, new Date(Date.now() + 3600_000))
  expect((await paraVos(db, yo.id)).total).toBe(0)
  // a otro no le toca nada
  await db.insert(avisos).values({ userId: sofi.id, tipo: 'pago', titulo: '💸 Yo te pagó $1', cuerpo: '', url: '/' })
  await limpiarParaVos(db, yo.id, new Date())
  expect((await paraVos(db, sofi.id)).total).toBe(1)
})

test('abrir o archivar uno (deslizándolo) lo saca de Para vos y ya no es nuevo; los demás siguen. Solo los propios', async () => {
  const db = await createTestDb()
  const [yo, sofi] = [await usuario(db, 'Yo'), await usuario(db, 'Sofi')]
  await guardarAviso(db, yo.id, { tipo: 'pago', title: '💸 Sofi te pagó $1', body: '', url: '/cuentas' })
  await guardarAviso(db, yo.id, { tipo: 'invisible_pregunta', title: '🤫 Tu amigo invisible te hizo una pregunta', body: '', url: '/invisible/x#preguntas' })
  const [pregunta, pago] = (await paraVos(db, yo.id)).entradas
  expect(await avisosSinLeer(db, { userId: yo.id })).toBe(2)

  // a otro no le marca nada, y lo que no es un id no rompe
  expect(await marcarAvisoVisto(db, sofi.id, pago.id)).toBeNull()
  expect(await marcarAvisoVisto(db, yo.id, 'cualquier-cosa')).toBeNull()
  expect((await paraVos(db, yo.id)).total).toBe(2)

  expect(await marcarAvisoVisto(db, yo.id, pago.id)).toBe('/cuentas')
  expect((await paraVos(db, yo.id)).entradas.map((e) => e.id)).toEqual([pregunta.id])
  expect(await avisosSinLeer(db, { userId: yo.id })).toBe(1)
  const [{ vistoAt }] = await db.select({ vistoAt: avisos.vistoAt }).from(avisos).where(eq(avisos.id, pago.id))
  // abrirlo de nuevo (desde la campanita) lleva igual, sin cambiar cuándo se vio
  expect(await marcarAvisoVisto(db, yo.id, pago.id)).toBe('/cuentas')
  expect((await db.select({ vistoAt: avisos.vistoAt }).from(avisos).where(eq(avisos.id, pago.id)))[0].vistoAt).toEqual(vistoAt)
  expect((await bandeja(db, { userId: yo.id })).entradas.map((e) => [e.titulo, e.nuevo])).toEqual([
    ['Tu amigo invisible te hizo una pregunta', true], ['Sofi te pagó $1', false],
  ])
})

test('la migración les agrega a los avisos el tipo y cuándo se limpiaron (los de antes quedan sin tipo)', () => {
  expect(readFileSync('drizzle/0034_para_vos.sql', 'utf8').trim()).toBe(
    'ALTER TABLE "avisos" ADD COLUMN "tipo" text;--> statement-breakpoint\nALTER TABLE "avisos" ADD COLUMN "visto_at" timestamp with time zone;',
  )
})
