import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { comments, items, lists, users } from '@/db/schema'
import { markBought, reserveItem } from '@/lib/claims'
import { addComment } from '@/lib/comments'
import { crearGrupo } from '@/lib/groups'
import { anotarInvitado } from '@/lib/guest'
import { historialDeLista, iniciarRegaloGrupal, regalosDeItem, sumarseARegalo } from '@/lib/regalos'
import { itemParaCompartir, listaParaCompartir } from '@/lib/compartir'
import { asegurarListaPropia, upsertUserFromGoogle } from '@/lib/users'
import { veQuienReservo } from '@/lib/acceso'

// "Solo con cuenta se ve quién reservó": con la opción prendida, el invitado sin cuenta ve qué está ocupado y nada más.
// La regla de la sorpresa era de honor: la dueña abría su link en una ventana privada, se anotaba como "Tía" y veía todo.
// Las vistas (lo que sale del servidor) y las páginas tal cual, con la base en PGlite y la sesión y las cookies simuladas.
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

import { commentAction, nombresSoloConCuentaAction } from '@/app/actions'
import { firmarInvitado, GUEST_COOKIE } from '@/lib/cookie-invitado'
import { getItemForViewer, getListForViewer, guardarNombresSoloConCuenta, nombresSoloConCuenta } from '@/lib/lists'
import { AjusteSoloConCuenta } from '@/components/SoloConCuenta'
import ListaAjena from '@/app/l/[token]/page'
import DetalleItem from '@/app/l/[token]/item/[itemId]/page'

const lista = async () =>
  renderToStaticMarkup(await ListaAjena({ params: Promise.resolve({ token: 'tok-euge' }), searchParams: Promise.resolve({}) }))
const deseo = async (itemId: string) =>
  renderToStaticMarkup(await DetalleItem({ params: Promise.resolve({ token: 'tok-euge', itemId }), searchParams: Promise.resolve({}) }))
function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

/**
 * La lista de Euge con la opción prendida. Rodri (con cuenta) reservó el Termo; Sofi compró el Mate y anotó qué; Rodri y
 * Sofi arman un regalo grupal de la Bici; en el hilo del Termo hay un comentario. La Tía entra sin cuenta, con su nombre,
 * y reserva el Libro.
 */
async function preparar() {
  h.db = await createTestDb()
  h.jar.clear()
  h.session = null
  const db = h.db
  const seed = await seedOwnerAndGiver(db)
  const [sofi] = await db.insert(users).values({ googleId: 'g-sofi', nombre: 'Sofi', email: 'sofi@test.com' }).returning()
  const [termo, mate, bici, libro, lampara] = await db.insert(items).values(
    ['Termo', 'Mate', 'Bici', 'Libro', 'Lámpara'].map((titulo) => ({ listId: seed.list.id, tipo: 'exacto' as const, titulo })),
  ).returning()
  await reserveItem(db, termo.id, { userId: seed.giver.id })
  const delMate = await reserveItem(db, mate.id, { userId: sofi.id })
  if (!delMate.ok) throw new Error(delMate.reason)
  await markBought(db, delMate.claimId, { userId: sofi.id }, 'el de calabaza, con Pilar')
  const grupal = await iniciarRegaloGrupal(db, bici.id, seed.giver.id)
  if (!grupal.ok) throw new Error(grupal.reason)
  await sumarseARegalo(db, grupal.giftId, sofi.id)
  await addComment(db, termo.id, { userId: seed.giver.id }, 'lo busco el sábado en Palermo')
  const tia = (await anotarInvitado(db, 'Tía Marta', seed.list.id))!
  await reserveItem(db, libro.id, { guestId: tia.id })
  await guardarNombresSoloConCuenta(db, seed.list.id, seed.owner.id, true)
  return { ...seed, db, sofi, termo, mate, bici, libro, lampara, tia: { guestId: tia.id } }
}

// lo que no le toca ver al invitado: quién reservó, quién compró y qué anotó, quiénes están en el grupal, el hilo
const SECRETOS = ['Rodri', 'Sofi', 'calabaza', 'Pilar', 'Palermo']

