import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { claims, guestIdentities, items, lists, users } from '@/db/schema'
import { CUENTAS_COOKIE, firmarInvitado, GUEST_COOKIE, NO_SOY_COOKIE, sumarCuenta } from '@/lib/cookie-invitado'
import { markBought, reserveItem } from '@/lib/claims'
import { addComment } from '@/lib/comments'
import { crearGrupo } from '@/lib/groups'

// Las acciones de identidad tal cual, con la base en PGlite y las cookies, la sesión y las redirecciones de Next simuladas.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  jar: new Map<string, string>(),
  // qué cookies se escribieron, en orden (para ver cuándo se renuevan)
  escritas: [] as string[],
  session: null as { userId: string } | null,
  signIn: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: h.signIn, signOut: h.signOut }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (h.jar.has(k) ? { name: k, value: h.jar.get(k)! } : undefined),
    set: (k: string, v: string) => { h.jar.set(k, v); h.escritas.push(k) },
    delete: (k: string) => { h.jar.delete(k) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
}))

import {
  anotarCuentaAction, codazoAction, entrarConGoogleAction, identificarseAction, noSoyElInvitadoAction, releaseAction, reserveAction,
  salirAction, unirInvitadoAction, verLoReservadoAction,
} from '@/app/actions'
import { getViewer, invitadoDeEsteNavegador, invitadoParaPreguntar } from '@/lib/viewer'
import { getItemForViewer, getListForViewer } from '@/lib/lists'
import { OtraCuenta } from '@/components/Identidad'

async function preparar() {
  h.db = await createTestDb()
  h.jar.clear()
  h.escritas.length = 0
  h.session = null
  h.signIn.mockReset()
  h.signOut.mockReset()
  const seed = await seedOwnerAndGiver(h.db)
  const [item] = await h.db.insert(items).values({ listId: seed.list.id, tipo: 'exacto', titulo: 'Termo' }).returning()
  return { ...seed, item }
}

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

async function redirigeA(p: Promise<unknown>): Promise<string> {
  try { await p } catch (e) { return (e as { url: string }).url }
  throw new Error('esperaba una redirección')
}

test('"¿Quién sos?": con un nombre se anota como invitado (cookie firmada) y pasa a ver la coordinación', async () => {
  const { giver } = await preparar()
  expect(await getViewer()).toEqual({})
  expect((await getListForViewer(h.db, 'tok-euge', await getViewer()))?.role).toBe('anonimo')

  expect(await identificarseAction(null, form({ token: 'tok-euge', nombre: '  Abuela ' }))).toBeNull()
  const [g] = await h.db.select().from(guestIdentities)
  expect(g.nombre).toBe('Abuela')
  expect(h.jar.get(GUEST_COOKIE)).toBe(firmarInvitado(g.id))
  expect(await getViewer()).toEqual({ guestId: g.id })
  expect((await getListForViewer(h.db, 'tok-euge', await getViewer()))?.role).toBe('giver')

  // ya identificado (o con sesión) no se anota de nuevo
  await identificarseAction(null, form({ token: 'tok-euge', nombre: 'Otra' }))
  h.jar.clear()
  h.session = { userId: giver.id }
  await identificarseAction(null, form({ token: 'tok-euge', nombre: 'Otra más' }))
  expect(await h.db.select().from(guestIdentities)).toHaveLength(1)
})

test('un nombre vacío o de más de 60 caracteres vuelve con un mensaje y no anota a nadie', async () => {
  const { item } = await preparar()
  expect(await identificarseAction(null, form({ token: 'tok-euge', nombre: '   ' }))).toEqual({ error: expect.stringContaining('nombre') })
  expect(await identificarseAction(null, form({ token: 'tok-euge', nombre: 'a'.repeat(61) }))).toEqual({ error: expect.stringContaining('60') })
  // reservar desde el diálogo del nombre
  expect(await reserveAction(null, form({ token: 'tok-euge', itemId: item.id, nombre: '  ' }))).toEqual({ error: expect.any(String) })
  // el codazo no anota a nadie: sin decir antes quién es, vuelve con el motivo (aunque mande un nombre)
  expect(await redirigeA(codazoAction(form({ token: 'tok-euge', nombre: 'Abuela' })))).toBe('/l/tok-euge?codazo=sin_identidad#codazo')
  expect(await redirigeA(codazoAction(form({ token: 'tok-euge' })))).toBe('/l/tok-euge?codazo=sin_identidad#codazo')
  // un token inventado tampoco anota a nadie
  expect(await identificarseAction(null, form({ token: 'no-existe', nombre: 'Abuela' }))).toBeNull()
  expect(await redirigeA(codazoAction(form({ token: 'no-existe', nombre: 'Abuela' })))).toBe('/')

  expect(await h.db.select().from(guestIdentities)).toEqual([])
  expect(await h.db.select().from(claims)).toEqual([])
  expect(h.jar.size).toBe(0)
})

