import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { claims, comments, items, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { getListForViewer, getItemForViewer, getOwnList } from '@/lib/lists'
import { crearGrupo, grupoParaDueno, grupoPorInvitacion, juntarNombres, salirDeGrupo, unirseAGrupo } from '@/lib/groups'
import { archiveItem, createItem, updateItem } from '@/lib/items'
import { reserveItem } from '@/lib/claims'
import { addComment } from '@/lib/comments'
import { upsertUserFromGoogle } from '@/lib/users'

const OWNER_KEYS = ['categoria', 'cantidad', 'estadoDueno', 'fotoUrl', 'id', 'linkTienda', 'notas', 'precio', 'prioridad', 'rangoPrecio', 'repetible', 'tipo', 'titulo'].sort()

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}

/** Delfina crea "Nuestra casa", Martín se suma por invitación, Rodri regala y reserva + comenta. */
async function setup() {
  const db = await createTestDb()
  const delfina = await usuario(db, 'Delfina')
  const martin = await usuario(db, 'Martín')
  const rodri = await usuario(db, 'Rodri')
  const intruso = await usuario(db, 'Intruso')
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Nuestra casa', descripcion: 'para equipar la casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  expect(await unirseAGrupo(db, grupo.inviteToken!, martin.id)).toBe(grupoId)
  const item = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Juego de copas', fotoUrl: 'https://x/copas.jpg' }, grupoId))!
  await db.insert(claims).values({ itemId: item.id, claimerUserId: rodri.id, expiresAt: new Date(Date.now() + 86400_000) })
  await db.insert(comments).values({ itemId: item.id, authorUserId: rodri.id, texto: '¿de cristal o vidrio?' })
  return { db, delfina, martin, rodri, intruso, grupo, item }
}

const SPOILERS = ['claim', 'reservado', 'comprado', 'disponible', 'comment', 'Rodri', 'cristal']

test('EL TEST DE ORO, grupos: ningún dueño del grupo ve reservas ni comentarios por ningún camino', async () => {
  const { db, delfina, martin, grupo, item } = await setup()
  for (const dueno of [delfina, martin]) {
    const porToken = await getListForViewer(db, grupo.shareToken, { userId: dueno.id })
    if (porToken?.role !== 'owner') throw new Error(`esperaba owner para ${dueno.nombre}`)
    expect(porToken).toMatchObject({ listId: grupo.id, tipo: 'grupo' })
    expect(Object.keys(porToken.items[0]).sort()).toEqual(OWNER_KEYS)

    const detalle = await getItemForViewer(db, grupo.shareToken, item.id, { userId: dueno.id })
    if (detalle?.role !== 'owner') throw new Error(`esperaba owner en el detalle para ${dueno.nombre}`)
    expect(Object.keys(detalle.item).sort()).toEqual(OWNER_KEYS)

    const vistaGrupo = await grupoParaDueno(db, grupo.id, dueno.id)
    expect(Object.keys(vistaGrupo!.items[0]).sort()).toEqual(OWNER_KEYS)

    for (const json of [porToken, detalle, vistaGrupo].map((v) => JSON.stringify(v).toLowerCase())) {
      for (const palabra of SPOILERS) expect(json).not.toContain(palabra.toLowerCase())
    }
  }
})

test('un co-dueño no puede reservar ni comentar en su propio grupo', async () => {
  const { db, martin, item } = await setup()
  expect(await reserveItem(db, item.id, { userId: martin.id })).toEqual({ ok: false, reason: 'propio' })
  expect(await addComment(db, item.id, { userId: martin.id }, 'yo lo compro')).toBe(false)
})

test('el regalador ve una sola lista con el nombre del grupo y sus dueños', async () => {
  const { db, rodri, grupo } = await setup()
  const vista = await getListForViewer(db, grupo.shareToken, { userId: rodri.id })
  if (vista?.role !== 'giver') throw new Error('esperaba giver')
  expect(vista.grupoNombre).toBe('Nuestra casa')
  expect(vista.duenos).toEqual(['Delfina', 'Martín'])
  expect(vista.ownerNombre).toBe('Delfina y Martín')
  expect(vista.items[0].claims[0]).toMatchObject({ claimerNombre: 'Rodri', esMia: true })
  // sin identificarse, los deseos sin estados (puede ser un co-dueño sin su sesión)
  expect((await getListForViewer(db, grupo.shareToken, {}))?.role).toBe('anonimo')
})