test('EL TEST DE ORO, sin cuenta: con la opción prendida, la vista de la lista dice qué está ocupado pero no por quién', async () => {
  const s = await preparar()
  const vista = await getListForViewer(s.db, 'tok-euge', s.tia)
  if (vista?.role !== 'giver') throw new Error('la tía ve la coordinación')
  expect(vista.sinNombres).toBe(true)
  const json = JSON.stringify(vista)
  for (const secreto of SECRETOS) expect(json).not.toContain(secreto)

  const de = (id: string) => vista.items.find((i) => i.id === id)!
  // sigue viendo qué está libre y qué no
  expect(Object.fromEntries(vista.items.map((i) => [i.titulo, i.disponible])))
    .toEqual({ Termo: false, Mate: false, Bici: false, Libro: false, Lámpara: true })
  expect(de(s.termo.id).claims).toMatchObject([{ estado: 'reservado', claimerNombre: null, esMia: false, notaQueCompre: null, grupal: null }])
  expect(de(s.mate.id).claims).toMatchObject([{ estado: 'comprado', claimerNombre: null, notaQueCompre: null }])
  // el regalo grupal: cuántos son, sin nombres
  expect(de(s.bici.id).claims[0].grupal).toMatchObject({ cuantos: 2, personas: [], soyParte: false })
  // lo suyo, sí, con su vencimiento
  expect(de(s.libro.id).claims).toMatchObject([{ claimerNombre: 'Tía Marta', esMia: true, vence: expect.any(Date) }])
  // y el historial de quién compró qué no es para ella
  expect(await historialDeLista(s.db, s.list.id, s.tia)).toBeNull()
  expect(await veQuienReservo(s.db, s.list.id, s.tia)).toBe(false)
})

test('EL TEST DE ORO, sin cuenta: el detalle de un deseo no trae nombres, ni el hilo, ni el regalo grupal', async () => {
  const s = await preparar()
  for (const id of [s.termo.id, s.mate.id, s.bici.id, s.libro.id]) {
    const d = await getItemForViewer(s.db, 'tok-euge', id, s.tia)
    if (d?.role !== 'giver') throw new Error('la tía ve la coordinación')
    expect(d.sinNombres).toBe(true)
    expect(d.comments).toEqual([])
    expect(d.regalos).toEqual([])
    const json = JSON.stringify(d)
    for (const secreto of SECRETOS) expect(json).not.toContain(secreto)
  }
  // llamado directo, también: los regalos grupales de un deseo, con sus miembros y sus montos
  expect(await regalosDeItem(s.db, s.bici.id, s.tia)).toEqual([])
  expect(await regalosDeItem(s.db, s.bici.id, { userId: s.sofi.id })).toHaveLength(1)
})

test('con cuenta se ve todo como siempre; y el dueño, nada, como siempre', async () => {
  const s = await preparar()
  const [pedro] = await s.db.insert(users).values({ googleId: 'g-pedro', nombre: 'Pedro', email: 'pedro@test.com' }).returning()
  const vista = await getListForViewer(s.db, 'tok-euge', { userId: pedro.id })
  if (vista?.role !== 'giver') throw new Error('Pedro ve la coordinación')
  expect(vista.sinNombres).toBe(false)
  const quien = (id: string) => vista.items.find((i) => i.id === id)!.claims.map((c) => c.claimerNombre)
  expect([quien(s.termo.id), quien(s.mate.id), quien(s.bici.id), quien(s.libro.id)]).toEqual([['Rodri'], ['Sofi'], ['Rodri'], ['Tía Marta']])
  expect(vista.items.find((i) => i.id === s.bici.id)!.claims[0].grupal).toMatchObject({ cuantos: 2, personas: ['Rodri', 'Sofi'] })
  const d = await getItemForViewer(s.db, 'tok-euge', s.termo.id, { userId: pedro.id })
  expect(d).toMatchObject({ role: 'giver', sinNombres: false, comments: [{ autorNombre: 'Rodri', texto: 'lo busco el sábado en Palermo' }] })
  expect((await historialDeLista(s.db, s.list.id, { userId: pedro.id }))?.entradas).toMatchObject([{ encargado: 'Sofi', nota: 'el de calabaza, con Pilar' }])

  // la dueña, con su cuenta o sin identificarse: la opción no le abre nada
  const deEuge = await getListForViewer(s.db, 'tok-euge', { userId: s.owner.id })
  expect(deEuge?.role).toBe('owner')
  expect(JSON.stringify(deEuge)).not.toMatch(/Rodri|Sofi|Tía|claims/)
  const sinNombre = await getListForViewer(s.db, 'tok-euge', {})
  expect(sinNombre?.role).toBe('anonimo')
  expect(JSON.stringify(sinNombre)).not.toMatch(/Rodri|Sofi|Tía|claims/)
  // y en un navegador donde ella tuvo sesión, la invitada tampoco ve nada (la protección de antes sigue igual)
  expect(await getListForViewer(s.db, 'tok-euge', { ...s.tia, cuentas: [s.owner.id] })).toMatchObject({ role: 'anonimo', motivo: 'otra_cuenta' })
})

