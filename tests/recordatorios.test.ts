import { beforeEach, expect, test, vi } from 'vitest'
import { createECDH, randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { createTestDb, seguir } from './helpers'
import { avisos, claims, groupGiftMembers, groupGifts, listFollows, lists, recordatoriosEnviados } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { guardarSuscripcion, type Aviso, type Enviar } from '@/lib/codazos'
import { bandeja } from '@/lib/bandeja'
import { markBought, reserveItem } from '@/lib/claims'
import { guardarCumple, guardarFechaGrupo, hoyLocal, inicioDelDia } from '@/lib/events'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { createGuest } from '@/lib/guest'
import { createItem } from '@/lib/items'
import { cambiarLinkParaRegalar } from '@/lib/lists'
import { comprarRegalo, iniciarRegaloGrupal, marcarPagado, sumarseARegalo } from '@/lib/regalos'
import { mandarRecordatorios } from '@/lib/recordatorios'
import { borrarCuenta } from '@/lib/cuenta'

// El route del cron usa la base de siempre: acá, la del test.
const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/db', () => ({ get db() { return h.db } }))

import { GET } from '@/app/api/cron/diario/route'

const DIA = 86400_000
const AHORA = new Date()
const HOY = hoyLocal(AHORA)
const en = (dias: number) => new Date(AHORA.getTime() + dias * DIA)

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}
const listaDe = async (db: Db, userId: string) => (await db.select().from(lists).where(eq(lists.ownerId, userId)))[0]
/** Cumple dentro de tantos días (desde hoy, en Argentina). */
async function cumpleEn(db: Db, userId: string, dias: number) {
  const f = new Date(HOY.getTime() + dias * DIA)
  await guardarCumple(db, userId, f.getUTCDate(), f.getUTCMonth() + 1)
}
const ecdh = createECDH('prime256v1')
const CLAVES = { p256dh: ecdh.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') }
/** Un servicio de push de mentira: anota a quién (el nombre con el que se activó) y qué. */
function pushFalso() {
  const enviados: { para: string; aviso: Aviso }[] = []
  const enviar: Enviar = async (s, aviso) => { enviados.push({ para: s.endpoint.split('/').at(-1)!, aviso }); return 201 }
  return { enviados, enviar, de: (nombre: string) => enviados.filter((e) => e.para === nombre).map((e) => e.aviso) }
}
const conAvisos = (db: Db, u: { id: string; nombre: string }) =>
  guardarSuscripcion(db, u.id, { endpoint: `https://fcm.googleapis.com/fcm/send/${u.nombre}`, keys: CLAVES })
const enBandeja = async (db: Db, userId: string) => (await bandeja(db, { userId })).entradas.map((e) => ({ titulo: e.titulo, cuerpo: e.cuerpo, href: e.href }))

/** Euge con su lista (Termo y Mate) y tres que le regalan, todos con los avisos activados. */
async function armar() {
  const db = await createTestDb()
  const [euge, rodri, caro, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Rodri'), await usuario(db, 'Caro'), await usuario(db, 'Sofi')]
  const lista = await listaDe(db, euge.id)
  const termo = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Termo' }))!
  const mate = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Mate' }))!
  for (const u of [euge, rodri, caro, sofi]) await conAvisos(db, u)
  return { db, euge, rodri, caro, sofi, lista, termo, mate, push: pushFalso() }
}

test('"¿Ya compraste…?" 3 días antes del cumple y otra vez la víspera, con el link al deseo; si ya lo marcó, no; y nunca dos veces', async () => {
  const { db, euge, rodri, caro, lista, termo, mate, push } = await armar()
  await cumpleEn(db, euge.id, 3)
  const r = await reserveItem(db, termo.id, { userId: rodri.id })
  const c = await reserveItem(db, mate.id, { userId: caro.id })
  if (!r.ok || !c.ok) throw new Error('no reservó')
  // la reserva no vence antes del cumple: en vez de liberarla, se pregunta
  expect((await db.select().from(claims).where(eq(claims.id, r.claimId)))[0].expiresAt).toEqual(inicioDelDia(new Date(HOY.getTime() + 5 * DIA)))

  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ loCompraste: 2, venceManana: 0, fallaron: [] })
  expect(push.de('Rodri')).toEqual([{
    title: '🎁 ¿Ya compraste "Termo"?',
    body: 'El cumple de Euge es en 3 días. Si ya lo tenés, marcá "Ya lo compré"; si no vas a llegar, liberalo así lo regala otra persona.',
    url: `/l/${lista.shareToken}/item/${termo.id}`,
  }])
  // queda en su bandeja, con el mismo link
  expect(await enBandeja(db, rodri.id)).toEqual([expect.objectContaining({ titulo: '¿Ya compraste "Termo"?', href: `/l/${lista.shareToken}/item/${termo.id}` })])
  // el cron corre dos veces el mismo día, y al otro día (faltan 2): nada nuevo
  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ loCompraste: 0 })
  expect(await mandarRecordatorios(db, en(1), push.enviar)).toMatchObject({ loCompraste: 0 })
  expect(push.enviados).toHaveLength(2)

  // Caro lo marca comprado: la víspera solo le llega a Rodri, que sigue sin marcar
  expect(await markBought(db, c.claimId, { userId: caro.id })).toEqual({ ok: true })
  expect(await mandarRecordatorios(db, en(2), push.enviar)).toMatchObject({ loCompraste: 1 })
  expect(push.de('Rodri')[1]).toMatchObject({ title: '🎁 ¿Ya compraste "Termo"?', body: expect.stringContaining('El cumple de Euge es mañana.') })
  expect(push.de('Caro')).toHaveLength(1)
  // el día del cumple, nada; al otro día, la última: mañana vence y el deseo vuelve a quedar libre
  expect(await mandarRecordatorios(db, en(3), push.enviar)).toMatchObject({ loCompraste: 0, venceManana: 0 })
  expect(await mandarRecordatorios(db, en(4), push.enviar)).toMatchObject({ loCompraste: 0, venceManana: 1 })
  expect(push.de('Rodri')[2].title).toBe('⏳ Tu reserva de "Termo" vence mañana')
  expect((await db.select().from(claims).where(eq(claims.id, r.claimId)))[0].estado).toBe('reservado')
  // a Euge, nada de todo esto en ningún momento: solo, al día siguiente de su cumple, lo que le llega a cualquiera que cumplió
  const paraEuge = { title: '🎁 ¿Qué te regalaron?', body: 'Marcalo y dejá tu lista al día para el año que viene.', url: '/mi-lista/recibidos' }
  expect(push.de('Euge')).toEqual([paraEuge])
  expect(await enBandeja(db, euge.id)).toEqual([{ titulo: '¿Qué te regalaron?', cuerpo: paraEuge.body, href: paraEuge.url }])
})

