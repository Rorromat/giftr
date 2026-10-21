import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { claims, comments, items, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { cambiarLinkParaRegalar, getListForViewer, getItemForViewer, getOwnList } from '@/lib/lists'
import {
  crearGrupo, grupoParaDueno, grupoPorInvitacion, juntarNombres, nombresDeMisGrupos, nuevaInvitacion, salirDeGrupo, unirseAGrupo,
} from '@/lib/groups'
import { archiveItem, createItem, updateItem } from '@/lib/items'
import { markBought, reserveItem } from '@/lib/claims'
import { addComment } from '@/lib/comments'
import { upsertUserFromGoogle } from '@/lib/users'
import { guardarFechaGrupo, misEventos, seguirLista } from '@/lib/events'
import { miGente } from '@/lib/gente'
import { comprarRegalo, historialDeLista, iniciarRegaloGrupal, misCuentas, regalosDeItem, sumarseARegalo, ultimosRegalos } from '@/lib/regalos'

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

test('EL TEST DE ORO, grupos: el que sale del grupo sigue sin ver nada de lo que armó, y volver con la invitación tampoco', async () => {
  const { db, delfina, martin, rodri, intruso, grupo, item } = await setup()
  // Rodri compró la vela ("la roja") y arma con Intruso un regalo grupal por la heladera, ya comprado
  const vela = (await createItem(db, martin.id, { tipo: 'exacto', titulo: 'Vela' }, grupo.id))!
  const r = await reserveItem(db, vela.id, { userId: rodri.id })
  if (!r.ok) throw new Error(r.reason)
  await markBought(db, r.claimId, { userId: rodri.id }, 'la roja')
  const heladera = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Heladera' }, grupo.id))!
  const g = await iniciarRegaloGrupal(db, heladera.id, rodri.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, intruso.id)
  await comprarRegalo(db, g.giftId, rodri.id, { total: 90000 })
  const libre = (await createItem(db, delfina.id, { tipo: 'idea', titulo: 'Plantas' }, grupo.id))!
  // Martín había abierto el link para regalar antes de sumarse
  await guardarFechaGrupo(db, grupo.id, delfina.id, '2020-12-25', true)
  await seguirLista(db, martin.id, grupo.id)

  expect(await salirDeGrupo(db, grupo.id, martin.id)).toBe(true)
  const yo = { userId: martin.id }
  const lista = await getListForViewer(db, grupo.shareToken, yo)
  expect(lista).toMatchObject({ role: 'anonimo', motivo: 'ex_dueno', duenos: ['Delfina'] })
  const detalle = await getItemForViewer(db, grupo.shareToken, item.id, yo)
  expect(detalle).toMatchObject({ role: 'anonimo', motivo: 'ex_dueno' })
  expect(await historialDeLista(db, grupo.id, yo)).toBeNull()
  expect(await regalosDeItem(db, heladera.id, yo)).toEqual([])
  expect((await ultimosRegalos(db, martin.id, [grupo.id])).size).toBe(0)
  expect(await misEventos(db, martin.id)).toEqual([])
  expect(await miGente(db, martin.id)).toEqual([])
  expect(await misCuentas(db, martin.id)).toEqual({ debes: 0, teDeben: 0, personas: [], enCurso: [], saldadas: [] })
  // tampoco reserva, comenta ni arma un regalo
  expect(await reserveItem(db, libre.id, yo)).toEqual({ ok: false, reason: 'propio' })
  expect(await addComment(db, item.id, yo, 'yo lo compro')).toBe(false)
  expect(await iniciarRegaloGrupal(db, libre.id, martin.id)).toEqual({ ok: false, reason: 'propio' })
  // sin su sesión, en un navegador donde entró con su cuenta: tampoco
  const sinSesion = await getListForViewer(db, grupo.shareToken, { cuentas: [martin.id] })
  expect(sinSesion).toMatchObject({ role: 'anonimo', motivo: 'otra_cuenta' })

  const espias = [lista, detalle, sinSesion, await getItemForViewer(db, grupo.shareToken, vela.id, yo)]
  for (const json of espias.map((v) => JSON.stringify(v).toLowerCase())) {
    for (const palabra of [...SPOILERS, 'la roja', 'Intruso', 'grupal', 'giftId', '90000']) expect(json).not.toContain(palabra.toLowerCase())
  }

  // vuelve con la misma invitación: es dueño de nuevo, y como dueño tampoco ve nada
  expect(await unirseAGrupo(db, grupo.inviteToken!, martin.id)).toBe(grupo.id)
  expect(await grupoParaDueno(db, grupo.id, martin.id)).not.toBeNull()
  expect((await getListForViewer(db, grupo.shareToken, yo))?.role).toBe('owner')
  expect((await getListForViewer(db, grupo.shareToken, { userId: rodri.id }))).toMatchObject({ duenos: ['Delfina', 'Martín'] })
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

test('salir del grupo: el último dueño no puede; un co-dueño sí, deja de editar y de figurar como dueño', async () => {
  const { db, delfina, martin, rodri, grupo, item } = await setup()
  expect(await salirDeGrupo(db, grupo.id, martin.id)).toBe(true)
  expect(await grupoParaDueno(db, grupo.id, martin.id)).toBeNull()
  expect(await nombresDeMisGrupos(db, martin.id)).toEqual([])
  expect(await updateItem(db, item.id, martin.id, { titulo: 'otra cosa' })).toBe(false)
  expect(await createItem(db, martin.id, { tipo: 'idea', titulo: 'Colado' }, grupo.id)).toBeNull()
  expect(await guardarFechaGrupo(db, grupo.id, martin.id, '2026-10-12', true)).toBe(false)
  // ve la lista sin la capa oculta (ver el test de oro de arriba)
  expect((await getListForViewer(db, grupo.shareToken, { userId: martin.id }))?.role).toBe('anonimo')
  // para los que regalan y en la invitación, la lista es solo de Delfina
  expect(await getListForViewer(db, grupo.shareToken, { userId: rodri.id })).toMatchObject({ duenos: ['Delfina'], ownerNombre: 'Delfina' })
  expect((await grupoPorInvitacion(db, grupo.inviteToken!))!.duenos.map((d) => d.nombre)).toEqual(['Delfina'])
  // Martín ya no cuenta: Delfina es la última y no puede salir, y él no sale dos veces
  expect(await salirDeGrupo(db, grupo.id, delfina.id)).toBe(false)
  expect(await salirDeGrupo(db, grupo.id, martin.id)).toBe(false)
  expect(await grupoParaDueno(db, grupo.id, delfina.id)).not.toBeNull()
})

test('generar una invitación nueva: la anterior deja de servir, y solo la genera un dueño', async () => {
  const { db, martin, rodri, intruso, grupo } = await setup()
  expect(await nuevaInvitacion(db, grupo.id, intruso.id)).toBeNull()
  expect(await nuevaInvitacion(db, 'no-es-un-uuid', martin.id)).toBeNull()
  const nueva = await nuevaInvitacion(db, grupo.id, martin.id)
  expect(nueva).toBeTruthy()
  expect(nueva).not.toBe(grupo.inviteToken)
  expect(await grupoPorInvitacion(db, grupo.inviteToken!)).toBeNull()
  expect(await unirseAGrupo(db, grupo.inviteToken!, intruso.id)).toBeNull()
  expect(await unirseAGrupo(db, nueva!, rodri.id)).toBe(grupo.id)
  // uno que salió ya no la puede cambiar
  await salirDeGrupo(db, grupo.id, martin.id)
  expect(await nuevaInvitacion(db, grupo.id, martin.id)).toBeNull()
})

test('cambiar el link para regalar: el anterior deja de andar y la lista sale de Tu gente y Eventos de quien la seguía', async () => {
  const { db, delfina, martin, rodri, intruso, grupo, item } = await setup()
  await guardarFechaGrupo(db, grupo.id, delfina.id, '2020-12-25', true)
  await seguirLista(db, rodri.id, grupo.id)
  expect(await miGente(db, rodri.id)).toHaveLength(1)
  expect(await misEventos(db, rodri.id)).toHaveLength(1)

  expect(await cambiarLinkParaRegalar(db, grupo.id, intruso.id)).toBeNull()
  expect(await cambiarLinkParaRegalar(db, 'no-es-un-uuid', martin.id)).toBeNull()
  const nuevo = await cambiarLinkParaRegalar(db, grupo.id, martin.id)
  expect(nuevo).toBeTruthy()
  expect(nuevo).not.toBe(grupo.shareToken)
  expect(await getListForViewer(db, grupo.shareToken, { userId: rodri.id })).toBeNull()
  expect(await getListForViewer(db, nuevo!, { userId: rodri.id })).toMatchObject({ role: 'giver' })
  expect(await miGente(db, rodri.id)).toEqual([])
  expect(await misEventos(db, rodri.id)).toEqual([])
  // lo reservado queda como estaba
  expect(await db.select({ estado: claims.estado }).from(claims).where(eq(claims.itemId, item.id))).toEqual([{ estado: 'reservado' }])

  // la lista personal, igual (solo su dueña)
  const antes = (await getOwnList(db, delfina.id))!
  expect(await cambiarLinkParaRegalar(db, antes.id, rodri.id)).toBeNull()
  const otro = await cambiarLinkParaRegalar(db, antes.id, delfina.id)
  expect(otro).not.toBe(antes.shareToken)
  expect((await getOwnList(db, delfina.id))!.shareToken).toBe(otro)
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
