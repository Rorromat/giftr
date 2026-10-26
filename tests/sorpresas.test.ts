import { expect, test } from 'vitest'
import { createECDH, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { createItem } from '@/lib/items'
import { pedirAmistad } from '@/lib/amigos'
import { guardarSuscripcion, type Aviso, type Enviar } from '@/lib/codazos'
import { cancelarRegalo, comprarRegalo, iniciarRegaloGrupal, misCuentas, regalosDeItem, sumarseARegalo } from '@/lib/regalos'
import { amigosParaDividir, invitacionesPendientes, responderInvitacion } from '@/lib/invitaciones'
import { crearSorpresa, duenoDelLink, esSorpresa, sorpresaParaViewer, sorpresasPara } from '@/lib/sorpresas'
import { getItemForViewer, getListForViewer, getOwnList } from '@/lib/lists'
import { misRegalos } from '@/lib/mis-regalos'
import { guardarCumple, misEventos } from '@/lib/events'
import { novedadesDeAmigos } from '@/lib/novedades'
import { itemParaCompartir, listaParaCompartir } from '@/lib/compartir'
import { perfilPublico } from '@/lib/perfil'
import { accesoALista, abrirListaAInvitado } from '@/lib/acceso'
import { addComment } from '@/lib/comments'
import { reserveItem } from '@/lib/claims'
import { createGuest } from '@/lib/guest'
import { miGente } from '@/lib/gente'
import { mandarCodazo } from '@/lib/codazos'

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}
const amigos = async (db: Db, a: string, b: string) => { await pedirAmistad(db, a, b); await pedirAmistad(db, b, a) }
const ecdh = createECDH('prime256v1')
const CLAVES = { p256dh: ecdh.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') }
function pushFalso() {
  const enviados: { para: string; aviso: Aviso }[] = []
  const enviar: Enviar = async (s, aviso) => { enviados.push({ para: s.endpoint.split('/').at(-1)!, aviso }); return 201 }
  return { enviados, enviar }
}
const TOCADISCOS = { tipo: 'exacto' as const, titulo: 'Tocadiscos vintage', precio: '$120.000', notas: 'El de madera' }

/** Euge le arma a Rodri una sorpresa con Sofi y Juan. Los cuatro son amigos de Euge; Ana no es amiga de nadie. */
async function setup() {
  const db = await createTestDb()
  const [euge, sofi, juan, rodri, ana] = await Promise.all(['Euge', 'Sofi', 'Juan', 'Rodri', 'Ana'].map((n) => usuario(db, n)))
  for (const o of [sofi, juan, rodri]) await amigos(db, euge.id, o.id)
  await amigos(db, sofi.id, rodri.id)
  await guardarCumple(db, rodri.id, 20, 12)
  // Rodri tiene su lista con algo (para ver que la sorpresa no se mezcla)
  await createItem(db, rodri.id, { tipo: 'exacto', titulo: 'Mate imperial' })
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, rodri.id))
  for (const u of [sofi, juan, rodri]) {
    await guardarSuscripcion(db, u.id, { endpoint: `https://fcm.googleapis.com/fcm/send/${u.id}`, keys: CLAVES })
  }
  return { db, euge, sofi, juan, rodri, ana, tokenRodri: lista.shareToken }
}

async function sorpresaDeEuge(s: Awaited<ReturnType<typeof setup>>, enviar = pushFalso().enviar) {
  const r = await crearSorpresa(s.db, s.euge.id, { para: { amigo: s.rodri.id }, deseo: TOCADISCOS, invitar: [s.sofi.id, s.juan.id, s.rodri.id] }, enviar)
  if (!r.ok) throw new Error('no se armó')
  const [l] = await s.db.select().from(lists).where(eq(lists.shareToken, r.token))
  const [item] = await s.db.select().from(items).where(eq(items.listId, l.id))
  return { token: r.token, listId: l.id, itemId: item.id }
}