test('reservó 2 días antes: le llega igual ("es en 2 días") y otra vez la víspera; en la fecha de una lista en común, con su nombre', async () => {
  const { db, euge, rodri, caro, termo, push } = await armar()
  await cumpleEn(db, euge.id, 2)
  await reserveItem(db, termo.id, { userId: rodri.id })
  const casa = await crearGrupo(db, euge.id, { nombre: 'Casa nueva' })
  await guardarFechaGrupo(db, casa, euge.id, new Date(HOY.getTime() + 3 * DIA).toISOString().slice(0, 10), false)
  const sillon = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Sillón' }, casa))!
  await reserveItem(db, sillon.id, { userId: caro.id })
  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ loCompraste: 2 })
  expect(push.de('Rodri')[0].body).toContain('El cumple de Euge es en 2 días.')
  expect(push.de('Caro')[0]).toMatchObject({ title: '🎁 ¿Ya compraste "Sillón"?', body: expect.stringContaining('"Casa nueva" es en 3 días.') })
  expect(await mandarRecordatorios(db, en(1), push.enviar)).toMatchObject({ loCompraste: 1 })
  expect(push.de('Rodri')[1].body).toContain('El cumple de Euge es mañana.')
})

test('"Tu reserva vence mañana": las que están lejos de un evento; no a un invitado, ni la de un regalo grupal, ni sobre una lista que ahora es suya', async () => {
  const { db, euge, rodri, caro, sofi, lista, termo, mate, push } = await armar()
  const mananaALaTarde = new Date(inicioDelDia(new Date(HOY.getTime() + DIA)).getTime() + 15 * 3600_000)
  await db.insert(claims).values({ itemId: termo.id, claimerUserId: rodri.id, createdAt: en(-13), expiresAt: mananaALaTarde })
  // la de Caro vence en 3 días: todavía no
  await db.insert(claims).values({ itemId: mate.id, claimerUserId: caro.id, createdAt: en(-11), expiresAt: en(3) })
  // la abuela, sin cuenta, no tiene dónde recibirlo: no es un error
  const abuela = await createGuest(db, 'Abuela')
  const libro = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Libro' }))!
  await db.insert(claims).values({ itemId: libro.id, claimerGuestId: abuela.id, expiresAt: mananaALaTarde })
  // el regalo grupal de Sofi no vence
  const bici = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Bici' }))!
  expect((await iniciarRegaloGrupal(db, bici.id, sofi.id)).ok).toBe(true)
  // Martín reservó en "Casa" y después se sumó como dueño: un aviso sobre esa lista le contaría lo suyo
  const martin = await usuario(db, 'Martin')
  await conAvisos(db, martin)
  const casa = await crearGrupo(db, euge.id, { nombre: 'Casa' })
  const mesa = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Mesa' }, casa))!
  await db.insert(claims).values({ itemId: mesa.id, claimerUserId: martin.id, expiresAt: mananaALaTarde })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, casa))
  expect(await unirseAGrupo(db, grupo.inviteToken!, martin.id)).toBe(casa)

  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ loCompraste: 0, venceManana: 1, fallaron: [] })
  expect(push.enviados).toEqual([{ para: 'Rodri', aviso: {
    title: '⏳ Tu reserva de "Termo" vence mañana',
    body: 'Si ya lo compraste, marcá "Ya lo compré". Si no, mañana queda libre para que lo regale otra persona.',
    url: `/l/${lista.shareToken}/item/${termo.id}`,
  } }])
  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ venceManana: 0 })
  expect(push.enviados).toHaveLength(1)
})

