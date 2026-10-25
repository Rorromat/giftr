import { expect, test } from 'vitest'
import { createECDH, randomBytes } from 'node:crypto'
import { parse as parseUrl } from 'node:url'
import { eq } from 'drizzle-orm'
import { conConsultas, createTestDb } from './helpers'
import { claims, codazos, lists, pushSubs, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { createGuest } from '@/lib/guest'
import { crearGrupo, salirDeGrupo, unirseAGrupo } from '@/lib/groups'
import { createItem } from '@/lib/items'
import {
  avisar, avisosPreguntados, borrarSuscripcion, clavesVapid, codazosSinVer, CODAZOS_DE_INVITADOS_POR_DIA, CODAZOS_POR_DIA, confirmarSuscripcion,
  guardarSuscripcion, mandarCodazo, marcarCodazosVistos, preguntarAvisos, probarAviso, SUSCRIPCIONES_POR_USUARIO, tieneAvisos, type Aviso,
  type Enviar,
} from '@/lib/codazos'
import { estadoAlAbrir, trasPedirPermiso, type NavegadorAvisos } from '@/lib/avisos-del-navegador'

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}
/** Claves como las de un navegador: la pública P-256 sin comprimir (65 bytes) y el secreto de 16. */
const claves = () => {
  const ecdh = createECDH('prime256v1')
  return { p256dh: ecdh.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') }
}
const CLAVES = claves()
const sub = (n: string, host = 'fcm.googleapis.com') => ({ endpoint: `https://${host}/fcm/send/${n}`, keys: CLAVES })

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
  // solo https a los servicios de push de los navegadores: nada de otros sitios ni de la red interna
  for (const endpoint of [
    'https://victima.example/x?n=1', 'https://10.0.0.1:8443/admin', 'https://fcm.googleapis.com.evil.tld/x', 'https://evilfcm.googleapis.com.ar/x',
    'https://fcm.googleapis.com:8443/fcm/send/1', 'https://yo:clave@fcm.googleapis.com/fcm/send/1', 'http://fcm.googleapis.com/fcm/send/1',
    'https://push.apple.com./x', 'no es una url',
  ]) expect(await guardarSuscripcion(db, euge.id, { endpoint, keys: CLAVES }), endpoint).toBe(false)
  // y con claves que sirvan: la pública de 65 bytes (empieza con 0x04) y el secreto de 16 o más
  const otra = claves()
  for (const keys of [
    { p256dh: 'x', auth: otra.auth }, { p256dh: otra.p256dh, auth: 'y' }, { p256dh: randomBytes(65).fill(2, 0, 1).toString('base64url'), auth: otra.auth },
    { p256dh: otra.p256dh, auth: randomBytes(8).toString('base64url') }, { p256dh: `${otra.p256dh}!`, auth: otra.auth },
  ]) expect(await guardarSuscripcion(db, euge.id, { endpoint: sub('x').endpoint, keys }), JSON.stringify(keys)).toBe(false)
  expect(await db.select().from(pushSubs)).toEqual([])
  for (const host of ['updates.push.services.mozilla.com', 'web.push.apple.com', 'wns2-bl2p.notify.windows.com']) {
    expect(await guardarSuscripcion(db, euge.id, sub('1', host)), host).toBe(true)
  }
  await db.delete(pushSubs)
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

test('el host que se controla es el mismo al que web-push se conecta: un %2E no lo cambia por el camino', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge')
  const push = pushFalso()
  // new URL lee "localhost.fcm.googleapis.com" y url.parse (el de web-push) lee "localhost"
  const raros = [
    'https://localhost%2Efcm.googleapis.com/fcm/send/x', 'https://10.0.0.5%2Efcm.googleapis.com/fcm/send/x',
    'https://atacante.example%2Eweb.push.apple.com/x', 'https://FCM.googleapis.com/fcm/send/x', 'https://fcm.googleapis.com/fcm/send/a\u0000b',
    'https://fcm.googleapis.com/fcm/send/a\tb', ' https://fcm.googleapis.com/fcm/send/x', 'https://fcm.googleapis.com\\fcm/send/x',
  ]
  for (const endpoint of raros) {
    // un carácter nulo tampoco llega a Postgres: no hay 500, es que no
    expect(await guardarSuscripcion(db, euge.id, { endpoint, keys: CLAVES }), endpoint).toBe(false)
    expect(await confirmarSuscripcion(db, euge.id, { endpoint, keys: CLAVES }), endpoint).toBe(false)
    await borrarSuscripcion(db, euge.id, endpoint)
  }
  // los que quedaron de antes se borran sin mandarles nada (ni "Probar" ni un codazo les hace un POST)
  await db.insert(pushSubs).values(raros.slice(0, 3).map((endpoint) => ({ userId: euge.id, endpoint, ...CLAVES })))
  expect(await probarAviso(db, euge.id, push.enviar)).toEqual({ ok: true, llegaron: 0 })
  expect(push.enviados).toEqual([])
  expect(await db.select().from(pushSubs)).toEqual([])
  // los de verdad, para los dos parsers el mismo host
  for (const endpoint of [
    'https://fcm.googleapis.com/fcm/send/cX7:APA91bH-abc_d', 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk-x_y=',
    'https://web.push.apple.com/QGuQyavXutnMH', 'https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB%2bvL%2fg%3d%3d',
  ]) {
    expect(parseUrl(endpoint).hostname).toBe(new URL(endpoint).hostname)
    expect(await guardarSuscripcion(db, euge.id, { endpoint, keys: CLAVES }), endpoint).toBe(true)
  }
})