test('con el id de un invitado (sin su firma) no se puede hacer pasar por él', async () => {
  const { item } = await preparar()
  expect(await reserveAction(null, form({ token: 'tok-euge', itemId: item.id, nombre: 'Abuela' }))).toBeNull()
  const [c] = await h.db.select().from(claims)
  expect(c.claimerGuestId).not.toBeNull()

  // otro navegador con la cookie vieja (el id pelado) de la abuela
  h.jar.set(GUEST_COOKIE, c.claimerGuestId!)
  expect(await getViewer()).toEqual({})
  await releaseAction(form({ token: 'tok-euge', itemId: item.id, claimId: c.id }))
  const [despues] = await h.db.select().from(claims).where(eq(claims.id, c.id))
  expect(despues.estado).toBe('reservado')
})

test('la cookie de un invitado de antes (giftr_guest, firmada o no) ya no se lee: el nombre nuevo deja volver atrás el deploy', async () => {
  const { item } = await preparar()
  expect(GUEST_COOKIE).not.toBe('giftr_guest')
  await identificarseAction(null, form({ token: 'tok-euge', nombre: 'Abuela' }))
  const [g] = await h.db.select().from(guestIdentities)
  h.jar.clear()
  for (const valor of [g.id, firmarInvitado(g.id)]) {
    h.jar.set('giftr_guest', valor)
    expect(await getViewer()).toEqual({})
  }
  expect(await redirigeA(reserveAction(null, form({ token: 'tok-euge', itemId: item.id })))).toBe('/l/tok-euge?reserva=sin_identidad')
  expect(await h.db.select().from(claims)).toEqual([])
})

test('la cookie de las cuentas se renueva al anotar un invitado: nunca vence antes que la de él', async () => {
  const { owner } = await preparar()
  // Euge entró con Google en la tablet de la familia hace casi un año y la sesión ya venció
  const cuentas = sumarCuenta(undefined, owner.id)
  h.jar.set(CUENTAS_COOKIE, cuentas)
  h.escritas.length = 0
  // la abuela se anota en la lista de Euge desde la tablet: las cuentas se vuelven a escribir, iguales, junto con su cookie
  await identificarseAction(null, form({ token: 'tok-euge', nombre: 'Abuela' }))
  expect(h.escritas).toEqual([GUEST_COOKIE, CUENTAS_COOKIE])
  expect(h.jar.get(CUENTAS_COOKIE)).toBe(cuentas)
  expect(await getListForViewer(h.db, 'tok-euge', await getViewer())).toMatchObject({ role: 'anonimo', motivo: 'otra_cuenta' })

  // sin cuentas anotadas (o con una cookie tocada a mano) no se escribe ninguna
  for (const antes of [undefined, `${owner.id}.firma-falsa`]) {
    h.jar.clear()
    if (antes) h.jar.set(CUENTAS_COOKIE, antes)
    h.escritas.length = 0
    await identificarseAction(null, form({ token: 'tok-euge', nombre: 'Tía' }))
    expect(h.escritas).toEqual([GUEST_COOKIE])
  }
})

test('una sesión que nunca anotó la cuenta (de antes de que se anotaran) la anota al abrir la app, una sola vez', async () => {
  const { owner, giver } = await preparar()
  await anotarCuentaAction()
  expect(h.escritas).toEqual([])
  h.session = { userId: owner.id }
  await anotarCuentaAction()
  await anotarCuentaAction()
  expect(h.escritas).toEqual([CUENTAS_COOKIE])
  // otra cuenta en el mismo navegador se suma a la que estaba
  h.session = { userId: giver.id }
  await anotarCuentaAction()
  h.session = null
  expect(await getViewer()).toEqual({ cuentas: [owner.id, giver.id] })
  // cuando vence la sesión, su lista sigue protegida
  expect(await getListForViewer(h.db, 'tok-euge', await getViewer())).toMatchObject({ role: 'anonimo', motivo: 'otra_cuenta' })
})