test('si cambiaron el link para regalar después de la reserva, el recordatorio no le pasa el nuevo: lleva a Mis regalos', async () => {
  const { db, euge, rodri, lista, termo, push } = await armar()
  await cumpleEn(db, euge.id, 3)
  await db.insert(claims).values({ itemId: termo.id, claimerUserId: rodri.id, createdAt: en(-2), expiresAt: en(5) })
  const nuevo = await cambiarLinkParaRegalar(db, lista.id, euge.id)
  await mandarRecordatorios(db, AHORA, push.enviar)
  expect(push.de('Rodri')).toMatchObject([{ title: '🎁 ¿Ya compraste "Termo"?', url: '/regalos' }])
  expect(JSON.stringify(push.enviados)).not.toContain(nuevo)
})

test('el repaso del día estira primero las reservas de antes: la que vencía mañana, en la víspera del cumple, no "vence mañana"', async () => {
  const { db, euge, rodri, termo, push } = await armar()
  await cumpleEn(db, euge.id, 3)
  // con la regla de antes vencía 3 días antes del cumple o, reservada tarde, a las 24 horas
  const [vieja] = await db.insert(claims).values({ itemId: termo.id, claimerUserId: rodri.id, createdAt: en(-1), expiresAt: en(1) }).returning()
  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ reservasFirmes: 1, loCompraste: 1, venceManana: 0 })
  expect((await db.select().from(claims).where(eq(claims.id, vieja.id)))[0].expiresAt).toEqual(inicioDelDia(new Date(HOY.getTime() + 5 * DIA)))
  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ reservasFirmes: 0, loCompraste: 0 })
})

test('"El cumple de Euge es en 7 días": a quienes siguen su lista y todavía no eligieron nada, si queda algo para reservar', async () => {
  const { db, euge, rodri, caro, sofi, lista, termo, mate, push } = await armar()
  const [flor, nico] = [await usuario(db, 'Flor'), await usuario(db, 'Nico')]
  for (const u of [flor, nico]) await conAvisos(db, u)
  await cumpleEn(db, euge.id, 7)
  // Rodri, Caro, Sofi y Flor la siguen; Nico no. Caro ya reservó, y Sofi y Flor están en un regalo grupal
  for (const u of [rodri, caro, sofi, flor]) await seguir(db, u.id, lista.id)
  await db.insert(claims).values({ itemId: termo.id, claimerUserId: caro.id, expiresAt: en(9) })
  const g = await iniciarRegaloGrupal(db, mate.id, sofi.id)
  if (!g.ok) throw new Error(g.reason)
  expect(await sumarseARegalo(db, g.giftId, flor.id)).toBe(true)
  // todo tomado: no hay nada que ir a elegir, así que no se molesta a nadie
  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ cumpleCerca: 0 })
  // Euge suma un deseo ese mismo día: al otro día (faltan 6) sí, solo a Rodri
  await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Libro' })
  expect(await mandarRecordatorios(db, en(1), push.enviar)).toMatchObject({ cumpleCerca: 1, fallaron: [] })
  expect(push.enviados).toEqual([{ para: 'Rodri', aviso: {
    title: '🎂 El cumple de Euge es en 6 días',
    body: 'Todavía no elegiste qué regalar. Mirá la lista y reservá algo, así nadie lo repite.',
    url: `/l/${lista.shareToken}`,
  } }])
  // una sola vez por cumple
  expect(await mandarRecordatorios(db, en(1), push.enviar)).toMatchObject({ cumpleCerca: 0 })
  expect(await mandarRecordatorios(db, en(2), push.enviar)).toMatchObject({ cumpleCerca: 0 })
  expect(push.enviados).toHaveLength(1)
  expect(await enBandeja(db, euge.id)).toEqual([])
})

