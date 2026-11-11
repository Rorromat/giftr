import { randomUUID } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq, sql } from 'drizzle-orm'
import { conConsultas, createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { claims, guestIdentities, items, lists, users } from '@/db/schema'
import { reserveItem } from '@/lib/claims'
import { cambiarLinkParaRegalar } from '@/lib/lists'

// El invitado sin cuenta: cuántos se pueden anotar (por lista y por navegador) y el link para volver a su reserva desde
// otro teléfono. Las acciones, el route del link y las páginas tal cual, con la base en PGlite y lo de Next simulado.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  jar: new Map<string, string>(),
  session: null as { userId: string } | null,
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (h.jar.has(k) ? { name: k, value: h.jar.get(k)! } : undefined),
    set: (k: string, v: string) => { h.jar.set(k, v) },
    delete: (k: string) => { h.jar.delete(k) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  RedirectType: { push: 'push', replace: 'replace' },
}))
vi.mock('@/components/Banners', () => ({ Banners: () => null }))

import { identificarseAction, reserveAction, salirAction } from '@/app/actions'
import {
  anotadosHoy, claveParaVolver, CUENTAS_COOKIE, firmarInvitado, GUEST_COOKIE, INVITADOS_POR_NAVEGADOR, leerClaveParaVolver,
  leerInvitado, pareceClaveParaVolver, sumarAnotado, sumarCuenta,
} from '@/lib/cookie-invitado'
import { anotarInvitado, createGuest, INVITADOS_POR_LISTA_Y_DIA, invitadoQueVuelve, linkParaVolver, unirInvitadoACuenta } from '@/lib/guest'
import { getListForViewer } from '@/lib/lists'
import { getViewer, invitadoParaPreguntar } from '@/lib/viewer'
import { ReservaConfirmada } from '@/components/ReservaConfirmada'
import { GET as volver } from '@/app/l/[token]/volver/[clave]/route'
import VolverAMiReserva from '@/app/l/[token]/volver/page'
import ListaAjena from '@/app/l/[token]/page'
import DetalleItem from '@/app/l/[token]/item/[itemId]/page'

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}
async function redirigeA(p: Promise<unknown>): Promise<string> {
  try { await p } catch (e) { return (e as { url: string }).url }
  throw new Error('esperaba una redirección')
}
const abrirLink = (clave: string, token = 'tok-euge') =>
  redirigeA(volver(new Request(`https://giftr.test/l/${token}/volver/${clave}`), { params: Promise.resolve({ token, clave }) }))
const lista = async (query: Record<string, string> = {}) =>
  renderToStaticMarkup(await ListaAjena({ params: Promise.resolve({ token: 'tok-euge' }), searchParams: Promise.resolve(query) }))
const deseo = async (itemId: string) =>
  renderToStaticMarkup(await DetalleItem({ params: Promise.resolve({ token: 'tok-euge', itemId }), searchParams: Promise.resolve({}) }))
const noSePudo = async (query: Record<string, string>) =>
  renderToStaticMarkup(await VolverAMiReserva({ params: Promise.resolve({ token: 'tok-euge' }), searchParams: Promise.resolve(query) }))

async function preparar() {
  h.db = await createTestDb()
  h.jar.clear()
  h.session = null
  const seed = await seedOwnerAndGiver(h.db)
  const [termo, mate] = await h.db.insert(items).values([
    { listId: seed.list.id, tipo: 'exacto', titulo: 'Termo' }, { listId: seed.list.id, tipo: 'exacto', titulo: 'Mate' },
  ]).returning()
  return { ...seed, db: h.db, termo, mate }
}

/** La abuela reserva el Termo con su nombre desde el navegador de WhatsApp. Devuelve su id y su clave para volver. */
async function abuelaReserva(s: Awaited<ReturnType<typeof preparar>>) {
  await reserveAction(null, form({ token: 'tok-euge', itemId: s.termo.id, nombre: 'Abuela' }))
  const guestId = leerInvitado(h.jar.get(GUEST_COOKIE))!
  return { guestId, clave: claveParaVolver(guestId, s.list.id), cookie: h.jar.get(GUEST_COOKIE)! }
}

// ---------- Tope de invitados ----------