test('como mucho 10 dispositivos por persona: al activar otro se va el más viejo, y avisar limpia lo que no sirve', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge')
  for (let n = 1; n <= SUSCRIPCIONES_POR_USUARIO + 2; n++) {
    await guardarSuscripcion(db, euge.id, sub(String(n)))
    await db.update(pushSubs).set({ createdAt: new Date(Date.now() - (100 - n) * 60_000) }).where(eq(pushSubs.endpoint, sub(String(n)).endpoint))
  }
  // guardar el 12 dejó afuera a los dos más viejos (el 1 se fue al guardar el 11)
  const quedan = async () => (await db.select({ endpoint: pushSubs.endpoint }).from(pushSubs)).map((s) => s.endpoint.split('/').pop()).sort((a, b) => Number(a) - Number(b))
  expect(await quedan()).toEqual(['3', '4', '5', '6', '7', '8', '9', '10', '11', '12'])
  // volver a activar el 3 lo hace el más nuevo: con uno más, se va el 4
  await guardarSuscripcion(db, euge.id, sub('3'))
  await guardarSuscripcion(db, euge.id, sub('13'))
  expect(await quedan()).toEqual(['3', '5', '6', '7', '8', '9', '10', '11', '12', '13'])

  // filas de antes de los controles (otro host, claves basura): avisar las borra sin mandarles nada
  await db.insert(pushSubs).values([
    { userId: euge.id, endpoint: 'https://10.0.0.1:8443/admin', p256dh: CLAVES.p256dh, auth: CLAVES.auth },
    { userId: euge.id, endpoint: sub('basura').endpoint, p256dh: 'x', auth: 'y' },
  ])
  const enviados: string[] = []
  const enviar: Enviar = async (s) => { enviados.push(s.endpoint); return 201 }
  expect(await avisar(db, euge.id, { title: 't', body: 'b', url: '/' }, enviar)).toBe(SUSCRIPCIONES_POR_USUARIO)
  expect(enviados.every((e) => e.startsWith('https://fcm.googleapis.com/'))).toBe(true)
  expect(enviados).not.toContain(sub('basura').endpoint)
  expect(await quedan()).toEqual(['3', '5', '6', '7', '8', '9', '10', '11', '12', '13'])
})

test('los avisos van a todos los dispositivos a la vez: uno lento no hace esperar a los demás', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge')
  for (const n of ['1', '2', '3', '4']) await guardarSuscripcion(db, euge.id, sub(n))
  let enVuelo = 0
  let maximo = 0
  const enviar: Enviar = async () => {
    maximo = Math.max(maximo, ++enVuelo)
    await new Promise((r) => setTimeout(r, 30))
    enVuelo--
    return 201
  }
  expect(await avisar(db, euge.id, { title: 't', body: 'b', url: '/' }, enviar)).toBe(4)
  expect(maximo).toBe(4)
})

test('"Probar": uno por minuto, también con dos toques a la vez', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge')
  await guardarSuscripcion(db, euge.id, sub('1'))
  const enviados: Aviso[] = []
  const enviar: Enviar = async (_, aviso) => { enviados.push(aviso); return 201 }
  const r = await Promise.all([probarAviso(db, euge.id, enviar), probarAviso(db, euge.id, enviar)])
  expect(r).toEqual(expect.arrayContaining([{ ok: true, llegaron: 1 }, { ok: false, reason: 'espera' }]))
  expect(await probarAviso(db, euge.id, enviar)).toEqual({ ok: false, reason: 'espera' })
  expect(enviados).toHaveLength(1)
  expect(enviados[0].title).toBe('👉 Así llega un codazo')
  // pasado el minuto, sí
  await db.update(users).set({ avisoProbadoAt: new Date(Date.now() - 61_000) }).where(eq(users.id, euge.id))
  expect(await probarAviso(db, euge.id, enviar)).toEqual({ ok: true, llegaron: 1 })
})