test('la fecha de una lista en común también se avisa a quienes la siguen, nunca a sus dueños (ni al que salió)', async () => {
  const { db, euge, rodri, caro, sofi, push } = await armar()
  const casa = await crearGrupo(db, euge.id, { nombre: 'Juancito' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, casa))
  expect(await unirseAGrupo(db, grupo.inviteToken!, caro.id)).toBe(casa)
  const enSiete = new Date(HOY.getTime() + 7 * DIA)
  await guardarFechaGrupo(db, casa, euge.id, enSiete.toISOString().slice(0, 10), true, AHORA, true)
  await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Triciclo' }, casa)
  for (const u of [rodri, sofi]) await seguir(db, u.id, casa)
  // por datos de antes, una dueña que además la sigue
  await db.insert(listFollows).values({ userId: caro.id, listId: casa }).onConflictDoNothing()
  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ cumpleCerca: 2 })
  expect(push.de('Rodri')).toMatchObject([{ title: '🎂 El cumple de Juancito es en 7 días', url: `/l/${grupo.shareToken}` }])
  expect(push.de('Sofi')).toHaveLength(1)
  expect([...push.de('Euge'), ...push.de('Caro')]).toEqual([])
})

test('"Tu cumple es en 30 días": al que cumple, una sola vez, para que ponga su lista al día', async () => {
  const { db, euge, rodri, caro, push } = await armar()
  await cumpleEn(db, euge.id, 30)
  await cumpleEn(db, rodri.id, 31)
  // a Caro el cron no le pasó justo a los 30: le llega igual, con los días que faltan
  await cumpleEn(db, caro.id, 28)
  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ tuCumple: 2, fallaron: [] })
  expect(push.de('Euge')).toEqual([{
    title: '🎂 Tu cumple es en 30 días',
    body: 'Poné tu lista al día: sumá lo que querés y sacá lo que ya no, así tu gente sabe qué regalarte.',
    url: '/mi-lista',
  }])
  expect(push.de('Caro')[0].title).toBe('🎂 Tu cumple es en 28 días')
  expect(push.de('Rodri')).toEqual([])
  // dos veces el mismo día no repite; al otro día le toca a Rodri, y a Euge no de nuevo
  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ tuCumple: 0 })
  expect(await mandarRecordatorios(db, en(1), push.enviar)).toMatchObject({ tuCumple: 1 })
  expect(push.de('Euge')).toHaveLength(1)
  expect(push.de('Rodri')).toHaveLength(1)
})

