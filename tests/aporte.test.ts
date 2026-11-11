import { expect, test } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { createTestDb, seguir } from './helpers'
import { avisos, claims, groupGifts, items, lists, notifications, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import {
  aportar, deshacerAporte, desmarcarComprado, expireStaleClaims, getMyClaimWarnings, markBought, releaseClaim, reserveItem, tomadasEnLista,
} from '@/lib/claims'
import { guardarCumple, hoyLocal } from '@/lib/events'
import { crearGrupo, grupoParaDueno, salirDeGrupo, unirseAGrupo } from '@/lib/groups'
import { createGuest } from '@/lib/guest'
import { archiveItem, createItem, deseoParaEditar, restoreItem, updateItem } from '@/lib/items'
import { getItemForViewer, getListForViewer, getOwnList, guardarNombresSoloConCuenta } from '@/lib/lists'
import { misRegalos } from '@/lib/mis-regalos'
import { getUnreadNotifications } from '@/lib/notifications'
import { novedadesDeAmigos, robarDeseo } from '@/lib/novedades'
import { marcarRecibidos, revelarRegalo } from '@/lib/post-evento'
import { mandarRecordatorios } from '@/lib/recordatorios'
import { historialDeLista, iniciarRegaloGrupal } from '@/lib/regalos'
import { borrarCuenta, exportarMisDatos } from '@/lib/cuenta'
import { itemParaCompartir, listaParaCompartir, textoDueno, textoRegalador } from '@/lib/compartir'
import { cupoDe, esAporte, esRepetible, juntadoAprox } from '@/lib/serialize'
import { partirPorTope, presupuestoDeLista } from '@/lib/presupuesto'
import { aceptarLinkDeAmigo } from '@/lib/amigos'
import { RESERVAS_POR_LISTA } from '@/lib/types'

// El deseo de aporte en plata ("Luna de miel", "Cochecito"): no se reserva, aportan todos los que quieran por transferencia
// al alias del deseo, y cada uno lo deja anotado si quiere. El dueño no ve quién aportó, ni cuánto, ni cuántos.

const DIA = 86400_000
const AHORA = new Date()
const HOY = hoyLocal(AHORA)

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}
const listaDe = async (db: Db, userId: string) => (await db.select().from(lists).where(eq(lists.ownerId, userId)))[0]
const claimsDe = (db: Db, itemId: string) => db.select().from(claims).where(eq(claims.itemId, itemId))
const fila = async (db: Db, itemId: string) => (await db.select().from(items).where(eq(items.id, itemId)))[0]
const ALIAS = 'euge.luna.mp'

/** Euge con un aporte ("Luna de miel", con meta) y un Termo en su lista, y Rodri, Caro y Sofi, que le regalan. */
async function armar({ meta = 300000 as number | undefined } = {}) {
  const db = await createTestDb()
  const [euge, rodri, caro, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Rodri'), await usuario(db, 'Caro'), await usuario(db, 'Sofi')]
  const lista = await listaDe(db, euge.id)
  const luna = (await createItem(db, euge.id, { tipo: 'aporte', titulo: 'Luna de miel', notas: 'Nos vamos al sur', aporteAlias: ALIAS, aporteMeta: meta }))!
  const termo = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Termo', precio: '$45.000' }))!
  return { db, euge, rodri, caro, sofi, lista, luna, termo }
}
/** La lista como la ve alguien que regala. */
async function comoRegalador(db: Db, token: string, viewer: { userId?: string; guestId?: string }) {
  const v = await getListForViewer(db, token, viewer)
  if (v?.role !== 'giver') throw new Error(`esperaba la vista de quien regala y vino ${v?.role}`)
  return v
}

// ---------- crear y editar ----------

test('crear un aporte: nombre, descripción, alias y meta; sin precio, tienda, cantidad ni "se repite"; sin un alias que valga no se crea', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge')
  const luna = await createItem(db, euge.id, {
    tipo: 'aporte', titulo: 'Luna de miel', notas: 'Nos vamos al sur', aporteAlias: ' Euge.Luna.MP ', aporteMeta: 300000,
    // lo que no es de un aporte no se guarda, aunque llegue (un formulario armado a mano)
    precio: '$300.000', linkTienda: 'https://tienda.com/x', cantidad: 5, repetible: true, videoUrl: 'https://youtu.be/x',
  })
  expect(luna).toMatchObject({
    tipo: 'aporte', titulo: 'Luna de miel', notas: 'Nos vamos al sur', aporteAlias: 'euge.luna.mp', aporteMeta: 300000,
    precio: null, precioMin: null, linkTienda: null, videoUrl: null, cantidad: 1, estadoDueno: 'activo',
  })
  // en la base la marca de repetible queda apagada: un aporte se repite siempre, por ser aporte
  expect((await fila(db, luna!.id)).repetible).toBe(false)
  expect(esAporte(luna!)).toBe(true)
  expect(esRepetible({ tipo: 'aporte', repetible: false })).toBe(true)

  // la meta es opcional; un CVU con los espacios del banco queda en sus 22 números
  const cochecito = await createItem(db, euge.id, { tipo: 'aporte', titulo: 'Cochecito', aporteAlias: '0000003 100012345678 901' })
  expect(cochecito).toMatchObject({ aporteAlias: '0000003100012345678901', aporteMeta: null })

  // sin alias, o con uno mal escrito, no se crea: es lo único que necesita quien quiere aportar
  expect(await createItem(db, euge.id, { tipo: 'aporte', titulo: 'Sin alias' })).toBeNull()
  for (const malo of ['', 'mío', 'a b', 'x'.repeat(21), '12345', '@euge']) {
    expect(await createItem(db, euge.id, { tipo: 'aporte', titulo: `Con ${malo}`, aporteAlias: malo }), malo).toBeNull()
  }
  // una meta que no es plata (cero, negativa, con decimales, enorme) no se guarda; el aporte, sí
  for (const mala of [0, -5, 1.5, 100_000_001, Number.NaN]) {
    expect(await createItem(db, euge.id, { tipo: 'aporte', titulo: `Meta ${mala}`, aporteAlias: ALIAS, aporteMeta: mala }), String(mala)).toMatchObject({ aporteMeta: null })
  }
  // un deseo de otro tipo no lleva alias ni meta aunque lleguen
  const termo = await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Termo', aporteAlias: ALIAS, aporteMeta: 5000 })
  expect(termo).toMatchObject({ tipo: 'exacto', aporteAlias: null, aporteMeta: null })
  expect((await fila(db, termo!.id)).aporteAlias).toBeNull()
  // un doble toque en "Agregar" no lo duplica
  const otra = await createItem(db, euge.id, { tipo: 'aporte', titulo: 'Luna de miel', notas: 'Nos vamos al sur', aporteAlias: 'euge.luna.mp', aporteMeta: 300000 })
  expect(otra!.id).toBe(luna!.id)
})