test('armar una sorpresa: el regalo grupal con el que la armó de encargado, y la propuesta a los amigos (nunca al que la recibe)', async () => {
  const s = await setup()
  const { enviados, enviar } = pushFalso()
  const { token, itemId } = await sorpresaDeEuge(s, enviar)
  expect(enviados.map((e) => e.para).sort()).toEqual([s.juan.id, s.sofi.id].sort())
  expect(enviados[0].aviso).toEqual({
    title: '🤫 Euge te propone una sorpresa',
    body: '"Tocadiscos vintage" para Rodri: no está en su lista y no se entera. En partes iguales, ¿te sumás?',
    url: '/inicio#invitaciones',
  })
  const [inv] = await invitacionesPendientes(s.db, s.sofi.id)
  expect(inv).toMatchObject({ titulo: 'Tocadiscos vintage', para: 'Rodri', sorpresa: true, href: `/sorpresa/${token}`, somos: 1 })
  expect(await responderInvitacion(s.db, s.sofi.id, inv.id, true, pushFalso().enviar)).toMatchObject({ ok: true, href: `/sorpresa/${token}` })

  const vista = await sorpresaParaViewer(s.db, token, { userId: s.sofi.id })
  if (vista?.estado !== 'abierta') throw new Error('esperaba la sorpresa')
  expect(vista).toMatchObject({
    creador: 'Euge', item: { id: itemId, titulo: 'Tocadiscos vintage', precio: '$120.000', notas: 'El de madera', cantidad: 1 },
    para: { userId: s.rodri.id, nombre: 'Rodri', token: s.tokenRodri },
  })
  expect(vista.fecha?.fecha.getUTCMonth()).toBe(11)
  expect(vista.regalos).toHaveLength(1)
  expect(vista.regalos[0]).toMatchObject({ estado: 'abierto', encargado: { nombre: 'Euge' }, soyParte: true })
  expect(vista.regalos[0].miembros.map((m) => m.nombre)).toEqual(['Euge', 'Sofi'])
  // a sus amigos, para invitar después: nunca Rodri
  expect((await amigosParaDividir(s.db, s.euge.id, itemId)).map((p) => p.nombre)).toEqual(['Juan', 'Sofi'])
})

test('EL TEST DE ORO de la sorpresa: el que la recibe no la ve por ningún lado, ni se puede sumar', async () => {
  const s = await setup()
  const { token, listId, itemId } = await sorpresaDeEuge(s)
  const [inv] = await invitacionesPendientes(s.db, s.sofi.id)
  await responderInvitacion(s.db, s.sofi.id, inv.id, true, pushFalso().enviar)
  const rodri = { userId: s.rodri.id }

  // nada de lo que ve Rodri la menciona
  const suyo = JSON.stringify([
    await getOwnList(s.db, s.rodri.id), await misRegalos(s.db, s.rodri.id), await misCuentas(s.db, s.rodri.id),
    await invitacionesPendientes(s.db, s.rodri.id), await misEventos(s.db, s.rodri.id), await novedadesDeAmigos(s.db, s.rodri.id),
    await miGente(s.db, s.rodri.id), await sorpresasPara(s.db, s.rodri.id, s.rodri.id),
  ])
  expect(suyo).not.toContain('Tocadiscos')
  expect(suyo).not.toContain(token)
  // ni por el link: para él no existe
  expect(await sorpresaParaViewer(s.db, token, rodri)).toBeNull()
  expect(await getListForViewer(s.db, token, rodri)).toBeNull()
  expect(await getItemForViewer(s.db, token, itemId, rodri)).toBeNull()
  expect(await regalosDeItem(s.db, itemId, rodri)).toEqual([])
  // para todo lo de la capa oculta es como el dueño: no se suma, no arma otro, no comenta, no reserva
  expect(await accesoALista(s.db, listId, rodri)).toBe('dueno')
  expect(await sumarseARegalo(s.db, vistaGift(await sorpresaParaViewer(s.db, token, { userId: s.sofi.id })), s.rodri.id, itemId)).toBe(false)
  expect(await iniciarRegaloGrupal(s.db, itemId, s.rodri.id)).toEqual({ ok: false, reason: 'propio' })
  expect(await addComment(s.db, itemId, rodri, '¿qué es esto?')).toBe(false)
  expect((await reserveItem(s.db, itemId, rodri)).ok).toBe(false)
  // y no puede ser para uno mismo
  expect(await crearSorpresa(s.db, s.rodri.id, { para: { amigo: s.rodri.id }, deseo: TOCADISCOS, invitar: [] })).toEqual({ ok: false, reason: 'para' })
})

function vistaGift(v: Awaited<ReturnType<typeof sorpresaParaViewer>>) {
  if (v?.estado !== 'abierta') throw new Error('esperaba la sorpresa')
  return v.regalos[0].id
}