test('cuentas pendientes: a quien debe su parte de un regalo grupal comprado hace una semana, como mucho una vez por semana, hasta que paga', async () => {
  const { db, rodri, sofi, mate, termo, push } = await armar()
  // Sofi organiza dos regalos con Rodri: el del mate lo compró hace 8 días; el del termo, hace 3
  const regalo = async (itemId: string, haceDias: number) => {
    const g = await iniciarRegaloGrupal(db, itemId, sofi.id)
    if (!g.ok) throw new Error(g.reason)
    expect(await sumarseARegalo(db, g.giftId, rodri.id)).toBe(true)
    expect(await comprarRegalo(db, g.giftId, sofi.id, { total: 30000 }, push.enviar)).toMatchObject({ ok: true })
    await db.update(groupGifts).set({ compradoAt: en(-haceDias) }).where(eq(groupGifts.id, g.giftId))
    return g.giftId
  }
  const delTermo = await regalo(termo.id, 3)
  push.enviados.length = 0
  // todavía no pasó una semana de ninguno
  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ cuentas: 0 })
  const delMate = await regalo(mate.id, 8)
  push.enviados.length = 0

  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ cuentas: 1, fallaron: [] })
  // lo que dice Cuentas: todo lo que le debe a Sofi, sin nombrar los deseos
  expect(push.enviados).toEqual([{ para: 'Rodri', aviso: {
    title: '💸 Tenés cuentas pendientes',
    body: 'Le debés $30.000 a Sofi de los regalos grupales. Cuando le pagues, marcalo en Cuentas.',
    url: '/cuentas',
  } }])
  // el mismo día y a los 3 días, no; a la semana, de nuevo
  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ cuentas: 0 })
  expect(await mandarRecordatorios(db, en(3), push.enviar)).toMatchObject({ cuentas: 0 })
  expect(await mandarRecordatorios(db, en(7), push.enviar)).toMatchObject({ cuentas: 1 })
  expect(push.de('Rodri')).toHaveLength(2)
  // paga todo: no se le recuerda más. A Sofi (le deben) y a Caro (no está), nunca
  for (const giftId of [delMate, delTermo]) expect(await marcarPagado(db, giftId, rodri.id, rodri.id, true, undefined, push.enviar)).toBe(true)
  expect((await db.select().from(groupGiftMembers).where(eq(groupGiftMembers.userId, rodri.id))).every((m) => m.pagado)).toBe(true)
  push.enviados.length = 0
  expect(await mandarRecordatorios(db, en(14), push.enviar)).toMatchObject({ cuentas: 0 })
  expect(push.enviados).toEqual([])
  expect([...push.de('Caro')]).toEqual([])
})

test('cuentas pendientes: si la encargada borró su cuenta, a nadie se le recuerda que le debe a "Cuenta eliminada"', async () => {
  const { db, rodri, sofi, mate, push } = await armar()
  const g = await iniciarRegaloGrupal(db, mate.id, sofi.id)
  if (!g.ok) throw new Error(g.reason)
  expect(await sumarseARegalo(db, g.giftId, rodri.id)).toBe(true)
  expect(await comprarRegalo(db, g.giftId, sofi.id, { total: 30000 }, push.enviar)).toMatchObject({ ok: true })
  await db.update(groupGifts).set({ compradoAt: en(-8) }).where(eq(groupGifts.id, g.giftId))
  // Sofi se va de GiftR: el regalo ya comprado queda a nombre de "Cuenta eliminada" para que Rodri siga viendo su cuenta
  expect(await borrarCuenta(db, sofi.id, push.enviar)).toBe(true)
  push.enviados.length = 0

  expect(await mandarRecordatorios(db, AHORA, push.enviar)).toMatchObject({ cuentas: 0, fallaron: [] })
  expect(push.enviados).toEqual([])
})

/**
 * Todo lo que le llega al dueño en los días previos a su cumple (a su celular y a su bandeja), con la lista llena de
 * reservas, compras y un regalo grupal con deuda, o sin nada.
 */
async function loQueLeLlegaAlDueno(conReservas: boolean) {
  const { db, euge, rodri, caro, sofi, lista, termo, mate, push } = await armar()
  await cumpleEn(db, euge.id, 30)
  const bici = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Bici' }))!
  for (const u of [rodri, caro, sofi]) await seguir(db, u.id, lista.id)
  if (conReservas) {
    await db.insert(claims).values({ itemId: termo.id, claimerUserId: rodri.id, createdAt: en(-13), expiresAt: en(1) })
    const c = await reserveItem(db, mate.id, { userId: caro.id })
    if (!c.ok) throw new Error(c.reason)
    await markBought(db, c.claimId, { userId: caro.id }, 'el de calabaza')
    const g = await iniciarRegaloGrupal(db, bici.id, sofi.id)
    if (!g.ok) throw new Error(g.reason)
    await sumarseARegalo(db, g.giftId, rodri.id)
    await comprarRegalo(db, g.giftId, sofi.id, { total: 90000 }, push.enviar)
    await db.update(groupGifts).set({ compradoAt: en(-8) }).where(eq(groupGifts.id, g.giftId))
  }
  // todos los días desde 30 antes hasta 2 después del cumple
  for (let d = 0; d <= 32; d++) expect((await mandarRecordatorios(db, en(d), push.enviar)).fallaron).toEqual([])
  return { push: push.de('Euge'), bandeja: await enBandeja(db, euge.id), aLosDemas: push.enviados.length - push.de('Euge').length }
}

