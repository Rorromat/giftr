import { expect, test, vi } from 'vitest'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { items, lists, users } from '@/db/schema'
import { reserveItem } from '@/lib/claims'
import { crearGrupo } from '@/lib/groups'
import { createItem, type NewItemData } from '@/lib/items'

// "Hasta $X" en la lista de alguien y la fecha del precio, en las pantallas tal cual (dibujadas), con la base en PGlite y
// las cookies y la sesión de Next simuladas.
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

import ListaAjena from '@/app/l/[token]/page'
import DetalleItem from '@/app/l/[token]/item/[itemId]/page'
import Deseo from '@/app/(menu)/deseo/[id]/page'
import { DeseoForm } from '@/components/DeseoForm'
import { OwnerItemsGrid } from '@/components/OwnerItemsGrid'
import { getOwnList } from '@/lib/lists'

const lista = async (query: Record<string, string> = {}, token = 'tok-euge') =>
  renderToStaticMarkup(await ListaAjena({ params: Promise.resolve({ token }), searchParams: Promise.resolve(query) }))
const detalle = async (itemId: string) =>
  renderToStaticMarkup(await DetalleItem({ params: Promise.resolve({ token: 'tok-euge', itemId }), searchParams: Promise.resolve({}) }))

/** Los deseos que se ven, en orden (cada tarjeta lleva su id). */
const titulosDe = (html: string, deseos: Record<string, { id: string }>) =>
  [...html.matchAll(/id="deseo-([0-9a-f-]+)"/g)].map((m) => Object.keys(deseos).find((k) => deseos[k].id === m[1]))
/** Los links de la página (sin las entidades de HTML). */
const links = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replaceAll('&amp;', '&'))
/** El pedazo de la página desde un texto. */
const desde = (html: string, texto: string) => html.slice(html.indexOf(texto))
const hace = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000)

const DESEOS = {
  medias: { titulo: 'Medias', precio: '$12.000', categoria: 'Ropa' },
  libro: { titulo: 'Libro', precio: '$18.500', categoria: 'Libros' },
  mate: { titulo: 'Mate', precio: '$25.000', categoria: 'Casa' },
  // una idea con rango: entra si entra su piso
  remera: { titulo: 'Remera', tipo: 'idea', precio: '$30.000 a $60.000', categoria: 'Ropa' },
  termo: { titulo: 'Termo', precio: '$45.000', categoria: 'Casa' },
  zapatillas: { titulo: 'Zapatillas', precio: '$89.000', categoria: 'Ropa' },
  bici: { titulo: 'Bici', precio: '$150.000' },
  // lo que no se puede comparar
  abrazo: { titulo: 'Abrazo', tipo: 'idea' },
  auriculares: { titulo: 'Auriculares', precio: 'US$ 100', categoria: 'Casa' },
} satisfies Record<string, Partial<NewItemData>>

async function preparar(cuales: (keyof typeof DESEOS)[] = Object.keys(DESEOS) as (keyof typeof DESEOS)[]) {
  h.db = await createTestDb()
  h.jar.clear()
  const seed = await seedOwnerAndGiver(h.db)
  // con su cuenta, como quien regala
  h.session = { userId: seed.giver.id }
  const deseos = {} as Record<keyof typeof DESEOS, { id: string }>
  for (const k of cuales) deseos[k] = (await createItem(h.db, seed.owner.id, { tipo: 'exacto', ...DESEOS[k] }))!
  return { ...seed, deseos }
}

test('con 6 o más deseos con precio, la fila de filtros ofrece "Hasta $…" con los topes de esa lista, como links', async () => {
  const { deseos } = await preparar()
  const html = await lista()
  // el chip es un casillero (abre los topes con CSS, sin JS) y los topes son links con ?hasta=
  expect(html).toContain('<input type="checkbox" id="elegir-tope"')
  expect(html).toContain('Hasta $…')
  expect(html).toContain('group-has-[#elegir-tope:checked]/presupuesto:flex')
  // los pisos en pesos: 12.000, 18.500, 25.000, 30.000, 45.000, 89.000 y 150.000
  expect(links(html).filter((l) => l.includes('hasta='))).toEqual(['/l/tok-euge?hasta=20000', '/l/tok-euge?hasta=30000', '/l/tok-euge?hasta=100000'])
  for (const tope of ['Hasta $20.000', 'Hasta $30.000', 'Hasta $100.000']) expect(html).toContain(`aria-label="${tope}"`)
  // sin tope elegido se ve todo, y no hay nada aparte
  expect(titulosDe(html, deseos)).toHaveLength(9)
  expect(html).not.toContain('Sin precio')
  expect(html).toMatch(/<a aria-current="page" class="gr-chip" href="\/l\/tok-euge">Todos<\/a>/)
})

