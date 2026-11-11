import { expect, test } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { avisos, claims, groupGiftMembers, groupGifts, items, lists, notifications, recordatoriosEnviados } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { reserveItem } from '@/lib/claims'
import { guardarCumple, hoyLocal, inicioDelDia } from '@/lib/events'
import { createGuest } from '@/lib/guest'
import { archiveItem, borrarDeseo, createItem, DESHACER_RECIBIDO_DIAS, restoreItem } from '@/lib/items'
import { getListForViewer, getOwnList } from '@/lib/lists'
import { misRegalos } from '@/lib/mis-regalos'
import { comprarRegalo, iniciarRegaloGrupal, sumarseARegalo } from '@/lib/regalos'
import { mandarRecordatorios } from '@/lib/recordatorios'
import {
  agradecer, cerrarPostEvento, dePartede, marcarRecibidos, POST_EVENTO_DIAS, postEvento, recibidosDe, revelarRegalo, textoGracias, yaSeRegalo,
} from '@/lib/post-evento'

// Después del cumple: el dueño marca lo que le regalaron, quien lo compró puede contarle que fue suyo, y el dueño
// agradece. Y la regla de la sorpresa, que después del evento sigue igual.

const DIA = 86400_000
const AHORA = new Date()
const HOY = hoyLocal(AHORA)
const en = (dias: number) => new Date(AHORA.getTime() + dias * DIA)
const iso = (d: Date) => d.toISOString().slice(0, 10)

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}
/** Su cumple fue hace tantos días (negativo: es dentro de tantos). */
async function cumpleHace(db: Db, userId: string, dias: number) {
  const f = new Date(HOY.getTime() - dias * DIA)
  await guardarCumple(db, userId, f.getUTCDate(), f.getUTCMonth() + 1)
  return f
}
type Estado = 'reservado' | 'comprado'
/** Una reserva (o una compra) hecha hace tantos días; la reserva, viva hasta mañana salvo que se diga cuándo vence. */
async function reserva(db: Db, itemId: string, userId: string, estado: Estado = 'reservado', { hace = 10, vence = inicioDelDia(new Date(HOY.getTime() + DIA)) } = {}) {
  const [c] = await db.insert(claims).values({ itemId, claimerUserId: userId, estado, createdAt: en(-hace), updatedAt: en(-hace), expiresAt: vence }).returning()
  return c
}
const claim = async (db: Db, id: string) => (await db.select().from(claims).where(eq(claims.id, id)))[0]
const deseo = async (db: Db, id: string) => (await db.select().from(items).where(eq(items.id, id)))[0]
const enBandeja = async (db: Db, userId: string) => (await db.select().from(avisos).where(eq(avisos.userId, userId))).map((a) => ({ titulo: a.titulo, cuerpo: a.cuerpo, url: a.url }))

/** Euge con Termo, Mate y Bici en su lista, y Rodri, Caro y Sofi, que le regalan. hace: cuántos días hace que cumplió. */
async function armar(hace = 1) {
  const db = await createTestDb()
  const [euge, rodri, caro, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Rodri'), await usuario(db, 'Caro'), await usuario(db, 'Sofi')]
  const cumple = await cumpleHace(db, euge.id, hace)
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  const nuevo = async (titulo: string) => (await createItem(db, euge.id, { tipo: 'exacto', titulo }))!
  const [termo, mate, bici] = [await nuevo('Termo'), await nuevo('Mate'), await nuevo('Bici')]
  return { db, euge, rodri, caro, sofi, lista, cumple, termo, mate, bici }
}

/** Un regalo grupal de Sofi y Caro, armado antes del cumple; comprado, si se pide. */
async function grupal(db: Db, itemId: string, sofiId: string, caroId: string, comprado = true) {
  const g = await iniciarRegaloGrupal(db, itemId, sofiId)
  if (!g.ok) throw new Error(g.reason)
  expect(await sumarseARegalo(db, g.giftId, caroId)).toBe(true)
  if (comprado) expect(await comprarRegalo(db, g.giftId, sofiId, { total: 30000 })).toMatchObject({ ok: true })
  const [gift] = await db.update(groupGifts).set({ createdAt: en(-10) }).where(eq(groupGifts.id, g.giftId)).returning()
  await db.update(claims).set({ createdAt: en(-10), updatedAt: en(-10) }).where(eq(claims.id, gift.claimId))
  return gift
}

// ---------- la ventana ----------

test('la ventana: desde el día siguiente al cumple y por 30 días; el día del cumple y sin cumple cargado, no', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge')
  await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Termo' })
  // sin cumple no hay evento
  expect(await postEvento(db, euge.id, AHORA)).toBeNull()
  expect(await marcarRecibidos(db, euge.id, [], AHORA)).toBeNull()
  expect(await cerrarPostEvento(db, euge.id, AHORA)).toBe(false)

  const cumple = await cumpleHace(db, euge.id, 0)
  // el día del cumple todavía no pasó: el último que pasó es el del año anterior
  expect(await postEvento(db, euge.id, AHORA)).toMatchObject({ enVentana: false, pendiente: false })
  expect(await postEvento(db, euge.id, en(1))).toEqual({ fecha: cumple, hace: 1, enVentana: true, pendiente: true })
  expect(await postEvento(db, euge.id, en(POST_EVENTO_DIAS))).toMatchObject({ hace: 30, enVentana: true, pendiente: true })
  expect(await postEvento(db, euge.id, en(POST_EVENTO_DIAS + 1))).toMatchObject({ hace: 31, enVentana: false, pendiente: false })
})