test('con la opción apagada (las listas de antes), el invitado ve los nombres como hasta ahora', async () => {
  const s = await preparar()
  await guardarNombresSoloConCuenta(s.db, s.list.id, s.owner.id, false)
  const vista = await getListForViewer(s.db, 'tok-euge', s.tia)
  if (vista?.role !== 'giver') throw new Error('la tía ve la coordinación')
  expect(vista.sinNombres).toBe(false)
  expect(vista.items.find((i) => i.id === s.termo.id)!.claims[0].claimerNombre).toBe('Rodri')
  expect((await getItemForViewer(s.db, 'tok-euge', s.termo.id, s.tia))).toMatchObject({ comments: [{ autorNombre: 'Rodri' }] })
  expect(await historialDeLista(s.db, s.list.id, s.tia)).not.toBeNull()
})

test('las páginas: "Reservado" a secas, lo suyo "Lo reservaste vos", "Regalo grupal de 2" y la línea para entrar con Google', async () => {
  const s = await preparar()
  h.jar.set(GUEST_COOKIE, firmarInvitado(s.tia.guestId))

  const html = await lista()
  for (const secreto of SECRETOS) expect(html).not.toContain(secreto)
  expect(html).not.toContain('Reservado por')
  expect(html).toContain('Reservado</p>')
  expect(html).toContain('Lo reservaste vos')
  expect(html).toContain('Regalo grupal de 2</p>')
  expect(html).toContain('✓ Comprado')
  expect(html).toMatch(/Entrá con Google<\/button>\s*para ver quién reservó cada cosa/)
  // sin el historial de quién compró qué
  expect(html).not.toContain('Lo que ya le regalaron')
  // y sigue pudiendo reservar lo que está libre
  expect(html).toContain('Reservar')

  const delTermo = await deseo(s.termo.id)
  for (const secreto of SECRETOS) expect(delTermo).not.toContain(secreto)
  expect(delTermo).toContain('Reservado')
  expect(delTermo).toMatch(/Entrá con Google<\/button>\s*para ver quién reservó cada cosa/)
  // sin el hilo: ni lo lee ni escribe
  expect(delTermo).not.toContain('Coordiná con los demás')
  const deLaBici = await deseo(s.bici.id)
  for (const secreto of SECRETOS) expect(deLaBici).not.toContain(secreto)
  expect(deLaBici).toContain('Regalo grupal de 2')
  expect(await deseo(s.mate.id)).toContain('Ya lo compraron')
  expect(await deseo(s.libro.id)).toContain('Vos lo reservaste')

  // con su cuenta, Pedro ve los nombres y no la línea
  const [pedro] = await s.db.insert(users).values({ googleId: 'g-pedro', nombre: 'Pedro', email: 'pedro@test.com' }).returning()
  h.jar.clear()
  h.session = { userId: pedro.id }
  const dePedro = await lista()
  expect(dePedro).toContain('Reservado por Rodri')
  expect(dePedro).toContain('Reservado por Tía Marta')
  expect(dePedro).not.toContain('para ver quién reservó cada cosa')
  expect(await deseo(s.termo.id)).toContain('lo busco el sábado en Palermo')
})

test('el invitado que no ve el hilo tampoco escribe en él', async () => {
  const s = await preparar()
  h.jar.set(GUEST_COOKIE, firmarInvitado(s.tia.guestId))
  await commentAction(form({ token: 'tok-euge', itemId: s.termo.id, texto: '¿quién lo reservó?' }))
  expect(await s.db.select().from(comments)).toHaveLength(1)
  // con la opción apagada, sí, como siempre
  await guardarNombresSoloConCuenta(s.db, s.list.id, s.owner.id, false)
  await commentAction(form({ token: 'tok-euge', itemId: s.termo.id, texto: 'yo pongo la tarjeta' }))
  expect(await s.db.select().from(comments)).toHaveLength(2)
})

test('la vista previa al compartir (las imágenes OG) sigue sin decir nada de reservas', async () => {
  const s = await preparar()
  for (const v of [await listaParaCompartir(s.db, 'tok-euge'), await itemParaCompartir(s.db, 'tok-euge', s.termo.id), await itemParaCompartir(s.db, 'tok-euge', s.bici.id)]) {
    expect(v).not.toBeNull()
    expect(JSON.stringify(v)).not.toMatch(/Rodri|Sofi|Tía|reserv|grupal|Palermo/i)
  }
})

