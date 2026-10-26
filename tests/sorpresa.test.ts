import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { items, claims, comments, lists } from '@/db/schema'
import { getListForViewer, getOwnList, getItemForViewer } from '@/lib/lists'
import { historialDeLista, regalosDeItem } from '@/lib/regalos'
import { markBought, reserveItem } from '@/lib/claims'
import { createGuest } from '@/lib/guest'
import { addComment } from '@/lib/comments'
import { abrirListaAInvitado } from '@/lib/acceso'
import { crearGrupo } from '@/lib/groups'
import { createItem } from '@/lib/items'
import type { Viewer } from '@/lib/types'

const OWNER_KEYS = ['categoria', 'cantidad', 'estadoDueno', 'fotoUrl', 'id', 'linkTienda', 'notas', 'precio', 'prioridad', 'rangoPrecio', 'repetible', 'tipo', 'titulo', 'videoUrl'].sort()

async function setup() {
  const db = await createTestDb()
  const seed = await seedOwnerAndGiver(db)
  const [item] = await db.insert(items).values({
    listId: seed.list.id, tipo: 'exacto', titulo: 'Termo Stanley', precio: '$95.000',
  }).returning()
  await db.insert(claims).values({
    itemId: item.id, claimerUserId: seed.giver.id,
    expiresAt: new Date(Date.now() + 14 * 86400_000),
  })
  await db.insert(comments).values({ itemId: item.id, authorUserId: seed.giver.id, texto: '¿de qué color lo quiere?' })
  return { db, item, ...seed }
}

test('EL TEST DE ORO: el dueño no puede ver estados de sus items por ningún endpoint', async () => {
  const { db, owner, item } = await setup()

  // por token compartido
  const porToken = await getListForViewer(db, 'tok-euge', { userId: owner.id })
  if (porToken?.role !== 'owner') throw new Error('esperaba owner')
  const json1 = JSON.stringify(porToken)
  for (const palabra of ['claim', 'reservado', 'comprado', 'disponible', 'comment', 'Rodri']) {
    expect(json1.toLowerCase()).not.toContain(palabra.toLowerCase())
  }
  expect(Object.keys(porToken.items[0]).sort()).toEqual(OWNER_KEYS)

  // por vista propia
  const propia = await getOwnList(db, owner.id)
  expect(JSON.stringify(propia).toLowerCase()).not.toContain('claim')
  expect(Object.keys(propia!.items[0]).sort()).toEqual(OWNER_KEYS)

  // por detalle de item directo (URL directa)
  const detalle = await getItemForViewer(db, 'tok-euge', item.id, { userId: owner.id })
  if (detalle?.role !== 'owner') throw new Error('esperaba owner')
  const json3 = JSON.stringify(detalle)
  for (const palabra of ['claim', 'reservado', 'comment', 'color']) {
    expect(json3.toLowerCase()).not.toContain(palabra.toLowerCase())
  }
  expect(Object.keys(detalle.item).sort()).toEqual(OWNER_KEYS)

  // sin sesión ni nombre (la dueña desde la app de inicio del iPhone o el navegador de WhatsApp): tampoco
  const anonLista = await getListForViewer(db, 'tok-euge', {})
  const anonDetalle = await getItemForViewer(db, 'tok-euge', item.id, {})
  if (anonLista?.role !== 'anonimo' || anonDetalle?.role !== 'anonimo') throw new Error('esperaba anonimo')
  for (const json of [JSON.stringify(anonLista), JSON.stringify(anonDetalle)].map((j) => j.toLowerCase())) {
    for (const palabra of ['claim', 'reservado', 'comprado', 'disponible', 'quedan', 'comment', 'regalos', 'Rodri', 'color']) {
      expect(json).not.toContain(palabra.toLowerCase())
    }
  }
  expect(Object.keys(anonLista.items[0]).sort()).toEqual(OWNER_KEYS)
  expect(Object.keys(anonDetalle.item).sort()).toEqual(OWNER_KEYS)
  expect(await historialDeLista(db, anonLista.listId, {})).toBeNull()
  expect(await regalosDeItem(db, item.id, {})).toEqual([])
})