test('"Ahora no" cierra la tarjeta para ese cumple y no vuelve; al año siguiente, sí', async () => {
  const { db, euge, lista, cumple } = await armar(3)
  expect(await postEvento(db, euge.id, AHORA)).toMatchObject({ pendiente: true })
  expect(await cerrarPostEvento(db, euge.id, AHORA)).toBe(true)
  expect((await db.select().from(lists).where(eq(lists.id, lista.id)))[0].postEventoHecho).toBe(iso(cumple))
  for (const d of [0, 1, 20]) expect(await postEvento(db, euge.id, en(d))).toMatchObject({ enVentana: true, pendiente: false })
  // no marcó nada: sus deseos siguen todos
  expect((await getOwnList(db, euge.id))!.items.every((i) => i.estadoDueno === 'activo')).toBe(true)
  // el cumple del año que viene es otro evento
  expect(await postEvento(db, euge.id, en(365 + 2))).toMatchObject({ enVentana: true, pendiente: true })
})

// ---------- marcar y desmarcar ----------

test('marcar lo que le regalaron: varios de una vez, salen de la lista y quedan en Recibidos con el año del cumple', async () => {
  const { db, euge, rodri, cumple, termo, mate, bici } = await armar(2)
  // uno de otra lista, uno que no existe y cualquier cosa: no cuentan
  const ajeno = (await createItem(db, rodri.id, { tipo: 'exacto', titulo: 'Reloj' }))!
  expect(await marcarRecibidos(db, euge.id, [termo.id, bici.id, bici.id, ajeno.id, 'no-es-un-id', crypto.randomUUID()], AHORA)).toBe(2)

  expect((await getOwnList(db, euge.id))!.items.map((i) => [i.titulo, i.estadoDueno]))
    .toEqual([['Termo', 'me_lo_regalaron'], ['Mate', 'activo'], ['Bici', 'me_lo_regalaron']])
  expect(await deseo(db, termo.id)).toMatchObject({ recibidoEvento: iso(cumple), recibidoAt: AHORA })
  expect((await deseo(db, ajeno.id)).estadoDueno).toBe('activo')
  const { recibidos, contados } = await recibidosDe(db, euge.id, AHORA)
  // los de un mismo envío, en el orden de su lista
  expect(recibidos).toEqual([
    { id: termo.id, titulo: 'Termo', fotoUrl: null, anio: cumple.getUTCFullYear(), seDeshace: true, dePartede: [] },
    { id: bici.id, titulo: 'Bici', fotoUrl: null, anio: cumple.getUTCFullYear(), seDeshace: true, dePartede: [] },
  ])
  expect(contados).toEqual([])
  // el evento quedó cerrado: la tarjeta no vuelve
  expect(await postEvento(db, euge.id, AHORA)).toMatchObject({ enVentana: true, pendiente: false })
  // un doble envío no marca nada de nuevo, y lo que ya sacó de la lista no se puede marcar
  expect(await marcarRecibidos(db, euge.id, [termo.id, bici.id], AHORA)).toBe(0)
  expect(await archiveItem(db, mate.id, euge.id, 'lo_tengo')).toBe(true)
  expect(await marcarRecibidos(db, euge.id, [mate.id], AHORA)).toBe(0)
  expect((await deseo(db, mate.id)).estadoDueno).toBe('lo_tengo')
  // para quien regala salieron de la lista, como cualquier archivado
  const vista = await getListForViewer(db, (await db.select().from(lists).where(eq(lists.ownerId, euge.id)))[0].shareToken, { userId: rodri.id })
  expect(vista?.items).toEqual([])
})

test('sin tildar nada también cierra el cumple; uno solo desde Recibidos (cerrar: false), no', async () => {
  const { db, euge, termo } = await armar(2)
  expect(await marcarRecibidos(db, euge.id, [termo.id], AHORA, { cerrar: false })).toBe(1)
  expect(await postEvento(db, euge.id, AHORA)).toMatchObject({ pendiente: true })
  expect(await marcarRecibidos(db, euge.id, [], AHORA)).toBe(0)
  expect(await postEvento(db, euge.id, AHORA)).toMatchObject({ pendiente: false })
})

// ---------- lo de quienes regalan ----------

