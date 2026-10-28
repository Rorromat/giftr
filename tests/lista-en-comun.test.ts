import { expect, test, vi } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import sharp from 'sharp'
import { createTestDb, seguir } from './helpers'
import type { Db } from '@/db/types'
import { avisos, fotosDeseo, listMembers, lists } from '@/db/schema'
import { upsertUserFromGoogle } from '@/lib/users'
import {
  crearGrupo, fechaDeCumple, guardarFotoGrupo, guardarParentesco, parentescoDelForm, relacionDeLista, salirDeGrupo, tituloDelGrupo,
  unirseAGrupo,
} from '@/lib/groups'
import { aceptarLinkDeAmigo, miAmigoToken } from '@/lib/amigos'
import { amigosParaInvitar, invitarAGrupo } from '@/lib/invitar-a-grupo'
import { agregarListaDeAmigo, miGente } from '@/lib/gente'
import { dejarDeSeguir, eventoDeLista, guardarFechaGrupo, misEventos, rotuloFechaGrupo } from '@/lib/events'
import { getListForViewer } from '@/lib/lists'
import { guardarFotoDeseo, procesarFotoDeseo } from '@/lib/fotos-deseo'

// Las listas en común como la de un hijo: su foto, si es un cumple, qué es para cada dueño, con quién se arma desde que se
// crea (les llega el aviso) y cómo la ven los amigos de sus dueños en Tu gente y en Eventos.