test('en una lista en común el alias es el del deseo: lo carga quien lo crea, sea quien sea de los que la arman', async () => {
  const db = await createTestDb()
  const [delfi, martin, sofi] = [await usuario(db, 'Delfi'), await usuario(db, 'Martín'), await usuario(db, 'Sofi')]
  const id = await crearGrupo(db, delfi.id, { nombre: 'El casamiento de Delfi y Martín', ocasion: 'casamiento' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, id))
  await unirseAGrupo(db, grupo.inviteToken!, martin.id)
  // Martín carga la luna de miel con SU alias: no sale de ningún perfil
  const luna = await createItem(db, martin.id, { tipo: 'aporte', titulo: 'Luna de miel', aporteAlias: 'martin.viajes' }, id)
  expect(luna).toMatchObject({ aporteAlias: 'martin.viajes' })
  // los dos lo ven igual en la lista, y lo edita cualquiera de los dos
  expect((await grupoParaDueno(db, id, delfi.id))!.items[0]).toMatchObject({ titulo: 'Luna de miel', tipo: 'aporte', aporteAlias: 'martin.viajes' })
  expect(await updateItem(db, luna!.id, delfi.id, { aporteAlias: 'delfi.y.martin' })).toBe(true)
  expect((await fila(db, luna!.id)).aporteAlias).toBe('delfi.y.martin')
  // quien regala ve ese, y la vista previa del link dice que hay un aporte (y nada más)
  const vista = await comoRegalador(db, grupo.shareToken, { userId: sofi.id })
  expect(vista.items[0]).toMatchObject({ tipo: 'aporte', aporteAlias: 'delfi.y.martin', disponible: true, quedan: null })
  expect(await listaParaCompartir(db, grupo.shareToken)).toMatchObject({ conAportes: true, ocasion: 'casamiento', cantidad: 1 })
  // alguien que no la arma no carga nada
  expect(await createItem(db, sofi.id, { tipo: 'aporte', titulo: 'Colada', aporteAlias: 'sofi.alias' }, id)).toBeNull()
})

test('editar un aporte: nombre, descripción, alias y meta; un alias mal escrito no pisa el bueno; no se vuelve un deseo, ni un deseo un aporte; y no le avisa a nadie', async () => {
  const { db, euge, rodri, luna, termo } = await armar()
  expect(await aportar(db, luna.id, { userId: rodri.id }, 20000)).toMatchObject({ ok: true })

  expect(await updateItem(db, luna.id, euge.id, { titulo: 'Luna de miel en Bariloche', notas: null, aporteAlias: 'EUGE.NUEVO', aporteMeta: 500000 })).toBe(true)
  expect(await fila(db, luna.id)).toMatchObject({ titulo: 'Luna de miel en Bariloche', notas: null, aporteAlias: 'euge.nuevo', aporteMeta: 500000 })
  // la meta se puede quitar
  await updateItem(db, luna.id, euge.id, { aporteMeta: null })
  expect((await fila(db, luna.id)).aporteMeta).toBeNull()
  // un alias mal escrito, o vacío, deja el que había (con uno roto la transferencia no sale)
  for (const malo of ['mío', '', 'ab', 'x'.repeat(21)]) {
    await updateItem(db, luna.id, euge.id, { aporteAlias: malo })
    expect((await fila(db, luna.id)).aporteAlias, malo).toBe('euge.nuevo')
  }
  // lo que no es de un aporte se ignora
  await updateItem(db, luna.id, euge.id, { precio: '$10', cantidad: 3, repetible: true, linkTienda: 'https://tienda.com' })
  expect(await fila(db, luna.id)).toMatchObject({ precio: null, cantidad: 1, repetible: false, linkTienda: null })

  // no cambia de tipo: los que ya aportaron quedarían como si lo hubieran comprado
  await updateItem(db, luna.id, euge.id, { tipo: 'exacto' })
  await updateItem(db, luna.id, euge.id, { tipo: 'idea', titulo: 'Otra cosa' })
  expect(await fila(db, luna.id)).toMatchObject({ tipo: 'aporte', titulo: 'Otra cosa' })
  // ni un deseo pasa a ser un aporte (tendría reservas sin dónde manejarlas), ni se le pega un alias
  expect(await reserveItem(db, termo.id, { userId: rodri.id })).toMatchObject({ ok: true })
  await updateItem(db, termo.id, euge.id, { tipo: 'aporte', aporteAlias: ALIAS, aporteMeta: 1000 })
  expect(await fila(db, termo.id)).toMatchObject({ tipo: 'exacto', aporteAlias: null, aporteMeta: null })

  // a Rodri, que ya aportó, nada de esto le llegó como aviso (al que ya transfirió no le cambia nada)
  expect(await getUnreadNotifications(db, { userId: rodri.id })).toEqual([])
  // solo el dueño lo edita
  expect(await updateItem(db, luna.id, rodri.id, { aporteAlias: 'rodri.se.la.queda' })).toBe(false)
  expect((await fila(db, luna.id)).aporteAlias).toBe('euge.nuevo')
})