test('una reserva sin comprar de un deseo que el dueño marcó recibido queda comprada, sin avisos; la de uno que no marcó sigue igual', async () => {
  const { db, euge, rodri, caro, sofi, termo, mate, bici } = await armar(1)
  const deRodri = await reserva(db, termo.id, rodri.id)
  const deCaro = await reserva(db, mate.id, caro.id)
  const deSofi = await reserva(db, bici.id, sofi.id, 'comprado')
  const invitado = await createGuest(db, 'Tía Marta')
  const [deLaTia] = await db.insert(claims).values({ itemId: termo.id, claimerGuestId: invitado.id, createdAt: en(-9), updatedAt: en(-9), expiresAt: en(1) }).returning()

  expect(await marcarRecibidos(db, euge.id, [termo.id, bici.id], AHORA)).toBe(2)

  // lo de Rodri (y lo de la tía, sin cuenta) quedó como comprado, a la hora en que Euge lo marcó
  expect(await claim(db, deRodri.id)).toMatchObject({ estado: 'comprado', updatedAt: AHORA, reveladoAt: null })
  expect(await claim(db, deLaTia.id)).toMatchObject({ estado: 'comprado', updatedAt: AHORA })
  // lo que Sofi ya había comprado no cambia, y la reserva de Caro (el Mate no lo marcó) tampoco
  expect(await claim(db, deSofi.id)).toEqual(deSofi)
  expect(await claim(db, deCaro.id)).toEqual(deCaro)
  // nadie recibe nada: ni carteles sobre el deseo ni avisos
  expect(await db.select().from(notifications)).toEqual([])
  expect(await db.select().from(avisos)).toEqual([])

  // a Rodri deja de pedirle que lo compre: pasa a lo que ya regaló. A Caro le sigue en "Por comprar"
  const r = await misRegalos(db, rodri.id, AHORA)
  expect(r.porComprar).toEqual([])
  expect(r.comprados).toEqual([])
  expect(r.historial).toMatchObject([{ titulo: 'Termo', estado: 'comprado', revelado: false, puedeRevelar: true }])
  expect((await misRegalos(db, caro.id, AHORA)).porComprar.map((x) => x.titulo)).toEqual(['Mate'])
  // y los recordatorios de reservas ya no le hablan del Termo
  await mandarRecordatorios(db, AHORA)
  expect((await enBandeja(db, rodri.id)).map((a) => a.titulo)).toEqual(['🎁 ¿Le contás a Euge que fue tuyo?'])
})

test('la reserva que venció después del cumple también cuenta como ese regalo; la que venció antes, no', async () => {
  const { db, euge, rodri, caro, sofi, cumple, termo } = await armar(5)
  // cerca del cumple las reservas duran hasta el final del día siguiente: Euge lo marca recién a los 5 días
  const firme = await reserva(db, termo.id, rodri.id, 'reservado', { vence: inicioDelDia(new Date(cumple.getTime() + 2 * DIA)) })
  const deAntes = await reserva(db, termo.id, caro.id, 'reservado', { hace: 40, vence: en(-26) })
  // Sofi la dejó vencer y volvió a reservar otra cosa: no tiene nada vivo del Termo, pero su vencida es de antes del cumple
  const vieja = await reserva(db, termo.id, sofi.id, 'reservado', { hace: 60, vence: en(-46) })
  expect(await marcarRecibidos(db, euge.id, [termo.id], AHORA)).toBe(1)
  expect(await claim(db, firme.id)).toMatchObject({ estado: 'comprado', updatedAt: AHORA })
  expect((await claim(db, deAntes.id)).estado).toBe('expirado')
  expect((await claim(db, vieja.id)).estado).toBe('expirado')
  expect(await db.select().from(notifications)).toEqual([])
})

test('un regalo grupal abierto sobre un deseo marcado recibido sigue abierto, para dividirlo en Cuentas (como con "Ya lo tengo")', async () => {
  const { db, euge, caro, sofi, bici } = await armar(1)
  const gift = await grupal(db, bici.id, sofi.id, caro.id, false)
  expect(await marcarRecibidos(db, euge.id, [bici.id], AHORA)).toBe(1)
  expect((await db.select().from(groupGifts).where(eq(groupGifts.id, gift.id)))[0].estado).toBe('abierto')
  expect((await claim(db, gift.claimId)).estado).toBe('reservado')
  // a los dos se les dice que lo terminen en Cuentas; al dueño, nada
  const carteles = await db.select().from(notifications)
  expect(carteles.map((n) => n.tipo)).toEqual(['regalo_lo_tiene', 'regalo_lo_tiene'])
  expect(carteles.map((n) => n.userId).sort()).toEqual([caro.id, sofi.id].sort())
  expect(await enBandeja(db, euge.id)).toEqual([])
  // la encargada lo compra después y divide: la cuenta se arma como siempre
  expect(await comprarRegalo(db, gift.id, sofi.id, { total: 30000 })).toMatchObject({ ok: true })
  expect((await db.select().from(groupGiftMembers).where(eq(groupGiftMembers.giftId, gift.id))).map((m) => m.monto)).toEqual([15000, 15000])
})