test('EL TEST DE ORO, recordatorios: al dueño le llega lo mismo con la lista llena de reservas que sin ninguna, y nada habla de ellas', async () => {
  const [con, sin] = [await loQueLeLlegaAlDueno(true), await loQueLeLlegaAlDueno(false)]
  // a los que regalan sí les fueron llegando cosas
  expect(con.aLosDemas).toBeGreaterThan(0)
  // al dueño, exactamente lo mismo: "Tu cumple es en 30 días" y, al día siguiente del cumple, "¿Qué te regalaron?"
  expect(con.push).toEqual(sin.push)
  expect(con.bandeja).toEqual(sin.bandeja)
  expect(con.push).toEqual([
    expect.objectContaining({ title: '🎂 Tu cumple es en 30 días', url: '/mi-lista' }),
    { title: '🎁 ¿Qué te regalaron?', body: 'Marcalo y dejá tu lista al día para el año que viene.', url: '/mi-lista/recibidos' },
  ])
  const texto = JSON.stringify([con.push, con.bandeja]).toLowerCase()
  for (const p of ['reserv', 'compr', 'termo', 'mate', 'bici', 'rodri', 'caro', 'sofi', 'cuenta', 'debés']) expect(texto).not.toContain(p)
}, 120_000)

// ---------- el route del cron ----------

beforeEach(() => { delete process.env.CRON_SECRET })

const pedido = (autorizacion?: string) =>
  new Request('https://giftr.test/api/cron/diario', autorizacion ? { headers: { authorization: autorizacion } } : undefined)

test('el cron: sin CRON_SECRET configurado, o con otro valor, 401 y no hace nada', async () => {
  const db = await createTestDb()
  h.db = db
  const euge = await usuario(db, 'Euge')
  await cumpleEn(db, euge.id, 30)
  // sin la variable no entra nadie, tampoco con "Bearer undefined" o sin nada
  for (const a of [undefined, 'Bearer undefined', 'Bearer ', 'Bearer secreto']) expect((await GET(pedido(a))).status).toBe(401)
  process.env.CRON_SECRET = 'secreto'
  for (const a of [undefined, 'Bearer otro', 'secreto', 'Bearer secretos', 'bearer secreto']) expect((await GET(pedido(a))).status).toBe(401)
  expect(await db.select().from(recordatoriosEnviados)).toEqual([])
  expect(await db.select().from(avisos)).toEqual([])
})

test('el cron: con el secreto de Vercel manda los recordatorios y contesta cuántos salieron de cada tipo', async () => {
  const db = await createTestDb()
  h.db = db
  const euge = await usuario(db, 'Euge')
  await cumpleEn(db, euge.id, 30)
  process.env.CRON_SECRET = 'secreto'
  const r = await GET(pedido('Bearer secreto'))
  expect(r.status).toBe(200)
  expect(r.headers.get('cache-control')).toBe('no-store')
  expect(await r.json()).toEqual({
    reservasFirmes: 0, loCompraste: 0, venceManana: 0, cumpleCerca: 0, tuCumple: 1, cuentas: 0, queTeRegalaron: 0, contale: 0, fallaron: [],
  })
  expect((await db.select().from(avisos)).map((a) => a.titulo)).toEqual(['🎂 Tu cumple es en 30 días'])
  // Vercel lo llama de nuevo: no repite
  expect(await (await GET(pedido('Bearer secreto'))).json()).toMatchObject({ tuCumple: 0 })
  expect(await db.select().from(avisos)).toHaveLength(1)
})

test('vercel.json: el cron de todos los días a las 12 UTC (las 9 en Argentina), en la región de siempre', () => {
  const v = JSON.parse(readFileSync('vercel.json', 'utf8'))
  expect(v.regions).toEqual(['gru1'])
  expect(v.crons).toEqual([{ path: '/api/cron/diario', schedule: '0 12 * * *' }])
  // la ruta existe y responde a GET, que es como llama Vercel
  expect(readFileSync('src/app/api/cron/diario/route.ts', 'utf8')).toContain('export async function GET')
})

test('la migración agrega la tabla de recordatorios enviados, con una sola fila por persona, tipo y motivo', () => {
  // el número lo pone quien junta las ramas: se busca por el nombre
  const archivo = readdirSync('drizzle').find((f) => f.endsWith('_recordatorios_enviados.sql'))!
  const sql = readFileSync(`drizzle/${archivo}`, 'utf8')
  expect(sql).toContain('CREATE TABLE "recordatorios_enviados"')
  expect(sql).toContain('PRIMARY KEY("user_id","tipo","clave")')
})