test('con un tope: lo que entra (un rango, por su piso), y al final, aparte, lo que no se puede comparar', async () => {
  const { deseos } = await preparar()
  const html = await lista({ hasta: '30000' })
  // la remera va de $30.000 a $60.000: algo de eso se consigue con $30.000. El termo y lo más caro, afuera.
  expect(titulosDe(html, deseos)).toEqual(['medias', 'libro', 'mate', 'remera', 'abrazo', 'auriculares'])
  // el abrazo no tiene precio y los auriculares están en dólares: no desaparecen, van abajo de su título
  expect(html).toContain('Sin precio para comparar')
  expect(titulosDe(desde(html, 'Sin precio para comparar'), deseos)).toEqual(['abrazo', 'auriculares'])
  expect(desde(html, 'Sin precio para comparar')).toContain('No sabemos si entran en lo que querés gastar')

  // el chip dice el tope elegido y tocarlo lo saca; "Todos" ya no es lo elegido
  expect(html).toContain('aria-label="Hasta $30.000: sacar el tope"')
  expect(html).not.toContain('id="elegir-tope"')
  expect(html).not.toMatch(/<a aria-current="page" class="gr-chip" href="\/l\/tok-euge">Todos/)
  // los topes quedan a la vista para cambiarlo, con el elegido marcado
  expect(html).toMatch(/<a aria-current="page" aria-label="Hasta \$30\.000" class="gr-chip tabular-nums"/)
  expect(html).not.toContain('hidden group-has-[#elegir-tope:checked]')
})

test('el tope justo entra; uno más bajo que todo deja solo lo que no se puede comparar, y lo dice', async () => {
  const { deseos } = await preparar()
  expect(titulosDe(await lista({ hasta: '45000' }), deseos)).toEqual(['medias', 'libro', 'mate', 'remera', 'termo', 'abrazo', 'auriculares'])
  expect(titulosDe(await lista({ hasta: '44999' }), deseos)).not.toContain('termo')

  const nada = await lista({ hasta: '5000' })
  expect(titulosDe(nada, deseos)).toEqual(['abrazo', 'auriculares'])
  expect(nada).toContain('No hay nada con precio hasta $5.000. De estos no sabemos si entran.')
})

test('solo sin precio de verdad: el título es "Sin precio"', async () => {
  const { deseos, owner } = await preparar(['medias', 'libro', 'mate', 'remera', 'termo', 'zapatillas', 'abrazo'])
  await createItem(h.db, owner.id, { tipo: 'idea', titulo: 'Otro abrazo' })
  const html = await lista({ hasta: '20000' })
  expect(titulosDe(html, deseos).slice(0, 3)).toEqual(['medias', 'libro', 'abrazo'])
  expect(html).toContain('>Sin precio<span')
  expect(html).not.toContain('Sin precio para comparar')
})

test('se combina con la categoría y con "Disponibles", y los links de cada filtro conservan los otros', async () => {
  const { deseos } = await preparar()
  // alguien más ya reservó el mate
  const [sofi] = await h.db.insert(users).values({ googleId: 'g-sofi', nombre: 'Sofi', email: 'sofi@test.com' }).returning()
  expect(await reserveItem(h.db, deseos.mate.id, { userId: sofi.id })).toMatchObject({ ok: true })

  // Casa hasta $30.000: el mate (el termo se pasa); los auriculares, en dólares, aparte
  const casa = await lista({ cat: 'Casa', hasta: '30000' })
  expect(titulosDe(casa, deseos)).toEqual(['mate', 'auriculares'])
  // Ropa hasta $30.000, sin nada aparte: no hay título de "Sin precio"
  const ropa = await lista({ cat: 'Ropa', hasta: '30000' })
  expect(titulosDe(ropa, deseos)).toEqual(['medias', 'remera'])
  expect(ropa).not.toContain('Sin precio')

  // disponibles hasta $30.000: el mate reservado no va
  const libres = await lista({ disp: '1', hasta: '30000' })
  expect(titulosDe(libres, deseos)).toEqual(['medias', 'libro', 'remera', 'abrazo', 'auriculares'])
  // sin "Disponibles", lo reservado va al fondo de lo que entra (como siempre), antes de lo que va aparte
  expect(titulosDe(await lista({ hasta: '30000' }), deseos)).toEqual(['medias', 'libro', 'remera', 'mate', 'abrazo', 'auriculares'])

  // los chips: la categoría y "Disponibles" no sacan el tope; los topes no sacan la categoría; sacar el tope deja lo demás
  const hrefs = links(casa)
  expect(hrefs).toContain('/l/tok-euge?cat=Ropa&hasta=30000')
  expect(hrefs).toContain('/l/tok-euge?disp=1&hasta=30000')
  expect(hrefs).toContain('/l/tok-euge?cat=Casa&hasta=100000')
  expect(hrefs).toContain('/l/tok-euge?cat=Casa')
  // "Todos" saca todo
  expect(hrefs).toContain('/l/tok-euge')
  // y si una reserva no sale, vuelve acá con el tope (el "volver" del botón de reservar)
  expect(casa).toContain('value="/l/tok-euge?cat=Casa&amp;hasta=30000"')
})