test('"Me equivoqué" (en el mes): vuelve a la lista tal cual estaba, y las reservas que se habían cerrado vuelven a ser reservas', async () => {
  const { db, euge, rodri, caro, sofi, cumple, termo, mate } = await armar(5)
  const viva = await reserva(db, termo.id, rodri.id, 'reservado', { vence: en(3) })
  const vencida = await reserva(db, mate.id, caro.id, 'reservado', { vence: inicioDelDia(new Date(cumple.getTime() + 2 * DIA)) })
  const compra = await reserva(db, mate.id, sofi.id, 'comprado')
  expect(await marcarRecibidos(db, euge.id, [termo.id, mate.id], AHORA)).toBe(2)
  expect((await claim(db, viva.id)).estado).toBe('comprado')
  expect((await claim(db, vencida.id)).estado).toBe('comprado')

  for (const id of [termo.id, mate.id]) expect(await restoreItem(db, id, euge.id, en(1))).toBe(true)
  expect(await deseo(db, termo.id)).toMatchObject({ estadoDueno: 'activo', recibidoAt: null, recibidoEvento: null, ocupaDesde: null })
  expect((await recibidosDe(db, euge.id)).recibidos).toEqual([])
  // la de Rodri vuelve a ser su reserva, con su vencimiento; la que ya había vencido, vencida; la compra de Sofi, igual
  expect(await claim(db, viva.id)).toMatchObject({ estado: 'reservado', expiresAt: viva.expiresAt })
  expect((await claim(db, vencida.id)).estado).toBe('expirado')
  expect(await claim(db, compra.id)).toEqual(compra)
  expect((await misRegalos(db, rodri.id)).porComprar.map((x) => x.titulo)).toEqual(['Termo'])
  // el Termo sigue tomado por Rodri: nadie más lo reserva
  expect(await reserveItem(db, termo.id, { userId: caro.id })).toEqual({ ok: false, reason: 'sin_stock' })
  // sin avisos para nadie
  expect(await db.select().from(notifications)).toEqual([])
  // se puede volver a marcar
  expect(await marcarRecibidos(db, euge.id, [termo.id], en(1))).toBe(1)
})

test('"Volver a pedir" (pasado el mes): se comporta como volver a pedir algo ya regalado, también con lo que se marcó comprado después del cumple', async () => {
  const { db, euge, rodri, caro, sofi, termo, mate } = await armar(2)
  const cerrada = await reserva(db, termo.id, rodri.id)
  // Sofi tocó "Ya lo compré" ayer, al otro día del cumple, cuando se lo recordamos
  const tarde = await reserva(db, mate.id, sofi.id, 'comprado', { hace: 10 })
  await db.update(claims).set({ updatedAt: en(-0.5) }).where(eq(claims.id, tarde.id))
  expect(await marcarRecibidos(db, euge.id, [termo.id, mate.id], AHORA)).toBe(2)

  const despues = en(DESHACER_RECIBIDO_DIAS + 5)
  expect((await recibidosDe(db, euge.id, despues)).recibidos.map((r) => r.seDeshace)).toEqual([false, false])
  for (const id of [termo.id, mate.id]) expect(await restoreItem(db, id, euge.id, despues)).toBe(true)
  expect(await deseo(db, termo.id)).toMatchObject({ estadoDueno: 'activo', ocupaDesde: despues, recibidoAt: null })
  // lo comprado queda en el historial de cada uno, y ya no ocupa el deseo: otro lo puede regalar
  expect((await claim(db, cerrada.id)).estado).toBe('comprado')
  expect((await claim(db, tarde.id)).estado).toBe('comprado')
  expect(await reserveItem(db, termo.id, { userId: caro.id })).toMatchObject({ ok: true })
  expect(await reserveItem(db, mate.id, { userId: caro.id })).toMatchObject({ ok: true })
})

// ---------- la regla de la sorpresa ----------

/** Todo lo que ve y recibe el dueño al marcar, con la lista llena de reservas y compras o sin ninguna. */
async function loQueVeElDueno(conReservas: boolean) {
  const { db, euge, rodri, caro, sofi, termo, mate, bici } = await armar(1)
  if (conReservas) {
    await reserva(db, termo.id, rodri.id)
    await reserva(db, mate.id, caro.id, 'comprado')
    await grupal(db, bici.id, sofi.id, caro.id)
  }
  const antes = { despues: await postEvento(db, euge.id, AHORA), lista: (await getOwnList(db, euge.id))!.items.map((i) => [i.titulo, i.estadoDueno]) }
  // el cron del día siguiente pasa antes de que marque nada
  const recordatorios = await mandarRecordatorios(db, AHORA)
  const marcados = await marcarRecibidos(db, euge.id, [termo.id, bici.id], AHORA)
  const sinIds = (r: Awaited<ReturnType<typeof recibidosDe>>) => ({ ...r, recibidos: r.recibidos.map((x) => ({ ...x, id: null })) })
  const vista = {
    antes, marcados, despues: await postEvento(db, euge.id, AHORA), recibidos: sinIds(await recibidosDe(db, euge.id, AHORA)),
    lista: (await getOwnList(db, euge.id))!.items.map((i) => [i.titulo, i.estadoDueno]),
    deParte: await dePartede(db, mate.id, euge.id),
  }
  return {
    vista, queTeRegalaron: recordatorios.queTeRegalaron, bandeja: await enBandeja(db, euge.id),
    carteles: (await db.select().from(notifications)).filter((n) => n.userId === euge.id),
  }
}

test('REGLA DE LA SORPRESA: lo que el dueño ve, marca y recibe después del cumple es lo mismo con la lista llena de reservas que sin ninguna', async () => {
  const [con, sin] = [await loQueVeElDueno(true), await loQueVeElDueno(false)]
  expect(con).toEqual(sin)
  // nada preseleccionado ni contado: los deseos, en el orden de su lista, y solo lo que él marcó pasa a Recibidos
  expect(con.vista.antes.lista).toEqual([['Termo', 'activo'], ['Mate', 'activo'], ['Bici', 'activo']])
  expect(con.vista.recibidos.recibidos.map((r) => [r.titulo, r.dePartede])).toEqual([['Termo', []], ['Bici', []]])
  expect(con.vista.recibidos.contados).toEqual([])
  expect(con.vista.deParte).toEqual([])
  // y lo único que le llega es su recordatorio, que no habla de reservas ni nombra a nadie
  expect(con.bandeja).toEqual([{ titulo: '🎁 ¿Qué te regalaron?', cuerpo: 'Marcalo y dejá tu lista al día para el año que viene.', url: '/mi-lista/recibidos' }])
  expect(con.carteles).toEqual([])
  const texto = JSON.stringify(con).toLowerCase()
  for (const p of ['reserv', 'compr', 'rodri', 'caro', 'sofi']) expect(texto).not.toContain(p)
}, 60_000)