test(`en una lista se anotan hasta ${INVITADOS_POR_LISTA_Y_DIA} invitados nuevos por día; el siguiente no, y en otra lista sí`, async () => {
  const s = await preparar()
  const [otra] = await s.db.insert(lists).values({ ownerId: s.giver.id, shareToken: 'tok-rodri' }).returning()
  for (let i = 0; i < INVITADOS_POR_LISTA_Y_DIA; i++) expect(await anotarInvitado(s.db, `Primo ${i}`, s.list.id)).not.toBeNull()
  expect(await anotarInvitado(s.db, 'Uno más', s.list.id)).toBeNull()
  expect(await s.db.select().from(guestIdentities)).toHaveLength(INVITADOS_POR_LISTA_Y_DIA)
  // la de Rodri no tiene nada que ver
  const enOtra = await anotarInvitado(s.db, 'Uno más', otra.id)
  expect(enOtra).not.toBeNull()
  // anotarse ahí es decir que no es suya: la ve
  expect((await getListForViewer(s.db, 'tok-rodri', { guestId: enOtra!.id }))?.role).toBe('giver')
  // los invitados de antes de que hubiera tope (createGuest: sin lista) no cuentan
  await createGuest(s.db, 'De antes')

  // al otro día vuelve a haber lugar
  await s.db.update(guestIdentities).set({ createdAt: sql`now() - interval '25 hours'` }).where(eq(guestIdentities.anotadoEn, s.list.id))
  expect(await anotarInvitado(s.db, 'Uno más', s.list.id)).not.toBeNull()
  // un nombre sin validar no pasa, y una lista que no existe no anota a nadie
  await expect(anotarInvitado(s.db, '   ', s.list.id)).rejects.toThrow()
  expect(await anotarInvitado(s.db, 'Nadie', randomUUID())).toBeNull()
})

test('la cuenta de los que se anotaron hoy se hace con la lista bloqueada: cien pedidos a la vez no pasan todos', async () => {
  const s = await preparar()
  const { db, consultas } = conConsultas(s.db)
  await anotarInvitado(db, 'Abuela', s.list.id)
  const bloqueo = consultas.findIndex((q) => /from "lists".*for no key update/i.test(q))
  const cuenta = consultas.findIndex((q) => /count\(\*\).*from "guest_identities"/i.test(q))
  const alta = consultas.findIndex((q) => /insert into "guest_identities"/i.test(q))
  expect(bloqueo).toBeGreaterThanOrEqual(0)
  expect(cuenta).toBeGreaterThan(bloqueo)
  expect(alta).toBeGreaterThan(cuenta)
})

test('con el tope de la lista lleno, anotarse o reservar con un nombre vuelve con el mensaje y no deja cookie; con cuenta se reserva igual', async () => {
  const s = await preparar()
  for (let i = 0; i < INVITADOS_POR_LISTA_Y_DIA; i++) await anotarInvitado(s.db, `Primo ${i}`, s.list.id)
  const mensaje = { error: 'Hoy ya se anotó mucha gente en esta lista: entrá con Google para reservar.' }
  expect(await identificarseAction(null, form({ token: 'tok-euge', nombre: 'Abuela' }))).toEqual(mensaje)
  expect(await reserveAction(null, form({ token: 'tok-euge', itemId: s.termo.id, nombre: 'Abuela' }))).toEqual(mensaje)
  expect(h.jar.size).toBe(0)
  expect(await s.db.select().from(claims)).toEqual([])
  expect(await getViewer()).toEqual({})

  h.session = { userId: s.giver.id }
  expect(await reserveAction(null, form({ token: 'tok-euge', itemId: s.termo.id }))).toBeNull()
  expect(await s.db.select().from(claims)).toMatchObject([{ claimerUserId: s.giver.id, estado: 'reservado' }])
})

test('un navegador que ya tiene su invitado sigue con ese: mandar otro nombre no anota a otro', async () => {
  const s = await preparar()
  await reserveAction(null, form({ token: 'tok-euge', itemId: s.termo.id, nombre: 'Abuela' }))
  const cookie = h.jar.get(GUEST_COOKIE)
  await reserveAction(null, form({ token: 'tok-euge', itemId: s.mate.id, nombre: 'Otro nombre' }))
  await identificarseAction(null, form({ token: 'tok-euge', nombre: 'Y otro' }))
  expect(await s.db.select().from(guestIdentities)).toMatchObject([{ nombre: 'Abuela', anotadoEn: s.list.id }])
  expect(h.jar.get(GUEST_COOKIE)).toBe(cookie)
  expect((await s.db.select().from(claims)).every((c) => c.claimerGuestId === leerInvitado(cookie))).toBe(true)
})