// La dueña sin su sesión, pero con una cookie de invitado en ese navegador:
// - la tablet de la familia: Mamá reservó como invitada; Euge entró con Google, dijo "No soy yo" y cerró sesión
//   (o no contestó, o se le venció la sesión). La cuenta de Euge quedó anotada en el navegador (cuentas).
// - Euge se anotó con su nombre en la lista de Rodri desde un navegador sin su sesión: en la suya no dijo nada.
test('EL TEST DE ORO, con una cookie de invitado: tampoco ve nada sin decir en esa lista que no es suya', async () => {
  const { db, owner, item } = await setup()
  const mama = await createGuest(db, 'Mamá')
  const r = await reserveItem(db, item.id, { guestId: mama.id })
  expect(r).toEqual({ ok: false, reason: 'sin_stock' }) // ya lo tenía Rodri; igual quedó dicho que la lista no es de Mamá
  const comoEuge = await createGuest(db, 'Euge')
  const grupoId = await crearGrupo(db, owner.id, { nombre: 'Casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  const cafetera = (await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Cafetera' }, grupoId))!
  await db.insert(claims).values({ itemId: cafetera.id, claimerGuestId: mama.id, expiresAt: new Date(Date.now() + 86400_000) })
  await abrirListaAInvitado(db, mama.id, grupoId)

  const casos: { viewer: Viewer; motivo: string }[] = [
    { viewer: { guestId: mama.id, cuentas: [owner.id] }, motivo: 'otra_cuenta' },
    // la cookie de las cuentas sola (sin invitado): ni se le pide el nombre
    { viewer: { cuentas: [owner.id] }, motivo: 'otra_cuenta' },
    { viewer: { guestId: comoEuge.id }, motivo: 'confirmar' },
  ]
  for (const { viewer, motivo } of casos) {
    for (const [token, deseo] of [['tok-euge', item], [grupo.shareToken, cafetera]] as const) {
      const vista = await getListForViewer(db, token, viewer)
      const detalle = await getItemForViewer(db, token, deseo.id, viewer)
      if (vista?.role !== 'anonimo' || detalle?.role !== 'anonimo') throw new Error(`esperaba anonimo (${motivo})`)
      expect([vista.motivo, detalle.motivo]).toEqual([motivo, motivo])
      for (const json of [JSON.stringify(vista), JSON.stringify(detalle)].map((j) => j.toLowerCase())) {
        for (const palabra of ['claim', 'reservado', 'comprado', 'disponible', 'quedan', 'comment', 'regalos', 'Rodri', 'Mamá', 'color']) {
          expect(json).not.toContain(palabra.toLowerCase())
        }
      }
      expect(await historialDeLista(db, vista.listId, viewer)).toBeNull()
      expect(await regalosDeItem(db, deseo.id, viewer)).toEqual([])
    }
    expect(await addComment(db, item.id, viewer, '¿y esto?')).toBe(false)
  }
  // donde entró con su cuenta, ni reservando se entera
  expect(await reserveItem(db, item.id, { guestId: mama.id, cuentas: [owner.id] })).toEqual({ ok: false, reason: 'propio' })
  expect(await db.select().from(comments).where(eq(comments.texto, '¿y esto?'))).toEqual([])
})

test('el regalador ve claims, comentarios y disponibilidad', async () => {
  const { db, giver, item } = await setup()
  const vista = await getListForViewer(db, 'tok-euge', { userId: giver.id })
  if (vista?.role !== 'giver') throw new Error('esperaba vista giver')
  expect(vista.items[0].claims).toHaveLength(1)
  expect(vista.items[0].claims[0].claimerNombre).toBe('Rodri')
  expect(vista.items[0].claims[0].esMia).toBe(true)
  expect(vista.items[0].disponible).toBe(false) // cantidad 1, ya reservado

  const detalle = await getItemForViewer(db, 'tok-euge', item.id, { userId: giver.id })
  if (detalle?.role !== 'giver') throw new Error('esperaba detalle giver')
  expect(detalle.comments).toHaveLength(1)
})