test('REGLA DE LA SORPRESA: sin revelado, la vista del dueño no trae nada de quien regaló; con revelado, solo ese nombre', async () => {
  const { db, euge, rodri, caro, sofi, termo, mate, bici } = await armar(1)
  const deRodri = await reserva(db, termo.id, rodri.id, 'comprado')
  await reserva(db, mate.id, caro.id, 'comprado')
  const gift = await grupal(db, bici.id, sofi.id, caro.id)
  expect(await marcarRecibidos(db, euge.id, [termo.id, bici.id], AHORA)).toBe(2)

  const sinNada = JSON.stringify([await recibidosDe(db, euge.id, AHORA), await dePartede(db, termo.id, euge.id), await dePartede(db, mate.id, euge.id)])
  for (const p of ['Rodri', 'Caro', 'Sofi', rodri.id, caro.id, sofi.id, deRodri.id, gift.id]) expect(sinNada).not.toContain(p)

  // Rodri le cuenta lo del Termo; del regalo grupal de la Bici, solo Caro
  expect(await revelarRegalo(db, rodri.id, 'suelto', deRodri.id, AHORA)).toBe(true)
  expect(await revelarRegalo(db, caro.id, 'grupal', gift.id, AHORA)).toBe(true)
  const { recibidos, contados } = await recibidosDe(db, euge.id, AHORA)
  expect(recibidos.map((r) => [r.titulo, r.dePartede])).toEqual([
    ['Termo', [{ tipo: 'suelto', id: deRodri.id, de: rodri.id, nombre: 'Rodri', agradecido: false }]],
    ['Bici', [{ tipo: 'grupal', id: gift.id, de: caro.id, nombre: 'Caro', agradecido: false }]],
  ])
  expect(contados).toEqual([])
  // de Sofi (la encargada del regalo grupal, que no se reveló) y del Mate de Caro (comprado, sin revelar), nada
  const conRevelados = JSON.stringify([recibidos, contados, await dePartede(db, mate.id, euge.id)])
  expect(conRevelados).not.toContain('Sofi')
  expect(conRevelados).not.toContain(sofi.id)
  expect(await dePartede(db, mate.id, euge.id)).toEqual([])
  // ni a otro que pregunte por los deseos de Euge
  expect(await dePartede(db, termo.id, caro.id)).toEqual([])
})

// ---------- el revelado ----------

test('revelado, las negativas: nunca antes del día siguiente al cumple, nunca una reserva sin comprar, nunca el regalo de otro', async () => {
  const { db, euge, rodri, caro, sofi, termo, mate, bici } = await armar(-3)
  const compra = await reserva(db, termo.id, rodri.id, 'comprado')
  const sinComprar = await reserva(db, mate.id, caro.id, 'reservado', { vence: en(5) })
  const gift = await grupal(db, bici.id, sofi.id, caro.id)
  const nadaRevelado = async () => expect([
    (await claim(db, compra.id)).reveladoAt, (await claim(db, sinComprar.id)).reveladoAt,
    ...(await db.select().from(groupGiftMembers)).map((m) => m.reveladoAt),
  ]).toEqual([null, null, null, null])

  // faltan 3 días, es mañana, es hoy: no
  for (const d of [0, 2, 3]) {
    expect(await revelarRegalo(db, rodri.id, 'suelto', compra.id, en(d))).toBe(false)
    expect(await revelarRegalo(db, caro.id, 'grupal', gift.id, en(d))).toBe(false)
    expect((await misRegalos(db, rodri.id, en(d))).comprados).toMatchObject([{ titulo: 'Termo', puedeRevelar: false, revelado: false }])
  }
  const despues = en(4)
  // una reserva sin comprar no se revela, ni después del cumple
  expect(await revelarRegalo(db, caro.id, 'suelto', sinComprar.id, despues)).toBe(false)
  // el regalo de otro, el de un regalo grupal en el que no está, uno que no existe o cualquier cosa
  expect(await revelarRegalo(db, caro.id, 'suelto', compra.id, despues)).toBe(false)
  expect(await revelarRegalo(db, rodri.id, 'grupal', gift.id, despues)).toBe(false)
  expect(await revelarRegalo(db, rodri.id, 'grupal', compra.id, despues)).toBe(false)
  expect(await revelarRegalo(db, rodri.id, 'suelto', crypto.randomUUID(), despues)).toBe(false)
  expect(await revelarRegalo(db, rodri.id, 'suelto', 'no-es-un-id', despues)).toBe(false)
  // la reserva del regalo grupal no se revela como si fuera suelta (revelaría a la encargada por los demás)
  expect(await revelarRegalo(db, sofi.id, 'suelto', gift.claimId, despues)).toBe(false)
  await nadaRevelado()
  expect(await enBandeja(db, euge.id)).toEqual([])
  expect(JSON.stringify(await recibidosDe(db, euge.id, despues))).not.toContain('Rodri')

  // lo que se reservó después del cumple es para el del año que viene: todavía no
  const paraElQueViene = await db.insert(claims).values({ itemId: mate.id, claimerUserId: sofi.id, estado: 'comprado', createdAt: en(5), updatedAt: en(5) }).returning()
  expect(await revelarRegalo(db, sofi.id, 'suelto', paraElQueViene[0].id, en(6))).toBe(false)
  // un deseo que el dueño eliminó: no hay dónde mostrarlo
  expect(await borrarDeseo(db, termo.id, euge.id)).toBe(true)
  expect(await revelarRegalo(db, rodri.id, 'suelto', compra.id, despues)).toBe(false)
  await nadaRevelado()
})