test('Perfil muestra los avisos activados solo si el servidor los tiene, y si faltaban los vuelve a guardar', async () => {
  const db = await createTestDb()
  const [euge, rodri] = [await usuario(db, 'Euge'), await usuario(db, 'Rodri')]
  const navegador = (suscripcion: object | null, permiso: NotificationPermission = 'granted'): NavegadorAvisos => ({
    soporta: true, pedirInstalar: false, permiso, suscripcion: async () => suscripcion && { toJSON: () => suscripcion },
  })
  const deEuge = (s: unknown) => confirmarSuscripcion(db, euge.id, s)

  // el navegador se suscribió pero guardarla falló (mala señal): al abrir Perfil se guarda y se ve activado
  expect(await tieneAvisos(db, euge.id)).toBe(false)
  expect(await estadoAlAbrir(navegador(sub('tel')), deEuge)).toBe('activado')
  expect(await tieneAvisos(db, euge.id)).toBe(true)
  // ya estaba: sigue activado, sin duplicarse
  expect(await estadoAlAbrir(navegador(sub('tel')), deEuge)).toBe('activado')
  expect(await db.select().from(pushSubs)).toHaveLength(1)
  // el navegador cambió la suscripción y la vieja se borró (410): la nueva se guarda al abrir Perfil
  expect(await estadoAlAbrir(navegador(sub('tel-nueva')), deEuge)).toBe('activado')
  expect((await db.select().from(pushSubs)).map((s) => s.endpoint)).toContain(sub('tel-nueva').endpoint)

  // la de otra cuenta de este navegador no se la saca solo por abrir Perfil: se ve apagado y la toma si activa
  await guardarSuscripcion(db, rodri.id, sub('tablet'))
  expect(await estadoAlAbrir(navegador(sub('tablet')), deEuge)).toBe('apagado')
  expect((await db.select().from(pushSubs).where(eq(pushSubs.endpoint, sub('tablet').endpoint)))[0].userId).toBe(rodri.id)

  // una que no pasa los controles, o el servidor que no contesta: apagado (y se puede activar de nuevo)
  expect(await estadoAlAbrir(navegador({ endpoint: 'https://otro.sitio/x', keys: CLAVES }), deEuge)).toBe('apagado')
  expect(await estadoAlAbrir(navegador(sub('tel')), async () => { throw new Error('Failed to fetch') })).toBe('apagado')
  // sin suscripción, bloqueados, o un navegador que no puede
  expect(await estadoAlAbrir(navegador(null), deEuge)).toBe('apagado')
  expect(await estadoAlAbrir(navegador(sub('tel'), 'denied'), deEuge)).toBe('bloqueado')
  expect(await estadoAlAbrir({ ...navegador(null), soporta: false, pedirInstalar: true }, deEuge)).toBe('ios-instalar')
  expect(await estadoAlAbrir({ ...navegador(null), soporta: false }, deEuge)).toBe('no-soportado')

  // cerrar el cartel de permiso sin elegir no los deja bloqueados: se puede volver a tocar "Activar avisos"
  expect(trasPedirPermiso('default')).toMatchObject({ estado: 'apagado', mensaje: expect.stringContaining('Permitir') })
  expect(trasPedirPermiso('denied')).toEqual({ estado: 'bloqueado' })
  expect(trasPedirPermiso('granted')).toBeNull()
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
  // si Martín sale del grupo, el cartel ya no le aparece (ese grupo ya no lo carga él) y los próximos no le llegan
  expect(await codazosSinVer(db, martin.id)).toHaveLength(1)
  await salirDeGrupo(db, grupoId, martin.id)
  expect(await codazosSinVer(db, martin.id)).toEqual([])

  for (let i = 1; i < CODAZOS_POR_DIA; i++) {
    const u = await usuario(db, `Primo${i}`)
    expect((await mandarCodazo(db, grupo.shareToken, { userId: u.id }, u.nombre, push.enviar)).ok).toBe(true)
  }
  const otro = await usuario(db, 'Uno más')
  expect(await mandarCodazo(db, grupo.shareToken, { userId: otro.id }, 'Uno más', push.enviar)).toEqual({ ok: false, reason: 'muchos' })
  expect(await db.select().from(codazos).where(eq(codazos.paraUserId, martin.id))).toHaveLength(1)
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

test('los topes del codazo valen también con pedidos a la vez', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge')
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  await guardarSuscripcion(db, euge.id, sub('1'))
  const push = pushFalso()
  // la misma persona, desde varias pestañas o un script: uno solo
  const sofi = await usuario(db, 'Sofi')
  const mismos = await Promise.all(Array.from({ length: 6 }, () => mandarCodazo(db, lista.shareToken, { userId: sofi.id }, 'Sofi', push.enviar)))
  expect(mismos.filter((r) => r.ok)).toHaveLength(1)
  expect(mismos.filter((r) => !r.ok).map((r) => !r.ok && r.reason)).toEqual(Array(5).fill('ya_mandaste'))
  // muchos distintos a la vez: no se pasan del tope del día
  const primos = await Promise.all(Array.from({ length: 7 }, (_, i) => usuario(db, `Primo${i}`)))
  const varios = await Promise.all(primos.map((p) => mandarCodazo(db, lista.shareToken, { userId: p.id }, p.nombre, push.enviar)))
  expect(varios.filter((r) => r.ok)).toHaveLength(CODAZOS_POR_DIA - 1)
  expect(await db.select().from(codazos)).toHaveLength(CODAZOS_POR_DIA)
  expect(push.enviados).toHaveLength(CODAZOS_POR_DIA)

  // Lo de arriba pasaría igual sin el lock: PGlite corre las transacciones de a una. En Postgres (Neon) corren a la vez, y
  // lo que hace esperar al segundo hasta que el primero grabó es el lock de la lista, antes de contar.
  const espia = conConsultas(db)
  const tia = await usuario(db, 'Tía')
  await mandarCodazo(espia.db, lista.shareToken, { userId: tia.id }, 'Tía', push.enviar)
  const lock = espia.consultas.findIndex((q) => /from "lists" .*for no key update/i.test(q))
  const cuenta = espia.consultas.findIndex((q) => /count\(/i.test(q) && q.includes('"codazos"'))
  expect(lock).toBeGreaterThanOrEqual(0)
  expect(lock).toBeLessThan(cuenta)
})

test('los invitados (cada navegador sin cookie es uno nuevo) no les sacan el lugar a los que tienen cuenta', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge')
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  const push = pushFalso()
  // alguien abre el link desde varias apps y pone un nombre en cada una
  const resultados = []
  for (let i = 0; i < CODAZOS_DE_INVITADOS_POR_DIA + 2; i++) {
    const g = await createGuest(db, `Pepe ${i}`)
    resultados.push(await mandarCodazo(db, lista.shareToken, { guestId: g.id }, `Pepe ${i}`, push.enviar))
  }
  expect(resultados.map((r) => r.ok)).toEqual([...Array(CODAZOS_DE_INVITADOS_POR_DIA).fill(true), false, false])
  expect(resultados.at(-1)).toEqual({ ok: false, reason: 'muchos' })
  // los amigos con cuenta tienen su lugar hasta el tope del día
  for (let i = CODAZOS_DE_INVITADOS_POR_DIA; i < CODAZOS_POR_DIA; i++) {
    const u = await usuario(db, `Amiga${i}`)
    expect((await mandarCodazo(db, lista.shareToken, { userId: u.id }, u.nombre, push.enviar)).ok).toBe(true)
  }
  const otra = await usuario(db, 'Una más')
  expect(await mandarCodazo(db, lista.shareToken, { userId: otra.id }, 'Una más', push.enviar)).toEqual({ ok: false, reason: 'muchos' })
})

test('el cartel de los avisos, una sola vez: a quien ya pasó la bienvenida, sin avisos activados y sin habérselo preguntado', async () => {
  const db = await createTestDb()
  const [nuevo, viejo, conAvisos] = [await usuario(db, 'Nuevo'), await usuario(db, 'Viejo'), await usuario(db, 'ConAvisos')]
  await db.update(users).set({ bienvenidaAt: new Date() }).where(eq(users.id, viejo.id))
  await db.update(users).set({ bienvenidaAt: new Date() }).where(eq(users.id, conAvisos.id))
  await guardarSuscripcion(db, conAvisos.id, sub('con-avisos'))
  // el nuevo todavía no pasó la bienvenida (ahí se le pregunta); el que ya los tiene, no hace falta
  expect(await preguntarAvisos(db, nuevo.id)).toBe(false)
  expect(await preguntarAvisos(db, conAvisos.id)).toBe(false)
  expect(await preguntarAvisos(db, viejo.id)).toBe(true)
  // una vez mostrado, no vuelve; y anotarlo de nuevo no cambia cuándo fue
  await avisosPreguntados(db, viejo.id)
  const [{ cuando }] = await db.select({ cuando: users.avisosPreguntadosAt }).from(users).where(eq(users.id, viejo.id))
  expect(cuando).toBeInstanceOf(Date)
  expect(await preguntarAvisos(db, viejo.id)).toBe(false)
  await avisosPreguntados(db, viejo.id)
  expect((await db.select({ cuando: users.avisosPreguntadosAt }).from(users).where(eq(users.id, viejo.id)))[0].cuando).toEqual(cuando)
  // si desactiva los avisos después, tampoco: ya se le preguntó
  await db.delete(pushSubs).where(eq(pushSubs.userId, conAvisos.id))
  await avisosPreguntados(db, conAvisos.id)
  expect(await preguntarAvisos(db, conAvisos.id)).toBe(false)
})
