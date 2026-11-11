import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { claims, items } from '@/db/schema'
import { reserveItem } from '@/lib/claims'

// La lista y el deseo como los ve el que recibió el link por WhatsApp: sin cuenta y sin nombre, ya con su nombre y con su
// cuenta. Las páginas tal cual (dibujadas), con la base en PGlite y las cookies y la sesión de Next simuladas.
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
// los carteles de avisos se arman solos con la base (un componente async): acá no se dibujan
vi.mock('@/components/Banners', () => ({ Banners: () => null }))

import { reserveAction } from '@/app/actions'
import { ultimoDia } from '@/components/ReservaConfirmada'
import ListaAjena from '@/app/l/[token]/page'
import DetalleItem from '@/app/l/[token]/item/[itemId]/page'

const lista = async (query: Record<string, string> = {}) =>
  renderToStaticMarkup(await ListaAjena({ params: Promise.resolve({ token: 'tok-euge' }), searchParams: Promise.resolve(query) }))
const deseo = async (itemId: string) =>
  renderToStaticMarkup(await DetalleItem({ params: Promise.resolve({ token: 'tok-euge', itemId }), searchParams: Promise.resolve({}) }))

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}
/** Reservar desde la lista, como el botón de la tarjeta: vuelve con ?reservado=. */
const reservarEnLista = (itemId: string, nombre?: string) =>
  reserveAction(null, form({ token: 'tok-euge', itemId, volver: '/l/tok-euge', avisar: '1', ...(nombre && { nombre }) })).catch(() => {})
const veces = (html: string, texto: string) => html.split(texto).length - 1

async function preparar() {
  h.db = await createTestDb()
  h.jar.clear()
  h.session = null
  const seed = await seedOwnerAndGiver(h.db)
  const deseos = await h.db.insert(items).values([
    { listId: seed.list.id, tipo: 'exacto', titulo: 'Termo', categoria: 'Casa' },
    { listId: seed.list.id, tipo: 'exacto', titulo: 'Mate', categoria: 'Casa' },
    { listId: seed.list.id, tipo: 'exacto', titulo: 'Auriculares', categoria: 'Tecnología' },
    { listId: seed.list.id, tipo: 'exacto', titulo: 'Libro' },
  ]).returning()
  const [termo, mate, auris, libro] = deseos
  return { ...seed, termo, mate, auris, libro }
}

test('sin nombre: la tapa compacta, "¿Quién sos?" en un renglón, "Reservar" en verde y la tarjeta entera abre el deseo', async () => {
  const { giver, termo } = await preparar()
  await reserveItem(h.db, termo.id, { userId: giver.id })
  const html = await lista()

  // la tapa: el perfil y los gustos en un chip, no en un botón a todo el ancho
  expect(html).toContain('Su perfil y sus gustos')
  expect(html).not.toContain('gr-btn--vidrio w-full')
  // "¿Quién sos?" ya no es una tarjeta con título: un renglón que se abre, con "¿Es tu lista?" adentro
  expect(html).toContain('<details id="quien-sos"')
  expect(html).toContain('Decinos quién sos para ver qué ya reservaron')
  expect(html).not.toContain('<h2 id="quien-sos"')
  // los cuatro deseos, todos como libres (puede ser la dueña sin su sesión): nada de quién reservó qué
  expect(veces(html, 'gr-btn-primary gr-btn--sm w-full')).toBe(4)
  for (const oculto of ['Reservado por', 'Rodri', 'Disponibles']) expect(html).not.toContain(oculto)
  // al tocar "Reservar" se pide el nombre, con la regla de la sorpresa a la vista y el diálogo con su nombre accesible
  expect(veces(html, '<dialog aria-labelledby="')).toBe(4)
  expect(html).toContain('Euge no se entera de nada: solo lo ven los demás que regalan.')
  expect(html).not.toContain('ya tiene dueño')
  expect(veces(html, '¿Es tu lista?')).toBe(5)
  // la tarjeta entera abre el deseo (el link del título se estira): sin "Ver más", y un solo link al deseo por tarjeta
  expect(html).not.toContain('Ver más')
  expect(veces(html, `href="/l/tok-euge/item/${termo.id}"`)).toBe(1)
  // "Armá tu lista" va al final y neutra: no flota tapando los deseos, y el verde queda para "Reservar"
  expect(html).toContain('Armá tu lista')
  expect(html).not.toContain('gr-floatbar')
  expect(html).not.toContain('gr-btn--accent')
  // el link con ?reservado= no le muestra nada al que no reservó
  expect(await lista({ reservado: termo.id })).not.toContain('Es tuyo')
})

test('las categorías llevan título solo si alguna junta 3 deseos; si no, una sola grilla corrida', async () => {
  const { list } = await preparar()
  const grupos = (html: string) => veces(html, 'data-buscar-grupo')
  const titulos = (html: string) => veces(html, 'font-extrabold')
  // 2 de Casa, 1 de Tecnología y 1 sin categoría: una grilla, sin títulos (los chips ya filtran)
  let html = await lista()
  expect(grupos(html)).toBe(1)
  expect(html).not.toContain('Sin categoría')
  expect(titulos(html)).toBe(0)
  // con un tercero de Casa, sí: cada categoría con su título, y lo que no tiene al final
  await h.db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Taza', categoria: 'Casa' })
  html = await lista()
  expect(grupos(html)).toBe(3)
  expect(titulos(html)).toBe(3)
  expect(html.indexOf('>Casa<')).toBeLessThan(html.indexOf('Sin categoría'))
  // con una categoría elegida, sin títulos
  html = await lista({ cat: 'Casa' })
  expect(grupos(html)).toBe(1)
  expect(titulos(html)).toBe(0)
})

