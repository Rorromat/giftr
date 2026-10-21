import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { claims, items, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo, fechaDeGrupoValida } from '@/lib/groups'
import {
  calendarioDelAnio, diasEntre, eventoDeLista, fechaCorta, fechaLarga, guardarCumple, guardarFechaGrupo,
  hoyLocal, misEventos, proximaDeGrupo, proximaFecha, rotuloFechaGrupo, seguirLista,
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
  for (const u of [sofi, rodri]) await seguirLista(db, u.id, lista.id)
  await seguirLista(db, sofi.id, mellizos)
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
  const { db, euge, caro } = await setup()
  const [tuCumple] = await misEventos(db, euge.id, HOY)
  expect(tuCumple).toMatchObject({ titulo: 'Tu cumple', propio: true, href: '/mi-lista' })
  expect(tuCumple.fotos).toEqual(['mate.jpg', 'zapas.jpg', 'copas.jpg']) // las reservadas también: no delata nada
  expect(tuCumple).not.toHaveProperty('misReservas')
  const json = JSON.stringify(await misEventos(db, euge.id, HOY)).toLowerCase()
  for (const palabra of ['rodri', 'reserv', 'claim', 'comprado']) expect(json).not.toContain(palabra)
  const [mellizos] = await misEventos(db, caro.id, HOY)
  expect(mellizos).toMatchObject({ titulo: 'Cumple de los mellizos', propio: true, contexto: 'Tu grupo' })
  expect(mellizos).not.toHaveProperty('misReservas')
})

test('seguir es idempotente y una lista propia no aparece dos veces', async () => {
  const { db, euge, sofi, lista } = await setup()
  await seguirLista(db, sofi.id, lista.id)
  await seguirLista(db, euge.id, lista.id) // abrió su propio link
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

test('calendario del año: días por mes, eventos y hoy', () => {
  const meses = calendarioDelAnio([
    { fecha: dia('2026-08-22'), anual: true },
    { fecha: dia('2027-03-01'), anual: true }, // anual: se marca en marzo aunque la próxima sea el año que viene
    { fecha: dia('2027-01-15'), anual: false }, // única del año que viene: no se marca en este calendario
  ], HOY)
  expect(meses).toHaveLength(12)
  expect(meses[1]).toMatchObject({ nombre: 'Feb', dias: 28 })
  expect(meses[7]).toMatchObject({ nombre: 'Ago', dias: 31, eventos: [22], hoy: 8, actual: true })
  expect(meses[2].eventos).toEqual([1])
  expect(meses[0].eventos).toEqual([])
})