test('sin sesión no se ve qué es: ni el link, ni la vista previa, ni como invitado', async () => {
  const s = await setup()
  const { token, listId, itemId } = await sorpresaDeEuge(s)
  expect(await sorpresaParaViewer(s.db, token, {})).toEqual({ estado: 'sin_sesion' })
  const abuela = await createGuest(s.db, 'Abuela')
  expect(await sorpresaParaViewer(s.db, token, { guestId: abuela.id })).toEqual({ estado: 'sin_sesion' })
  // decir que no es suya no se la abre
  await abrirListaAInvitado(s.db, abuela.id, listId)
  expect(await accesoALista(s.db, listId, { guestId: abuela.id })).toBe('confirmar')
  expect(await addComment(s.db, itemId, { guestId: abuela.id }, 'hola')).toBe(false)
  // las páginas de /l/ no la muestran (la mandan a la suya), y la vista previa de WhatsApp no dice qué es
  expect(await esSorpresa(s.db, token)).toBe(true)
  expect(await esSorpresa(s.db, s.tokenRodri)).toBe(false)
  for (const viewer of [{}, { guestId: abuela.id }, { userId: s.sofi.id }]) {
    expect(await getListForViewer(s.db, token, viewer)).toBeNull()
    expect(await getItemForViewer(s.db, token, itemId, viewer)).toBeNull()
  }
  expect(await itemParaCompartir(s.db, token, itemId)).toBeNull()
  expect(await listaParaCompartir(s.db, token)).toBeNull()
  expect(await perfilPublico(s.db, token)).toBeNull()
  // ni un codazo a nadie
  expect(await mandarCodazo(s.db, token, { userId: s.sofi.id }, 'Sofi', pushFalso().enviar)).toEqual({ ok: false, reason: 'no_existe' })
})

test('en la lista de Rodri: la ven los que le regalan (con quién y si están), hasta que pasa el cumple', async () => {
  const s = await setup()
  const { token } = await sorpresaDeEuge(s)
  const paraAna = await sorpresasPara(s.db, s.rodri.id, s.ana.id)
  expect(paraAna).toEqual([{
    token, titulo: 'Tocadiscos vintage', foto: null, precio: '$120.000', encargado: 'Euge', personas: ['Euge'], soyParte: false, comprada: false,
  }])
  expect((await sorpresasPara(s.db, s.rodri.id, s.euge.id))[0].soyParte).toBe(true)
  // Ana (no es amiga de Euge) se suma desde ahí
  const vista = await sorpresaParaViewer(s.db, token, { userId: s.ana.id })
  if (vista?.estado !== 'abierta') throw new Error('esperaba la sorpresa')
  // no sigue la lista de Rodri: la sorpresa no le pasa su link
  expect(vista.para.token).toBeNull()
  expect(await sumarseARegalo(s.db, vista.regalos[0].id, s.ana.id, vista.item.id)).toBe(true)
  expect((await sorpresasPara(s.db, s.rodri.id, s.ana.id))[0]).toMatchObject({ personas: ['Euge', 'Ana'], soyParte: true })

  // comprada: sigue (para este cumple) y les queda la cuenta, para Rodri
  expect(await comprarRegalo(s.db, vista.regalos[0].id, s.euge.id, { total: 120000 })).toEqual({ ok: true })
  expect((await sorpresasPara(s.db, s.rodri.id, s.sofi.id))[0].comprada).toBe(true)
  const cuentas = await misCuentas(s.db, s.ana.id)
  expect(cuentas.personas[0].lineas[0]).toMatchObject({ itemTitulo: 'Tocadiscos vintage', para: 'Rodri', href: `/sorpresa/${token}`, monto: 60000 })
  const mios = await misRegalos(s.db, s.ana.id)
  expect(mios.comprados[0]).toMatchObject({ titulo: 'Tocadiscos vintage', para: 'Rodri', href: `/sorpresa/${token}` })
})

test('en Próximos: el cumple de Rodri dice que estás en una sorpresa', async () => {
  const s = await setup()
  await sorpresaDeEuge(s)
  const cumple = (await misEventos(s.db, s.euge.id)).find((e) => e.titulo === 'Cumple de Rodri')
  expect(cumple).toMatchObject({ misReservas: 1, misGrupales: 0, misSorpresas: 1 })
  // Sofi (amiga de Rodri, no se sumó) no
  expect((await misEventos(s.db, s.sofi.id)).find((e) => e.titulo === 'Cumple de Rodri')).toMatchObject({ misReservas: 0, misSorpresas: 0 })
})

test('desde la lista de alguien (con su link), aunque no sea mi amigo; un amigo que no es, no', async () => {
  const s = await setup()
  expect(await duenoDelLink(s.db, s.tokenRodri, s.ana.id)).toMatchObject({ id: s.rodri.id, nombre: 'Rodri' })
  expect(await duenoDelLink(s.db, s.tokenRodri, s.rodri.id)).toBeNull()
  const r = await crearSorpresa(s.db, s.ana.id, { para: { token: s.tokenRodri }, deseo: TOCADISCOS, invitar: [s.euge.id] })
  expect(r.ok).toBe(true)
  // Euge no es amiga de Ana: no la invita
  expect(await invitacionesPendientes(s.db, s.euge.id)).toEqual([])
  expect(await crearSorpresa(s.db, s.ana.id, { para: { amigo: s.rodri.id }, deseo: TOCADISCOS, invitar: [] })).toEqual({ ok: false, reason: 'para' })
  expect(await crearSorpresa(s.db, s.rodri.id, { para: { token: s.tokenRodri }, deseo: TOCADISCOS, invitar: [] })).toEqual({ ok: false, reason: 'para' })
  expect(await crearSorpresa(s.db, s.ana.id, { para: { token: 'no-existe' }, deseo: TOCADISCOS, invitar: [] })).toEqual({ ok: false, reason: 'para' })
  expect(await crearSorpresa(s.db, s.ana.id, { para: { token: s.tokenRodri }, deseo: { tipo: 'exacto', titulo: '   ' }, invitar: [] }))
    .toEqual({ ok: false, reason: 'deseo' })
})