test('"¿No sos X? Salir de este dispositivo" borra la cookie de invitado y "Cerrar sesión" cierra la de Google', async () => {
  const { giver } = await preparar()
  await identificarseAction(null, form({ token: 'tok-euge', nombre: 'Abuelo' }))
  expect(h.jar.has(GUEST_COOKIE)).toBe(true)
  expect(await redirigeA(salirAction(form({ volver: '/l/tok-euge' })))).toBe('/l/tok-euge')
  expect(h.jar.has(GUEST_COOKIE)).toBe(false)
  expect(h.signOut).not.toHaveBeenCalled()
  expect(await getViewer()).toEqual({})

  // cerrar sesión deja anotado que esa cuenta usó el navegador
  h.session = { userId: giver.id }
  await salirAction(form({ volver: '/' }))
  expect(h.signOut).toHaveBeenCalledWith({ redirectTo: '/' })
  h.session = null
  expect(await getViewer()).toEqual({ cuentas: [giver.id] })
})

test('si la reserva no sale, vuelve a la página con el motivo (el nombre ya quedó anotado)', async () => {
  const { giver, item: termo, list } = await preparar()
  // Rodri ya compró el Termo; la abuela abre el link sin identificarse y lo ve como cualquier otro deseo
  const r = await reserveItem(h.db, termo.id, { userId: giver.id })
  if (!r.ok) throw new Error(r.reason)
  await h.db.update(claims).set({ estado: 'comprado' })
  expect(await redirigeA(reserveAction(null, form({ token: 'tok-euge', itemId: termo.id, nombre: 'Abuela' }))))
    .toBe('/l/tok-euge?reserva=sin_stock')
  const [abuela] = await h.db.select().from(guestIdentities)
  expect(await getViewer()).toEqual({ guestId: abuela.id })
  expect(await h.db.select().from(claims)).toHaveLength(1)

  // vuelve a la página de donde vino, con sus filtros; desde el detalle, al detalle (si el deseo ya no está, a la lista)
  expect(await redirigeA(reserveAction(null, form({ token: 'tok-euge', itemId: termo.id, volver: '/l/tok-euge?cat=Casa&disp=1' }))))
    .toBe('/l/tok-euge?cat=Casa&disp=1&reserva=sin_stock')
  expect(await redirigeA(reserveAction(null, form({ token: 'tok-euge', itemId: termo.id, volver: `/l/tok-euge/item/${termo.id}` }))))
    .toBe(`/l/tok-euge/item/${termo.id}?reserva=sin_stock`)
  const [velas] = await h.db.insert(items).values({ listId: list.id, tipo: 'idea', titulo: 'Velas', estadoDueno: 'lo_tengo' }).returning()
  expect(await redirigeA(reserveAction(null, form({ token: 'tok-euge', itemId: velas.id, volver: `/l/tok-euge/item/${velas.id}` }))))
    .toBe('/l/tok-euge?reserva=archivado')
  // nunca a otra lista ni a otro sitio
  for (const afuera of ['/l/tok-rodri', '/l/tok-eugenia', 'https://otro.com/l/tok-euge', '//otro.com']) {
    expect(await redirigeA(reserveAction(null, form({ token: 'tok-euge', itemId: termo.id, volver: afuera })))).toBe('/l/tok-euge?reserva=sin_stock')
  }

  // la que sale no redirige; si arriba quedó el cartel de la que no salió, vuelve a la misma página sin él
  const [mate] = await h.db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Mate' }).returning()
  const [taza] = await h.db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Taza' }).returning()
  expect(await reserveAction(null, form({ token: 'tok-euge', itemId: mate.id, volver: '/l/tok-euge' }))).toBeNull()
  expect(await redirigeA(reserveAction(null, form({ token: 'tok-euge', itemId: taza.id, volver: '/l/tok-euge?cat=Casa', conCartel: '1' }))))
    .toBe('/l/tok-euge?cat=Casa')
  expect(await h.db.select().from(claims).where(eq(claims.claimerGuestId, abuela.id))).toHaveLength(2)
})