test('apagada en las listas que ya existían, prendida en las que se crean ahora', async () => {
  const db = await createTestDb()
  // una fila de antes: sin decir nada, queda apagada (el valor por defecto de la columna)
  const { list, owner } = await seedOwnerAndGiver(db)
  expect(await nombresSoloConCuenta(db, list.id)).toBe(false)

  // la lista personal de una cuenta nueva
  const ana = await upsertUserFromGoogle(db, { googleId: 'g-ana', email: 'ana@test.com', nombre: 'Ana' })
  const [deAna] = await db.select().from(lists).where(eq(lists.ownerId, ana.id))
  expect(deAna.nombresSoloConCuenta).toBe(true)
  // la de un usuario de antes al que le faltaba
  const [beto] = await db.insert(users).values({ googleId: 'g-beto', nombre: 'Beto', email: 'beto@test.com' }).returning()
  const deBeto = (await asegurarListaPropia(db, beto.id))!
  expect(await nombresSoloConCuenta(db, deBeto.id)).toBe(true)
  // y una lista en común
  const casa = await crearGrupo(db, owner.id, { nombre: 'Casa' })
  expect(await nombresSoloConCuenta(db, casa)).toBe(true)
  // volver a entrar con Google no le cambia la suya a nadie
  await guardarNombresSoloConCuenta(db, deAna.id, ana.id, false)
  await upsertUserFromGoogle(db, { googleId: 'g-ana', email: 'ana@test.com', nombre: 'Ana' })
  expect(await nombresSoloConCuenta(db, deAna.id)).toBe(false)
})

test('el ajuste lo cambia solo un dueño de la lista: la personal desde Mi lista, la lista en común con su id', async () => {
  const db = h.db = await createTestDb()
  h.jar.clear()
  const { list, owner, giver } = await seedOwnerAndGiver(db)
  const casa = await crearGrupo(db, owner.id, { nombre: 'Casa' })
  await guardarNombresSoloConCuenta(db, casa, owner.id, false)

  expect(await guardarNombresSoloConCuenta(db, list.id, giver.id, true)).toBe(false)
  expect(await guardarNombresSoloConCuenta(db, 'no-es-un-id', owner.id, true)).toBe(false)
  expect(await nombresSoloConCuenta(db, list.id)).toBe(false)

  // Rodri manda el formulario con el id de la lista en común de Euge: no cambia nada (y sin grupoId cambia la suya)
  h.session = { userId: giver.id }
  await nombresSoloConCuentaAction(form({ grupoId: casa, prendida: '1' }))
  expect(await nombresSoloConCuenta(db, casa)).toBe(false)

  h.session = { userId: owner.id }
  await nombresSoloConCuentaAction(form({ prendida: '1' }))
  expect(await nombresSoloConCuenta(db, list.id)).toBe(true)
  expect(await nombresSoloConCuenta(db, casa)).toBe(false)
  await nombresSoloConCuentaAction(form({ grupoId: casa, prendida: '1' }))
  expect(await nombresSoloConCuenta(db, casa)).toBe(true)
  await nombresSoloConCuentaAction(form({ prendida: '0' }))
  expect(await nombresSoloConCuenta(db, list.id)).toBe(false)

  // sin sesión, a entrar
  h.session = null
  await expect(nombresSoloConCuentaAction(form({ prendida: '1' }))).rejects.toMatchObject({ url: '/' })
  expect(await nombresSoloConCuenta(db, list.id)).toBe(false)
})

test('el ajuste dice cómo está, por qué sirve y ofrece lo contrario', () => {
  const apagado = renderToStaticMarkup(AjusteSoloConCuenta({ prendida: false }))
  expect(apagado).toContain('Solo con cuenta se ve quién reservó')
  expect(apagado).toContain('Apagado.')
  expect(apagado).toContain('nadie puede espiar quién te regala qué entrando con un nombre inventado')
  expect(apagado).toContain('name="prendida" value="1"')
  expect(apagado).toContain('Prender')
  const prendido = renderToStaticMarkup(AjusteSoloConCuenta({ prendida: true, grupoId: 'g1' }))
  expect(prendido).toContain('Prendido.')
  expect(prendido).toContain('Así nadie puede espiar quién les regala qué entrando con un nombre inventado.')
  expect(prendido).toContain('name="grupoId" value="g1"')
  expect(prendido).toContain('name="prendida" value="0"')
  expect(prendido).toContain('Apagar')
})