test('después de reservar: hasta cuándo es suyo y qué sigue; sin cuenta, que con Google le avisamos', async () => {
  const { giver, termo, mate } = await preparar()
  // la abuela reserva el Termo desde la lista, con su nombre
  await reservarEnLista(termo.id, 'Abuela')
  const [claim] = await h.db.select().from(claims).where(eq(claims.itemId, termo.id))
  const hasta = ultimoDia(claim.expiresAt!)
  let html = await lista({ reservado: termo.id })
  expect(html).toContain(`Es tuyo hasta el ${hasta}.`)
  expect(html).toContain(`href="/l/tok-euge/item/${termo.id}">marcalo como comprado</a>`)
  expect(html).toContain('Entrá con Google</button> y te avisamos antes de que venza.')
  // el cartel va pegado a su tarjeta, y en la tarjeta queda hasta cuándo aunque el cartel ya no esté
  expect(html.indexOf('Es tuyo hasta el')).toBeGreaterThan(html.indexOf(`id="deseo-${termo.id}"`))
  expect(html).toContain(`Tuyo hasta el ${hasta}`)
  expect(await lista()).toContain(`Tuyo hasta el ${hasta}`)
  expect(await lista()).not.toContain('Es tuyo hasta el')
  // con "Disponibles" su Termo ya no se ve: el cartel sale igual
  html = await lista({ reservado: termo.id, disp: '1' })
  expect(html).not.toContain(`id="deseo-${termo.id}"`)
  expect(html).toContain(`Es tuyo hasta el ${hasta}.`)
  // lo que no reservó ella no tiene cartel, y lo demás se reserva de un toque (ya dijo quién es: sin diálogo)
  html = await lista({ reservado: mate.id })
  expect(html).not.toContain('Es tuyo hasta el')
  expect(html).not.toContain('<dialog')
  expect(veces(html, 'name="avisar"')).toBe(3)
  // ya reservó: ahora sí "¿Y vos qué querés?" flota abajo, neutra
  expect(html).toContain('gr-floatbar border border-gr-line bg-gr-surface')

  // Rodri, con su cuenta: el cartel sin lo de Google (ya le avisamos) y sin "Armá tu lista" (ya tiene la suya)
  h.jar.clear()
  h.session = { userId: giver.id }
  await reservarEnLista(mate.id)
  html = await lista({ reservado: mate.id })
  expect(html).toContain('Es tuyo hasta el')
  expect(html).toContain('Reservado por Abuela')
  for (const no of ['te avisamos antes de que venza', 'Armá tu lista', '<dialog']) expect(html).not.toContain(no)
})

test('en el deseo: "Reservar" es la acción principal y "Armar regalo grupal" la secundaria, solo con cuenta', async () => {
  const { giver, termo, mate } = await preparar()
  // sin nombre: reservar pide el nombre; nada de regalo grupal
  let html = await deseo(termo.id)
  expect(html).toContain('gr-btn-primary w-full min-h-12')
  expect(html).toContain('Euge no se entera de nada')
  expect(html).not.toContain('Armar regalo grupal')
  // la abuela, con su nombre y sin cuenta: reserva de un toque y no se le ofrece lo que no puede hacer
  await reservarEnLista(mate.id, 'Abuela')
  html = await deseo(termo.id)
  expect(html).toContain('gr-btn-primary w-full min-h-12')
  for (const no of ['<dialog', 'Armar regalo grupal', 'Lo compro yo', 'Lo dividimos', 'Reservarlo para mí', '¿Cómo lo regalás?']) expect(html).not.toContain(no)
  // lo que reservó: qué sigue, con la fecha de esa reserva, y que con Google le avisamos
  const [claim] = await h.db.select().from(claims).where(eq(claims.itemId, mate.id))
  html = await deseo(mate.id)
  expect(html).toContain(`Es tuyo hasta el ${ultimoDia(claim.expiresAt!)}.`)
  expect(html).toContain('Cuando lo compres, marcalo como comprado.')
  expect(html).toContain('y te avisamos antes de que venza.')

  // Rodri, con su cuenta: "Reservar" sin elegir nada antes, y abajo "Armar regalo grupal"
  h.jar.clear()
  h.session = { userId: giver.id }
  html = await deseo(termo.id)
  expect(html).toContain('gr-btn-primary w-full min-h-12')
  expect(html).toContain('Armar regalo grupal')
  for (const no of ['Lo compro yo', 'Reservarlo para mí', '¿Cómo lo regalás?', 'role="radiogroup"']) expect(html).not.toContain(no)
  expect(html.indexOf('Armar regalo grupal')).toBeLessThan(html.indexOf('gr-ficha__barra'))
  await reserveItem(h.db, termo.id, { userId: giver.id })
  html = await deseo(termo.id)
  expect(html).toContain('Es tuyo hasta el')
  expect(html).not.toContain('te avisamos antes de que venza')
})