// ---------- aportar ----------

test('"Ya aporté": queda anotado comprado y sin vencer, con el monto si lo dijo; el deseo sigue disponible; se corrige, se deshace y se vuelve a anotar', async () => {
  const { db, rodri, lista, luna } = await armar()
  const r = await aportar(db, luna.id, { userId: rodri.id }, 20000)
  if (!r.ok) throw new Error(r.reason)
  expect(await claimsDe(db, luna.id)).toMatchObject([{ id: r.claimId, claimerUserId: rodri.id, estado: 'comprado', expiresAt: null, aporteMonto: 20000, notaQueCompre: null }])

  let v = await comoRegalador(db, lista.shareToken, { userId: rodri.id })
  let aporte = v.items.find((i) => i.id === luna.id)!
  // nunca queda ocupado: sin cupo y disponible, también para el que ya aportó
  expect(aporte).toMatchObject({ disponible: true, quedan: null })
  expect(aporte.claims).toEqual([expect.objectContaining({ id: r.claimId, estado: 'comprado', esMia: true, claimerNombre: 'Rodri', monto: 20000, deshacer: true, vence: null, grupal: null })])

  // un doble toque (o la lista y el deseo abiertos a la vez) no anota dos: es el mismo, y un monto nuevo lo corrige
  expect(await aportar(db, luna.id, { userId: rodri.id })).toEqual({ ok: true, claimId: r.claimId })
  expect((await claimsDe(db, luna.id))[0].aporteMonto).toBe(20000)
  expect(await aportar(db, luna.id, { userId: rodri.id }, 35000)).toEqual({ ok: true, claimId: r.claimId })
  expect(await claimsDe(db, luna.id)).toMatchObject([{ aporteMonto: 35000 }])

  // "Me equivoqué, todavía no aporté": deja de figurar, con su monto, y no vuelve a ser una reserva
  expect(await deshacerAporte(db, r.claimId, { userId: rodri.id })).toBe(true)
  expect(await claimsDe(db, luna.id)).toMatchObject([{ estado: 'liberado', aporteMonto: null }])
  v = await comoRegalador(db, lista.shareToken, { userId: rodri.id })
  aporte = v.items.find((i) => i.id === luna.id)!
  expect(aporte.claims).toEqual([])
  expect(await deshacerAporte(db, r.claimId, { userId: rodri.id })).toBe(false)
  // y lo puede anotar de nuevo, sin decir cuánto
  const otra = await aportar(db, luna.id, { userId: rodri.id })
  expect(otra).toMatchObject({ ok: true })
  expect(otra.ok && otra.claimId).not.toBe(r.claimId)
  v = await comoRegalador(db, lista.shareToken, { userId: rodri.id })
  expect(v.items.find((i) => i.id === luna.id)!.claims).toEqual([expect.objectContaining({ esMia: true, monto: null, deshacer: true })])
})

test('varios aportan a la vez: cada uno tiene el suyo, ninguno le saca el lugar a otro, y nadie deshace el de otro', async () => {
  const { db, rodri, caro, sofi, lista, luna } = await armar()
  const [a, b, c] = await Promise.all([
    aportar(db, luna.id, { userId: rodri.id }, 20000), aportar(db, luna.id, { userId: caro.id }, 50000), aportar(db, luna.id, { userId: sofi.id }),
  ])
  if (!a.ok || !b.ok || !c.ok) throw new Error('esperaba que aporten los tres')
  expect(new Set([a.claimId, b.claimId, c.claimId]).size).toBe(3)
  expect((await claimsDe(db, luna.id)).map((x) => x.estado)).toEqual(['comprado', 'comprado', 'comprado'])
  // sigue disponible aunque pida "uno": un aporte no tiene cupo
  expect(cupoDe(await fila(db, luna.id), 3)).toEqual({ quedan: null, disponible: true })
  // cada uno ve su monto, y de los demás el nombre: cuánto puso otro no viaja
  const deCaro = (await comoRegalador(db, lista.shareToken, { userId: caro.id })).items.find((i) => i.id === luna.id)!
  expect(deCaro.claims.map((x) => ({ quien: x.claimerNombre, mia: x.esMia, monto: x.monto, deshacer: x.deshacer })).sort((x, y) => x.quien!.localeCompare(y.quien!))).toEqual([
    { quien: 'Caro', mia: true, monto: 50000, deshacer: true },
    { quien: 'Rodri', mia: false, monto: null, deshacer: false },
    { quien: 'Sofi', mia: false, monto: null, deshacer: false },
  ])
  // el de otro no se deshace
  expect(await deshacerAporte(db, a.claimId, { userId: caro.id })).toBe(false)
  expect(await deshacerAporte(db, 'no-es-un-id', { userId: caro.id })).toBe(false)
  expect((await claimsDe(db, luna.id)).filter((x) => x.estado === 'comprado').length).toBe(3)
})