test(`"¿No sos X?" y otro nombre: desde un navegador se anotan hasta ${INVITADOS_POR_NAVEGADOR} por día`, async () => {
  const s = await preparar()
  for (let i = 0; i < INVITADOS_POR_NAVEGADOR; i++) {
    expect(await identificarseAction(null, form({ token: 'tok-euge', nombre: `Primo ${i}` }))).toBeNull()
    await redirigeA(salirAction(form({ volver: '/l/tok-euge' })))
  }
  expect(await identificarseAction(null, form({ token: 'tok-euge', nombre: 'Uno más' })))
    .toEqual({ error: 'Hoy ya se anotó mucha gente desde este dispositivo: entrá con Google para reservar.' })
  expect(await reserveAction(null, form({ token: 'tok-euge', itemId: s.termo.id, nombre: 'Uno más' }))).toEqual({ error: expect.stringContaining('entrá con Google') })
  expect(await s.db.select().from(guestIdentities)).toHaveLength(INVITADOS_POR_NAVEGADOR)
  expect(h.jar.has(GUEST_COOKIE)).toBe(false)

  // otro navegador (otra persona con el mismo link) se anota sin problema
  h.jar.clear()
  expect(await identificarseAction(null, form({ token: 'tok-euge', nombre: 'Tía' }))).toBeNull()
})

test('la cuenta del navegador va firmada y es de un día: tocada a mano o de ayer, no cuenta', () => {
  const uno = sumarAnotado(undefined, '2026-11-11')
  expect(anotadosHoy(uno, '2026-11-11')).toBe(1)
  expect(anotadosHoy(sumarAnotado(uno, '2026-11-11'), '2026-11-11')).toBe(2)
  // al otro día empieza de nuevo
  expect(anotadosHoy(uno, '2026-11-12')).toBe(0)
  expect(anotadosHoy(sumarAnotado(uno, '2026-11-12'), '2026-11-12')).toBe(1)
  for (const mala of [undefined, '', 'basura', uno.replace('~1.', '~0.'), `2026-11-11~0.${uno.split('.')[1]}`]) {
    expect(anotadosHoy(mala, '2026-11-11')).toBe(0)
  }
})

// ---------- El link para volver a su reserva ----------

test('la clave para volver es de ese invitado y de esa lista: otra lista, otro invitado o un carácter cambiado no pasan', () => {
  const [abuela, tia, lista1, lista2] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  const clave = claveParaVolver(abuela, lista1)
  expect(pareceClaveParaVolver(clave)).toBe(true)
  expect(leerClaveParaVolver(clave, lista1)).toBe(abuela)
  expect(leerClaveParaVolver(clave, lista2)).toBeNull()
  // el id de la tía con la firma de la abuela: no se convierte en la tía
  expect(leerClaveParaVolver(tia.replaceAll('-', '') + clave.slice(32), lista1)).toBeNull()
  // cortada al copiarla, con algo de más, vacía
  for (const mala of [clave.slice(0, -1), `${clave}a`, clave.slice(1), '', undefined, 'no-es-una-clave', `${abuela}.${clave.slice(32)}`]) {
    expect(leerClaveParaVolver(mala, lista1)).toBeNull()
  }
  // no es la firma de la cookie: con la clave no se arma la cookie a mano, ni al revés
  expect(firmarInvitado(abuela)).not.toContain(clave.slice(32))
  expect(leerInvitado(`${abuela}.${clave.slice(32)}`)).toBeNull()
})

test('en otro teléfono, el link le vuelve a poner su cookie y la deja en la lista, con su reserva', async () => {
  const s = await preparar()
  const abuela = await abuelaReserva(s)
  // abre la lista en Chrome: sin cookie, no es nadie y no puede manejar su reserva
  h.jar.clear()
  expect(await getViewer()).toEqual({})
  const antes = await s.db.select().from(guestIdentities)

  expect(await abrirLink(abuela.clave)).toBe('/l/tok-euge')
  expect(h.jar.get(GUEST_COOKIE)).toBe(abuela.cookie)
  expect(await getViewer()).toEqual({ guestId: abuela.guestId })
  const vista = await getListForViewer(s.db, 'tok-euge', await getViewer())
  if (vista?.role !== 'giver') throw new Error('la abuela ve la coordinación')
  expect(vista.items.find((i) => i.id === s.termo.id)?.claims).toMatchObject([{ esMia: true, estado: 'reservado' }])
  // es un GET: no escribe nada en la base (lo abre también la vista previa de WhatsApp)
  expect(await s.db.select().from(guestIdentities)).toEqual(antes)
  // abrirlo de nuevo en el mismo navegador no cambia nada
  expect(await abrirLink(abuela.clave)).toBe('/l/tok-euge')
  expect(h.jar.get(GUEST_COOKIE)).toBe(abuela.cookie)
})

