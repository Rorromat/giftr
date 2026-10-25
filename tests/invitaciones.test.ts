import { expect, test } from 'vitest'
import { createECDH, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { groupGiftMembers, invitacionesRegalo, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { createItem } from '@/lib/items'
import { pedirAmistad } from '@/lib/amigos'
import { guardarSuscripcion, type Aviso, type Enviar } from '@/lib/codazos'
import { cancelarRegalo, iniciarRegaloGrupal, salirDeRegalo, sumarseARegalo } from '@/lib/regalos'
import {
  amigosParaDividir, invitacionesPendientes, invitadosDeRegalo, invitarARegalo, responderInvitacion,
} from '@/lib/invitaciones'

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}
const amigos = async (db: Db, a: string, b: string) => { await pedirAmistad(db, a, b); await pedirAmistad(db, b, a) }
const ecdh = createECDH('prime256v1')
const CLAVES = { p256dh: ecdh.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') }
const conAvisos = (db: Db, userId: string) => guardarSuscripcion(db, userId, { endpoint: `https://fcm.googleapis.com/fcm/send/${userId}`, keys: CLAVES })
function pushFalso() {
  const enviados: { para: string; aviso: Aviso }[] = []
  const enviar: Enviar = async (s, aviso) => { enviados.push({ para: s.endpoint.split('/').at(-1)!, aviso }); return 201 }
  return { enviados, enviar }
}
const miembros = async (db: Db, giftId: string) =>
  (await db.select({ id: groupGiftMembers.userId }).from(groupGiftMembers).where(eq(groupGiftMembers.giftId, giftId))).map((m) => m.id).sort()

/** Euge arma el regalo del mate de Rodri. Sofi y Juan son amigos de Euge; Rodri también (es el del cumple); Ana no. */
async function setup() {
  const db = await createTestDb()
  const [euge, sofi, juan, rodri, ana] = await Promise.all(['Euge', 'Sofi', 'Juan', 'Rodri', 'Ana'].map((n) => usuario(db, n)))
  for (const o of [sofi, juan, rodri]) await amigos(db, euge.id, o.id)
  const mate = (await createItem(db, rodri.id, { tipo: 'exacto', titulo: 'Mate imperial' }))!
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, rodri.id))
  for (const u of [euge, sofi, juan]) await conAvisos(db, u.id)
  return { db, euge, sofi, juan, rodri, ana, mate, token: lista.shareToken }
}

test('a quiénes se les puede proponer: mis amigos, nunca el del cumple', async () => {
  const { db, euge, sofi, juan, mate } = await setup()
  expect((await amigosParaDividir(db, euge.id, mate.id)).map((p) => p.id)).toEqual([juan.id, sofi.id])
  expect(await amigosParaDividir(db, euge.id, 'cualquier-cosa')).toEqual([])
})

test('Lo dividimos: les llega la propuesta a los amigos elegidos (y a nadie más)', async () => {
  const { db, euge, sofi, juan, rodri, ana, mate } = await setup()
  const r = await iniciarRegaloGrupal(db, mate.id, euge.id)
  if (!r.ok) throw new Error('no se armó')
  const { enviados, enviar } = pushFalso()
  // Rodri es el del cumple, Ana no es amiga, Euge es el que lo arma: solo Sofi y Juan
  expect(await invitarARegalo(db, r.giftId, euge.id, [sofi.id, juan.id, rodri.id, ana.id, euge.id, sofi.id], enviar)).toBe(2)
  expect(enviados.map((e) => e.para).sort()).toEqual([juan.id, sofi.id].sort())
  expect(enviados[0].aviso).toEqual({ title: '🎁 Euge te propone dividir un regalo', body: '"Mate imperial" para Rodri, en partes iguales. ¿Te sumás?', url: '/inicio#invitaciones' })
  // otra vez, o alguien que no lo organiza: nada
  expect(await invitarARegalo(db, r.giftId, euge.id, [sofi.id], enviar)).toBe(0)
  expect(await invitarARegalo(db, r.giftId, sofi.id, [juan.id], enviar)).toBe(0)
  expect(enviados).toHaveLength(2)

  const [inv] = await invitacionesPendientes(db, sofi.id)
  expect(inv).toMatchObject({ de: { id: euge.id, nombre: 'Euge' }, giftId: r.giftId, itemId: mate.id, titulo: 'Mate imperial', para: 'Rodri', somos: 1 })
  expect(await invitacionesPendientes(db, rodri.id)).toEqual([])
  expect(await invitadosDeRegalo(db, r.giftId)).toEqual([
    { persona: expect.objectContaining({ id: sofi.id }), estado: 'esperando' },
    { persona: expect.objectContaining({ id: juan.id }), estado: 'esperando' },
  ])
})

