import { describe, expect, test } from 'vitest'
import { createECDH, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { createTestDb, seguir } from './helpers'
import { amistades, listFollows, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { guardarSuscripcion, type Aviso, type Enviar } from '@/lib/codazos'
import { miGente } from '@/lib/gente'
import { cambiarLinkParaRegalar } from '@/lib/lists'
import {
  aceptarLinkDeAmigo, asegurarUsuario, buscarPorUsuario, cambiarUsuario, cancelarSolicitud, cuantasRecibidas, dejarDeSerAmigos,
  miAmigoToken, misAmigos, normalizarUsuario, pedirAmistad, pedirAmistadPorMail, reclamarSolicitudesPorMail, relacionCon,
  responderSolicitud, SOLICITUDES_POR_DIA, solicitudesEnviadas, solicitudesRecibidas, sugerenciasDeAmigos, USUARIO, usuarioDelNombre,
} from '@/lib/amigos'

async function usuario(db: Db, nombre: string, email = `${nombre.toLowerCase().replace(/ /g, '.')}@test.com`) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}-${email}`, email, nombre })
}
const ecdh = createECDH('prime256v1')
const CLAVES = { p256dh: ecdh.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') }
/** Le activa los avisos (un dispositivo) para ver qué le llega. */
const conAvisos = (db: Db, userId: string) => guardarSuscripcion(db, userId, { endpoint: `https://fcm.googleapis.com/fcm/send/${userId}`, keys: CLAVES })
function pushFalso() {
  const enviados: { para: string; aviso: Aviso }[] = []
  const enviar: Enviar = async (s, aviso) => { enviados.push({ para: s.endpoint.split('/').at(-1)!, aviso }); return 201 }
  return { enviados, enviar }
}
const listaDe = async (db: Db, userId: string) => (await db.select().from(lists).where(eq(lists.ownerId, userId)))[0]
const sigue = async (db: Db, userId: string, listId: string) =>
  (await db.select().from(listFollows).where(sql`${listFollows.userId} = ${userId} and ${listFollows.listId} = ${listId}`)).length > 0

describe('@usuario', () => {
  test('se saca del nombre, sin tildes ni espacios, y se normaliza lo que escriben', () => {
    expect(usuarioDelNombre('Euge Mateus')).toBe('euge.mateus')
    expect(usuarioDelNombre('Ñandú Pérez')).toBe('nandu.perez')
    expect(usuarioDelNombre('Ñandú Pérez-López')).toBe('nandu.perez') // hasta 16, en una palabra entera
    expect(usuarioDelNombre('Al')).toBe('')
    expect(usuarioDelNombre('María José de los Ángeles Fernández')).toMatch(USUARIO)
    expect(normalizarUsuario('  @Euge.Mateus ')).toBe('euge.mateus')
    for (const malo of ['ab', '.euge', 'euge.', 'eu ge', 'euge@x', 'a'.repeat(21), 42, null]) expect(normalizarUsuario(malo), String(malo)).toBeNull()
  })

  test('a cada uno se le pone uno libre, y queda', async () => {
    const db = await createTestDb()
    const a = await usuario(db, 'Euge Mateus')
    const b = await usuario(db, 'Euge Mateus', 'otra@test.com')
    const c = await usuario(db, 'Al')
    expect(await asegurarUsuario(db, a.id)).toBe('euge.mateus')
    expect(await asegurarUsuario(db, b.id)).toBe('euge.mateus2')
    expect(await asegurarUsuario(db, c.id)).toBe('usuario2') // "usuario" está reservado
    expect(await asegurarUsuario(db, a.id)).toBe('euge.mateus')
    expect(await asegurarUsuario(db, crypto.randomUUID())).toBeNull()
  })

  test('las cuentas de antes reciben uno con la migración, válido y sin repetir', async () => {
    const db = await createTestDb()
    for (const [n, nombre] of ['Euge Mateus', 'Euge Mateus', 'Ñandú Pérez', 'Al', '***', 'Un nombre larguísimo que no entra'].entries()) {
      await db.insert(users).values({ googleId: `g${n}`, nombre, email: `${n}@x.com` })
    }
    const migracion = readFileSync('drizzle/0023_amigos.sql', 'utf8').split('--> statement-breakpoint').at(-1)!
    await db.execute(sql.raw(migracion))
    const todos = (await db.select({ nombre: users.nombre, usuario: users.usuario }).from(users))
    for (const u of todos) expect(u.usuario, u.nombre).toMatch(USUARIO)
    expect(new Set(todos.map((u) => u.usuario)).size).toBe(todos.length)
    expect(todos.find((u) => u.nombre === 'Ñandú Pérez')?.usuario).toBe('nandu.perez')
    expect(todos.filter((u) => u.nombre === 'Euge Mateus').map((u) => u.usuario)).not.toContain('euge.mateus')
  })

  test('cambiarlo: el formato, uno que ya es de otro, y el mismo en otras mayúsculas', async () => {
    const db = await createTestDb()
    const [a, b] = [await usuario(db, 'Euge'), await usuario(db, 'Rodri')]
    await asegurarUsuario(db, a.id)
    expect(await cambiarUsuario(db, b.id, 'no vale')).toEqual({ ok: false, error: 'formato' })
    expect(await cambiarUsuario(db, b.id, '@EUGE')).toEqual({ ok: false, error: 'ocupado' })
    expect(await cambiarUsuario(db, b.id, 'giftr')).toEqual({ ok: false, error: 'ocupado' })
    expect(await cambiarUsuario(db, b.id, '@Rodri_10')).toEqual({ ok: true, usuario: 'rodri_10' })
    expect(await cambiarUsuario(db, a.id, 'euge')).toEqual({ ok: true, usuario: 'euge' })
    expect((await buscarPorUsuario(db, '@RODRI_10'))?.id).toBe(b.id)
    expect(await buscarPorUsuario(db, 'nadie.aca')).toBeNull()
  })
})

describe('solicitudes', () => {
  test('mandar, ver, aceptar: se ven mutuamente y a los dos les llega el aviso', async () => {
    const db = await createTestDb()
    const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
    await conAvisos(db, euge.id); await conAvisos(db, sofi.id)
    const push = pushFalso()
    expect(await pedirAmistad(db, euge.id, sofi.id, push.enviar)).toEqual({ ok: true, estado: 'enviada' })
    expect(push.enviados).toEqual([{ para: sofi.id, aviso: expect.objectContaining({ title: '🤝 Euge quiere ser tu amigo en GiftR', url: '/gente' }) }])
    expect(await relacionCon(db, euge.id, sofi.id)).toBe('enviada')
    expect(await relacionCon(db, sofi.id, euge.id)).toBe('recibida')
    const [s] = await solicitudesRecibidas(db, sofi.id)
    expect(s.de).toMatchObject({ id: euge.id, nombre: 'Euge' })
    expect(await cuantasRecibidas(db, sofi.id)).toEqual({ n: 1, primero: 'Euge' })
    expect((await solicitudesEnviadas(db, euge.id)).map((e) => e.para?.id)).toEqual([sofi.id])
    // hasta que acepta, no se ven
    expect(await miGente(db, euge.id)).toEqual([])

    // otro no la puede contestar por ella
    expect(await responderSolicitud(db, euge.id, s.id, true, push.enviar)).toBe(false)
    expect(await responderSolicitud(db, sofi.id, s.id, true, push.enviar)).toBe(true)
    expect(push.enviados.at(-1)).toEqual({ para: euge.id, aviso: expect.objectContaining({ title: '🤝 Sofi aceptó' }) })
    expect(await relacionCon(db, euge.id, sofi.id)).toBe('amigos')
    expect((await miGente(db, euge.id)).map((c) => c.nombre)).toEqual(['Sofi'])
    expect((await miGente(db, sofi.id)).map((c) => c.nombre)).toEqual(['Euge'])
    expect(await misAmigos(db, sofi.id)).toEqual(new Set([euge.id]))
    expect(await solicitudesRecibidas(db, sofi.id)).toEqual([])
    expect(await solicitudesEnviadas(db, euge.id)).toEqual([])
    // ya contestada: no se vuelve a contestar
    expect(await responderSolicitud(db, sofi.id, s.id, false)).toBe(false)
    // y pedirla de nuevo no cambia nada
    expect(await pedirAmistad(db, euge.id, sofi.id, push.enviar)).toEqual({ ok: true, estado: 'amigos' })
    expect(await db.select().from(amistades)).toHaveLength(1)
  })

  test('cruzadas: si el otro ya me la había mandado, quedamos amigos', async () => {
    const db = await createTestDb()
    const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
    await pedirAmistad(db, euge.id, sofi.id)
    expect(await pedirAmistad(db, sofi.id, euge.id)).toEqual({ ok: true, estado: 'amigos' })
    expect(await relacionCon(db, euge.id, sofi.id)).toBe('amigos')
    expect(await db.select().from(amistades)).toHaveLength(1)
  })

  test('rechazada: el que la mandó no se entera y mandarla de nuevo no le llega; si ella después la pide, son amigos', async () => {
    const db = await createTestDb()
    const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
    await conAvisos(db, sofi.id)
    const push = pushFalso()
    await pedirAmistad(db, euge.id, sofi.id, push.enviar)
    const [s] = await solicitudesRecibidas(db, sofi.id)
    expect(await responderSolicitud(db, sofi.id, s.id, false)).toBe(true)
    expect(await relacionCon(db, euge.id, sofi.id)).toBe('enviada')
    expect(await relacionCon(db, sofi.id, euge.id)).toBe('nada')
    expect(await solicitudesEnviadas(db, euge.id)).toHaveLength(1)
    expect(await solicitudesRecibidas(db, sofi.id)).toEqual([])
    expect(await pedirAmistad(db, euge.id, sofi.id, push.enviar)).toEqual({ ok: true, estado: 'enviada' })
    expect(push.enviados).toHaveLength(1)
    expect(await solicitudesRecibidas(db, sofi.id)).toEqual([])
    // cancelarla: la saca de sus enviadas, pero sigue sin llegarle si la vuelve a mandar
    await cancelarSolicitud(db, euge.id, s.id)
    expect(await solicitudesEnviadas(db, euge.id)).toEqual([])
    await pedirAmistad(db, euge.id, sofi.id, push.enviar)
    expect(push.enviados).toHaveLength(1)
    expect(await solicitudesEnviadas(db, euge.id)).toHaveLength(1)
    // ella sí puede: quedan amigos
    expect(await pedirAmistad(db, sofi.id, euge.id)).toEqual({ ok: true, estado: 'amigos' })
  })

  test('cancelar una pendiente: deja de llegarle', async () => {
    const db = await createTestDb()
    const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
    await pedirAmistad(db, euge.id, sofi.id)
    const [e] = await solicitudesEnviadas(db, euge.id)
    await cancelarSolicitud(db, sofi.id, e.id) // no es suya
    expect(await solicitudesRecibidas(db, sofi.id)).toHaveLength(1)
    await cancelarSolicitud(db, euge.id, e.id)
    expect(await solicitudesRecibidas(db, sofi.id)).toEqual([])
    expect(await db.select().from(amistades)).toEqual([])
  })

  test('a uno mismo o a alguien que no existe, no', async () => {
    const db = await createTestDb()
    const euge = await usuario(db, 'Euge')
    expect(await pedirAmistad(db, euge.id, euge.id)).toEqual({ ok: false, reason: 'yo' })
    expect(await pedirAmistad(db, euge.id, crypto.randomUUID())).toEqual({ ok: false, reason: 'no_existe' })
    expect(await pedirAmistad(db, euge.id, 'no-es-un-id')).toEqual({ ok: false, reason: 'no_existe' })
  })

  test(`hasta ${SOLICITUDES_POR_DIA} por día`, async () => {
    const db = await createTestDb()
    const euge = await usuario(db, 'Euge')
    for (let n = 0; n < SOLICITUDES_POR_DIA; n++) {
      const otro = await usuario(db, `Otro ${n}`)
      expect((await pedirAmistad(db, euge.id, otro.id)).ok).toBe(true)
    }
    const uno = await usuario(db, 'Uno Mas')
    expect(await pedirAmistad(db, euge.id, uno.id)).toEqual({ ok: false, reason: 'muchas' })
    expect(await pedirAmistadPorMail(db, euge.id, 'nadie@x.com')).toEqual({ ok: false, reason: 'muchas' })
  })

  test('dejar de ser amigos: ninguno ve más al otro', async () => {
    const db = await createTestDb()
    const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
    await pedirAmistad(db, euge.id, sofi.id)
    await pedirAmistad(db, sofi.id, euge.id)
    await dejarDeSerAmigos(db, sofi.id, euge.id)
    expect(await relacionCon(db, euge.id, sofi.id)).toBe('nada')
    expect(await miGente(db, euge.id)).toEqual([])
    expect(await miGente(db, sofi.id)).toEqual([])
    // y pueden volver a empezar
    expect(await pedirAmistad(db, euge.id, sofi.id)).toEqual({ ok: true, estado: 'enviada' })
  })

  test('cambiar el link de la lista: los amigos la siguen viendo; los que la tenían por el link, no', async () => {
    const db = await createTestDb()
    const [euge, sofi, rodri] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi'), await usuario(db, 'Rodri')]
    await pedirAmistad(db, euge.id, sofi.id)
    await pedirAmistad(db, sofi.id, euge.id)
    const lista = await listaDe(db, euge.id)
    await seguir(db, rodri.id, lista.id)
    expect(await cambiarLinkParaRegalar(db, lista.id, euge.id)).toBeTruthy()
    expect(await sigue(db, sofi.id, lista.id)).toBe(true)
    expect(await sigue(db, rodri.id, lista.id)).toBe(false)
    expect((await miGente(db, sofi.id))[0].href).toBe(`/l/${(await listaDe(db, euge.id)).shareToken}`)
  })
})

describe('por mail', () => {
  test('a una cuenta con ese mail: le llega, y en mis enviadas figura el mail que escribí', async () => {
    const db = await createTestDb()
    const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi', 'Sofi.G@Mail.com')]
    expect(await pedirAmistadPorMail(db, euge.id, '  sofi.g@mail.COM ')).toEqual({ ok: true, estado: 'enviada' })
    expect((await solicitudesRecibidas(db, sofi.id)).map((s) => s.de.id)).toEqual([euge.id])
    expect(await solicitudesEnviadas(db, euge.id)).toEqual([{ id: expect.any(String), a: 'sofi.g@mail.com', para: null }])
  })

  test('a un mail sin cuenta: queda esperando y le llega cuando entra con ese mail', async () => {
    const db = await createTestDb()
    const euge = await usuario(db, 'Euge')
    expect(await pedirAmistadPorMail(db, euge.id, 'ana@mail.com')).toEqual({ ok: true, estado: 'enviada' })
    // mandarla dos veces no hace dos
    await pedirAmistadPorMail(db, euge.id, 'ANA@mail.com')
    expect(await solicitudesEnviadas(db, euge.id)).toEqual([{ id: expect.any(String), a: 'ana@mail.com', para: null }])
    const ana = await usuario(db, 'Ana', 'Ana@Mail.com')
    await reclamarSolicitudesPorMail(db, ana.id, 'Ana@Mail.com')
    const [s] = await solicitudesRecibidas(db, ana.id)
    expect(s.de.id).toBe(euge.id)
    expect(await responderSolicitud(db, ana.id, s.id, true)).toBe(true)
    expect(await relacionCon(db, euge.id, ana.id)).toBe('amigos')
  })

  test('si al entrar ya había algo entre los dos, vale eso y la del mail se va', async () => {
    const db = await createTestDb()
    const euge = await usuario(db, 'Euge')
    await pedirAmistadPorMail(db, euge.id, 'ana@mail.com')
    const ana = await usuario(db, 'Ana', 'otro@mail.com')
    await pedirAmistad(db, ana.id, euge.id)
    await reclamarSolicitudesPorMail(db, ana.id, 'ana@mail.com')
    expect(await db.select().from(amistades)).toHaveLength(1)
    expect(await relacionCon(db, euge.id, ana.id)).toBe('recibida')
  })

  test('un mail mal escrito, o el propio', async () => {
    const db = await createTestDb()
    const euge = await usuario(db, 'Euge')
    expect(await pedirAmistadPorMail(db, euge.id, 'no es un mail')).toEqual({ ok: false, reason: 'formato' })
    expect(await pedirAmistadPorMail(db, euge.id, 'EUGE@test.com')).toEqual({ ok: false, reason: 'yo' })
  })
})

describe('link de amigo', () => {
  test('quien lo abre y acepta queda amigo sin solicitud, y al dueño le llega el aviso', async () => {
    const db = await createTestDb()
    const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
    await conAvisos(db, euge.id)
    const push = pushFalso()
    const token = (await miAmigoToken(db, euge.id))!
    expect(await miAmigoToken(db, euge.id)).toBe(token)
    expect(await aceptarLinkDeAmigo(db, euge.id, token)).toEqual({ ok: false, reason: 'yo' })
    expect(await aceptarLinkDeAmigo(db, sofi.id, 'no-existe')).toEqual({ ok: false, reason: 'no_existe' })
    expect(await aceptarLinkDeAmigo(db, sofi.id, token, push.enviar)).toMatchObject({ ok: true, de: { id: euge.id } })
    expect(await relacionCon(db, sofi.id, euge.id)).toBe('amigos')
    expect((await miGente(db, sofi.id)).map((c) => c.nombre)).toEqual(['Euge'])
    expect(push.enviados).toEqual([{ para: euge.id, aviso: expect.objectContaining({ title: '🤝 Sofi se sumó como amigo' }) }])
    // otra vez: nada nuevo
    await aceptarLinkDeAmigo(db, sofi.id, token, push.enviar)
    expect(push.enviados).toHaveLength(1)
  })

  test('aunque antes se hubiera rechazado una solicitud entre los dos', async () => {
    const db = await createTestDb()
    const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
    await pedirAmistad(db, sofi.id, euge.id)
    const [s] = await solicitudesRecibidas(db, euge.id)
    await responderSolicitud(db, euge.id, s.id, false)
    await aceptarLinkDeAmigo(db, sofi.id, (await miAmigoToken(db, euge.id))!)
    expect(await relacionCon(db, euge.id, sofi.id)).toBe('amigos')
    expect(await db.select().from(amistades)).toHaveLength(1)
  })
})

describe('gente que quizás conocés', () => {
  /** Amigos sin pasar por la solicitud (los dos la mandan). */
  const amigos = async (db: Db, a: string, b: string) => { await pedirAmistad(db, a, b); await pedirAmistad(db, b, a) }

  test('los amigos de tus amigos, primero los que tienen más en común, con quiénes', async () => {
    const db = await createTestDb()
    const [yo, sofi, juan, ana, beto, caro, dani] = await Promise.all(['Yo', 'Sofi Paz', 'Juan', 'Ana', 'Beto', 'Caro', 'Dani'].map((n) => usuario(db, n)))
    await amigos(db, yo.id, sofi.id)
    await amigos(db, yo.id, juan.id)
    // Ana: amiga de Sofi y de Juan; Beto: solo de Juan; Caro: de Sofi, pero la solicitud está pendiente (no cuenta)
    await amigos(db, sofi.id, ana.id)
    await amigos(db, juan.id, ana.id)
    await amigos(db, juan.id, beto.id)
    await pedirAmistad(db, sofi.id, caro.id)
    // Dani: amigo de amigos de amigos, no
    await amigos(db, ana.id, dani.id)
    expect(await sugerenciasDeAmigos(db, yo.id)).toEqual([
      { p: expect.objectContaining({ id: ana.id, nombre: 'Ana' }), enComun: ['Juan', 'Sofi'] },
      { p: expect.objectContaining({ id: beto.id, nombre: 'Beto' }), enComun: ['Juan'] },
    ])
    // con límite
    expect((await sugerenciasDeAmigos(db, yo.id, 1)).map((s) => s.p.id)).toEqual([ana.id])
    // a Ana le sugiere a mí (dos en común) y a Beto (Juan); a quien no tiene amigos, nadie
    expect((await sugerenciasDeAmigos(db, ana.id)).map((s) => s.p.nombre)).toEqual(['Yo', 'Beto'])
    expect(await sugerenciasDeAmigos(db, caro.id)).toEqual([])
  })

  test('no sugiere a quien ya tiene una solicitud con vos, la mandara quien la mandara, ni a quien la rechazó', async () => {
    const db = await createTestDb()
    const [yo, sofi, ana, beto, caro, dani] = await Promise.all(['Yo', 'Sofi', 'Ana', 'Beto', 'Caro', 'Dani'].map((n) => usuario(db, n)))
    await amigos(db, yo.id, sofi.id)
    for (const o of [ana, beto, caro, dani]) await amigos(db, sofi.id, o.id)
    expect((await sugerenciasDeAmigos(db, yo.id)).map((s) => s.p.nombre)).toEqual(['Ana', 'Beto', 'Caro', 'Dani'])
    // a Ana se la mandé; Beto me la mandó; Caro rechazó la mía
    await pedirAmistad(db, yo.id, ana.id)
    await pedirAmistad(db, beto.id, yo.id)
    await pedirAmistad(db, yo.id, caro.id)
    const [deCaro] = await db.select().from(amistades).where(sql`${amistades.deUserId} = ${yo.id} and ${amistades.paraUserId} = ${caro.id}`)
    await responderSolicitud(db, caro.id, deCaro.id, false)
    expect((await sugerenciasDeAmigos(db, yo.id)).map((s) => s.p.nombre)).toEqual(['Dani'])
    // y con Dani amigos: ya no es sugerencia
    await amigos(db, yo.id, dani.id)
    expect(await sugerenciasDeAmigos(db, yo.id)).toEqual([])
  })
})