test('un doble toque en "Reservar" no le dice al que reservó que lo agarró otro', async () => {
  const { item } = await preparar()
  const datos = { token: 'tok-euge', itemId: item.id, volver: '/l/tok-euge', nombre: 'Abuela' }
  expect(await reserveAction(null, form(datos))).toBeNull()
  // el segundo envío llega con la cookie que puso el primero
  expect(await reserveAction(null, form(datos))).toBeNull()
  expect(await h.db.select().from(claims)).toHaveLength(1)
})

test('con sesión en un navegador con un invitado se pregunta "¿Sos vos?" y solo se une si dice que sí', async () => {
  const { giver, item } = await preparar()
  await reserveAction(null, form({ token: 'tok-euge', itemId: item.id, nombre: 'Rodri' }))
  const [g] = await h.db.select().from(guestIdentities)

  // entra con Google ("Me sumo"): todavía no pasa nada, se le pregunta
  h.session = { userId: giver.id }
  expect(await invitadoParaPreguntar(giver.id)).toBe('Rodri')
  expect((await h.db.select().from(claims))[0].claimerGuestId).toBe(g.id)

  await unirInvitadoAction()
  const [c] = await h.db.select().from(claims)
  expect(c).toMatchObject({ claimerUserId: giver.id, claimerGuestId: null })
  expect(h.jar.has(GUEST_COOKIE)).toBe(false)
  expect(await invitadoParaPreguntar(giver.id)).toBeNull()
})

test('"No soy yo": lo del invitado queda como estaba, no se le pregunta más a esa cuenta y al salir vuelve a ser él', async () => {
  const { owner, giver, item } = await preparar()
  // Mamá, como invitada en la tablet de la casa, reserva el Termo de Euge
  await reserveAction(null, form({ token: 'tok-euge', itemId: item.id, nombre: 'Mamá' }))
  const [mama] = await h.db.select().from(guestIdentities)
  const cookieDeMama = h.jar.get(GUEST_COOKIE)

  // A Euge se le pregunta igual que a cualquiera (no importa qué reservó Mamá ni dónde): no le cuenta nada
  h.session = { userId: owner.id }
  expect(await invitadoParaPreguntar(owner.id)).toBe('Mamá')
  const [deRodri] = await h.db.insert(lists).values({ ownerId: giver.id, shareToken: 'tok-rodri' }).returning()
  const [mate] = await h.db.insert(items).values({ listId: deRodri.id, tipo: 'exacto', titulo: 'Mate' }).returning()
  await h.db.delete(claims)
  await reserveItem(h.db, mate.id, { guestId: mama.id })
  expect(await invitadoParaPreguntar(owner.id)).toBe('Mamá')

  await noSoyElInvitadoAction()
  expect(await invitadoParaPreguntar(owner.id)).toBeNull()
  // a otra cuenta en el mismo navegador sí se le pregunta
  expect(await invitadoParaPreguntar(giver.id)).toBe('Mamá')
  const [c] = await h.db.select().from(claims)
  expect(c).toMatchObject({ claimerGuestId: mama.id, claimerUserId: null })
  expect(h.jar.get(GUEST_COOKIE)).toBe(cookieDeMama)

  // Euge cierra sesión: la tablet vuelve a ser de Mamá, que sigue manejando su reserva en la lista de Rodri…
  await salirAction(form({ volver: '/' }))
  expect(h.signOut).toHaveBeenCalled()
  h.session = null
  expect(await getViewer()).toEqual({ guestId: mama.id, cuentas: [owner.id] })
  expect(h.jar.has(NO_SOY_COOKIE)).toBe(true)
  const deRodriVista = await getListForViewer(h.db, 'tok-rodri', await getViewer())
  if (deRodriVista?.role !== 'giver') throw new Error('esperaba giver')
  expect(deRodriVista.items[0].claims[0]).toMatchObject({ claimerNombre: 'Mamá', esMia: true })
  // …pero días después Euge abre su propio link en esa tablet: no se entera de nada (puede ser ella con la cookie de Mamá)
  await reserveItem(h.db, item.id, { guestId: mama.id })
  expect(await getListForViewer(h.db, 'tok-euge', await getViewer())).toMatchObject({ role: 'anonimo', motivo: 'otra_cuenta' })
  expect(await getItemForViewer(h.db, 'tok-euge', item.id, await getViewer())).toMatchObject({ role: 'anonimo', motivo: 'otra_cuenta' })
  expect(await reserveItem(h.db, item.id, await getViewer())).toEqual({ ok: false, reason: 'propio' })
  // y "¿No sos Mamá? Salir de este dispositivo" borra al invitado; lo que usó el navegador queda anotado
  await redirigeA(salirAction(form({ volver: '/' })))
  expect([...h.jar.keys()]).toEqual([CUENTAS_COOKIE])
  expect(await getListForViewer(h.db, 'tok-euge', await getViewer())).toMatchObject({ role: 'anonimo', motivo: 'otra_cuenta' })
})