test('un link que no es de un invitado de esa lista no pone ninguna cookie', async () => {
  const s = await preparar()
  const abuela = await abuelaReserva(s)
  const [otra] = await s.db.insert(lists).values({ ownerId: s.giver.id, shareToken: 'tok-rodri' }).returning()
  h.jar.clear()

  const no = '/l/tok-euge/volver?motivo=no'
  // tocado a mano, de alguien que no existe, de un invitado que nunca abrió esta lista
  expect(await abrirLink(`${abuela.clave.slice(0, -2)}xx`)).toBe(no)
  expect(await abrirLink(claveParaVolver(randomUUID(), s.list.id))).toBe(no)
  const tia = await createGuest(s.db, 'Tía')
  expect(await abrirLink(claveParaVolver(tia.id, s.list.id))).toBe(no)
  expect(await invitadoQueVuelve(s.db, 'tok-euge', claveParaVolver(tia.id, s.list.id))).toBeNull()
  // el de la abuela, por el link de otra lista (aunque la clave se arme para esa: ahí no reservó nada)
  expect(await abrirLink(abuela.clave, 'tok-rodri')).toBe('/l/tok-rodri/volver?motivo=no')
  expect(await abrirLink(claveParaVolver(abuela.guestId, otra.id), 'tok-rodri')).toBe('/l/tok-rodri/volver?motivo=no')
  expect(await abrirLink(abuela.clave, 'no-existe')).toBe('/l/no-existe/volver?motivo=no')
  expect(h.jar.size).toBe(0)

  // si la dueña cambia el link para regalar, el de volver se va con él
  await cambiarLinkParaRegalar(s.db, s.list.id, s.owner.id)
  expect(await abrirLink(abuela.clave)).toBe(no)
  expect(h.jar.size).toBe(0)
})