test('revelado: al día siguiente, quien lo compró lo elige regalo por regalo; al dueño le llega una vez y no se repite', async () => {
  const { db, euge, rodri, caro, termo, mate } = await armar(1)
  const delTermo = await reserva(db, termo.id, rodri.id, 'comprado')
  const delMate = await reserva(db, mate.id, rodri.id, 'comprado')
  await reserva(db, mate.id, caro.id, 'comprado')
  expect((await misRegalos(db, rodri.id, AHORA)).historial.map((r) => [r.titulo, r.puedeRevelar, r.revelado]).sort())
    .toEqual([['Mate', true, false], ['Termo', true, false]])

  expect(await revelarRegalo(db, rodri.id, 'suelto', delTermo.id, AHORA)).toBe(true)
  // solo ese regalo: el Mate, que también le compró, no (no es global)
  expect((await claim(db, delTermo.id)).reveladoAt).toEqual(AHORA)
  expect((await claim(db, delMate.id)).reveladoAt).toBeNull()
  expect((await misRegalos(db, rodri.id, AHORA)).historial.map((r) => [r.titulo, r.puedeRevelar, r.revelado]).sort())
    .toEqual([['Mate', true, false], ['Termo', false, true]])
  // Euge no lo había marcado: le aparece como algo que le contaron, con el nombre de Rodri y de nadie más
  const { recibidos, contados } = await recibidosDe(db, euge.id, AHORA)
  expect(recibidos).toEqual([])
  expect(contados).toEqual([{ id: termo.id, titulo: 'Termo', fotoUrl: null, activo: true, dePartede: [{ tipo: 'suelto', id: delTermo.id, de: rodri.id, nombre: 'Rodri', agradecido: false }] }])
  expect(await dePartede(db, termo.id, euge.id)).toMatchObject([{ nombre: 'Rodri' }])
  expect(await enBandeja(db, euge.id)).toEqual([{
    titulo: '🎁 Rodri te cuenta que fue de su parte', cuerpo: 'Te regaló "Termo". Si querés, mandale las gracias desde tu lista.', url: '/mi-lista#recibidos',
  }])
  // un doble toque no revela ni avisa de nuevo
  expect(await revelarRegalo(db, rodri.id, 'suelto', delTermo.id, en(1))).toBe(false)
  expect((await claim(db, delTermo.id)).reveladoAt).toEqual(AHORA)
  expect(await enBandeja(db, euge.id)).toHaveLength(1)
  // al marcarlo recibido, "De parte de Rodri" va con el deseo
  expect(await marcarRecibidos(db, euge.id, [termo.id], AHORA, { cerrar: false })).toBe(1)
  expect((await recibidosDe(db, euge.id, AHORA)).recibidos).toMatchObject([{ titulo: 'Termo', dePartede: [{ nombre: 'Rodri' }] }])
})

test('revelado: lo que se marcó comprado al otro día del cumple, y la reserva que el dueño cerró al marcarlo recibido, también se pueden contar', async () => {
  const { db, euge, rodri, caro, sofi, termo, mate, bici } = await armar(2)
  // Rodri lo reservó antes y tocó "Ya lo compré" ayer, cuando le avisamos que vencía
  const tarde = await reserva(db, termo.id, rodri.id, 'comprado')
  await db.update(claims).set({ updatedAt: en(-0.5) }).where(eq(claims.id, tarde.id))
  // Caro nunca lo marcó: lo cierra Euge al decir que se lo regalaron
  const deCaro = await reserva(db, mate.id, caro.id)
  // Sofi lo reservó y lo compró después del cumple (se lo dio tarde): cuenta porque Euge dijo que lo recibió
  const [deSofi] = await db.insert(claims).values({ itemId: bici.id, claimerUserId: sofi.id, estado: 'comprado', createdAt: en(-0.5), updatedAt: en(-0.5) }).returning()
  expect((await misRegalos(db, sofi.id, AHORA)).comprados).toMatchObject([{ titulo: 'Bici', puedeRevelar: false }])
  expect(await revelarRegalo(db, sofi.id, 'suelto', deSofi.id, AHORA)).toBe(false)

  expect(await marcarRecibidos(db, euge.id, [mate.id, bici.id], AHORA)).toBe(2)
  expect(await revelarRegalo(db, rodri.id, 'suelto', tarde.id, AHORA)).toBe(true)
  expect(await revelarRegalo(db, caro.id, 'suelto', deCaro.id, AHORA)).toBe(true)
  expect(await revelarRegalo(db, sofi.id, 'suelto', deSofi.id, AHORA)).toBe(true)
  // "Me equivoqué" con el Mate: Caro ya contó que fue suyo, así que su compra queda
  expect(await restoreItem(db, mate.id, euge.id, en(1))).toBe(true)
  expect((await claim(db, deCaro.id)).estado).toBe('comprado')
  expect((await recibidosDe(db, euge.id, en(1))).contados.map((c) => [c.titulo, c.activo, c.dePartede.map((d) => d.nombre)]).sort())
    .toEqual([['Mate', true, ['Caro']], ['Termo', true, ['Rodri']]])
})