// Antes un visitante sin identificar veía la vista de regalador completa; ahora ve los deseos como el dueño
// (puede ser el dueño sin su sesión) y la coordinación aparece cuando dice quién es.
test('sin identificarse se ven los deseos activos sin estados; con nombre, la vista de regalador', async () => {
  const { db, list } = await setup()
  await db.insert(items).values({ listId: list.id, tipo: 'idea', titulo: 'Velas', estadoDueno: 'lo_tengo' })
  const vista = await getListForViewer(db, 'tok-euge', {})
  if (vista?.role !== 'anonimo') throw new Error('esperaba anonimo')
  expect(vista.items.map((i) => i.titulo)).toEqual(['Termo Stanley'])
  expect(vista.ownerNombre).toBe('Euge')

  // un invitado ve la coordinación de una lista cuando dice ahí que no es suya (se anota, reserva o "Ver lo reservado")
  const abuela = await createGuest(db, 'Abuela')
  expect(await getListForViewer(db, 'tok-euge', { guestId: abuela.id })).toMatchObject({ role: 'anonimo', motivo: 'confirmar' })
  await abrirListaAInvitado(db, abuela.id, list.id)
  expect((await getListForViewer(db, 'tok-euge', { guestId: abuela.id }))?.role).toBe('giver')
})

test('el id de un invitado no llega a lo que se manda a la página', async () => {
  const { db, list, giver, item } = await setup()
  // la abuela (invitada) compró algo y Rodri también: el ranking de "Quién se ocupó" tiene a los dos
  const abuela = await createGuest(db, 'Abuela')
  const [mate] = await db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Mate' }).returning()
  const r = await reserveItem(db, mate.id, { guestId: abuela.id })
  if (!r.ok) throw new Error(r.reason)
  await markBought(db, r.claimId, { guestId: abuela.id })
  const [c] = await db.select().from(claims).where(eq(claims.claimerUserId, giver.id))
  await markBought(db, c.id, { userId: giver.id })
  await db.insert(comments).values({ itemId: mate.id, authorGuestId: abuela.id, texto: 'lo compré en Palermo' })

  const otra = await createGuest(db, 'Tía')
  await abrirListaAInvitado(db, otra.id, list.id)
  for (const viewer of [{ guestId: otra.id }, { userId: giver.id }]) {
    const historial = await historialDeLista(db, list.id, viewer)
    expect(historial!.ranking).toHaveLength(2)
    const vistas = [
      historial,
      await getListForViewer(db, 'tok-euge', viewer),
      await getItemForViewer(db, 'tok-euge', mate.id, viewer),
      await getItemForViewer(db, 'tok-euge', item.id, viewer),
    ]
    for (const v of vistas) expect(JSON.stringify(v)).not.toContain(abuela.id)
  }
})

test('el dueño ve sus items archivados; el regalador no', async () => {
  const { db, owner, giver, list } = await setup()
  await db.insert(items).values({ listId: list.id, tipo: 'idea', titulo: 'Velas', estadoDueno: 'no_lo_quiero' })
  const propia = await getOwnList(db, owner.id)
  expect(propia!.items).toHaveLength(2)
  const ajena = await getListForViewer(db, 'tok-euge', { userId: giver.id })
  if (ajena?.role !== 'giver') throw new Error('esperaba giver')
  expect(ajena.items).toHaveLength(1)
})

test('giver con URL directa a item archivado obtiene null; dueño lo ve', async () => {
  const { db, owner, giver, list } = await setup()
  const [archived] = await db.insert(items).values({ listId: list.id, tipo: 'idea', titulo: 'Velas', estadoDueno: 'lo_tengo' }).returning()

  // Giver intenta ver item archivado via URL directa → null
  const giverView = await getItemForViewer(db, 'tok-euge', archived.id, { userId: giver.id })
  expect(giverView).toBeNull()

  // Guest anónimo intenta → null
  const guestView = await getItemForViewer(db, 'tok-euge', archived.id, {})
  expect(guestView).toBeNull()

  // Owner lo ve sin problemas
  const ownerView = await getItemForViewer(db, 'tok-euge', archived.id, { userId: owner.id })
  if (ownerView?.role !== 'owner') throw new Error('esperaba owner')
  expect(ownerView.item.titulo).toBe('Velas')
})
