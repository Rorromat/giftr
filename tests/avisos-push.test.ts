import { beforeEach, expect, test, vi } from 'vitest'
import { createECDH, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver, seguir } from './helpers'
import { avisos, items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { reserveItem } from '@/lib/claims'
import { abrirListaAInvitado } from '@/lib/acceso'
import { bandeja } from '@/lib/bandeja'
import { guardarSuscripcion, type Aviso, type Enviar } from '@/lib/codazos'
import { addComment } from '@/lib/comments'
import { createGuest } from '@/lib/guest'
import { archiveItem, createItem, updateItem } from '@/lib/items'
import { cambiarLinkParaRegalar } from '@/lib/lists'
import { dejarAviso, getUnreadNotifications, markNotificationsRead } from '@/lib/notifications'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { upsertUserFromGoogle } from '@/lib/users'

// Lo que antes solo dejaba un cartel y ahora también suena en el celular: los avisos sobre un deseo (lo editaron, lo
// dieron de baja) y los comentarios de su hilo.
// El push de un aviso que se deja adentro de una transacción sale después de contestar (after de Next), con la base de
// afuera y por web-push: acá, lo que quedó para después se junta en h.despues, la base es la del test y web-push anota.
const h = vi.hoisted(() => ({
  db: null as unknown, despues: [] as (() => Promise<void>)[], enviados: [] as { para: string; aviso: { title: string; body: string; url: string } }[],
}))
vi.mock('next/server', () => ({ after: (tarea: () => Promise<void>) => { h.despues.push(tarea) } }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('web-push', () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: 'publica', privateKey: 'privada' }),
    sendNotification: async (s: { endpoint: string }, cuerpo: string) => {
      h.enviados.push({ para: s.endpoint.split('/').at(-1)!, aviso: JSON.parse(cuerpo) })
      return { statusCode: 201 }
    },
  },
}))
beforeEach(() => {
  h.despues.length = 0
  h.enviados.length = 0
})
/** La respuesta ya salió: corre lo que quedó para después. */
async function yaContesto() {
  for (const tarea of h.despues.splice(0)) await tarea()
}