test('con menos de 6 deseos con precio no hay filtro, y un ?hasta= de un link viejo no esconde nada', async () => {
  const { deseos } = await preparar(['medias', 'libro', 'mate', 'termo', 'bici', 'abrazo', 'auriculares'])
  const html = await lista({ hasta: '20000' })
  expect(html).not.toContain('elegir-tope')
  expect(html).not.toContain('Hasta $')
  expect(html).not.toContain('Sin precio')
  expect(titulosDe(html, deseos)).toHaveLength(7)
})

test('un tope que no es un número no filtra', async () => {
  const { deseos } = await preparar()
  for (const hasta of ['abc', '-1', '0', '20.000']) {
    const html = await lista({ hasta })
    expect(titulosDe(html, deseos)).toHaveLength(9)
    expect(html).toContain('id="elegir-tope"')
  }
})

test('una lista en dólares se filtra en dólares, y lo que está en pesos va aparte', async () => {
  h.db = await createTestDb()
  h.jar.clear()
  const seed = await seedOwnerAndGiver(h.db)
  h.session = { userId: seed.giver.id }
  for (const [titulo, precio] of [['A', 'US$ 20'], ['B', 'USD 35'], ['C', 'u$s 50'], ['D', 'US$ 80'], ['E', 'US$ 120'], ['F', 'US$ 300'], ['Mate', '$25.000']]) {
    await createItem(h.db, seed.owner.id, { tipo: 'exacto', titulo, precio })
  }
  const html = await lista()
  expect(html).toContain('Hasta US$…')
  expect(links(html).filter((l) => l.includes('hasta='))).toEqual(['/l/tok-euge?hasta=50', '/l/tok-euge?hasta=150'])
  const filtrada = await lista({ hasta: '50' })
  expect(filtrada).toContain('aria-label="Hasta US$ 50: sacar el tope"')
  // $25.000 no es "hasta 50": no se comparan
  const aparte = desde(filtrada, 'Sin precio para comparar')
  expect(aparte).toContain('Mate')
  expect(aparte).not.toContain('US$ 20')
  expect(filtrada.slice(0, filtrada.indexOf('Sin precio para comparar'))).toContain('US$ 20')
  expect(filtrada).not.toContain('US$ 80')
})

test('sin nombre también se filtra (no hace falta ver las reservas), y en una lista en común es la misma pantalla', async () => {
  const { deseos, owner } = await preparar()
  h.session = null
  const html = await lista({ hasta: '20000' })
  expect(titulosDe(html, deseos)).toEqual(['medias', 'libro', 'abrazo', 'auriculares'])
  // sin ver las reservas no hay "Disponibles", pero el tope está
  expect(html).not.toContain('Disponibles')
  expect(html).toContain('aria-label="Hasta $20.000: sacar el tope"')

  const grupoId = await crearGrupo(h.db, owner.id, { nombre: 'Nuestra casa' })
  const [{ shareToken }] = await h.db.select({ shareToken: lists.shareToken }).from(lists).where(eq(lists.id, grupoId))
  for (const d of Object.values(DESEOS)) await createItem(h.db, owner.id, { tipo: 'exacto', ...d }, grupoId)
  const enComun = await lista({ hasta: '20000' }, shareToken)
  expect(enComun).toContain('Nuestra casa')
  expect(enComun).toContain(`href="/l/${shareToken}?hasta=30000"`)
  expect(enComun).toContain('Medias')
  expect(enComun).not.toContain('Zapatillas')
})

test('el deseo, para quien regala: un precio de más de 60 días lleva una nota con su fecha; uno reciente, no', async () => {
  const { deseos } = await preparar(['mate', 'abrazo'])
  expect(await detalle(deseos.mate.id)).not.toContain('puede haber cambiado')

  await h.db.update(items).set({ precioAt: hace(59) }).where(eq(items.id, deseos.mate.id))
  expect(await detalle(deseos.mate.id)).not.toContain('puede haber cambiado')

  await h.db.update(items).set({ precioAt: hace(100) }).where(eq(items.id, deseos.mate.id))
  expect(await detalle(deseos.mate.id)).toContain('Precio de hace 3 meses: puede haber cambiado.')
  // sin nombre también: es del deseo, no de las reservas
  h.session = null
  expect(await detalle(deseos.mate.id)).toContain('Precio de hace 3 meses: puede haber cambiado.')
  // sin precio no hay nada que avisar
  expect(await detalle(deseos.abrazo.id)).not.toContain('Precio de')
})