test('un doble toque no arma dos', async () => {
  const s = await setup()
  const datos = { para: { amigo: s.rodri.id }, deseo: TOCADISCOS, invitar: [s.sofi.id] }
  const a = await crearSorpresa(s.db, s.euge.id, datos, pushFalso().enviar)
  const b = await crearSorpresa(s.db, s.euge.id, datos, pushFalso().enviar)
  expect(b).toEqual(a)
  expect(await sorpresasPara(s.db, s.rodri.id, s.ana.id)).toHaveLength(1)
  expect(await invitacionesPendientes(s.db, s.sofi.id)).toHaveLength(1)
})

test('para alguien sin GiftR: con su nombre y su fecha, en Próximos y Mis regalos de los que están', async () => {
  const s = await setup()
  const fecha = new Date(Date.now() + 20 * 86400_000).toISOString().slice(0, 10)
  const r = await crearSorpresa(s.db, s.euge.id, {
    para: { nombre: '  la abuela Marta ', fecha }, deseo: { tipo: 'exacto', titulo: 'Bata de polar' }, invitar: [s.sofi.id],
  }, pushFalso().enviar)
  if (!r.ok) throw new Error('no se armó')
  const [inv] = await invitacionesPendientes(s.db, s.sofi.id)
  expect(inv).toMatchObject({ para: 'la abuela Marta', sorpresa: true, href: `/sorpresa/${r.token}` })
  await responderInvitacion(s.db, s.sofi.id, inv.id, true, pushFalso().enviar)
  const vista = await sorpresaParaViewer(s.db, r.token, { userId: s.sofi.id })
  expect(vista).toMatchObject({ estado: 'abierta', para: { userId: null, nombre: 'la abuela Marta', token: null } })
  const evento = (await misEventos(s.db, s.sofi.id)).find((e) => e.titulo === 'Sorpresa para la abuela Marta')
  expect(evento).toMatchObject({ href: `/sorpresa/${r.token}`, contexto: 'No usa GiftR', misReservas: 1, misGrupales: 0, misSorpresas: 1 })
  expect(evento!.fecha.toISOString().slice(0, 10)).toBe(fecha)
  expect((await misRegalos(s.db, s.sofi.id)).porComprar[0]).toMatchObject({ titulo: 'Bata de polar', para: 'la abuela Marta' })
  // sin nombre no hay para quién; una fecha que ya pasó no se guarda
  expect(await crearSorpresa(s.db, s.euge.id, { para: { nombre: ' ' }, deseo: TOCADISCOS, invitar: [] })).toEqual({ ok: false, reason: 'para' })
  const vieja = await crearSorpresa(s.db, s.euge.id, { para: { nombre: 'Tío', fecha: '2020-01-01' }, deseo: TOCADISCOS, invitar: [] })
  if (!vieja.ok) throw new Error('no se armó')
  const [l] = await s.db.select().from(lists).where(eq(lists.shareToken, vieja.token))
  expect(l.eventoFecha).toBeNull()
})

test('si el que la armó cancela el regalo, la sorpresa se va', async () => {
  const s = await setup()
  const { token } = await sorpresaDeEuge(s)
  const giftId = vistaGift(await sorpresaParaViewer(s.db, token, { userId: s.euge.id }))
  expect(await cancelarRegalo(s.db, giftId, s.euge.id)).toBe(true)
  expect(await sorpresaParaViewer(s.db, token, { userId: s.sofi.id })).toEqual({
    estado: 'cancelada', para: expect.objectContaining({ nombre: 'Rodri' }),
  })
  expect(await sorpresasPara(s.db, s.rodri.id, s.ana.id)).toEqual([])
  expect(await invitacionesPendientes(s.db, s.sofi.id)).toEqual([])
  expect((await misEventos(s.db, s.euge.id)).find((e) => e.titulo === 'Cumple de Rodri')).toMatchObject({ misSorpresas: 0 })
})
