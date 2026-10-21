import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo, salirDeGrupo, unirseAGrupo } from '@/lib/groups'
import { dejarDeSeguir, guardarCumple, guardarFechaGrupo, misEventos, seguirLista } from '@/lib/events'
import { miGente } from '@/lib/gente'

const HOY = new Date(Date.UTC(2026, 7, 8)) // sábado 8 de agosto de 2026
const dia = (s: string) => new Date(`${s}T00:00:00Z`)

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}
const listaDe = async (db: Db, userId: string) => (await db.select().from(lists).where(eq(lists.ownerId, userId)))[0]

/** Sofi abrió la lista de Euge (cumple 22/8, 2 deseos activos), la de Rodri (sin cumple) y el grupo de Caro (12/10). */
async function setup() {
  const db = await createTestDb()
  const [euge, rodri, sofi, caro] = [await usuario(db, 'Euge Mateus'), await usuario(db, 'rodri'), await usuario(db, 'Sofi'), await usuario(db, 'Caro')]
  await guardarCumple(db, euge.id, 22, 8)
  const [deEuge, deRodri] = [await listaDe(db, euge.id), await listaDe(db, rodri.id)]
  await db.insert(items).values([
    { listId: deEuge.id, tipo: 'exacto', titulo: 'Mate' },
    { listId: deEuge.id, tipo: 'exacto', titulo: 'Copas' },
    { listId: deEuge.id, tipo: 'exacto', titulo: 'Velas', estadoDueno: 'no_lo_quiero' },
  ])
  const mellizos = await crearGrupo(db, caro.id, { nombre: 'Cumple de los mellizos' })
  await guardarFechaGrupo(db, mellizos, caro.id, '2026-10-12', true)
  for (const listId of [deEuge.id, deRodri.id, mellizos]) await seguirLista(db, sofi.id, listId)
  return { db, euge, rodri, sofi, caro, deEuge, deRodri, mellizos }
}

test('tu gente: las listas que abriste, por orden alfabético, con su próximo cumple o fecha', async () => {
  const { db, sofi, deEuge, mellizos } = await setup()
  const gente = await miGente(db, sofi.id, HOY)
  expect(gente.map((c) => c.nombre)).toEqual(['Cumple de los mellizos', 'Euge Mateus', 'rodri'])
  const [grupo, euge, rodri] = gente
  expect(euge).toMatchObject({
    listId: deEuge.id, tipo: 'personal', href: `/l/${deEuge.shareToken}`, deseos: 2, // sin las velas archivadas
    duenos: [{ nombre: 'Euge Mateus', foto: null }], proxima: { fecha: dia('2026-08-22'), dias: 14 },
  })
  expect(grupo).toMatchObject({ listId: mellizos, tipo: 'grupo', duenos: [{ nombre: 'Caro' }], deseos: 0, proxima: { dias: 65 } })
  expect(rodri.proxima).toBeNull() // no cargó su cumple, pero igual está
})

test('REGLA DE LA SORPRESA: va en un solo sentido, nadie ve quién sigue su lista', async () => {
  const { db, euge, caro } = await setup()
  expect(await miGente(db, euge.id, HOY)).toEqual([])
  expect(await miGente(db, caro.id, HOY)).toEqual([])
})

test('una lista de la que sos co-dueño no es tu gente, aunque la hayas abierto antes', async () => {
  const { db, sofi, mellizos } = await setup()
  const [{ inviteToken }] = await db.select({ inviteToken: lists.inviteToken }).from(lists).where(eq(lists.id, mellizos))
  await unirseAGrupo(db, inviteToken!, sofi.id)
  expect((await miGente(db, sofi.id, HOY)).map((c) => c.nombre)).toEqual(['Euge Mateus', 'rodri'])
  // si sale del grupo tampoco vuelve: lo armó ella, así que no ve qué le regalan (ni en Tu gente ni en Eventos)
  expect(await salirDeGrupo(db, mellizos, sofi.id)).toBe(true)
  expect((await miGente(db, sofi.id, HOY)).map((c) => c.nombre)).toEqual(['Euge Mateus', 'rodri'])
  expect((await misEventos(db, sofi.id, HOY)).map((e) => e.titulo)).toEqual(['Cumple de Euge'])
})

test('para quien sigue un grupo, sus dueños son los que están: el que salió ya no figura', async () => {
  const { db, euge, sofi, mellizos } = await setup()
  const [{ inviteToken }] = await db.select({ inviteToken: lists.inviteToken }).from(lists).where(eq(lists.id, mellizos))
  await unirseAGrupo(db, inviteToken!, euge.id)
  const grupo = async () => (await miGente(db, sofi.id, HOY)).find((c) => c.listId === mellizos)!
  expect((await grupo()).duenos.map((d) => d.nombre)).toEqual(['Caro', 'Euge Mateus'])
  await salirDeGrupo(db, mellizos, euge.id)
  expect((await grupo()).duenos.map((d) => d.nombre)).toEqual(['Caro'])
  expect((await misEventos(db, sofi.id, HOY)).find((e) => e.listId === mellizos)!.personas).toEqual(['Caro'])
})

test('dejar de seguir la saca de tu gente y de Eventos; si la volvés a abrir, vuelve', async () => {
  const { db, sofi, deEuge } = await setup()
  await dejarDeSeguir(db, sofi.id, deEuge.id)
  await dejarDeSeguir(db, sofi.id, 'no-es-un-id') // ignorado
  expect((await miGente(db, sofi.id, HOY)).map((c) => c.nombre)).toEqual(['Cumple de los mellizos', 'rodri'])
  expect((await misEventos(db, sofi.id, HOY)).map((e) => e.titulo)).toEqual(['Cumple de los mellizos'])
  await seguirLista(db, sofi.id, deEuge.id)
  expect((await miGente(db, sofi.id, HOY)).map((c) => c.nombre)).toContain('Euge Mateus')
})
