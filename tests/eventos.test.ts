import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seguir } from './helpers'
import { claims, groupGifts, items, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo, fechaDeGrupoValida } from '@/lib/groups'
import { archiveItem } from '@/lib/items'
import { getListForViewer } from '@/lib/lists'
import { cancelarRegalo, comprarRegalo, iniciarRegaloGrupal, salirDeRegalo, sumarseARegalo } from '@/lib/regalos'
import { miGente } from '@/lib/gente'
import {
  calendarioDelAnio, desdeElUltimoEvento, diasEntre, eventoDeLista, fechaCorta, fechaDeGrupo, fechaLarga, fechaParaEditar,
  guardarCumple, guardarFechaGrupo, hoyLocal, inicioDelDia, misEventos, proximaDeGrupo, proximaFecha, rotuloFechaGrupo,
} from '@/lib/events'

const HOY = new Date(Date.UTC(2026, 7, 8)) // sábado 8 de agosto de 2026
const dia = (s: string) => new Date(`${s}T00:00:00Z`)

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}
const listaDe = async (db: Db, userId: string) => (await db.select().from(lists).where(eq(lists.ownerId, userId)))[0]

/** Euge cumple el 22/8 y tiene 5 deseos; Rodri le reservó las zapatillas. Caro arma "Cumple de los mellizos" (12/10). */
async function setup() {
  const db = await createTestDb()
  const [euge, rodri, sofi, caro] = [await usuario(db, 'Euge Mateus'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi'), await usuario(db, 'Caro')]
  await guardarCumple(db, euge.id, 22, 8)
  const lista = await listaDe(db, euge.id)
  const t = (min: number) => new Date(Date.UTC(2026, 6, 1, 0, min))
  const deseos = await db.insert(items).values([
    { listId: lista.id, tipo: 'exacto', titulo: 'Libro', prioridad: 'suelta', fotoUrl: 'libro.jpg', createdAt: t(1) },
    { listId: lista.id, tipo: 'exacto', titulo: 'Mate', prioridad: 'mucho', fotoUrl: 'mate.jpg', createdAt: t(2) },
    { listId: lista.id, tipo: 'exacto', titulo: 'Zapatillas', prioridad: 'mucho', fotoUrl: 'zapas.jpg', createdAt: t(3) },
    { listId: lista.id, tipo: 'exacto', titulo: 'Copas', prioridad: 'gustaria', fotoUrl: 'copas.jpg', createdAt: t(4) },
    { listId: lista.id, tipo: 'exacto', titulo: 'Velas', prioridad: 'mucho', fotoUrl: 'velas.jpg', estadoDueno: 'no_lo_quiero', createdAt: t(5) },
  ]).returning()
  const zapas = deseos.find((d) => d.titulo === 'Zapatillas')!
  await db.insert(claims).values({ itemId: zapas.id, claimerUserId: rodri.id, expiresAt: new Date(Date.now() + 86400_000) })
  const mellizos = await crearGrupo(db, caro.id, { nombre: 'Cumple de los mellizos' })
  await guardarFechaGrupo(db, mellizos, caro.id, '2026-10-12', true)
  for (const u of [sofi, rodri]) await seguir(db, u.id, lista.id)
  await seguir(db, sofi.id, mellizos)
  return { db, euge, rodri, sofi, caro, lista, mellizos }
}

test('fechas: próxima ocurrencia, días, 29 de febrero y hoy en Argentina', () => {
  expect(proximaFecha(22, 8, HOY)).toEqual(dia('2026-08-22'))
  expect(diasEntre(HOY, proximaFecha(22, 8, HOY))).toBe(14)
  expect(proximaFecha(8, 8, HOY)).toEqual(HOY) // hoy cuenta
  expect(proximaFecha(1, 3, HOY)).toEqual(dia('2027-03-01')) // ya pasó: el año que viene
  expect(proximaFecha(29, 2, HOY)).toEqual(dia('2027-02-28')) // 2027 no es bisiesto
  expect(fechaLarga(dia('2026-08-22'))).toBe('Sábado 22 de agosto')
  expect(fechaCorta(dia('2026-08-22'))).toBe('22 ago')
  // 02:00 UTC del 9 son las 23:00 del 8 en Buenos Aires
  expect(hoyLocal(new Date('2026-08-09T02:00:00Z'))).toEqual(dia('2026-08-08'))
  expect(proximaDeGrupo('2026-05-01', false, HOY)).toBeNull() // única y ya pasó
  expect(proximaDeGrupo('2026-12-31', false, HOY)).toEqual(dia('2026-12-31'))
  expect(proximaDeGrupo('2020-05-01', true, HOY)).toEqual(dia('2027-05-01'))
})

test('el regalador ve el cumple de su gente con los 3 que más quiere sin reservar', async () => {
  const { db, sofi, rodri } = await setup()
  const [cumple, grupo] = await misEventos(db, sofi.id, HOY)
  expect(cumple).toMatchObject({
    titulo: 'Cumple de Euge', dias: 14, propio: false, personas: ['Euge Mateus'],
    fotos: ['mate.jpg', 'copas.jpg', 'libro.jpg'], // sin las zapatillas reservadas ni las velas archivadas
    misReservas: 0,
  })
  expect(cumple.fecha).toEqual(dia('2026-08-22'))
  expect(cumple.href).toMatch(/^\/l\//)
  expect(grupo).toMatchObject({ titulo: 'Cumple de los mellizos', dias: 65, personas: ['Caro'], contexto: 'Grupo', fotos: [] })
  // quien reservó se ve a sí mismo
  const [deRodri] = await misEventos(db, rodri.id, HOY)
  expect(deRodri.misReservas).toBe(1)
})

test('REGLA DE LA SORPRESA: en sus propios eventos el dueño no recibe nada de reservas', async () => {
  const { db, euge, caro, sofi, lista } = await setup()
  // también con un regalo grupal armado y uno comprado, y con lo que ya no tiene lugar
  const deseos = await db.select().from(items).where(eq(items.listId, lista.id))
  const mate = deseos.find((d) => d.titulo === 'Mate')!
  const copas = deseos.find((d) => d.titulo === 'Copas')!
  const r = await iniciarRegaloGrupal(db, mate.id, sofi.id)
  if (!r.ok) throw new Error('no se armó el regalo')
  await sumarseARegalo(db, r.giftId, caro.id)
  const otro = await iniciarRegaloGrupal(db, copas.id, caro.id)
  if (!otro.ok) throw new Error('no se armó el regalo')
  await comprarRegalo(db, otro.giftId, caro.id, { total: 30000 })

  const [tuCumple] = await misEventos(db, euge.id, HOY)
  expect(tuCumple).toMatchObject({ titulo: 'Tu cumple', propio: true, href: '/mi-lista' })
  expect(tuCumple.fotos).toEqual(['mate.jpg', 'zapas.jpg', 'copas.jpg']) // las reservadas también: no delata nada
  expect(tuCumple).not.toHaveProperty('misReservas')
  expect(tuCumple).not.toHaveProperty('misGrupales')
  const json = JSON.stringify(await misEventos(db, euge.id, HOY)).toLowerCase()
  for (const palabra of ['rodri', 'sofi', 'caro', 'reserv', 'claim', 'comprado', 'grupal']) expect(json).not.toContain(palabra)
  const [mellizos] = await misEventos(db, caro.id, HOY)
  expect(mellizos).toMatchObject({ titulo: 'Cumple de los mellizos', propio: true, contexto: 'Tu grupo' })
  expect(mellizos).not.toHaveProperty('misReservas')
})

test('seguir es idempotente y una lista propia no aparece dos veces', async () => {
  const { db, euge, sofi, lista } = await setup()
  await seguir(db, sofi.id, lista.id)
  await seguir(db, euge.id, lista.id) // abrió su propio link
  expect((await misEventos(db, sofi.id, HOY)).filter((e) => e.titulo === 'Cumple de Euge')).toHaveLength(1)
  expect((await misEventos(db, euge.id, HOY)).map((e) => e.titulo)).toEqual(['Tu cumple'])
})

test('sin fechas no hay eventos, y un evento único que ya pasó desaparece', async () => {
  const { db, rodri, caro, mellizos } = await setup()
  expect(await misEventos(db, (await usuario(db, 'Nadie')).id, HOY)).toEqual([])
  expect((await misEventos(db, rodri.id, HOY)).map((e) => e.titulo)).toEqual(['Cumple de Euge']) // Rodri no cargó su cumple
  await guardarFechaGrupo(db, mellizos, caro.id, '2026-03-01', false)
  expect(await misEventos(db, caro.id, HOY)).toEqual([])
})

test('validaciones: cumple y fecha del grupo', async () => {
  const { db, euge, sofi, mellizos } = await setup()
  expect(await guardarCumple(db, euge.id, 31, 2)).toBe(false)
  expect(await guardarCumple(db, euge.id, 29, 2)).toBe(true)
  expect(await guardarCumple(db, euge.id, 1, 13)).toBe(false)
  expect(await guardarCumple(db, euge.id, null, null)).toBe(true)
  const [u] = await db.select().from(users).where(eq(users.id, euge.id))
  expect([u.cumpleDia, u.cumpleMes]).toEqual([null, null])
  expect(await guardarFechaGrupo(db, mellizos, sofi.id, '2026-10-12', true)).toBe(false) // no es dueña
  expect(await guardarFechaGrupo(db, mellizos, euge.id, 'mañana', true)).toBe(false)
  expect(await guardarFechaGrupo(db, 'no-es-uuid', euge.id, '2026-10-12', true)).toBe(false)
})

test('fecha del grupo: tiene que existir y tener un año razonable (nunca un error de la base)', async () => {
  for (const f of ['2026-10-12', '2028-02-29', '1900-01-01', '2100-12-31', '2026-04-30']) expect(fechaDeGrupoValida(f)).toBe(true)
  for (const f of ['2026-02-30', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '0000-01-01', '0099-05-01',
    '1899-12-31', '2101-01-01', '9999-12-31', '2026-1-5', '12/10/2026', '', 'mañana']) expect(fechaDeGrupoValida(f)).toBe(false)

  const { db, caro, mellizos } = await setup()
  // antes Date.parse las dejaba pasar y Postgres las rechazaba con un error 500
  for (const f of ['2026-02-30', '2026-02-29', '0000-01-01', '9999-12-31']) {
    expect(await guardarFechaGrupo(db, mellizos, caro.id, f, false)).toBe(false)
  }
  expect(await guardarFechaGrupo(db, mellizos, caro.id, '2028-02-29', false)).toBe(true)

  // al crear, la fecha va en el mismo alta; una que no existe no se guarda y el grupo se crea igual
  const conFecha = await crearGrupo(db, caro.id, { nombre: 'Casamiento', eventoFecha: '2027-03-06', eventoAnual: false })
  const sinFecha = await crearGrupo(db, caro.id, { nombre: 'Mudanza', eventoFecha: '2026-02-30', eventoAnual: false })
  const fechas = await db.select({ id: lists.id, f: lists.eventoFecha, anual: lists.eventoAnual }).from(lists)
  expect(fechas.find((l) => l.id === conFecha)).toMatchObject({ f: '2027-03-06', anual: false })
  expect(fechas.find((l) => l.id === sinFecha)).toMatchObject({ f: null })
})

test('la fecha en la pantalla del grupo: la próxima, una única que ya pasó (sigue guardada) o ninguna', () => {
  expect(rotuloFechaGrupo('2026-08-22', false, HOY)).toBe('Sábado 22 de agosto · en 14 días')
  expect(rotuloFechaGrupo('2020-08-08', true, HOY)).toBe('Sábado 8 de agosto · ¡hoy!')
  expect(rotuloFechaGrupo('2020-08-09', true, HOY)).toBe('Domingo 9 de agosto · mañana')
  expect(rotuloFechaGrupo('2026-03-01', false, HOY)).toBe('Fue el 1 de marzo de 2026 · cambiar')
  expect(rotuloFechaGrupo(null, true, HOY)).toBe('Agregar una fecha')
})

test('cuenta regresiva de una lista: cumple del dueño o fecha del grupo', async () => {
  const { db, lista, mellizos, rodri } = await setup()
  expect(await eventoDeLista(db, lista.id, HOY)).toEqual({ esCumple: true, fecha: dia('2026-08-22'), dias: 14 })
  expect(await eventoDeLista(db, mellizos, HOY)).toEqual({ esCumple: false, fecha: dia('2026-10-12'), dias: 65 })
  expect(await eventoDeLista(db, (await listaDe(db, rodri.id)).id, HOY)).toBeNull()
})

const cumpleEl = (dia: number, mes: number) => ({ cae: { dia, mes, anio: null, anual: true } })

test('calendario del año: días por mes, eventos y hoy', () => {
  const meses = calendarioDelAnio([
    cumpleEl(22, 8),
    cumpleEl(1, 3), // anual: se marca en marzo aunque la próxima sea el año que viene
    { cae: fechaDeGrupo('2027-01-15', false) }, // única del año que viene: no se marca en este calendario
  ], HOY)
  expect(meses).toHaveLength(12)
  expect(meses[1]).toMatchObject({ nombre: 'Feb', dias: 28 })
  expect(meses[7]).toMatchObject({ nombre: 'Ago', dias: 31, eventos: [22], hoy: 8, actual: true })
  expect(meses[2].eventos).toEqual([1])
  expect(meses[0].eventos).toEqual([])
})

const deseoDe = async (db: Db, listId: string, titulo: string) =>
  (await db.select().from(items).where(eq(items.listId, listId))).find((d) => d.titulo === titulo)!

async function regalo(db: Db, itemId: string, encargado: string) {
  const r = await iniciarRegaloGrupal(db, itemId, encargado)
  if (!r.ok) throw new Error(`no se armó el regalo: ${r.reason}`)
  return r.giftId
}

test('Ya te ocupás: el que se sumó a un regalo grupal no ve "Todavía no reservaste nada", abierto o comprado', async () => {
  const { db, lista, rodri, sofi } = await setup()
  const mate = await deseoDe(db, lista.id, 'Mate')
  const giftId = await regalo(db, mate.id, rodri.id)
  expect(await sumarseARegalo(db, giftId, sofi.id)).toBe(true)
  const deSofi = async () => (await misEventos(db, sofi.id, HOY)).find((e) => e.listId === lista.id)!
  const deRodri = async () => (await misEventos(db, rodri.id, HOY)).find((e) => e.listId === lista.id)!
  expect(await deSofi()).toMatchObject({ misReservas: 1, misGrupales: 1 })
  // el encargado: las zapatillas sueltas y el mate en el regalo (que es suyo y de la reserva a su nombre: cuenta una vez)
  expect(await deRodri()).toMatchObject({ misReservas: 2, misGrupales: 1 })

  expect(await salirDeRegalo(db, giftId, sofi.id)).toBe(true)
  expect(await deSofi()).toMatchObject({ misReservas: 0, misGrupales: 0 })
  expect(await sumarseARegalo(db, giftId, sofi.id)).toBe(true)
  expect(await comprarRegalo(db, giftId, rodri.id, { total: 40000 })).toEqual({ ok: true })
  expect(await deSofi()).toMatchObject({ misReservas: 1, misGrupales: 1 })

  // uno cancelado ya no es de nadie
  const copas = await deseoDe(db, lista.id, 'Copas')
  const otro = await regalo(db, copas.id, rodri.id)
  expect(await sumarseARegalo(db, otro, sofi.id)).toBe(true)
  expect(await deSofi()).toMatchObject({ misReservas: 2, misGrupales: 2 })
  expect(await cancelarRegalo(db, otro, rodri.id)).toBe(true)
  expect(await deSofi()).toMatchObject({ misReservas: 1, misGrupales: 1 })
})

test('Ya reservaste: solo lo de este cumple y de deseos que siguen en la lista', async () => {
  const { db, euge, lista, rodri, sofi } = await setup()
  const [libro, mate, copas] = [await deseoDe(db, lista.id, 'Libro'), await deseoDe(db, lista.id, 'Mate'), await deseoDe(db, lista.id, 'Copas')]
  // el cumple pasado fue el 22/8/2025: lo comprado hasta ese día ya se regaló
  await db.insert(claims).values([
    { itemId: libro.id, claimerUserId: rodri.id, estado: 'comprado', createdAt: dia('2025-08-01'), updatedAt: dia('2025-08-15') },
    { itemId: mate.id, claimerUserId: rodri.id, estado: 'comprado', createdAt: dia('2026-07-20'), updatedAt: dia('2026-08-01') },
    { itemId: copas.id, claimerUserId: rodri.id, estado: 'comprado', createdAt: dia('2026-07-20'), updatedAt: dia('2026-08-01') },
  ])
  // las copas ya se las dieron: "Ya lo tengo" las saca de la lista
  expect(await archiveItem(db, copas.id, euge.id, 'lo_tengo')).toBe(true)
  const [cumple] = await misEventos(db, rodri.id, HOY)
  expect(cumple).toMatchObject({ titulo: 'Cumple de Euge', misReservas: 2, misGrupales: 0 }) // las zapatillas y el mate

  // un regalo grupal comprado para el cumple pasado tampoco: al año siguiente vuelve "Todavía no reservaste nada"
  const [bici] = await db.insert(items).values({ listId: lista.id, tipo: 'exacto', titulo: 'Bici' }).returning()
  const giftId = await regalo(db, bici.id, sofi.id)
  await comprarRegalo(db, giftId, sofi.id, { total: 20000 })
  await db.update(claims).set({ updatedAt: dia('2025-08-20') }).where(eq(claims.claimerUserId, sofi.id))
  expect((await misEventos(db, sofi.id, HOY)).find((e) => e.listId === lista.id)).toMatchObject({ misReservas: 0, misGrupales: 0 })
})

test('un regalo grupal que sigue abierto cuenta aunque lo hayan armado para el cumple pasado, como en la lista', async () => {
  const { db, lista, rodri, sofi } = await setup()
  const [bici] = await db.insert(items).values({ listId: lista.id, tipo: 'exacto', titulo: 'Bici' }).returning()
  const giftId = await regalo(db, bici.id, rodri.id)
  expect(await sumarseARegalo(db, giftId, sofi.id)).toBe(true)
  // lo armaron para el cumple del 22/8/2025 y nadie lo cerró: hasta que lo cierren es lo pendiente de este
  await db.update(groupGifts).set({ createdAt: dia('2025-08-01') }).where(eq(groupGifts.id, giftId))
  await db.update(claims).set({ createdAt: dia('2025-08-01'), updatedAt: dia('2025-08-01') }).where(eq(claims.itemId, bici.id))
  const deSofi = async () => (await misEventos(db, sofi.id, HOY)).find((e) => e.listId === lista.id)!
  expect(await deSofi()).toMatchObject({ misReservas: 1, misGrupales: 1 })
  const vista = await getListForViewer(db, lista.shareToken, { userId: sofi.id })
  if (vista?.role !== 'giver') throw new Error('Sofi tendría que ver la lista como regaladora')
  expect(vista.items.find((i) => i.id === bici.id)).toMatchObject({ disponible: false, claims: [{ grupal: { soyParte: true } }] })
  // cuando el encargado lo cierra, ya no
  expect(await cancelarRegalo(db, giftId, rodri.id)).toBe(true)
  expect(await deSofi()).toMatchObject({ misReservas: 0, misGrupales: 0 })
})

test('fotos del evento: los deseos que todavía se pueden reservar (repetibles y con cantidad), como en la lista', async () => {
  const { db, lista, rodri, sofi, caro } = await setup()
  const [vinos, medias] = await db.insert(items).values([
    { listId: lista.id, tipo: 'idea', titulo: 'Vinos', repetible: true, prioridad: 'mucho', fotoUrl: 'vinos.jpg' },
    { listId: lista.id, tipo: 'exacto', titulo: 'Medias', cantidad: 3, prioridad: 'mucho', fotoUrl: 'medias.jpg' },
  ]).returning()
  await db.insert(claims).values([
    { itemId: vinos.id, claimerUserId: rodri.id, expiresAt: new Date(Date.now() + 86400_000) },
    { itemId: vinos.id, claimerUserId: caro.id, estado: 'comprado' },
    { itemId: medias.id, claimerUserId: rodri.id, expiresAt: new Date(Date.now() + 86400_000) },
    { itemId: medias.id, claimerUserId: caro.id, estado: 'comprado' },
  ])
  const fotos = async () => (await misEventos(db, sofi.id, HOY)).find((e) => e.listId === lista.id)!.fotos
  expect(await fotos()).toEqual(['mate.jpg', 'vinos.jpg', 'medias.jpg']) // a las medias les queda 1 de 3
  await db.insert(claims).values({ itemId: medias.id, claimerUserId: sofi.id, estado: 'comprado' })
  expect(await fotos()).toEqual(['mate.jpg', 'vinos.jpg', 'copas.jpg'])
})

test('una fecha anual que todavía no cayó nunca cuenta hasta la primera vez, no hasta la de este año', async () => {
  const hoy = dia('2026-10-21')
  expect(proximaDeGrupo('2027-11-20', true, hoy)).toEqual(dia('2027-11-20'))
  expect(proximaDeGrupo('2027-02-10', true, hoy)).toEqual(dia('2027-02-10'))
  expect(proximaDeGrupo('2026-11-20', true, hoy)).toEqual(dia('2026-11-20'))
  expect(proximaDeGrupo('2020-11-20', true, hoy)).toEqual(dia('2026-11-20'))
  expect(proximaDeGrupo('2028-02-29', true, hoy)).toEqual(dia('2028-02-29'))
  expect(rotuloFechaGrupo('2027-11-20', true, hoy)).toBe('Sábado 20 de noviembre · en 395 días')

  const { db, caro, rodri } = await setup()
  const casamiento = await crearGrupo(db, caro.id, { nombre: 'Casamiento de Ana y Beto', eventoFecha: '2027-11-20', eventoAnual: true })
  await seguir(db, rodri.id, casamiento)
  const deRodri = (await misEventos(db, rodri.id, hoy)).find((e) => e.listId === casamiento)!
  expect(deRodri).toMatchObject({ fecha: dia('2027-11-20'), dias: 395 })
  expect((await misEventos(db, caro.id, hoy)).find((e) => e.listId === casamiento)).toMatchObject({ dias: 395 })
  expect(await eventoDeLista(db, casamiento, hoy)).toMatchObject({ fecha: dia('2027-11-20'), dias: 395 })
  expect((await miGente(db, rodri.id, hoy)).find((c) => c.listId === casamiento)!.proxima).toMatchObject({ dias: 395 })
  // en la grilla de este año no está (todavía no fue nunca); en la del que viene, sí
  expect(calendarioDelAnio([deRodri], hoy)[10].eventos).toEqual([])
  expect(calendarioDelAnio([deRodri], dia('2027-01-05'))[10].eventos).toEqual([20])
  // y no hubo "uno anterior": lo de antes de un 20/11/2026 que no existió no queda afuera
  const ahora = new Date('2026-12-01T15:00:00Z')
  expect(await desdeElUltimoEvento(db, casamiento, ahora)).toEqual(new Date(ahora.getTime() - 365 * 86400_000))
  // cuando ya pasó la primera, el anterior es esa
  expect(await desdeElUltimoEvento(db, casamiento, new Date('2027-12-01T15:00:00Z'))).toEqual(inicioDelDia(dia('2027-11-21')))
})

test('corregir la fecha de un grupo anual que ya tuvo su evento no lo hace empezar de nuevo', async () => {
  const hoy = dia('2026-10-21')
  const ahora = new Date('2026-10-21T15:00:00Z')
  const { db, caro, rodri } = await setup()
  const mellizos = await crearGrupo(db, caro.id, { nombre: 'Cumple mellizos', eventoFecha: '2024-03-10', eventoAnual: true })
  await seguir(db, rodri.id, mellizos)
  const [pelota] = await db.insert(items).values({ listId: mellizos, tipo: 'exacto', titulo: 'Pelota' }).returning()
  // Rodri la compró para el cumple del 10/3/2026
  await db.insert(claims).values({
    itemId: pelota.id, claimerUserId: rodri.id, estado: 'comprado', createdAt: dia('2026-02-20'), updatedAt: dia('2026-03-01'),
  })
  const deRodri = async () => (await misEventos(db, rodri.id, hoy)).find((e) => e.listId === mellizos)!
  const fechaDe = async (id: string) => (await db.select({ f: lists.eventoFecha }).from(lists).where(eq(lists.id, id)))[0].f
  expect(await desdeElUltimoEvento(db, mellizos, ahora)).toEqual(inicioDelDia(dia('2026-03-11')))
  expect(await deRodri()).toMatchObject({ misReservas: 0 })

  // Caro le corrige el día poniendo el del año que viene: se guarda con el último año en que ya cayó
  expect(await guardarFechaGrupo(db, mellizos, caro.id, '2027-03-11', true, hoy)).toBe(true)
  expect(await fechaDe(mellizos)).toBe('2026-03-11')
  expect(await desdeElUltimoEvento(db, mellizos, ahora)).toEqual(inicioDelDia(dia('2026-03-12')))
  const evento = await deRodri()
  expect(evento).toMatchObject({ fecha: dia('2027-03-11'), dias: 141, misReservas: 0 })
  expect(calendarioDelAnio([evento], hoy)[2].eventos).toEqual([11]) // el de 2026 fue
  // el formulario muestra la próxima, no el año de la primera: así nadie "corrige" el año
  expect(fechaParaEditar(await fechaDe(mellizos), true, hoy)).toBe('2027-03-11')
  expect(fechaParaEditar('2026-03-01', false, hoy)).toBe('2026-03-01')
  expect(fechaParaEditar(null, true, hoy)).toBe('')
  // el 29/2, con el último bisiesto; una que ya cayó, tal cual
  expect(await guardarFechaGrupo(db, mellizos, caro.id, '2028-02-29', true, hoy)).toBe(true)
  expect(await fechaDe(mellizos)).toBe('2024-02-29')
  expect(await guardarFechaGrupo(db, mellizos, caro.id, '2025-05-05', true, hoy)).toBe(true)
  expect(await fechaDe(mellizos)).toBe('2025-05-05')

  // uno único que ya fue y ahora se repite, también
  const mudanza = await crearGrupo(db, caro.id, { nombre: 'Mudanza', eventoFecha: '2026-03-01', eventoAnual: false })
  expect(await guardarFechaGrupo(db, mudanza, caro.id, '2027-03-01', true, hoy)).toBe(true)
  expect(await fechaDe(mudanza)).toBe('2026-03-01')
  // sin uno que ya pasó (el casamiento a futuro, un grupo sin fecha), tal cual: todavía no empezó
  const casamiento = await crearGrupo(db, caro.id, { nombre: 'Casamiento', eventoFecha: '2027-11-20', eventoAnual: true })
  expect(await guardarFechaGrupo(db, casamiento, caro.id, '2027-11-21', true, hoy)).toBe(true)
  expect(await fechaDe(casamiento)).toBe('2027-11-21')
  const sinFecha = await crearGrupo(db, caro.id, { nombre: 'Navidad' })
  expect(await guardarFechaGrupo(db, sinFecha, caro.id, '2026-12-24', true, hoy)).toBe(true)
  expect(await fechaDe(sinFecha)).toBe('2026-12-24')
})

test('el 29/2 en la grilla del año: el 28 en los años que no son bisiestos, el 29 en los que sí (como proximaFecha)', async () => {
  // la próxima es el 29/2/2028, pero en la grilla de 2027 febrero tiene 28 días
  expect(calendarioDelAnio([cumpleEl(29, 2)], dia('2027-06-01'))[1]).toMatchObject({ dias: 28, eventos: [28] })
  // la próxima es el 28/2/2029, pero en 2028 cae el 29
  expect(calendarioDelAnio([cumpleEl(29, 2)], dia('2028-06-01'))[1]).toMatchObject({ dias: 29, eventos: [29] })
  expect(calendarioDelAnio([{ cae: fechaDeGrupo('2024-02-29', true) }], dia('2027-06-01'))[1].eventos).toEqual([28])
  expect(calendarioDelAnio([cumpleEl(28, 2)], dia('2028-06-01'))[1].eventos).toEqual([28]) // un 28 de verdad sigue en el 28

  // de punta a punta: Martín cumple el 29/2
  const { db, sofi } = await setup()
  const martin = await usuario(db, 'Martín')
  await guardarCumple(db, martin.id, 29, 2)
  await seguir(db, sofi.id, (await listaDe(db, martin.id)).id)
  const hoy = dia('2027-06-01')
  const eventos = await misEventos(db, sofi.id, hoy)
  expect(eventos.find((e) => e.titulo === 'Cumple de Martín')!.fecha).toEqual(dia('2028-02-29'))
  expect(calendarioDelAnio(eventos, hoy)[1].eventos).toEqual([28])
})