test('la invitada que ya había reservado en la lista de una cuenta que entró en la tablet: el cartel le dice cómo recuperarlo', async () => {
  const { owner, item } = await preparar()
  // Mamá reserva el Termo de Euge como invitada; Euge entra con Google en la tablet, dice "No soy yo" y cierra sesión
  await reserveAction(null, form({ token: 'tok-euge', itemId: item.id, nombre: 'Mamá' }))
  const [mama] = await h.db.select().from(guestIdentities)
  const [termo] = await h.db.select().from(claims)
  h.session = { userId: owner.id }
  await noSoyElInvitadoAction()
  await salirAction(form({ volver: '/' }))
  h.session = null

  // desde la tablet Mamá ya no ve ni maneja su reserva (puede ser Euge con la cookie de Mamá)
  expect(await getViewer()).toEqual({ guestId: mama.id, cuentas: [owner.id] })
  expect(await getItemForViewer(h.db, 'tok-euge', item.id, await getViewer())).toMatchObject({ role: 'anonimo', motivo: 'otra_cuenta' })
  expect(await markBought(h.db, termo.id, await getViewer())).toEqual({ ok: false, reason: 'no_permitido' })
  // el cartel le dice cómo recuperarlo; es un texto fijo, el mismo para la dueña
  expect(renderToStaticMarkup(createElement(OtraCuenta, { volver: '/l/tok-euge' })))
    .toContain('Si ya habías reservado algo acá con tu nombre, entrá con tu Google y tocá “Sí, soy yo”')

  // entra con su propio Google: a ella sí se le pregunta (el "No soy yo" era de la cuenta de Euge), dice que sí y lo maneja
  const [cuentaDeMama] = await h.db.insert(users).values({ googleId: 'g-mama', nombre: 'Mamá', email: 'mama@test.com' }).returning()
  h.session = { userId: cuentaDeMama.id }
  expect(await invitadoParaPreguntar(cuentaDeMama.id)).toBe('Mamá')
  await unirInvitadoAction()
  const deEuge = await getItemForViewer(h.db, 'tok-euge', item.id, await getViewer())
  if (deEuge?.role !== 'giver') throw new Error('esperaba giver')
  expect(deEuge.item.claims[0]).toMatchObject({ id: termo.id, esMia: true, estado: 'reservado' })
  expect(await markBought(h.db, termo.id, await getViewer())).toEqual({ ok: true })
})