test('quién puede anotar un aporte: los mismos que reservan; ningún dueño (ni uno que salió), ni sin decir quién es, ni con montos que no son plata', async () => {
  const { db, euge, rodri, luna, termo } = await armar()
  expect(await aportar(db, luna.id, {})).toEqual({ ok: false, reason: 'sin_identidad' })
  expect(await aportar(db, luna.id, { userId: euge.id }, 1000)).toEqual({ ok: false, reason: 'propio' })
  for (const malo of [0, -1, 0.5, 100_000_001, Number.NaN]) expect(await aportar(db, luna.id, { userId: rodri.id }, malo), String(malo)).toEqual({ ok: false, reason: 'monto' })
  // "Ya aporté" es de los aportes: en un deseo común no existe (para eso está reservar)
  expect(await aportar(db, termo.id, { userId: rodri.id })).toEqual({ ok: false, reason: 'no_existe' })
  expect(await aportar(db, 'no-es-un-id', { userId: rodri.id })).toEqual({ ok: false, reason: 'no_existe' })
  // un invitado con su nombre, sí; y anotarlo es decir que la lista no es suya
  const tia = await createGuest(db, 'Tía Marta')
  expect(await aportar(db, luna.id, { guestId: tia.id }, 5000)).toMatchObject({ ok: true })
  // en un navegador donde tuvo sesión la dueña, un invitado no: puede ser ella
  const otra = await createGuest(db, 'Otra')
  expect(await aportar(db, luna.id, { guestId: otra.id, cuentas: [euge.id] })).toEqual({ ok: false, reason: 'propio' })
  // sacado de la lista, ya no se anota
  await archiveItem(db, luna.id, euge.id, 'no_lo_quiero')
  expect(await aportar(db, luna.id, { userId: rodri.id })).toEqual({ ok: false, reason: 'archivado' })
  expect((await claimsDe(db, luna.id)).length).toBe(1)

  // en una lista en común: ni los que la arman, ni el que la armó y salió
  const [delfi, martin] = [await usuario(db, 'Delfi'), await usuario(db, 'Martín')]
  const id = await crearGrupo(db, delfi.id, { nombre: 'Casamiento', ocasion: 'casamiento' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, id))
  await unirseAGrupo(db, grupo.inviteToken!, martin.id)
  const viaje = (await createItem(db, delfi.id, { tipo: 'aporte', titulo: 'Luna de miel', aporteAlias: 'delfi.alias' }, id))!
  expect(await aportar(db, viaje.id, { userId: martin.id })).toEqual({ ok: false, reason: 'propio' })
  await salirDeGrupo(db, id, martin.id)
  expect(await aportar(db, viaje.id, { userId: martin.id })).toEqual({ ok: false, reason: 'propio' })
  expect(await claimsDe(db, viaje.id)).toEqual([])
})

test('un aporte no se reserva, no entra en un regalo grupal, no cuenta para el tope y no vence', async () => {
  const { db, euge, rodri, caro, lista, luna } = await armar()
  // reservar no (ni con un pedido armado a mano), y armar un regalo grupal encima tampoco: dividir un aporte no tiene sentido
  expect(await reserveItem(db, luna.id, { userId: rodri.id })).toMatchObject({ ok: false })
  expect(await iniciarRegaloGrupal(db, luna.id, rodri.id)).toMatchObject({ ok: false })
  expect(await claimsDe(db, luna.id)).toEqual([])
  expect(await db.select().from(groupGifts)).toEqual([])

  // con el aporte anotado, tampoco (ni lo convierte en un regalo)
  const r = await aportar(db, luna.id, { userId: rodri.id }, 10000)
  if (!r.ok) throw new Error(r.reason)
  expect(await iniciarRegaloGrupal(db, luna.id, rodri.id)).toMatchObject({ ok: false })
  expect(await iniciarRegaloGrupal(db, luna.id, caro.id)).toMatchObject({ ok: false })
  expect(await db.select().from(groupGifts)).toEqual([])
  // las acciones de una reserva no lo tocan: no se "desmarca" a reservado, ni se libera, ni se vuelve a marcar
  expect(await desmarcarComprado(db, r.claimId, { userId: rodri.id })).toEqual({ ok: false, reason: 'no_permitido' })
  expect(await releaseClaim(db, r.claimId, { userId: rodri.id })).toBe(false)
  expect(await markBought(db, r.claimId, { userId: rodri.id }, 'una nota')).toEqual({ ok: true })
  expect(await claimsDe(db, luna.id)).toMatchObject([{ estado: 'comprado', aporteMonto: 10000, notaQueCompre: null, expiresAt: null }])

  // no cuenta para el tope de reservas: con el aporte anotado entran las 10 de siempre…
  expect(await tomadasEnLista(db, lista.id, { userId: rodri.id })).toBe(0)
  for (let i = 0; i < RESERVAS_POR_LISTA; i++) {
    const d = (await createItem(db, euge.id, { tipo: 'exacto', titulo: `Deseo ${i}` }))!
    expect(await reserveItem(db, d.id, { userId: rodri.id }), String(i)).toMatchObject({ ok: true })
  }
  const unoMas = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Uno más' }))!
  expect(await reserveItem(db, unoMas.id, { userId: rodri.id })).toEqual({ ok: false, reason: 'muchas' })
  // …y con el tope lleno se puede aportar igual (Caro, a otro aporte; Rodri, corregir el suyo)
  const cochecito = (await createItem(db, euge.id, { tipo: 'aporte', titulo: 'Cochecito', aporteAlias: ALIAS }))!
  expect(await aportar(db, cochecito.id, { userId: rodri.id })).toMatchObject({ ok: true })

  // no vence: pasado un año sigue anotado, y no hay cartel de "se te vence"
  await expireStaleClaims(db, undefined, new Date(AHORA.getTime() + 400 * DIA))
  expect((await claimsDe(db, luna.id))[0].estado).toBe('comprado')
  expect((await getMyClaimWarnings(db, { userId: rodri.id })).map((w) => w.itemTitulo)).not.toContain('Luna de miel')
})

// ---------- la regla de la sorpresa ----------