const HOY = new Date(Date.UTC(2026, 9, 28)) // miércoles 28 de octubre de 2026
const dia = (s: string) => new Date(`${s}T00:00:00Z`)

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase().replace(/\s+/g, '.')}@test.com`, nombre })
}

async function hacerseAmigos(db: Db, a: string, b: string) {
  const token = await miAmigoToken(db, a)
  await aceptarLinkDeAmigo(db, b, token!)
}

const inviteToken = async (db: Db, listId: string) =>
  (await db.select({ t: lists.inviteToken }).from(lists).where(eq(lists.id, listId)))[0].t!

async function fotoSubida(db: Db, userId: string) {
  const jpeg = await procesarFotoDeseo(await sharp({ create: { width: 40, height: 40, channels: 3, background: '#FFD9C2' } }).png().toBuffer())
  return (await guardarFotoDeseo(db, userId, jpeg))!
}

/**
 * Rodri armó "Juancito" (su hijo, cumple el 9/11, con foto) y Euge se sumó (también es su hijo). Sofi es amiga de Rodri;
 * Martín es amigo de Euge; Lu no es amiga de nadie.
 */
async function setup() {
  const db = await createTestDb()
  const [rodri, euge, sofi, martin, lu] = await Promise.all(['Rodri Mateus', 'Euge', 'Sofi', 'Martín', 'Lu'].map((n) => usuario(db, n)))
  await hacerseAmigos(db, rodri.id, euge.id)
  await hacerseAmigos(db, rodri.id, sofi.id)
  await hacerseAmigos(db, euge.id, martin.id)
  const foto = await fotoSubida(db, rodri.id)
  const juancito = await crearGrupo(db, rodri.id, {
    nombre: 'Juancito', esCumple: true, eventoFecha: fechaDeCumple(9, 11), fotoUrl: foto, parentesco: 'Hijo',
  })
  await unirseAGrupo(db, await inviteToken(db, juancito), euge.id)
  await guardarParentesco(db, juancito, euge.id, 'Hijo')
  return { db, rodri, euge, sofi, martin, lu, juancito, foto }
}

test('qué es para vos: uno de la lista, u "Otro" con lo que escribió; lo demás no vale', () => {
  expect(parentescoDelForm('Tío abuelo', '')).toBe('Tío abuelo')
  expect(parentescoDelForm('otro', '  ahijado   de   la   casa ')).toBe('Ahijado de la casa')
  expect(parentescoDelForm('otro', '   ')).toBeNull()
  expect(parentescoDelForm('Rey', null)).toBeNull() // un formulario armado a mano
  expect(parentescoDelForm('', 'Hijo')).toBeNull()
  expect(parentescoDelForm(undefined, undefined)).toBeNull()
  expect(parentescoDelForm('otro', 'x'.repeat(80))).toHaveLength(30)
})

test('cómo se lee para los demás: juntos los que dicen lo mismo, cada uno con lo suyo, y los que no dicen nada no van', () => {
  expect(relacionDeLista([{ nombre: 'Rodri Mateus', parentesco: 'Hijo' }, { nombre: 'Euge', parentesco: 'hijo' }])).toBe('Hijo de Rodri y Euge')
  expect(relacionDeLista([{ nombre: 'Sofi', parentesco: 'Abuela' }, { nombre: 'Ana', parentesco: 'Madre' }, { nombre: 'Leo' }]))
    .toBe('Abuela de Sofi · madre de Ana')
  expect(relacionDeLista([{ nombre: 'Martín', parentesco: null }])).toBeNull()
  expect(tituloDelGrupo('Juancito', true)).toBe('Cumple de Juancito')
  expect(tituloDelGrupo('Lista de Juancito', true)).toBe('Cumple de Juancito')
  expect(tituloDelGrupo('Cumple de los mellizos', true)).toBe('Cumple de los mellizos')
  expect(tituloDelGrupo('Nuestra casa', false)).toBe('Nuestra casa')
})

test('el cumple de una lista: día y mes, todos los años (también el 29/2); uno que no existe, no', () => {
  expect(fechaDeCumple(9, 11)).toBe('2000-11-09')
  expect(fechaDeCumple(29, 2)).toBe('2000-02-29')
  expect(fechaDeCumple(31, 4)).toBeNull()
  expect(fechaDeCumple(9, null)).toBeNull()
  expect(rotuloFechaGrupo('2000-11-09', true, HOY, true)).toBe('Cumple el lunes 9 de noviembre · en 12 días')
  expect(rotuloFechaGrupo(null, true, HOY, true)).toBe('Agregar su cumple')
})

test('al crearla: foto, cumple, qué es para el que la crea; en Eventos es "Cumple de Juancito" con su foto', async () => {
  const { db, rodri, sofi, juancito, foto } = await setup()
  const [grupo] = await db.select().from(lists).where(eq(lists.id, juancito))
  expect(grupo).toMatchObject({ esCumple: true, eventoFecha: '2000-11-09', eventoAnual: true, fotoUrl: foto })
  expect(await eventoDeLista(db, juancito, HOY)).toMatchObject({ esCumple: true, dias: 12 })

  const [deRodri] = (await misEventos(db, rodri.id, HOY)).filter((e) => e.listId === juancito)
  expect(deRodri).toMatchObject({ titulo: 'Cumple de Juancito', contexto: 'Tu hijo', fecha: dia('2026-11-09'), caras: [foto], personas: ['Juancito'] })

  await seguir(db, sofi.id, juancito)
  const [deSofi] = await misEventos(db, sofi.id, HOY)
  expect(deSofi).toMatchObject({ titulo: 'Cumple de Juancito', contexto: 'Hijo de Rodri y Euge', href: expect.stringMatching(/^\/l\//) })
})

test('una foto que no es una subida no se guarda; la del grupo la cambia o la quita solo un dueño', async () => {
  const { db, rodri, sofi, juancito } = await setup()
  const otra = await crearGrupo(db, rodri.id, { nombre: 'Casa', fotoUrl: 'https://otro.sitio/foto.jpg' })
  expect((await db.select().from(lists).where(eq(lists.id, otra)))[0].fotoUrl).toBeNull()
  expect(await guardarFotoGrupo(db, juancito, sofi.id, null)).toBe(false)
  expect(await guardarFotoGrupo(db, juancito, rodri.id, 'https://otro.sitio/foto.jpg')).toBe(false)
  expect(await guardarFotoGrupo(db, juancito, rodri.id, null)).toBe(true)
  expect((await db.select().from(lists).where(eq(lists.id, juancito)))[0].fotoUrl).toBeNull()
})

test('la limpieza de fotos que nadie usa no se lleva la de un grupo', async () => {
  const { db, rodri, foto } = await setup()
  const id = foto.split('/').at(-1)!
  await db.update(fotosDeseo).set({ createdAt: sql`now() - interval '2 days'` }).where(eq(fotosDeseo.id, id))
  await fotoSubida(db, rodri.id) // la próxima subida limpia
  expect(await db.select({ id: fotosDeseo.id }).from(fotosDeseo).where(eq(fotosDeseo.id, id))).toHaveLength(1)
  // sin el grupo, la siguiente se la lleva
  await db.update(lists).set({ fotoUrl: null })
  await fotoSubida(db, rodri.id)
  expect(await db.select({ id: fotosDeseo.id }).from(fotosDeseo).where(eq(fotosDeseo.id, id))).toHaveLength(0)
})

test('qué es para vos es de cada dueño, y el que salió del grupo ya no lo cambia', async () => {
  const { db, euge, juancito } = await setup()
  expect(await guardarParentesco(db, juancito, euge.id, 'Nieto')).toBe(true)
  const filas = await db.select({ userId: listMembers.userId, p: listMembers.parentesco }).from(listMembers).where(eq(listMembers.listId, juancito))
  expect(filas.map((f) => f.p).sort()).toEqual(['Hijo', 'Nieto'])
  await salirDeGrupo(db, juancito, euge.id)
  expect(await guardarParentesco(db, juancito, euge.id, 'Hijo')).toBe(false)
})

test('cambiar la fecha: de cumple a otra cosa y de vuelta; guardar el mismo cumple lo deja como estaba', async () => {
  const { db, rodri, juancito } = await setup()
  const leer = async () => (await db.select().from(lists).where(eq(lists.id, juancito)))[0]
  expect(await guardarFechaGrupo(db, juancito, rodri.id, '2000-11-09', false, new Date(), true)).toBe(true)
  expect(await leer()).toMatchObject({ eventoFecha: '2000-11-09', eventoAnual: true, esCumple: true, corteEvento: null })
  expect(await guardarFechaGrupo(db, juancito, rodri.id, '2026-12-20', false)).toBe(true)
  expect(await leer()).toMatchObject({ eventoFecha: '2026-12-20', eventoAnual: false, esCumple: false })
  expect(await guardarFechaGrupo(db, juancito, rodri.id, '2000-02-29', false, new Date(), true)).toBe(true)
  expect(await leer()).toMatchObject({ eventoFecha: '2000-02-29', eventoAnual: true, esCumple: true })
})

test('con quién la armás: solo a amigos que todavía no están, una vez por día; les llega el nombre de la lista y la invitación', async () => {
  const { db, rodri, euge, sofi, lu, juancito } = await setup()
  expect((await amigosParaInvitar(db, juancito, rodri.id)).map((p) => p.nombre)).toEqual(['Sofi']) // Euge ya está
  // Lu no es amiga suya, y Euge ya está
  expect(await invitarAGrupo(db, juancito, rodri.id, [sofi.id, lu.id, euge.id, 'no-es-un-id'])).toEqual([sofi.id])
  const [aviso] = await db.select().from(avisos).where(and(eq(avisos.userId, sofi.id), eq(avisos.deUserId, rodri.id)))
  expect(aviso).toMatchObject({
    titulo: '👥 Rodri te sumó a la lista en común "Juancito"', url: `/grupos/unirme/${await inviteToken(db, juancito)}`,
  })
  // de nuevo, no le llega otra vez
  expect(await invitarAGrupo(db, juancito, rodri.id, [sofi.id])).toEqual([])
  // nada para Lu, y alguien que no es dueño no invita
  expect(await db.select().from(avisos).where(eq(avisos.userId, lu.id))).toEqual([])
  expect(await invitarAGrupo(db, juancito, sofi.id, [rodri.id])).toEqual([])
  // y avisar no la suma: entra recién con el toque (la regla de la sorpresa)
  expect((await db.select().from(listMembers).where(and(eq(listMembers.listId, juancito), eq(listMembers.userId, sofi.id))))).toEqual([])
})

test('tu gente: la lista en común de un amigo aparece para agregar; agregada, entra en Eventos; quitada, vuelve a estar para agregar', async () => {
  const { db, sofi, juancito, foto } = await setup()
  const deJuancito = async () => (await miGente(db, sofi.id, HOY)).find((c) => c.listId === juancito)
  expect(await deJuancito()).toMatchObject({
    tipo: 'grupo', nombre: 'Juancito', agregada: false, foto, esCumple: true, relacion: 'Hijo de Rodri y Euge',
    proxima: { fecha: dia('2026-11-09'), dias: 12 }, duenos: [{ nombre: 'Rodri Mateus' }, { nombre: 'Euge' }],
  })
  expect(await misEventos(db, sofi.id, HOY)).toEqual([])

  expect(await agregarListaDeAmigo(db, sofi.id, juancito)).toBe(true)
  expect(await deJuancito()).toMatchObject({ agregada: true })
  expect((await misEventos(db, sofi.id, HOY)).map((e) => e.titulo)).toEqual(['Cumple de Juancito'])

  await dejarDeSeguir(db, sofi.id, juancito)
  expect(await deJuancito()).toMatchObject({ agregada: false })
  expect(await misEventos(db, sofi.id, HOY)).toEqual([])
})

test('agregar: solo la de un amigo que la arma hoy; nunca la tuya, ni la de alguien que no es tu amigo', async () => {
  const { db, rodri, euge, martin, lu, juancito } = await setup()
  // Martín es amigo de Euge, que la arma: también le aparece
  expect((await miGente(db, martin.id, HOY)).map((c) => c.nombre)).toContain('Juancito')
  expect(await agregarListaDeAmigo(db, lu.id, juancito)).toBe(false)
  expect((await miGente(db, lu.id, HOY)).map((c) => c.nombre)).not.toContain('Juancito')
  expect(await agregarListaDeAmigo(db, rodri.id, juancito)).toBe(false)
  expect(await agregarListaDeAmigo(db, rodri.id, 'no-es-un-id')).toBe(false)
  // si Euge sale, para Martín ya no es la lista de un amigo
  await salirDeGrupo(db, juancito, euge.id)
  expect((await miGente(db, martin.id, HOY)).map((c) => c.nombre)).not.toContain('Juancito')
  expect(await agregarListaDeAmigo(db, martin.id, juancito)).toBe(false)
  // y a Euge, que la armó, no le aparece nunca como la de un amigo (no ve quién regala qué)
  expect((await miGente(db, euge.id, HOY)).map((c) => c.nombre)).not.toContain('Juancito')
})

test('los que regalan ven su foto y qué es para sus dueños', async () => {
  const { db, sofi, juancito, foto } = await setup()
  const [{ shareToken }] = await db.select({ shareToken: lists.shareToken }).from(lists).where(eq(lists.id, juancito))
  const vista = await getListForViewer(db, shareToken, { userId: sofi.id })
  expect(vista).toMatchObject({ role: 'giver', grupoNombre: 'Juancito', grupoFoto: foto, relacion: 'Hijo de Rodri y Euge' })
})

// ---------------------------------------------------------------- las acciones

const h = vi.hoisted(() => ({ db: undefined as unknown as Db, session: null as { userId: string } | null }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
}))

import { agregarListaAction, createGroupAction, joinGroupAction, setGroupDateAction } from '@/app/actions'

function form(campos: Record<string, string | string[]>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) for (const x of [v].flat()) fd.append(k, x)
  return fd
}

async function redirigeA(p: Promise<unknown>): Promise<string> {
  try { await p } catch (e) { return (e as { url: string }).url }
  throw new Error('esperaba una redirección')
}

test('crearla desde el formulario: cumple, qué es, foto y amigos (les llega el aviso y lo dice arriba)', async () => {
  const { db, rodri, sofi, lu } = await setup()
  h.db = db
  h.session = { userId: rodri.id }
  const foto = await fotoSubida(db, rodri.id)
  const url = await redirigeA(createGroupAction(form({
    nombre: 'Abuela Marta', cumple: '1', dia: '2', mes: '12', fecha: '2026-01-01', foto, parentesco: 'otro', parentescoOtro: 'abuela del corazón',
    amigo: [sofi.id, lu.id],
  })))
  expect(url).toMatch(/^\/grupos\/[0-9a-f-]{36}\?nuevo=invitados$/)
  const id = url.slice('/grupos/'.length, -'?nuevo=invitados'.length)
  expect((await db.select().from(lists).where(eq(lists.id, id)))[0]).toMatchObject({ esCumple: true, eventoFecha: '2000-12-02', fotoUrl: foto })
  expect((await db.select().from(listMembers).where(eq(listMembers.listId, id)))[0].parentesco).toBe('Abuela del corazón')
  expect((await db.select().from(avisos).where(eq(avisos.userId, sofi.id))).map((a) => a.titulo)).toContain('👥 Rodri te sumó a la lista en común "Abuela Marta"')

  // un cumple que no existe: se crea sin fecha y la pantalla avisa; sin amigos, sin el aviso de arriba
  const mal = await redirigeA(createGroupAction(form({ nombre: 'Tía', cumple: '1', dia: '31', mes: '4' })))
  expect(mal).toMatch(/\?fecha=invalida$/)
  // sin cumple ni fecha, como siempre
  expect(await redirigeA(createGroupAction(form({ nombre: 'Casa', cumple: '0' })))).toMatch(/^\/grupos\/[0-9a-f-]{36}$/)

  // la fecha del grupo como cumple, desde su pantalla
  expect(await redirigeA(setGroupDateAction(form({ grupoId: id, cumple: '1', dia: '', mes: '' })))).toBe(`/grupos/${id}?fecha=invalida`)
  expect(await redirigeA(setGroupDateAction(form({ grupoId: id, cumple: '1', dia: '3', mes: '12' })))).toBe(`/grupos/${id}`)
  expect((await db.select().from(lists).where(eq(lists.id, id)))[0]).toMatchObject({ esCumple: true, eventoFecha: '2000-12-03' })
})

test('sumarse con la invitación diciendo qué es para uno; agregar la de un amigo desde Tu gente', async () => {
  const { db, sofi, juancito } = await setup()
  h.db = db
  h.session = { userId: sofi.id }
  expect(await agregarListaAction(form({ listId: juancito }))).toBeUndefined()
  expect((await miGente(db, sofi.id, HOY)).find((c) => c.listId === juancito)).toMatchObject({ agregada: true })

  const url = await redirigeA(joinGroupAction(form({ invite: await inviteToken(db, juancito), parentesco: 'Sobrino' })))
  expect(url).toBe(`/grupos/${juancito}`)
  const [fila] = await db.select().from(listMembers).where(and(eq(listMembers.listId, juancito), eq(listMembers.userId, sofi.id)))
  expect(fila.parentesco).toBe('Sobrino')
  // ahora la arma ella: ya no es de su gente
  expect((await miGente(db, sofi.id, HOY)).map((c) => c.listId)).not.toContain(juancito)
})