const ecdh = createECDH('prime256v1')
const CLAVES = { p256dh: ecdh.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') }
const conAvisos = (db: Db, u: { id: string; nombre: string }) =>
  guardarSuscripcion(db, u.id, { endpoint: `https://fcm.googleapis.com/fcm/send/${u.nombre}`, keys: CLAVES })
function pushFalso() {
  const enviados: { para: string; aviso: Aviso }[] = []
  const enviar: Enviar = async (s, aviso) => { enviados.push({ para: s.endpoint.split('/').at(-1)!, aviso }); return 201 }
  return { enviados, enviar, de: (nombre: string) => enviados.filter((e) => e.para === nombre).map((e) => e.aviso) }
}

async function setup() {
  const db = await createTestDb()
  h.db = db
  const seed = await seedOwnerAndGiver(db)
  const termo = (await createItem(db, seed.owner.id, { tipo: 'exacto', titulo: 'Termo' }))!
  const mate = (await createItem(db, seed.owner.id, { tipo: 'exacto', titulo: 'Mate' }))!
  return { db, ...seed, termo, mate }
}

// ---------- los avisos sobre un deseo ----------

test('un aviso sobre un deseo le llega al celular a quien tiene cuenta: dice lo que su cartel, y no suma nada a la bandeja', async () => {
  const { db, owner, giver, termo } = await setup()
  for (const u of [owner, giver]) await conAvisos(db, u)
  await db.update(items).set({ cantidad: 3 }).where(eq(items.id, termo.id))
  await reserveItem(db, termo.id, { userId: giver.id })
  // la abuela, sin cuenta, no tiene dispositivo: le queda el cartel
  const abuela = await createGuest(db, 'Abuela')
  await reserveItem(db, termo.id, { guestId: abuela.id })

  await updateItem(db, termo.id, owner.id, { notas: 'el verde' })
  // el dueño que edita no espera al celular de nadie: sale cuando su respuesta ya salió
  expect(h.enviados).toEqual([])
  await yaContesto()
  expect(h.enviados).toEqual([{ para: 'Rodri', aviso: { title: '✏️ "Termo" fue editado por su dueño', body: 'Revisá los detalles.', url: `/l/tok-euge/item/${termo.id}` } }])
  expect(await getUnreadNotifications(db, { guestId: abuela.id })).toHaveLength(1)
  // en la bandeja está una sola vez, la de siempre: el push no deja otra fila
  expect((await bandeja(db, { userId: giver.id })).entradas.map((e) => e.titulo)).toEqual(['"Termo" fue editado por su dueño'])
  expect(await db.select().from(avisos)).toEqual([])

  // otra edición con el aviso sin leer: sube el mismo cartel, y el celular no vuelve a sonar
  await updateItem(db, termo.id, owner.id, { notas: 'el verde oscuro' })
  await yaContesto()
  expect(h.enviados).toHaveLength(1)
  // ya lo leyó: la edición siguiente es un aviso nuevo
  await markNotificationsRead(db, { userId: giver.id })
  await updateItem(db, termo.id, owner.id, { notas: 'el azul' })
  await yaContesto()
  expect(h.enviados.map((e) => e.para)).toEqual(['Rodri', 'Rodri'])
  // al dueño, nada; ni aunque por error le quedara uno sobre su propio deseo (le diría que alguien lo reservó)
  await dejarAviso(db, termo.id, 'item_editado', [{ userId: owner.id, guestId: null }])
  await yaContesto()
  expect(h.enviados.map((e) => e.para)).toEqual(['Rodri', 'Rodri'])
})

test('el que se deja adentro de una transacción (dar de baja un deseo) suena cuando la respuesta ya salió; si se deshace, no suena', async () => {
  const { db, owner, giver, mate, termo } = await setup()
  await conAvisos(db, giver)
  await reserveItem(db, mate.id, { userId: giver.id })
  await reserveItem(db, termo.id, { userId: giver.id })
  expect(await archiveItem(db, mate.id, owner.id, 'no_lo_quiero')).toBe(true)
  // con el deseo bloqueado no se espera a los servicios de push
  expect(h.enviados).toEqual([])
  await yaContesto()
  expect(h.enviados).toEqual([{ para: 'Rodri', aviso: { title: '📦 "Mate" fue dado de baja por su dueño', body: 'Te conviene elegir otro regalo.', url: '/l/tok-euge' } }])

  // una transacción que se deshace después de dejar el aviso: no quedó cartel, y el celular no suena por algo que no pasó
  await expect(db.transaction(async (tx) => {
    await dejarAviso(tx as unknown as Db, termo.id, 'item_baja', [{ userId: giver.id, guestId: null }])
    throw new Error('se deshace')
  })).rejects.toThrow('se deshace')
  await yaContesto()
  expect(h.enviados).toHaveLength(1)
  expect((await getUnreadNotifications(db, { userId: giver.id })).map((n) => `${n.tipo} ${n.itemTitulo}`)).toEqual(['item_baja Mate'])
})

test('si cambiaron el link para regalar y no lo abrió después, el push no se lo pasa: lleva a su bandeja', async () => {
  const { db, owner, giver, list, termo } = await setup()
  await conAvisos(db, giver)
  await reserveItem(db, termo.id, { userId: giver.id })
  const nuevo = await cambiarLinkParaRegalar(db, list.id, owner.id)
  await updateItem(db, termo.id, owner.id, { notas: 'el verde' })
  await yaContesto()
  expect(h.enviados).toMatchObject([{ para: 'Rodri', aviso: { url: '/avisos' } }])
  expect(JSON.stringify(h.enviados)).not.toContain(nuevo)
})

// ---------- los comentarios del hilo de un deseo ----------

test('un comentario les avisa a los demás del hilo y a quienes regalan ese deseo; nunca al dueño ni a quien lo escribió', async () => {
  const { db, owner, giver, list, termo, mate } = await setup()
  const usuario = (nombre: string) => upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre}@test.com`, nombre })
  const [caro, sofi, nico] = [await usuario('Caro'), await usuario('Sofi'), await usuario('Nico')]
  for (const u of [owner, giver, caro, sofi, nico]) await conAvisos(db, u)
  const push = pushFalso()
  await reserveItem(db, termo.id, { userId: giver.id })
  // Nico reservó otro deseo: el hilo del termo no es con él
  await reserveItem(db, mate.id, { userId: nico.id })

  // Caro pregunta: le llega a Rodri, que lo tiene reservado
  expect(await addComment(db, termo.id, { userId: caro.id }, '¿Alguien sabe el talle?', push.enviar)).toBe(true)
  expect(push.enviados).toEqual([{ para: 'Rodri', aviso: { title: '💬 Caro comentó en "Termo"', body: '¿Alguien sabe el talle?', url: `/l/tok-euge/item/${termo.id}` } }])
  // Sofi contesta: a Rodri y a Caro, que ya escribió en el hilo
  expect(await addComment(db, termo.id, { userId: sofi.id }, 'El mediano, me dijo la hermana', push.enviar)).toBe(true)
  expect(push.enviados.slice(1).map((e) => e.para).sort()).toEqual(['Caro', 'Rodri'])
  // queda en la bandeja, con quién lo escribió
  expect((await bandeja(db, { userId: caro.id })).entradas).toMatchObject([
    { emoji: '💬', titulo: 'Sofi comentó en "Termo"', cuerpo: 'El mediano, me dijo la hermana', href: `/l/tok-euge/item/${termo.id}`, de: { nombre: 'Sofi' }, nuevo: true },
  ])
  // un doble toque en "Enviar" no lo deja dos veces, ni avisa dos veces
  expect(await addComment(db, termo.id, { userId: sofi.id }, 'El mediano, me dijo la hermana', push.enviar)).toBe(true)
  expect(push.enviados).toHaveLength(3)

  // la abuela, sin cuenta: avisa a los tres con su nombre, y a ella no le llega nada (no tiene bandeja ni dispositivo)
  const abuela = await createGuest(db, 'Abuela Marta')
  await abrirListaAInvitado(db, abuela.id, list.id)
  expect(await addComment(db, termo.id, { guestId: abuela.id }, 'a'.repeat(200), push.enviar)).toBe(true)
  const deLaAbuela = push.enviados.slice(3)
  expect(deLaAbuela.map((e) => e.para).sort()).toEqual(['Caro', 'Rodri', 'Sofi'])
  // el aviso lleva el principio; el resto, en el hilo
  expect(deLaAbuela[0].aviso).toEqual({ title: '💬 Abuela comentó en "Termo"', body: `${'a'.repeat(139)}…`, url: `/l/tok-euge/item/${termo.id}` })
  expect(await addComment(db, termo.id, { userId: sofi.id }, 'Gracias', push.enviar)).toBe(true)
  expect(push.enviados.slice(6).map((e) => e.para).sort()).toEqual(['Caro', 'Rodri'])

  // el dueño no entra al hilo, y a él nunca le llegó nada: ni al celular ni a la bandeja
  expect(await addComment(db, termo.id, { userId: owner.id }, 'hola', push.enviar)).toBe(false)
  expect(push.de('Euge')).toEqual([])
  expect(push.de('Nico')).toEqual([])
  expect((await bandeja(db, { userId: owner.id })).entradas).toEqual([])
  expect(await db.select().from(avisos).where(eq(avisos.userId, owner.id))).toEqual([])
})

test('el aviso de un comentario no pasa el link para regalar nuevo, ni le llega a quien ahora es dueño de la lista', async () => {
  const db = await createTestDb()
  const usuario = (nombre: string) => upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre}@test.com`, nombre })
  const [delfina, martin, rodri, sofi] = [await usuario('Delfina'), await usuario('Martin'), await usuario('Rodri'), await usuario('Sofi')]
  for (const u of [delfina, martin, rodri, sofi]) await conAvisos(db, u)
  const push = pushFalso()
  const casa = await crearGrupo(db, delfina.id, { nombre: 'Casa' })
  const mesa = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Mesa' }, casa))!
  // Martín y Rodri escribieron en el hilo; después Martín se sumó a la lista como dueño
  for (const u of [martin, rodri]) expect(await addComment(db, mesa.id, { userId: u.id }, `Soy ${u.nombre}`, push.enviar)).toBe(true)
  const [grupo] = await db.select().from(lists).where(eq(lists.id, casa))
  expect(await unirseAGrupo(db, grupo.inviteToken!, martin.id)).toBe(casa)
  // y cambiaron el link para regalar: Sofi la abrió con el nuevo, Rodri no
  const nuevo = await cambiarLinkParaRegalar(db, casa, delfina.id)
  await seguir(db, sofi.id, casa)
  push.enviados.length = 0
  expect(await addComment(db, mesa.id, { userId: sofi.id }, '¿La compramos entre todos?', push.enviar)).toBe(true)
  expect(push.enviados).toEqual([{ para: 'Rodri', aviso: { title: '💬 Sofi comentó en "Mesa"', body: '¿La compramos entre todos?', url: '/avisos' } }])
  // Rodri la abre con el link nuevo: desde ahí, al deseo
  await seguir(db, rodri.id, casa)
  expect(await addComment(db, mesa.id, { userId: sofi.id }, 'Avisen', push.enviar)).toBe(true)
  expect(push.de('Rodri')[1].url).toBe(`/l/${nuevo}/item/${mesa.id}`)
  expect([...push.de('Martin'), ...push.de('Delfina')]).toEqual([])
})