test('EL DUEÑO NO VE NADA: ni quién aportó, ni cuánto, ni cuántos, por ningún camino (su lista, el deseo, el link, la vista previa, los avisos, sus datos)', async () => {
  const { db, euge, rodri, caro, lista, luna } = await armar()
  const conAportes = async () => JSON.stringify([
    await getOwnList(db, euge.id), await getListForViewer(db, lista.shareToken, { userId: euge.id }),
    await getItemForViewer(db, lista.shareToken, luna.id, { userId: euge.id }), await deseoParaEditar(db, luna.id, euge.id),
    // sin su sesión (el navegador de WhatsApp): tampoco
    await getListForViewer(db, lista.shareToken, {}), await getItemForViewer(db, lista.shareToken, luna.id, {}),
    // la vista previa del link, que también le llega
    await listaParaCompartir(db, lista.shareToken), await itemParaCompartir(db, lista.shareToken, luna.id),
    await exportarMisDatos(db, euge.id), await getUnreadNotifications(db, { userId: euge.id }),
    await db.select().from(avisos).where(eq(avisos.userId, euge.id)), await db.select().from(notifications).where(eq(notifications.userId, euge.id)),
  ])
  const antes = await conAportes()
  const a = await aportar(db, luna.id, { userId: rodri.id }, 20000)
  await aportar(db, luna.id, { userId: caro.id }, 77000)
  const tia = await createGuest(db, 'Tía Marta')
  await aportar(db, luna.id, { guestId: tia.id }, 6100)
  if (!a.ok) throw new Error(a.reason)
  await deshacerAporte(db, a.claimId, { userId: rodri.id })
  await aportar(db, luna.id, { userId: rodri.id }, 31000)
  // el cron del día tampoco le cuenta nada
  await mandarRecordatorios(db, AHORA, async () => 201)
  const despues = await conAportes()
  // lo que le llega es idéntico haya o no aportes (salvo la hora en que se generó su descarga)
  const sinHora = (s: string) => s.replace(/"generado":"[^"]+"/, '')
  expect(sinHora(despues)).toBe(sinHora(antes))
  for (const dato of ['Rodri', 'Caro', 'Tía Marta', '20000', '77000', '31000', '6100', 'aporteMonto', 'juntado', 'claims']) expect(despues, dato).not.toContain(dato)
  // lo suyo sí lo ve: el alias y la meta que cargó
  const propia = await getListForViewer(db, lista.shareToken, { userId: euge.id })
  if (propia?.role !== 'owner') throw new Error('esperaba la vista del dueño')
  expect(propia.items.find((i) => i.id === luna.id)).toMatchObject({ tipo: 'aporte', aporteAlias: ALIAS, aporteMeta: 300000 })
  expect(Object.keys(propia.items[0])).not.toContain('claims')
  expect(Object.keys(propia.items[0])).not.toContain('juntado')
  // sin decir quién es se ve el alias (lo ve cualquiera con el link) y nada de los aportes
  const anonima = await getItemForViewer(db, lista.shareToken, luna.id, {})
  if (anonima?.role !== 'anonimo') throw new Error('esperaba la vista sin identificarse')
  expect(anonima.item).toMatchObject({ aporteAlias: ALIAS, aporteMeta: 300000 })
  expect(Object.keys(anonima.item)).not.toContain('claims')
})