test('aceptar suma al regalo; no, no; y al que lo armó le avisa las dos', async () => {
  const { db, euge, sofi, juan, mate, token } = await setup()
  const r = await iniciarRegaloGrupal(db, mate.id, euge.id)
  if (!r.ok) throw new Error('no se armó')
  await invitarARegalo(db, r.giftId, euge.id, [sofi.id, juan.id], pushFalso().enviar)
  const { enviados, enviar } = pushFalso()

  const [deSofi] = await invitacionesPendientes(db, sofi.id)
  expect(await responderInvitacion(db, sofi.id, deSofi.id, true, enviar)).toEqual({ ok: true, token, itemId: mate.id })
  expect(await miembros(db, r.giftId)).toEqual([euge.id, sofi.id].sort())
  expect(await invitacionesPendientes(db, sofi.id)).toEqual([])
  // Juan ve que ya son dos
  const [deJuan] = await invitacionesPendientes(db, juan.id)
  expect(deJuan.somos).toBe(2)
  expect(await responderInvitacion(db, juan.id, deJuan.id, false, enviar)).toEqual({ ok: true, token, itemId: mate.id })
  expect(await miembros(db, r.giftId)).toEqual([euge.id, sofi.id].sort())
  expect(enviados.map((e) => [e.para, e.aviso.title])).toEqual([
    [euge.id, '🤝 Sofi se suma a "Mate imperial"'],
    [euge.id, 'Juan no se suma a "Mate imperial"'],
  ])
  // ya contestada, o la de otro: nada
  expect(await responderInvitacion(db, juan.id, deJuan.id, true, enviar)).toEqual({ ok: false, reason: 'no_existe' })
  expect(await responderInvitacion(db, juan.id, deSofi.id, true, enviar)).toEqual({ ok: false, reason: 'no_existe' })

  expect((await invitadosDeRegalo(db, r.giftId)).map((i) => [i.persona.nombre, i.estado])).toEqual([['Sofi', 'se_sumo'], ['Juan', 'no_puede']])
  await salirDeRegalo(db, r.giftId, sofi.id)
  expect((await invitadosDeRegalo(db, r.giftId)).map((i) => [i.persona.nombre, i.estado])).toEqual([['Sofi', 'se_bajo'], ['Juan', 'no_puede']])
})

test('si se sumó por su cuenta o el regalo se canceló, la propuesta ya no espera; aceptarla igual no lo suma', async () => {
  const { db, euge, sofi, juan, mate } = await setup()
  const r = await iniciarRegaloGrupal(db, mate.id, euge.id)
  if (!r.ok) throw new Error('no se armó')
  await invitarARegalo(db, r.giftId, euge.id, [sofi.id, juan.id], pushFalso().enviar)
  const [deJuan] = await invitacionesPendientes(db, juan.id)
  // Sofi tocó "Me sumo" en el deseo
  await sumarseARegalo(db, r.giftId, sofi.id, mate.id)
  expect(await invitacionesPendientes(db, sofi.id)).toEqual([])
  // Euge lo cancela: a Juan no le queda nada que contestar, y si contesta desde una pantalla vieja no se suma
  await cancelarRegalo(db, r.giftId, euge.id)
  expect(await invitacionesPendientes(db, juan.id)).toEqual([])
  expect(await responderInvitacion(db, juan.id, deJuan.id, true, pushFalso().enviar)).toEqual({ ok: false, reason: 'no_se_pudo' })
  expect((await db.select().from(invitacionesRegalo).where(eq(invitacionesRegalo.id, deJuan.id)))[0].estado).toBe('rechazada')
  // y a un regalo cancelado no se invita
  expect(await invitarARegalo(db, r.giftId, euge.id, [juan.id], pushFalso().enviar)).toBe(0)
})