test('la invitación muestra el grupo, es idempotente y no sirve una inválida', async () => {
  const { db, martin, grupo } = await setup()
  const inv = await grupoPorInvitacion(db, grupo.inviteToken!)
  expect(inv).toMatchObject({ id: grupo.id, nombre: 'Nuestra casa', descripcion: 'para equipar la casa' })
  expect(inv!.duenos.map((d) => d.nombre)).toEqual(['Delfina', 'Martín'])
  expect(await unirseAGrupo(db, grupo.inviteToken!, martin.id)).toBe(grupo.id)
  expect((await grupoPorInvitacion(db, grupo.inviteToken!))!.duenos).toHaveLength(2)
  expect(await unirseAGrupo(db, 'no-existe', martin.id)).toBeNull()
  // el link para regalar no sirve como invitación
  expect(await grupoPorInvitacion(db, grupo.shareToken)).toBeNull()
})

test('cualquier dueño agrega, edita y archiva; un extraño no', async () => {
  const { db, martin, intruso, grupo, item } = await setup()
  expect(await updateItem(db, item.id, martin.id, { prioridad: 'mucho' })).toBe(true)
  expect(await archiveItem(db, item.id, martin.id, 'lo_tengo')).toBe(true)
  expect(await createItem(db, intruso.id, { tipo: 'idea', titulo: 'Colado' }, grupo.id)).toBeNull()
  expect(await createItem(db, intruso.id, { tipo: 'idea', titulo: 'Colado' }, 'no-es-un-uuid')).toBeNull()
  expect(await updateItem(db, item.id, intruso.id, { titulo: 'hackeado' })).toBe(false)
  expect(await archiveItem(db, item.id, intruso.id, 'lo_tengo')).toBe(false)
  expect(await grupoParaDueno(db, grupo.id, intruso.id)).toBeNull()
  expect(await grupoParaDueno(db, 'no-es-un-uuid', martin.id)).toBeNull()
})

test('la lista personal no se mezcla con los grupos', async () => {
  const { db, delfina, grupo } = await setup()
  const propio = (await createItem(db, delfina.id, { tipo: 'idea', titulo: 'Libro' }))!
  const personal = await getOwnList(db, delfina.id)
  expect(personal!.items.map((i) => i.titulo)).toEqual(['Libro'])
  expect(personal!.shareToken).not.toBe(grupo.shareToken)
  expect((await grupoParaDueno(db, grupo.id, delfina.id))!.items.map((i) => i.id)).not.toContain(propio.id)
  // volver a entrar con Google no crea otra lista personal
  await usuario(db, 'Delfina')
  const [{ id }] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'delfina@test.com'))
  expect(await db.select().from(lists).where(eq(lists.ownerId, id))).toHaveLength(1)
})

test('salir del grupo: el último dueño no puede, un co-dueño sí y pierde el acceso', async () => {
  const { db, delfina, martin, grupo } = await setup()
  expect(await salirDeGrupo(db, grupo.id, martin.id)).toBe(true)
  expect(await grupoParaDueno(db, grupo.id, martin.id)).toBeNull()
  expect((await getListForViewer(db, grupo.shareToken, { userId: martin.id }))?.role).toBe('giver')
  expect(await salirDeGrupo(db, grupo.id, delfina.id)).toBe(false)
  expect(await grupoParaDueno(db, grupo.id, delfina.id)).not.toBeNull()
})

test('juntarNombres', () => {
  expect(juntarNombres(['Euge'])).toBe('Euge')
  expect(juntarNombres(['Delfina', 'Martín'])).toBe('Delfina y Martín')
  expect(juntarNombres(['Ana', 'Delfina', 'Martín'])).toBe('Ana, Delfina y Martín')
})

test('los items del grupo existen en la base con su lista', async () => {
  const { db, grupo, item } = await setup()
  const [row] = await db.select().from(items).where(eq(items.id, item.id))
  expect(row.listId).toBe(grupo.id)
})