test('"Solo con cuenta se ve quién reservó": un invitado sin cuenta ve su aporte y nada de los demás (ni cuántos); con la protección apagada ve los nombres, nunca el progreso', async () => {
  const { db, euge, rodri, caro, lista, luna } = await armar()
  await aportar(db, luna.id, { userId: rodri.id }, 20000)
  await aportar(db, luna.id, { userId: caro.id }, 50000)
  // la "Tía" (que puede ser la dueña en una ventana privada): se anota y aporta
  const tia = await createGuest(db, 'Tía Marta')
  expect(await aportar(db, luna.id, { guestId: tia.id }, 5000)).toMatchObject({ ok: true })

  const conProteccion = await comoRegalador(db, lista.shareToken, { guestId: tia.id })
  expect(conProteccion.sinNombres).toBe(true)
  const suVista = conProteccion.items.find((i) => i.id === luna.id)!
  // solo el suyo: de Rodri y de Caro no le llega ni que existen
  expect(suVista.claims).toEqual([expect.objectContaining({ esMia: true, monto: 5000 })])
  expect(suVista.juntado).toBeNull()
  expect(JSON.stringify(conProteccion)).not.toMatch(/Rodri|Caro|20000|50000|70000|75000/)
  const detalle = await getItemForViewer(db, lista.shareToken, luna.id, { guestId: tia.id })
  if (detalle?.role !== 'giver') throw new Error('esperaba la vista de quien regala')
  expect(detalle.item.claims.length).toBe(1)
  expect(detalle.item.juntado).toBeNull()
  // otro invitado que no aportó: nada
  const primo = await createGuest(db, 'Primo')
  await reserveItem(db, (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Mate' }))!.id, { guestId: primo.id })
  expect((await comoRegalador(db, lista.shareToken, { guestId: primo.id })).items.find((i) => i.id === luna.id)!.claims).toEqual([])

  // con la protección apagada (una lista de antes, o la apagó ella): ve los nombres, como en el resto de la lista…
  await guardarNombresSoloConCuenta(db, lista.id, euge.id, false)
  const sinProteccion = (await comoRegalador(db, lista.shareToken, { guestId: primo.id })).items.find((i) => i.id === luna.id)!
  expect(sinProteccion.claims.map((c) => c.claimerNombre).sort()).toEqual(['Caro', 'Rodri', 'Tía Marta'])
  // …pero cuánto puso cada uno no, y el progreso tampoco: eso es solo con cuenta
  expect(sinProteccion.claims.every((c) => c.monto === null)).toBe(true)
  expect(sinProteccion.juntado).toBeNull()

  // con su cuenta: los nombres y el progreso aproximado (75.000 anotados)
  const sofi = await usuario(db, 'Sofía')
  const conCuenta = (await comoRegalador(db, lista.shareToken, { userId: sofi.id })).items.find((i) => i.id === luna.id)!
  expect(conCuenta.claims.map((c) => c.claimerNombre).sort()).toEqual(['Caro', 'Rodri', 'Tía Marta'])
  expect(conCuenta.claims.every((c) => c.monto === null)).toBe(true)
  expect(conCuenta.juntado).toBe(75000)
})

test('el progreso es aproximado, solo si hay meta, de lo anotado para este evento, y sin lo que se deshizo', async () => {
  // redondeado para abajo a dos cifras: con el número exacto se sacaría cuánto puso el último
  expect([0, 99, 100, 5000, 12345, 123456, 99999, 1_234_567].map(juntadoAprox)).toEqual([0, 99, 100, 5000, 12000, 120000, 99000, 1_200_000])

  const { db, euge, rodri, caro, sofi, lista, luna } = await armar()
  const juntado = async () => (await comoRegalador(db, lista.shareToken, { userId: sofi.id })).items.find((i) => i.id === luna.id)!.juntado
  // sin aportes, cero (la pantalla no dibuja una barra vacía)
  expect(await juntado()).toBe(0)
  const a = await aportar(db, luna.id, { userId: rodri.id }, 23456)
  await aportar(db, luna.id, { userId: caro.id }, 100000)
  expect(await juntado()).toBe(120000)
  // el que no dijo cuánto no suma; el que se arrepintió, tampoco
  const tia = await createGuest(db, 'Tía Marta')
  await aportar(db, luna.id, { guestId: tia.id })
  if (a.ok) await deshacerAporte(db, a.claimId, { userId: rodri.id })
  expect(await juntado()).toBe(100000)
  // en el detalle, lo mismo
  const detalle = await getItemForViewer(db, lista.shareToken, luna.id, { userId: sofi.id })
  expect(detalle?.role === 'giver' && detalle.item.juntado).toBe(100000)
  // sin meta no hay progreso que mostrar
  await updateItem(db, luna.id, euge.id, { aporteMeta: null })
  expect(await juntado()).toBeNull()
})

test('lo del evento que ya pasó no le quita a nadie aportar para el que viene, ni suma al progreso', async () => {
  const { db, euge, rodri, sofi, lista, luna } = await armar()
  // Euge cumplió ayer; Rodri había aportado para ese cumple, hace diez días
  const ayer = new Date(HOY.getTime() - DIA)
  await guardarCumple(db, euge.id, ayer.getUTCDate(), ayer.getUTCMonth() + 1)
  const hace10 = new Date(AHORA.getTime() - 10 * DIA)
  const [viejo] = await db.insert(claims).values({ itemId: luna.id, claimerUserId: rodri.id, estado: 'comprado', aporteMonto: 40000, createdAt: hace10, updatedAt: hace10 }).returning()
  // para el cumple que viene, la lista arranca sin aportes: ni para él ni para los demás
  const deRodri = (await comoRegalador(db, lista.shareToken, { userId: rodri.id })).items.find((i) => i.id === luna.id)!
  expect(deRodri.claims).toEqual([])
  expect((await comoRegalador(db, lista.shareToken, { userId: sofi.id })).items.find((i) => i.id === luna.id)!.juntado).toBe(0)
  // y Rodri aporta de nuevo: es otro aporte, el del año pasado queda en su historial
  const nuevo = await aportar(db, luna.id, { userId: rodri.id }, 10000)
  expect(nuevo.ok && nuevo.claimId).not.toBe(viejo.id)
  // el del cumple pasado no se deshace: ya se regaló
  expect(await deshacerAporte(db, viejo.id, { userId: rodri.id })).toBe(false)
  const mios = await misRegalos(db, rodri.id)
  expect(mios.historial.map((r) => r.aporte)).toEqual([{ monto: 40000 }])
  expect(mios.comprados.map((r) => r.aporte)).toEqual([{ monto: 10000 }])
})

// ---------- los cruces ----------

test('filtros: un aporte está siempre "disponible" y no tiene un precio para comparar (la pantalla lo pone arriba de todo, fuera del "Hasta $X")', async () => {
  const { db, euge, rodri, lista, luna } = await armar()
  await aportar(db, luna.id, { userId: rodri.id }, 300000)
  for (const precio of ['$10.000', '$20.000', '$30.000', '$40.000', '$50.000', '$60.000']) await createItem(db, euge.id, { tipo: 'exacto', titulo: `De ${precio}`, precio })
  const v = await comoRegalador(db, lista.shareToken, { userId: rodri.id })
  const aporte = v.items.find((i) => i.id === luna.id)!
  // aunque ya se juntó toda la meta, sigue disponible
  expect(aporte.disponible).toBe(true)
  // la meta no es un precio: no cuenta para armar los topes, y con un tope elegido no queda "dentro" ni afuera
  expect(aporte).toMatchObject({ precio: null, precioMin: null, precioMoneda: null })
  const presupuesto = presupuestoDeLista(v.items)!
  expect(presupuesto.topes.every((t) => t < 300000)).toBe(true)
  const { dentro, sinPrecio } = partirPorTope(v.items.filter((i) => !esAporte(i)), presupuesto.topes[0], 'ARS')
  expect([...dentro, ...sinPrecio].some((i) => i.id === luna.id)).toBe(false)
})

test('Tus regalos: el aporte va con lo comprado, con lo que anotó, y no se le ofrece contárselo al dueño', async () => {
  const { db, euge, rodri, luna, termo } = await armar()
  await aportar(db, luna.id, { userId: rodri.id }, 20000)
  await reserveItem(db, termo.id, { userId: rodri.id })
  let mios = await misRegalos(db, rodri.id)
  expect(mios.porComprar.map((r) => r.titulo)).toEqual(['Termo'])
  expect(mios.comprados).toMatchObject([{ titulo: 'Luna de miel', tipo: 'suelto', estado: 'comprado', aporte: { monto: 20000 }, puedeRevelar: false, venceEnDias: null, para: 'Euge' }])
  // lo reservado no lleva la marca de aporte
  expect(mios.porComprar[0].aporte).toBeUndefined()
  // pasó el cumple: una compra se puede contar; un aporte, no (la transferencia ya dice de quién fue)
  const ayer = new Date(HOY.getTime() - DIA)
  await guardarCumple(db, euge.id, ayer.getUTCDate(), ayer.getUTCMonth() + 1)
  const hace5 = new Date(AHORA.getTime() - 5 * DIA)
  await db.update(claims).set({ createdAt: hace5, updatedAt: hace5 }).where(eq(claims.claimerUserId, rodri.id))
  await db.update(claims).set({ estado: 'comprado' }).where(and(eq(claims.claimerUserId, rodri.id), eq(claims.itemId, termo.id)))
  mios = await misRegalos(db, rodri.id)
  const [delAporte] = await claimsDe(db, luna.id)
  expect(mios.historial.find((r) => r.titulo === 'Termo')?.puedeRevelar).toBe(true)
  expect(mios.historial.find((r) => r.titulo === 'Luna de miel')).toMatchObject({ puedeRevelar: false, aporte: { monto: 20000 } })
  expect(await revelarRegalo(db, rodri.id, 'suelto', delAporte.id)).toBe(false)
  expect((await claimsDe(db, luna.id))[0].reveladoAt).toBeNull()
})

test('después del cumple: un aporte no se tilda en "¿Qué te regalaron?", y el cron no pregunta por él ni invita a contarlo', async () => {
  const { db, euge, rodri, luna, termo } = await armar()
  const hace5 = new Date(AHORA.getTime() - 5 * DIA)
  await aportar(db, luna.id, { userId: rodri.id }, 20000)
  await db.update(claims).set({ createdAt: hace5, updatedAt: hace5 }).where(eq(claims.itemId, luna.id))
  const ayer = new Date(HOY.getTime() - DIA)
  await guardarCumple(db, euge.id, ayer.getUTCDate(), ayer.getUTCMonth() + 1)
  // tildar el aporte (un formulario armado a mano) no lo saca de la lista; el Termo, sí
  expect(await marcarRecibidos(db, euge.id, [luna.id, termo.id])).toBe(1)
  expect((await fila(db, luna.id)).estadoDueno).toBe('activo')
  expect((await fila(db, termo.id)).estadoDueno).toBe('me_lo_regalaron')
  expect((await claimsDe(db, luna.id))[0]).toMatchObject({ estado: 'comprado', aporteMonto: 20000 })
  // quedó solo el aporte: "¿Qué te regalaron?" no tiene qué preguntar, y a Rodri no se le dice "¿Le contás que fue tuyo?"
  await db.update(lists).set({ postEventoHecho: null }).where(eq(lists.ownerId, euge.id))
  const r = await mandarRecordatorios(db, AHORA, async () => 201)
  expect({ queTeRegalaron: r.queTeRegalaron, contale: r.contale, loCompraste: r.loCompraste, venceManana: r.venceManana, fallaron: r.fallaron })
    .toEqual({ queTeRegalaron: 0, contale: 0, loCompraste: 0, venceManana: 0, fallaron: [] })
})

test('recordatorios antes del cumple: nadie pregunta "¿ya lo compraste?" por un aporte, y al que ya aportó no se le dice que todavía no eligió', async () => {
  const { db, euge, rodri, caro, lista, luna } = await armar()
  await aportar(db, luna.id, { userId: rodri.id })
  for (const u of [rodri, caro]) await seguir(db, u.id, lista.id)
  // faltan 3 días: las reservas sin comprar se preguntan; un aporte no es una reserva
  const en3 = new Date(HOY.getTime() + 3 * DIA)
  await guardarCumple(db, euge.id, en3.getUTCDate(), en3.getUTCMonth() + 1)
  expect((await mandarRecordatorios(db, AHORA, async () => 201)).loCompraste).toBe(0)
  // faltan 7: a Caro, que no hizo nada, se le recuerda (el aporte siempre está para elegir); a Rodri, que ya aportó, no
  const en7 = new Date(HOY.getTime() + 7 * DIA)
  await guardarCumple(db, euge.id, en7.getUTCDate(), en7.getUTCMonth() + 1)
  expect((await mandarRecordatorios(db, AHORA, async () => 201)).cumpleCerca).toBe(1)
  const deCaro = await db.select().from(avisos).where(eq(avisos.userId, caro.id))
  expect(deCaro.map((a) => a.titulo)).toEqual([expect.stringContaining('El cumple de Euge es en 7 días')])
  expect(await db.select().from(avisos).where(eq(avisos.userId, rodri.id))).toEqual([])
  expect(await db.select().from(avisos).where(eq(avisos.userId, euge.id))).toEqual([])
})

test('sacar un aporte de la lista y volver a ponerlo: a los que ya aportaron no les llega ningún aviso (la plata ya está transferida)', async () => {
  const { db, euge, rodri, lista, luna, termo } = await armar()
  await aportar(db, luna.id, { userId: rodri.id }, 20000)
  await reserveItem(db, termo.id, { userId: rodri.id })
  expect(await archiveItem(db, luna.id, euge.id, 'no_lo_quiero')).toBe(true)
  expect(await getUnreadNotifications(db, { userId: rodri.id })).toEqual([])
  // ya no está para los que regalan; el aporte de Rodri sigue anotado, en su historial
  expect((await comoRegalador(db, lista.shareToken, { userId: rodri.id })).items.map((i) => i.titulo)).toEqual(['Termo'])
  expect((await claimsDe(db, luna.id))[0]).toMatchObject({ estado: 'comprado', aporteMonto: 20000 })
  expect(await restoreItem(db, luna.id, euge.id)).toBe(true)
  expect(await getUnreadNotifications(db, { userId: rodri.id })).toEqual([])
  expect((await fila(db, luna.id)).estadoDueno).toBe('activo')
  // con un deseo común, en cambio, sí se entera (lo de siempre no cambió)
  await archiveItem(db, termo.id, euge.id, 'no_lo_quiero')
  expect((await getUnreadNotifications(db, { userId: rodri.id })).map((n) => n.tipo)).toEqual(['item_baja'])
})

test('lo nuevo de tus amigos, "Me lo robo" y el historial de la lista: un aporte no va en ninguno', async () => {
  const { db, euge, rodri, caro, lista, luna, termo } = await armar()
  // Rodri y Euge son amigos (por el link de ella)
  await db.update(users).set({ amigoToken: 'tok-amiga' }).where(eq(users.id, euge.id))
  expect(await aceptarLinkDeAmigo(db, rodri.id, 'tok-amiga', async () => 201)).toMatchObject({ ok: true })
  // en lo nuevo de Euge aparece el Termo; la luna de miel, no
  expect((await novedadesDeAmigos(db, rodri.id)).novedades.map((n) => n.item.titulo)).toEqual(['Termo'])
  // robarse un aporte copiaría el alias de Euge a la lista de Rodri: no se puede
  expect(await robarDeseo(db, rodri.id, lista.shareToken, luna.id)).toEqual({ ok: false, reason: 'no_existe' })
  expect(await robarDeseo(db, rodri.id, lista.shareToken, termo.id)).toMatchObject({ ok: true })
  expect((await getOwnList(db, rodri.id))!.items.map((i) => ({ titulo: i.titulo, alias: i.aporteAlias }))).toEqual([{ titulo: 'Termo', alias: null }])

  // "Quién se ocupó": una compra figura; un aporte, no ("Lo compró Rodri" no es lo que pasó)
  await aportar(db, luna.id, { userId: rodri.id }, 20000)
  const r = await reserveItem(db, termo.id, { userId: caro.id })
  if (r.ok) await markBought(db, r.claimId, { userId: caro.id })
  const historial = await historialDeLista(db, lista.id, { userId: caro.id })
  expect(historial?.entradas.map((e) => e.titulo)).toEqual(['Termo'])
  expect(historial?.ranking).toEqual([{ nombre: 'Caro', cantidad: 1, esYo: true }])
})

test('la cuenta: la descarga trae sus aportes y el alias de sus deseos; al borrarla, sus aportes se van enteros y los de los demás quedan', async () => {
  const { db, euge, rodri, caro, luna } = await armar()
  await aportar(db, luna.id, { userId: rodri.id }, 20000)
  await aportar(db, luna.id, { userId: caro.id }, 50000)
  // Rodri, además, pide un aporte en su lista, al que aportó Caro
  const viaje = (await createItem(db, rodri.id, { tipo: 'aporte', titulo: 'Mi viaje', aporteAlias: 'rodri.viaja', aporteMeta: 90000 }))!
  await aportar(db, viaje.id, { userId: caro.id }, 9000)

  const datos = (await exportarMisDatos(db, rodri.id))!
  // de su lista: el aporte con su alias y su meta, y nada de quién aportó
  expect(datos.tuLista?.deseos).toMatchObject([{ titulo: 'Mi viaje', tipo: 'aporte', aliasParaAportar: 'rodri.viaja', metaDelAporte: 90000 }])
  expect(JSON.stringify(datos.tuLista)).not.toMatch(/Caro|9000"|cuantoAportaste/)
  // de lo que regala: su aporte, con lo que anotó
  expect(datos.loQueRegalas.reservasYCompras).toMatchObject([{ deseo: 'Luna de miel', para: 'Euge', estado: 'comprado', esUnAporteEnPlata: true, cuantoAportaste: 20000 }])
  // un deseo común no lleva esos campos
  const deEuge = (await exportarMisDatos(db, euge.id))!
  expect(Object.keys(deEuge.tuLista!.deseos.find((d) => d.titulo === 'Termo')!)).not.toContain('aliasParaAportar')

  expect(await borrarCuenta(db, rodri.id)).toBe(true)
  // su aporte a Euge se fue (no queda a nombre de "Cuenta eliminada": un aporte no ocupa nada), el de Caro sigue
  expect((await claimsDe(db, luna.id)).map((c) => ({ de: c.claimerUserId, monto: c.aporteMonto }))).toEqual([{ de: caro.id, monto: 50000 }])
  // y su lista, con el aporte que pedía y lo que le habían aportado, también
  expect(await db.select().from(items).where(eq(items.id, viaje.id))).toEqual([])
  expect(await claimsDe(db, viaje.id)).toEqual([])
})

test('compartir un aporte: el texto dice que se aporta, y la vista previa no dice ni cuánto ni quién', async () => {
  const { db, rodri, lista, luna, termo } = await armar()
  await aportar(db, luna.id, { userId: rodri.id }, 20000)
  expect(await itemParaCompartir(db, lista.shareToken, luna.id)).toEqual({
    titulo: 'Luna de miel', fotoUrl: null, precio: null, prioridad: 'gustaria', para: 'Euge', grupoNombre: null, aporte: true,
  })
  expect((await itemParaCompartir(db, lista.shareToken, termo.id))?.aporte).toBe(false)
  expect(await listaParaCompartir(db, lista.shareToken)).toMatchObject({ conAportes: true, cantidad: 2 })
  expect(textoRegalador({ titulo: 'Luna de miel', precio: null, para: 'Euge Mateus', aporte: true }, 'https://x/l/t')).toBe('Para Euge se puede aportar para "Luna de miel" 🎁\nhttps://x/l/t')
  expect(textoDueno({ titulo: 'Luna de miel', tipo: 'aporte' }, 'https://x/l/t')).toBe('Si querés aportar para "Luna de miel", es por acá 🎁\nhttps://x/l/t')
  expect(textoDueno({ titulo: 'Termo', tipo: 'exacto' }, 'https://x/l/t')).toBe('Esto es algo que me encantaría: Termo 🎁\nhttps://x/l/t')
})