test('revelado: si el dueño lo vuelve a pedir, "De parte de" era del que ya le regalaron y no sigue en el deseo', async () => {
  const { db, euge, rodri, termo } = await armar(1)
  const c = await reserva(db, termo.id, rodri.id, 'comprado')
  expect(await marcarRecibidos(db, euge.id, [termo.id], AHORA)).toBe(1)
  expect(await revelarRegalo(db, rodri.id, 'suelto', c.id, AHORA)).toBe(true)
  expect(await restoreItem(db, termo.id, euge.id, en(DESHACER_RECIBIDO_DIAS + 1))).toBe(true)
  expect(await recibidosDe(db, euge.id, en(DESHACER_RECIBIDO_DIAS + 1))).toEqual({ recibidos: [], contados: [] })
  expect(await dePartede(db, termo.id, euge.id)).toEqual([])
})

test('yaSeRegalo: lo reservado antes de que termine el día del evento, o lo que el dueño marcó recibido', () => {
  const corte = new Date('2026-11-11T03:00:00Z')
  expect(yaSeRegalo({ reservada: new Date('2026-11-01T12:00:00Z'), recibido: false }, { corte })).toBe(true)
  expect(yaSeRegalo({ reservada: new Date('2026-11-11T02:59:59Z'), recibido: false }, { corte })).toBe(true)
  expect(yaSeRegalo({ reservada: corte, recibido: false }, { corte })).toBe(false)
  expect(yaSeRegalo({ reservada: new Date('2026-11-12T12:00:00Z'), recibido: true }, { corte })).toBe(true)
  // sin un evento que haya pasado, nunca
  expect(yaSeRegalo({ reservada: new Date(0), recibido: true }, null)).toBe(false)
})

// ---------- agradecer ----------

test('"Mandarle gracias": solo sobre un regalo revelado de su lista, y una sola vez por regalo', async () => {
  const { db, euge, rodri, caro, sofi, termo, mate, bici } = await armar(1)
  const deRodri = await reserva(db, termo.id, rodri.id, 'comprado')
  const deCaro = await reserva(db, mate.id, caro.id, 'comprado')
  const gift = await grupal(db, bici.id, sofi.id, caro.id)
  // (lo que le llegó a Caro por la compra del regalo grupal no es de acá)
  await db.delete(avisos)
  // sin revelado no hay a quién: ni con el id de la compra en la mano
  expect(await agradecer(db, euge.id, 'suelto', deRodri.id, rodri.id, AHORA)).toBe(false)
  expect(await agradecer(db, euge.id, 'grupal', gift.id, caro.id, AHORA)).toBe(false)
  expect(await db.select().from(avisos)).toEqual([])

  expect(await revelarRegalo(db, rodri.id, 'suelto', deRodri.id, AHORA)).toBe(true)
  expect(await revelarRegalo(db, caro.id, 'grupal', gift.id, AHORA)).toBe(true)
  // otra persona no agradece por ella, ni a quien no se reveló (Caro por el Mate, Sofi por la Bici)
  expect(await agradecer(db, sofi.id, 'suelto', deRodri.id, rodri.id, AHORA)).toBe(false)
  expect(await agradecer(db, euge.id, 'suelto', deRodri.id, caro.id, AHORA)).toBe(false)
  expect(await agradecer(db, euge.id, 'suelto', deCaro.id, caro.id, AHORA)).toBe(false)
  expect(await agradecer(db, euge.id, 'grupal', gift.id, sofi.id, AHORA)).toBe(false)
  expect(await enBandeja(db, rodri.id)).toEqual([])

  expect(await agradecer(db, euge.id, 'suelto', deRodri.id, rodri.id, AHORA)).toBe(true)
  expect(await enBandeja(db, rodri.id)).toEqual([{ titulo: '💛 Euge te da las gracias', cuerpo: 'Por "Termo", que le regalaste.', url: '/regalos' }])
  // una vez por regalo
  expect(await agradecer(db, euge.id, 'suelto', deRodri.id, rodri.id, en(1))).toBe(false)
  expect(await enBandeja(db, rodri.id)).toHaveLength(1)
  expect(await dePartede(db, termo.id, euge.id)).toMatchObject([{ nombre: 'Rodri', agradecido: true }])
  // el del regalo grupal va aparte, solo a Caro
  expect(await agradecer(db, euge.id, 'grupal', gift.id, caro.id, AHORA)).toBe(true)
  expect(await agradecer(db, euge.id, 'grupal', gift.id, caro.id, AHORA)).toBe(false)
  expect(await enBandeja(db, caro.id)).toEqual([{ titulo: '💛 Euge te da las gracias', cuerpo: 'Por "Bici", que le regalaste.', url: '/regalos' }])
  expect(await enBandeja(db, sofi.id)).toEqual([])
})

