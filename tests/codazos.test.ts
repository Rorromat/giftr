import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { claims, codazos, lists, pushSubs } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { createGuest } from '@/lib/guest'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { createItem } from '@/lib/items'
import {
  avisar, borrarSuscripcion, clavesVapid, codazosSinVer, CODAZOS_POR_DIA, guardarSuscripcion, mandarCodazo, marcarCodazosVistos,
  tieneAvisos, type Aviso, type Enviar,
} from '@/lib/codazos'

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}
const sub = (n: string) => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: `p-${n}`, auth: `a-${n}` } })

/** Un servicio de push de mentira: anota lo que manda y contesta lo que le digan por endpoint. */
function pushFalso(respuestas: Record<string, number> = {}) {
  const enviados: { endpoint: string; aviso: Aviso }[] = []
  const enviar: Enviar = async (s, aviso) => { enviados.push({ endpoint: s.endpoint, aviso }); return respuestas[s.endpoint] ?? 201 }
  return { enviados, enviar }
}

test('las claves VAPID se generan una sola vez y quedan', async () => {
  const db = await createTestDb()
  const a = await clavesVapid(db)
  expect(a.publica).toMatch(/^[A-Za-z0-9_-]{80,}$/)
  expect(await clavesVapid(db)).toEqual(a)
})

test('suscripciones: se validan, un endpoint es de un solo usuario y se pueden borrar', async () => {
  const db = await createTestDb()
  const [euge, rodri] = [await usuario(db, 'Euge'), await usuario(db, 'Rodri')]
  expect(await guardarSuscripcion(db, euge.id, { endpoint: 'http://inseguro', keys: { p256dh: 'x', auth: 'y' } })).toBe(false)
  expect(await guardarSuscripcion(db, euge.id, { nada: true })).toBe(false)
  expect(await guardarSuscripcion(db, euge.id, sub('1'))).toBe(true)
  expect(await tieneAvisos(db, euge.id)).toBe(true)
  // el mismo teléfono, ahora con otra cuenta
  await guardarSuscripcion(db, rodri.id, sub('1'))
  expect(await tieneAvisos(db, euge.id)).toBe(false)
  await borrarSuscripcion(db, euge.id, sub('1').endpoint) // no es suyo: no borra
  expect(await tieneAvisos(db, rodri.id)).toBe(true)
  await borrarSuscripcion(db, rodri.id, sub('1').endpoint)
  expect(await tieneAvisos(db, rodri.id)).toBe(false)
})

test('el codazo le llega a la dueña como aviso y como cartel; uno por persona cada 24 h', async () => {
  const db = await createTestDb()
  const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi Pérez')]
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  await guardarSuscripcion(db, euge.id, sub('telefono'))
  await guardarSuscripcion(db, euge.id, sub('vieja'))
  const push = pushFalso({ [sub('vieja').endpoint]: 410 })

  expect(await mandarCodazo(db, lista.shareToken, {}, 'Nadie', push.enviar)).toEqual({ ok: false, reason: 'sin_identidad' })
  expect(await mandarCodazo(db, lista.shareToken, { userId: euge.id }, 'Euge', push.enviar)).toEqual({ ok: false, reason: 'propio' })
  expect(await mandarCodazo(db, 'no-existe', { userId: sofi.id }, 'Sofi', push.enviar)).toEqual({ ok: false, reason: 'no_existe' })

  expect(await mandarCodazo(db, lista.shareToken, { userId: sofi.id }, 'Sofi Pérez', push.enviar)).toEqual({ ok: true, para: ['Euge'], avisados: 1 })
  expect(push.enviados.map((e) => e.aviso.title)).toEqual(['👉 ¡Codazo de Sofi!', '👉 ¡Codazo de Sofi!'])
  expect(push.enviados[0].aviso).toMatchObject({ url: '/mi-lista', body: 'Quiere saber qué regalarte. Cargá lo que querés en tu lista.' })
  // la suscripción vencida (410) se borró
  expect((await db.select().from(pushSubs)).map((s) => s.endpoint)).toEqual([sub('telefono').endpoint])

  expect(await mandarCodazo(db, lista.shareToken, { userId: sofi.id }, 'Sofi Pérez', push.enviar)).toEqual({ ok: false, reason: 'ya_mandaste' })
  const carteles = await codazosSinVer(db, euge.id)
  expect(carteles).toHaveLength(1)
  expect(carteles[0]).toMatchObject({ deNombre: 'Sofi Pérez', tipo: 'personal' })
  await marcarCodazosVistos(db, euge.id)
  expect(await codazosSinVer(db, euge.id)).toEqual([])

  // al día siguiente puede volver a darle un codazo
  await db.update(codazos).set({ createdAt: new Date(Date.now() - 25 * 3600_000) })
  expect((await mandarCodazo(db, lista.shareToken, { userId: sofi.id }, 'Sofi Pérez', push.enviar)).ok).toBe(true)
})

test('en un grupo le llega a cada dueño; un invitado también puede, y hay tope por día', async () => {
  const db = await createTestDb()
  const [delfina, martin] = [await usuario(db, 'Delfina'), await usuario(db, 'Martín')]
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Nuestra casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  await unirseAGrupo(db, grupo.inviteToken!, martin.id)
  await guardarSuscripcion(db, martin.id, sub('martin'))
  const push = pushFalso()
  const invitada = await createGuest(db, 'Tía Marta')
  const r = await mandarCodazo(db, grupo.shareToken, { guestId: invitada.id }, 'Tía Marta', push.enviar)
  expect(r).toEqual({ ok: true, para: ['Delfina', 'Martín'], avisados: 1 })
  expect(push.enviados[0].aviso).toMatchObject({ url: `/grupos/${grupoId}`, body: 'Quiere saber qué regalarles. Cargá cosas en "Nuestra casa".' })
  expect((await codazosSinVer(db, delfina.id))[0]).toMatchObject({ deNombre: 'Tía Marta', tipo: 'grupo', listaNombre: 'Nuestra casa' })
  expect((await mandarCodazo(db, grupo.shareToken, { guestId: invitada.id }, 'Tía Marta', push.enviar)).ok).toBe(false)

  for (let i = 1; i < CODAZOS_POR_DIA; i++) {
    const u = await usuario(db, `Primo${i}`)
    expect((await mandarCodazo(db, grupo.shareToken, { userId: u.id }, u.nombre, push.enviar)).ok).toBe(true)
  }
  const otro = await usuario(db, 'Uno más')
  expect(await mandarCodazo(db, grupo.shareToken, { userId: otro.id }, 'Uno más', push.enviar)).toEqual({ ok: false, reason: 'muchos' })
})

test('EL TEST DE ORO, codazo: el aviso no dice nada de reservas ni de qué hay en la lista', async () => {
  const db = await createTestDb()
  const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  const mate = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Mate imperial' }))!
  await db.insert(claims).values({ itemId: mate.id, claimerUserId: sofi.id, estado: 'comprado' })
  await guardarSuscripcion(db, euge.id, sub('1'))
  const push = pushFalso()
  await mandarCodazo(db, lista.shareToken, { userId: sofi.id }, 'Sofi', push.enviar)
  const json = JSON.stringify([push.enviados, await codazosSinVer(db, euge.id)]).toLowerCase()
  for (const p of ['mate', 'comprado', 'reserv', 'claim']) expect(json).not.toContain(p)
  // y avisar a alguien sin dispositivos no manda nada
  expect(await avisar(db, sofi.id, { title: 't', body: 'b', url: '/' }, push.enviar)).toBe(0)
})