test('el dueño: con un precio viejo, Mi lista y su deseo le preguntan si sigue costando eso, y lo llevan a editar', async () => {
  const { deseos, owner } = await preparar(['mate', 'termo', 'abrazo'])
  h.session = { userId: owner.id }
  const grilla = async () =>
    renderToStaticMarkup(createElement(Fragment, null, OwnerItemsGrid({ items: (await getOwnList(h.db, owner.id))!.items, shareToken: 'tok-euge' })))
  const suDeseo = async (id: string) => renderToStaticMarkup(await Deseo({ params: Promise.resolve({ id }) }))

  expect(await grilla()).not.toContain('¿Sigue costando')
  expect(await suDeseo(deseos.mate.id)).not.toContain('¿Sigue costando')

  await h.db.update(items).set({ precioAt: hace(125) }).where(eq(items.id, deseos.mate.id))
  const html = await grilla()
  // solo en el del precio viejo, y es un link a editarlo
  expect(html.split('¿Sigue costando').length - 1).toBe(1)
  expect(html).toMatch(new RegExp(`<a[^>]*href="/editar/${deseos.mate.id}"[^>]*>¿Sigue costando \\$25\\.000\\?</a>`))
  // el del termo sigue siendo el precio solo
  expect(html).toContain('<p class="text-[13px] text-gr-muted tabular-nums">$45.000</p>')

  const ficha = await suDeseo(deseos.mate.id)
  expect(ficha).toContain('Precio de hace 4 meses.')
  expect(ficha).toMatch(new RegExp(`<a[^>]*href="/editar/${deseos.mate.id}"[^>]*>¿Sigue costando \\$25\\.000\\?</a>`))
  expect(await suDeseo(deseos.termo.id)).not.toContain('¿Sigue costando')
})

test('editar: con un precio viejo, el casillero "Sigue costando lo mismo"; con link a la tienda, traer el precio a mano', async () => {
  const { owner } = await preparar([])
  const form = async (datos: NewItemData, precioAt?: Date) => {
    const item = (await createItem(h.db, owner.id, datos))!
    if (precioAt) await h.db.update(items).set({ precioAt }).where(eq(items.id, item.id))
    const deseo = (await getOwnList(h.db, owner.id))!.items.find((i) => i.id === item.id)!
    return renderToStaticMarkup(createElement(DeseoForm, { action: async () => {}, deseo, boton: 'Guardar cambios' }))
  }
  // a la vista, o escondido (sin precio viejo: lo tilda la lectura del link)
  const casillero = (html: string) => /<label class="flex[^"]*"><input type="checkbox"[^>]*name="precioVisto" value="1"/.test(html)
  const escondido = (html: string) => /<label hidden=""><input type="checkbox"[^>]*name="precioVisto" value="1"/.test(html)

  // reciente y sin link: nada
  const nuevo = await form({ tipo: 'exacto', titulo: 'Mate', precio: '$25.000' })
  expect(nuevo).not.toContain('precioVisto')
  expect(nuevo).not.toContain('Traer el precio de la tienda')

  const viejo = await form({ tipo: 'exacto', titulo: 'Termo', precio: '$45.000' }, hace(125))
  expect(casillero(viejo)).toBe(true)
  expect(viejo).toContain('Sigue costando lo mismo')
  expect(viejo).toContain('(es de hace 4 meses)')
  expect(viejo).not.toContain('Traer el precio de la tienda')

  // con link, el botón está aunque el precio sea de hoy; el casillero va escondido (lo tilda la lectura)
  const conLink = await form({ tipo: 'exacto', titulo: 'Bici', precio: '$150.000', linkTienda: 'https://tienda.com.ar/bici' })
  expect(conLink).toContain('<button type="button" class="gr-btn gr-btn--sm self-start disabled:opacity-60">Traer el precio de la tienda</button>')
  expect(escondido(conLink)).toBe(true)
  expect(casillero(conLink)).toBe(false)

  // al agregar, nada de esto
  const agregar = renderToStaticMarkup(createElement(DeseoForm, { action: async () => {}, boton: 'Agregar' }))
  expect(agregar).not.toContain('precioVisto')
})