test('"Agradecer por WhatsApp": un texto corto, sin destinatario ni nada de quién regaló', () => {
  expect(textoGracias()).toBe('¡Gracias por el regalo de cumple! Me encantó 🎁💛')
})

// ---------- los recordatorios del día siguiente ----------

test('recordatorios: el día después del cumple, "¿Qué te regalaron?" al dueño y "¿Le contás que fue tuyo?" a quien compró algo, una sola vez', async () => {
  const { db, euge, rodri, caro, sofi, lista, cumple, termo, mate, bici } = await armar(-1)
  const deRodri = await reserva(db, termo.id, rodri.id, 'comprado')
  await reserva(db, mate.id, rodri.id, 'comprado')
  // Caro solo lo tiene reservado; Sofi le compró algo el año pasado
  await reserva(db, bici.id, caro.id, 'reservado', { vence: en(4) })
  await reserva(db, bici.id, sofi.id, 'comprado', { hace: 400 })

  // la víspera y el día del cumple, nada de esto
  for (const d of [0, 1]) expect(await mandarRecordatorios(db, en(d))).toMatchObject({ queTeRegalaron: 0, contale: 0, fallaron: [] })
  expect(await enBandeja(db, euge.id)).toEqual([])

  expect(await mandarRecordatorios(db, en(2))).toMatchObject({ queTeRegalaron: 1, contale: 1, fallaron: [] })
  expect(await enBandeja(db, euge.id)).toEqual([{ titulo: '🎁 ¿Qué te regalaron?', cuerpo: 'Marcalo y dejá tu lista al día para el año que viene.', url: '/mi-lista/recibidos' }])
  // a Rodri, uno solo por los dos regalos
  expect((await enBandeja(db, rodri.id)).filter((a) => a.titulo.includes('Le contás'))).toEqual([{
    titulo: '🎁 ¿Le contás a Euge que fue tuyo?',
    cuerpo: 'Ya pasó su cumple. Si querés, puede ver cuáles de sus regalos fueron de tu parte: solo se entera si vos lo elegís.',
    url: '/regalos',
  }])
  expect((await enBandeja(db, caro.id)).filter((a) => a.titulo.includes('Le contás'))).toEqual([])
  expect((await enBandeja(db, sofi.id)).filter((a) => a.titulo.includes('Le contás'))).toEqual([])
  expect((await db.select().from(recordatoriosEnviados).where(eq(recordatoriosEnviados.tipo, 'contale'))).map((r) => [r.userId, r.clave]))
    .toEqual([[rodri.id, `${lista.id}:${iso(cumple)}`]])

  // el mismo día de nuevo y los días siguientes: no se repite. Caro marca "Ya lo compré" al otro día: le llega a ella
  expect(await mandarRecordatorios(db, en(2))).toMatchObject({ queTeRegalaron: 0, contale: 0 })
  await db.update(claims).set({ estado: 'comprado', updatedAt: en(2.5) }).where(and(eq(claims.itemId, bici.id), eq(claims.claimerUserId, caro.id)))
  expect(await mandarRecordatorios(db, en(3))).toMatchObject({ queTeRegalaron: 0, contale: 1 })
  expect((await enBandeja(db, caro.id)).filter((a) => a.titulo.includes('Le contás'))).toEqual([{
    titulo: '🎁 ¿Le contás a Euge que fue tuyo?',
    cuerpo: 'Ya pasó su cumple. Si querés, puede ver que "Bici" fue de tu parte: solo se entera si vos lo elegís.',
    url: '/regalos',
  }])
  for (const d of [4, 5, 10]) expect(await mandarRecordatorios(db, en(d))).toMatchObject({ queTeRegalaron: 0, contale: 0 })
  expect(await enBandeja(db, euge.id)).toHaveLength(1)
  expect((await claim(db, deRodri.id)).reveladoAt).toBeNull()
})

test('recordatorios: al dueño que ya marcó (o tocó "Ahora no"), o que no tiene deseos, no se le pregunta; a quien ya se reveló, tampoco', async () => {
  const { db, euge, rodri, caro, sofi, termo, mate } = await armar(1)
  const deRodri = await reserva(db, termo.id, rodri.id, 'comprado')
  await reserva(db, mate.id, caro.id, 'comprado')
  expect(await cerrarPostEvento(db, euge.id, AHORA)).toBe(true)
  expect(await revelarRegalo(db, rodri.id, 'suelto', deRodri.id, AHORA)).toBe(true)
  await db.delete(avisos)
  expect(await mandarRecordatorios(db, AHORA)).toMatchObject({ queTeRegalaron: 0, contale: 1, fallaron: [] })
  expect(await enBandeja(db, euge.id)).toEqual([])
  expect(await enBandeja(db, rodri.id)).toEqual([])
  expect((await enBandeja(db, caro.id)).map((a) => a.titulo)).toEqual(['🎁 ¿Le contás a Euge que fue tuyo?'])

  // Sofi cumplió ayer y no tiene nada en la lista: no hay qué marcar
  await cumpleHace(db, sofi.id, 1)
  expect(await mandarRecordatorios(db, AHORA)).toMatchObject({ queTeRegalaron: 0, contale: 0 })
})