test('la dueña que fue invitada, entra con Google sin contestar "¿Sos vos?" y cierra sesión: en su lista no ve nada', async () => {
  const { owner, giver, item } = await preparar()
  // Euge, sin su sesión, se anota como "Euge" en la lista de Rodri y le da un codazo
  await h.db.insert(lists).values({ ownerId: giver.id, shareToken: 'tok-rodri' })
  await identificarseAction(null, form({ token: 'tok-rodri', nombre: 'Euge' }))
  expect(await redirigeA(codazoAction(form({ token: 'tok-rodri' })))).toMatch(/^\/l\/tok-rodri\?codazo=(avisado|cartel)#codazo$/)
  const [comoInvitada] = await h.db.select().from(guestIdentities)
  // Rodri le reserva el Termo
  await reserveItem(h.db, item.id, { userId: giver.id })
  // entra con Google (el callback anota la cuenta en el navegador), no contesta y cierra sesión
  h.jar.set(CUENTAS_COOKIE, sumarCuenta(undefined, owner.id))
  h.session = { userId: owner.id }
  expect(await invitadoParaPreguntar(owner.id)).toBe('Euge')
  await salirAction(form({ volver: '/' }))
  h.session = null

  expect(await getViewer()).toEqual({ guestId: comoInvitada.id, cuentas: [owner.id] })
  expect(await getListForViewer(h.db, 'tok-euge', await getViewer())).toMatchObject({ role: 'anonimo', motivo: 'otra_cuenta' })
  expect(await reserveItem(h.db, item.id, await getViewer())).toEqual({ ok: false, reason: 'propio' })
  // en la lista de Rodri sigue siendo la invitada de siempre
  expect((await getListForViewer(h.db, 'tok-rodri', await getViewer()))?.role).toBe('giver')
})

test('anotarse en la lista de otro no abre la propia: en cada lista nueva se pregunta "¿Es tu lista?"', async () => {
  const { owner, giver, item } = await preparar()
  const [deRodri] = await h.db.insert(lists).values({ ownerId: giver.id, shareToken: 'tok-rodri' }).returning()
  const [mate] = await h.db.insert(items).values({ listId: deRodri.id, tipo: 'exacto', titulo: 'Mate' }).returning()
  const grupoId = await crearGrupo(h.db, owner.id, { nombre: 'Casa' })
  const [grupo] = await h.db.select().from(lists).where(eq(lists.id, grupoId))
  await reserveItem(h.db, item.id, { userId: giver.id })

  // Euge usa GiftR desde la app de inicio; el link de Rodri se abre en Safari, sin su sesión, y se anota para mirar
  await identificarseAction(null, form({ token: 'tok-rodri', nombre: 'Euge' }))
  expect((await getListForViewer(h.db, 'tok-rodri', await getViewer()))?.role).toBe('giver')
  // en su lista y en la del grupo la ve como dueña hasta que diga que no es suya
  for (const token of ['tok-euge', grupo.shareToken]) {
    expect(await getListForViewer(h.db, token, await getViewer())).toMatchObject({ role: 'anonimo', motivo: 'confirmar' })
  }
  expect(await getItemForViewer(h.db, 'tok-euge', item.id, await getViewer())).toMatchObject({ role: 'anonimo', motivo: 'confirmar' })
  expect(await addComment(h.db, item.id, await getViewer(), 'hola')).toBe(false)

  // otra persona con ese nombre en ese navegador: "No es mía: ver lo reservado", o reservar ahí
  await verLoReservadoAction(form({ token: 'tok-euge' }))
  expect((await getListForViewer(h.db, 'tok-euge', await getViewer()))?.role).toBe('giver')
  await reserveAction(null, form({ token: grupo.shareToken, itemId: mate.id }))
  expect(await getListForViewer(h.db, grupo.shareToken, await getViewer())).toMatchObject({ role: 'anonimo', motivo: 'confirmar' })
  const cafetera = (await h.db.insert(items).values({ listId: grupoId, tipo: 'exacto', titulo: 'Cafetera' }).returning())[0]
  expect(await reserveAction(null, form({ token: grupo.shareToken, itemId: cafetera.id }))).toBeNull()
  expect((await getListForViewer(h.db, grupo.shareToken, await getViewer()))?.role).toBe('giver')
  // sin invitado, "Ver lo reservado" no hace nada
  h.jar.clear()
  await verLoReservadoAction(form({ token: 'tok-rodri' }))
  expect(await getViewer()).toEqual({})
})

test('en Perfil se puede unir el invitado del navegador aunque se haya dicho "No soy yo" por error', async () => {
  const { giver, item } = await preparar()
  await reserveAction(null, form({ token: 'tok-euge', itemId: item.id, nombre: 'Rodri' }))
  h.session = { userId: giver.id }
  await noSoyElInvitadoAction()
  expect(await invitadoParaPreguntar(giver.id)).toBeNull()
  expect(await invitadoDeEsteNavegador()).toBe('Rodri')
  await unirInvitadoAction()
  expect((await h.db.select().from(claims))[0]).toMatchObject({ claimerUserId: giver.id, claimerGuestId: null })
  expect(await invitadoDeEsteNavegador()).toBeNull()
})

test('salir y entrar con Google solo vuelven a páginas de la app', async () => {
  await preparar()
  for (const afuera of ['https://otro.com', '//otro.com', '/\\otro.com', '']) {
    expect(await redirigeA(salirAction(form({ volver: afuera })))).toBe('/')
    await entrarConGoogleAction(form({ volver: afuera }))
    expect(h.signIn).toHaveBeenLastCalledWith('google', { redirectTo: '/' })
  }
  await entrarConGoogleAction(form({ volver: '/l/tok-euge/item/123' }))
  expect(h.signIn).toHaveBeenLastCalledWith('google', { redirectTo: '/l/tok-euge/item/123' })
})