test('cuando pasó su reserva a su cuenta, el link ya no sirve: se entra con Google', async () => {
  const s = await preparar()
  const abuela = await abuelaReserva(s)
  await unirInvitadoACuenta(s.db, abuela.guestId, s.giver.id)
  h.jar.clear()
  expect(await abrirLink(abuela.clave)).toBe('/l/tok-euge/volver?motivo=no')
  expect(h.jar.size).toBe(0)
  const html = await noSePudo({ motivo: 'no' })
  expect(html).toContain('Ese link para volver ya no sirve')
  expect(html).toContain('Entrar con Google')
  expect(html).toContain('href="/l/tok-euge"')
  // no dice de quién era ni qué había reservado
  expect(html).not.toMatch(/Abuela|Termo/)
  // el aviso de una lista que no existe: no está
  await expect(VolverAMiReserva({ params: Promise.resolve({ token: 'no-existe' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
})

test('no pisa a otro invitado de ese navegador: se le avisa, y si sale de ese nombre el link lo trae', async () => {
  const s = await preparar()
  const abuela = await abuelaReserva(s)
  // la tablet de la familia, donde está anotada la tía (con su propia reserva)
  h.jar.clear()
  await reserveAction(null, form({ token: 'tok-euge', itemId: s.mate.id, nombre: 'Tía Marta' }))
  const deLaTia = h.jar.get(GUEST_COOKIE)!

  const aviso = `/l/tok-euge/volver?motivo=otro&clave=${abuela.clave}`
  expect(await abrirLink(abuela.clave)).toBe(aviso)
  expect(h.jar.get(GUEST_COOKIE)).toBe(deLaTia)
  const html = await noSePudo({ motivo: 'otro', clave: abuela.clave })
  expect(html).toContain('Acá ya está anotado “Tía Marta”')
  expect(html).toContain('¿No sos Tía Marta?')
  // "Salir igual" vuelve al link (y solo a un link con forma de clave: no a cualquier lado)
  expect(html).toContain(`name="volver" value="/l/tok-euge/volver/${abuela.clave}"`)
  expect(await noSePudo({ motivo: 'otro', clave: '../../perfil' })).toContain('Ese link para volver ya no sirve')

  expect(await redirigeA(salirAction(form({ volver: `/l/tok-euge/volver/${abuela.clave}` })))).toBe(`/l/tok-euge/volver/${abuela.clave}`)
  expect(await abrirLink(abuela.clave)).toBe('/l/tok-euge')
  expect(h.jar.get(GUEST_COOKIE)).toBe(abuela.cookie)
  // y el aviso, si quedó abierto, ya no tiene a quién nombrar: de nuevo al link
  h.jar.delete(GUEST_COOKIE)
  expect(await redirigeA(noSePudo({ motivo: 'otro', clave: abuela.clave }))).toBe(`/l/tok-euge/volver/${abuela.clave}`)
})

test('a la dueña el link no le sirve para mirar: con su sesión va a Mi lista, y sin ella, en un navegador donde entró, no ve nada', async () => {
  const s = await preparar()
  const abuela = await abuelaReserva(s)

  // en un navegador donde Euge tuvo sesión (cerró sesión en la tablet): la cookie queda, pero la lista no muestra nada
  h.jar.clear()
  h.jar.set(CUENTAS_COOKIE, sumarCuenta(undefined, s.owner.id))
  expect(await abrirLink(abuela.clave)).toBe('/l/tok-euge')
  expect(await getListForViewer(s.db, 'tok-euge', await getViewer())).toMatchObject({ role: 'anonimo', motivo: 'otra_cuenta' })
  expect(await lista()).not.toMatch(/Reservado|Lo reservaste|Ya lo reservaste|Tuyo hasta|Guardate este link/)

  // con su sesión (una de antes, que nunca anotó la cuenta en este navegador): el link la anota, y su lista es Mi lista
  h.jar.clear()
  h.session = { userId: s.owner.id }
  expect(await abrirLink(abuela.clave)).toBe('/l/tok-euge')
  await expect(lista()).rejects.toMatchObject({ url: '/mi-lista' })
  // cuando se le vence la sesión, sigue sin ver nada
  h.session = null
  expect(await getListForViewer(s.db, 'tok-euge', await getViewer())).toMatchObject({ role: 'anonimo', motivo: 'otra_cuenta' })
})

test('si el link cae en un navegador con sesión de Google, se le pregunta "¿Sos vos?" y con "Sí, soy yo" la reserva pasa a la cuenta', async () => {
  const s = await preparar()
  const abuela = await abuelaReserva(s)
  const [nieta] = await s.db.insert(users).values({ googleId: 'g-nieta', nombre: 'Cami', email: 'cami@test.com' }).returning()
  h.jar.clear()
  h.session = { userId: nieta.id }
  expect(await abrirLink(abuela.clave)).toBe('/l/tok-euge')
  // nunca se une sola
  expect(await getViewer()).toEqual({ userId: nieta.id })
  expect((await s.db.select().from(claims))[0]).toMatchObject({ claimerGuestId: abuela.guestId, claimerUserId: null })
  expect(await invitadoParaPreguntar(nieta.id)).toBe('Abuela')
  expect(await lista()).toContain('En este navegador se anotó “Abuela”. ¿Sos vos?')
})

test('el link se ofrece al invitado sin cuenta, en el cartel de recién reservado y en el deseo; con cuenta no hace falta', async () => {
  const s = await preparar()
  const abuela = await abuelaReserva(s)
  const link = `/l/tok-euge/volver/${abuela.clave}`
  expect(linkParaVolver({ guestId: abuela.guestId }, s.list.id, 'tok-euge')).toBe(link)
  expect(linkParaVolver({ userId: s.giver.id }, s.list.id, 'tok-euge')).toBeUndefined()
  expect(linkParaVolver({}, s.list.id, 'tok-euge')).toBeUndefined()

  const cartel = await lista({ reservado: s.termo.id })
  expect(cartel).toContain('Guardate este link para volver a tu reserva desde otro teléfono')
  expect(cartel).toContain('Copiar link')
  expect(cartel).toContain('Mandármelo por WhatsApp')
  expect(cartel).toContain(`https://wa.me/?text=${encodeURIComponent(`Mi link para volver a lo que reservé en GiftR (es solo para mí):\n${link}`)}`)
  // sin el cartel (otro día, mirando la lista), no va en cada tarjeta: está en el deseo
  expect(await lista()).not.toContain('Guardate este link')
  expect(await deseo(s.termo.id)).toContain('Guardate este link para volver a tu reserva desde otro teléfono')
  // en un deseo que no reservó, no
  expect(await deseo(s.mate.id)).not.toContain('Guardate este link')

  // Rodri, con su cuenta: entra con Google desde donde sea
  h.jar.clear()
  h.session = { userId: s.giver.id }
  await reserveItem(s.db, s.mate.id, { userId: s.giver.id })
  expect(await lista({ reservado: s.mate.id })).not.toContain('Guardate este link')
  expect(await deseo(s.mate.id)).not.toContain('Guardate este link')
  // y el componente, sin link, queda como antes
  expect(renderToStaticMarkup(ReservaConfirmada({ vence: null }))).not.toContain('Guardate')
  expect(renderToStaticMarkup(ReservaConfirmada({ vence: null, recuperar: 'https://giftr.test/l/t/volver/x' }))).toContain('Mandármelo por WhatsApp')
})
