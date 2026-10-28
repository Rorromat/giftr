import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { conConsultas, createTestDb, seguir } from './helpers'
import { claims, comments, items, lists, notifications, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { cambiarLinkParaRegalar, getListForViewer, getItemForViewer, getOwnList } from '@/lib/lists'
import {
  crearGrupo, grupoParaDueno, grupoPorInvitacion, juntarNombres, nombresDeMisGrupos, nuevaInvitacion, sacarDelGrupo, salirDeGrupo,
  unirseAGrupo,
} from '@/lib/groups'
import { archiveItem, createItem, updateItem } from '@/lib/items'
import { markBought, reserveItem } from '@/lib/claims'
import { addComment } from '@/lib/comments'
import { upsertUserFromGoogle } from '@/lib/users'
import { guardarFechaGrupo, misEventos } from '@/lib/events'
import { miGente } from '@/lib/gente'
import { comprarRegalo, historialDeLista, iniciarRegaloGrupal, misCuentas, regalosDeItem, sumarseARegalo, ultimosRegalos } from '@/lib/regalos'
import { getUnreadNotifications } from '@/lib/notifications'
import { abrirListaAInvitado } from '@/lib/acceso'
import { createGuest } from '@/lib/guest'

const OWNER_KEYS = ['categoria', 'cantidad', 'estadoDueno', 'fotoUrl', 'id', 'linkTienda', 'notas', 'precio', 'prioridad', 'rangoPrecio', 'repetible', 'tipo', 'titulo', 'videoUrl'].sort()

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
  await seguir(db, martin.id, grupo.id)

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
  expect(await misCuentas(db, martin.id)).toEqual({ debes: 0, teDeben: 0, personas: [], rondas: [], porVos: [], enCurso: [], saldadas: [] })
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

test('EL TEST DE ORO, grupos: el que usó la lista como invitado y después se suma no ve nada con su cookie de invitado', async () => {
  const { db, delfina, rodri, grupo, item } = await setup()
  const juan = await usuario(db, 'Juan')
  const cafetera = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Cafetera' }, grupo.id))!
  // Juan abrió el link para regalar en el navegador de WhatsApp, se anotó como invitado y reservó la cafetera. La tía
  // también regala, como invitada. Rodri reservó las copas y comentó (en setup).
  const juanDeWhatsApp = await createGuest(db, 'Juan')
  const tia = await createGuest(db, 'Tía')
  const r = await reserveItem(db, cafetera.id, { guestId: juanDeWhatsApp.id })
  if (!r.ok) throw new Error(r.reason)
  await abrirListaAInvitado(db, tia.id, grupo.id)
  expect((await getListForViewer(db, grupo.shareToken, { guestId: tia.id }))?.role).toBe('giver')
  await new Promise((ok) => setTimeout(ok, 5))

  // después Delfina lo invita y se suma desde Chrome, con su Google: el servidor no sabe que el invitado es él
  expect(await unirseAGrupo(db, grupo.inviteToken!, juan.id)).toBe(grupo.id)
  for (const invitado of [juanDeWhatsApp, tia]) {
    const yo = { guestId: invitado.id }
    const lista = await getListForViewer(db, grupo.shareToken, yo)
    expect(lista).toMatchObject({ role: 'anonimo', motivo: 'confirmar' })
    const detalle = await getItemForViewer(db, grupo.shareToken, item.id, yo)
    expect(detalle).toMatchObject({ role: 'anonimo', motivo: 'confirmar' })
    expect(await historialDeLista(db, grupo.id, yo)).toBeNull()
    expect(await regalosDeItem(db, item.id, yo)).toEqual([])
    expect(await addComment(db, item.id, yo, 'yo llevo el vino')).toBe(false)
    for (const json of [lista, detalle].map((v) => JSON.stringify(v).toLowerCase())) {
      for (const palabra of SPOILERS) expect(json).not.toContain(palabra.toLowerCase())
    }
  }

  // la tía vuelve a decir que no es suya y la ve de nuevo; Juan, con su Google, es dueño
  await new Promise((ok) => setTimeout(ok, 5))
  await abrirListaAInvitado(db, tia.id, grupo.id)
  expect((await getListForViewer(db, grupo.shareToken, { guestId: tia.id }))?.role).toBe('giver')
  expect((await getListForViewer(db, grupo.shareToken, { userId: juan.id }))?.role).toBe('owner')
  expect((await getListForViewer(db, grupo.shareToken, { guestId: juanDeWhatsApp.id }))?.role).toBe('anonimo')

  // si sale y vuelve con la invitación, se pregunta otra vez: también puede haberla usado como invitado entretanto
  expect(await salirDeGrupo(db, grupo.id, juan.id)).toBe(true)
  await new Promise((ok) => setTimeout(ok, 5))
  expect(await unirseAGrupo(db, grupo.inviteToken!, juan.id)).toBe(grupo.id)
  expect(await getListForViewer(db, grupo.shareToken, { guestId: tia.id })).toMatchObject({ role: 'anonimo', motivo: 'confirmar' })
  // y entrar de nuevo con una invitación de la que ya es parte no cambia nada
  await new Promise((ok) => setTimeout(ok, 5))
  await abrirListaAInvitado(db, tia.id, grupo.id)
  expect(await unirseAGrupo(db, grupo.inviteToken!, juan.id)).toBe(grupo.id)
  expect((await getListForViewer(db, grupo.shareToken, { guestId: tia.id }))?.role).toBe('giver')
  // a nadie le cambió lo que reservó: la de Rodri sigue y la del invitado de Juan vence sola
  expect((await db.select().from(claims).where(eq(claims.claimerUserId, rodri.id)))[0].estado).toBe('reservado')
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

test('un co-dueño, y después ex, no recibe avisos de lo que compró como regalador antes de sumarse', async () => {
  const { db, delfina, intruso, grupo } = await setup()
  const vela = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Vela' }, grupo.id))!
  const r = await reserveItem(db, vela.id, { userId: intruso.id })
  if (!r.ok) throw new Error(r.reason)
  await markBought(db, r.claimId, { userId: intruso.id })
  await unirseAGrupo(db, grupo.inviteToken!, intruso.id)
  await updateItem(db, vela.id, delfina.id, { titulo: 'Vela de soja' })
  expect(await getUnreadNotifications(db, { userId: intruso.id })).toEqual([])
  await salirDeGrupo(db, grupo.id, intruso.id)
  await updateItem(db, vela.id, delfina.id, { notas: 'la del frasco' })
  expect(await getUnreadNotifications(db, { userId: intruso.id })).toEqual([])
  // el aviso está (la compra sigue a su nombre), pero nunca se le muestra: le diría que lo editaron porque alguien lo compró.
  // Uno solo: la segunda edición sube el que seguía sin leer en vez de sumar otro igual.
  expect(await db.select().from(notifications).where(eq(notifications.userId, intruso.id))).toHaveLength(1)
})

test('sacar a quien se sumó por error: deja de editar, sigue ciego como uno que sale, y la invitación cambia', async () => {
  const { db, delfina, martin, rodri, intruso, grupo, item } = await setup()
  const [tio, tia] = [await usuario(db, 'Tío'), await usuario(db, 'Tía')]
  // a Martín se le escapó la invitación en el grupo de la familia: el tío se sumó y cargó una vela, y la tía se sumó y salió
  await unirseAGrupo(db, grupo.inviteToken!, tio.id)
  const vela = (await createItem(db, tio.id, { tipo: 'exacto', titulo: 'Vela' }, grupo.id))!
  await unirseAGrupo(db, grupo.inviteToken!, tia.id)
  await salirDeGrupo(db, grupo.id, tia.id)
  expect(await reserveItem(db, vela.id, { userId: rodri.id })).toMatchObject({ ok: true })
  // solo los que siguen y llegaron después: a la tía, que ya salió, no hay nada que sacarle
  expect((await grupoParaDueno(db, grupo.id, martin.id))!.sacables).toEqual([{ id: tio.id, nombre: 'Tío' }])
  expect((await grupoParaDueno(db, grupo.id, tio.id))!.sacables).toEqual([])

  // el que llegó después no saca a los que armaron la lista; tampoco saca uno de afuera ni uno que ya salió, y a la tía
  // (ya salió) no se la saca de nuevo
  expect(await sacarDelGrupo(db, grupo.id, tio.id, martin.id)).toBe(false)
  expect(await sacarDelGrupo(db, grupo.id, intruso.id, tio.id)).toBe(false)
  expect(await sacarDelGrupo(db, grupo.id, tia.id, tio.id)).toBe(false)
  expect(await sacarDelGrupo(db, grupo.id, delfina.id, tia.id)).toBe(false)
  expect(await sacarDelGrupo(db, grupo.id, martin.id, martin.id)).toBe(false)
  expect(await sacarDelGrupo(db, 'no-es-un-uuid', martin.id, tio.id)).toBe(false)
  expect(await sacarDelGrupo(db, grupo.id, martin.id, 'no-es-un-uuid')).toBe(false)
  expect((await db.select().from(lists).where(eq(lists.id, grupo.id)))[0].inviteToken).toBe(grupo.inviteToken)

  expect(await sacarDelGrupo(db, grupo.id, martin.id, tio.id)).toBe(true)
  // ya no edita ni figura como dueño, pero no vuelve a regalar: pudo haber cargado deseos (la vela) y vería quién los reservó
  expect(await grupoParaDueno(db, grupo.id, tio.id)).toBeNull()
  expect(await updateItem(db, vela.id, tio.id, { titulo: 'Vela de soja' })).toBe(false)
  expect(await getListForViewer(db, grupo.shareToken, { userId: tio.id })).toMatchObject({ role: 'anonimo', motivo: 'ex_dueno' })
  expect(await getItemForViewer(db, grupo.shareToken, item.id, { userId: tio.id })).toMatchObject({ role: 'anonimo' })
  expect(await reserveItem(db, item.id, { userId: tio.id })).toEqual({ ok: false, reason: 'propio' })
  expect(await getListForViewer(db, grupo.shareToken, { userId: rodri.id })).toMatchObject({ duenos: ['Delfina', 'Martín'] })
  expect((await grupoParaDueno(db, grupo.id, martin.id))!.sacables).toEqual([])
  expect(await sacarDelGrupo(db, grupo.id, martin.id, tio.id)).toBe(false)

  // con la invitación de antes no vuelve; con la nueva sí, y sigue después de los que ya estaban
  const [{ inviteToken: nueva }] = await db.select({ inviteToken: lists.inviteToken }).from(lists).where(eq(lists.id, grupo.id))
  expect(nueva).not.toBe(grupo.inviteToken)
  expect(await unirseAGrupo(db, grupo.inviteToken!, tio.id)).toBeNull()
  expect(await unirseAGrupo(db, nueva!, tio.id)).toBe(grupo.id)
  expect((await grupoParaDueno(db, grupo.id, tio.id))!.sacables).toEqual([])
  expect((await grupoParaDueno(db, grupo.id, delfina.id))!.sacables).toEqual([{ id: martin.id, nombre: 'Martín' }, { id: tio.id, nombre: 'Tío' }])
})

test('unirse con la invitación bloquea la fila del grupo (PGlite no deja probar dos pedidos a la vez)', async () => {
  const { db, delfina, martin, grupo } = await setup()
  // En Postgres, si Delfina sacaba a Martín justo mientras él volvía a entrar con la invitación de antes, unirseAGrupo ya
  // había leído el token viejo y después veía salio_at puesto: lo volvía a activar. Con FOR SHARE espera al cambio de
  // invitación y no encuentra el grupo. Acá las transacciones van de a una, así que se fija que el lock se toma.
  const unirse = conConsultas(db)
  expect(await unirseAGrupo(unirse.db, grupo.inviteToken!, martin.id)).toBe(grupo.id)
  const porInvitacion = unirse.consultas.find((q) => q.includes('from "lists"') && q.includes('"invite_token"'))
  expect(porInvitacion).toMatch(/for share$/)
  // y en orden: sacado, con la de antes no vuelve
  expect(await sacarDelGrupo(db, grupo.id, delfina.id, martin.id)).toBe(true)
  expect(await unirseAGrupo(db, grupo.inviteToken!, martin.id)).toBeNull()
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
  await seguir(db, rodri.id, grupo.id)
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
