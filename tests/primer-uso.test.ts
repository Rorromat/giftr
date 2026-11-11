import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { items, users } from '@/db/schema'
import { guardarGustos, necesitaBienvenida, saltearBienvenida } from '@/lib/bienvenida'
import { preguntarAvisos } from '@/lib/codazos'
import { textoMiLista } from '@/lib/compartir'
import { sanitizarGustos, NO_FUTBOL } from '@/lib/gustos'
import { crearGrupo } from '@/lib/groups'
import { loCopiadoParaAgregar } from '@/components/AlLlegarDelAgregado'
import { RecienAgregado } from '@/components/RecienAgregado'

// El primer uso, de punta a punta: login → una pantalla de bienvenida → el primer deseo → compartir la lista. Las pantallas
// tal cual, con la base en PGlite y la sesión, los headers y las redirecciones de Next simulados.
const h = vi.hoisted(() => ({ db: undefined as unknown as Db, session: null as { userId: string; user?: { name: string } } | null }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'sec-fetch-site': 'same-origin' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => '/mi-lista',
  useSearchParams: () => new URLSearchParams(),
}))

import { addItemAction, bienvenidaAction } from '@/app/actions'
import Agregar from '@/app/(menu)/agregar/page'
import MiLista from '@/app/(menu)/mi-lista/page'

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

/** A dónde redirige (null si no redirige). */
async function redirige(p: Promise<unknown>): Promise<string | null> {
  try { await p } catch (e) { return (e as { url: string }).url }
  return null
}

async function preparar() {
  h.db = await createTestDb()
  const seed = await seedOwnerAndGiver(h.db)
  h.session = { userId: seed.owner.id, user: { name: 'Euge' } }
  return seed
}

type Elemento = React.ReactElement<{ children?: React.ReactNode; deseo?: Record<string, unknown> }>
/** Todos los elementos de lo que devuelve una página (sin renderizar los componentes: solo el árbol). */
function elementos(nodo: React.ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (!nodo || typeof nodo !== 'object' || !('props' in nodo)) return []
  const el = nodo as Elemento
  return [el, ...elementos(el.props.children)]
}

const miLista = (sp: Record<string, string> = {}) => MiLista({ searchParams: Promise.resolve(sp) })
const agregar = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await Agregar({ searchParams: Promise.resolve(sp) }))

test('primer uso: de la bienvenida al primer deseo (con su invitación) y de ahí a mandar la lista; los avisos, recién después', async () => {
  const { owner, list } = await preparar()
  // entra por primera vez: una pantalla, y de ahí derecho a Agregar
  expect(await redirige(miLista())).toBe('/bienvenida')
  expect(await redirige(bienvenidaAction(form({ dia: '12', mes: '10' })))).toBe('/agregar')
  expect(await necesitaBienvenida(h.db, owner.id)).toBe(false)
  const primero = await agregar()
  expect(primero).toContain('Empecemos por lo primero que se te ocurra')
  expect(primero).toContain('>Tu primer deseo<')
  // todavía no hizo nada: por los avisos no se le pregunta
  expect(await preguntarAvisos(h.db, owner.id)).toBe(false)

  // anota el primero: vuelve a su lista con "¡Anotado!", que ofrece mandarla (lo principal) sin repetir cuánto lo quiere
  const vuelta = await redirige(addItemAction(form({ titulo: 'Mate imperial', prioridad: 'mucho', tipo: 'exacto' })))
  const [mate] = await h.db.select().from(items).where(eq(items.listId, list.id))
  expect(vuelta).toBe(`/mi-lista?agregado=${mate.id}`)
  const anotado = (pantalla: React.ReactNode) => elementos(pantalla).find((e) => e.type === RecienAgregado)?.props.deseo
  const wa = `https://wa.me/?text=${encodeURIComponent(textoMiLista(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${list.shareToken}`))}`
  expect(anotado(await miLista({ agregado: mate.id }))).toEqual({ id: mate.id, titulo: 'Mate imperial', foto: null, grupo: false, waHref: wa, primero: true })
  // ahora sí: ya hizo algo (el cartel espera a que cierre "¡Anotado!", ver PreguntaAvisos)
  expect(await preguntarAvisos(h.db, owner.id)).toBe(true)

  // el segundo ya no es "el primero": Agregar es el de siempre y mandar la lista queda a mano, no como lo principal
  const despues = await agregar()
  expect(despues).not.toContain('Empecemos por lo primero')
  expect(despues).toContain('>Nuevo deseo<')
  await redirige(addItemAction(form({ titulo: 'Termo', prioridad: 'gustaria', tipo: 'exacto' })))
  const termo = (await h.db.select().from(items).where(eq(items.listId, list.id))).find((i) => i.titulo === 'Termo')!
  expect(anotado(await miLista({ agregado: termo.id }))).toMatchObject({ id: termo.id, waHref: wa, primero: false })
  // sin ?agregado= (o con uno que no es de su lista) no hay "¡Anotado!"
  expect(anotado(await miLista())).toBeUndefined()
  expect(anotado(await miLista({ agregado: 'otro' }))).toBeUndefined()
})

test('Agregar: la invitación del primer deseo es solo para su lista vacía (no en una lista en común ni con algo compartido)', async () => {
  const { owner } = await preparar()
  await saltearBienvenida(h.db, owner.id)
  const grupoId = await crearGrupo(h.db, owner.id, { nombre: 'Nuestra casa' })
  expect(await agregar()).toContain('Empecemos por lo primero que se te ocurra')
  expect(await agregar({ lista: grupoId })).not.toContain('Empecemos por lo primero')
  // lo que llega compartido desde una tienda ya viene puesto: no hace falta invitar
  expect(await agregar({ link: 'https://tienda.com.ar/mate' })).not.toContain('Empecemos por lo primero')
})

test('Mi lista: el mensaje de WhatsApp explica qué hacer, y una línea dice por qué acá no se ven reservas', async () => {
  const { owner, list } = await preparar()
  await saltearBienvenida(h.db, owner.id)
  await h.db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Mate' })
  const p = renderToStaticMarkup(await miLista())
  const texto = decodeURIComponent(/href="https:\/\/wa\.me\/\?text=([^"]*)"/.exec(p)![1])
  expect(texto).toBe(`Armé mi lista de deseos en GiftR 🎁 Elegí algo y reservalo: yo no me entero de quién regala qué.\n/l/${list.shareToken}`)
  // cerca de compartir: antes del botón de WhatsApp, en la tapa
  const silencio = p.indexOf('Acá no vas a ver quién reservó qué: tu gente se organiza sin que te enteres.')
  expect(silencio).toBeGreaterThan(-1)
  expect(silencio).toBeLessThan(p.indexOf('Mandala por WhatsApp'))
  // y ningún número ni estado de reservas, como siempre
  expect(p).not.toMatch(/reservad[oa]s?\b/i)
})

test('Mi lista: "Contá tus gustos" lleva al primero que falta, dice cuántos van y desaparece cuando están todos', async () => {
  const { owner, list } = await preparar()
  await saltearBienvenida(h.db, owner.id)
  // sin deseos: primero "Agregar un deseo", después la tarjeta entera
  let p = renderToStaticMarkup(await miLista())
  expect(p).toContain('href="/perfil/gustos/deportes?volver=lista"')
  expect(p).toMatch(/Contá tus gustos <span[^>]*>· 0 de 7<\/span>/)
  expect(p).toContain('Talles, colores, lo que no querés: así tu gente acierta.')
  expect(p.indexOf('Agregar un deseo')).toBeLessThan(p.indexOf('Contá tus gustos'))

  // con deseos y algunos contados: una fila, arriba de los deseos, al próximo que falta
  await h.db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Mate' })
  await guardarGustos(h.db, owner.id, sanitizarGustos({ deportes: ['Pádel'], colores: ['Verde'] }))
  p = renderToStaticMarkup(await miLista())
  expect(p).toContain('href="/perfil/gustos/futbol?volver=lista"')
  expect(p).toMatch(/· 2 de 7</)
  expect(p).toContain('Así tu gente acierta.')
  expect(p).not.toContain('Talles, colores, lo que no querés')
  expect(p.indexOf('Contá tus gustos')).toBeLessThan(p.indexOf('Tus deseos'))

  // todos contados: no está
  await guardarGustos(h.db, owner.id, sanitizarGustos({
    deportes: ['Pádel'], club: NO_FUTBOL, hobbies: ['Leer'], marcas: ['Nike'], colores: ['Verde'], bebidas: ['Mate'], noRegalar: ['Perfumes'],
  }))
  expect(renderToStaticMarkup(await miLista())).not.toContain('Contá tus gustos')
  // y quien ya había pasado la bienvenida de antes (con sus gustos) no vuelve a pasar por nada
  expect((await h.db.select({ at: users.bienvenidaAt }).from(users).where(eq(users.id, owner.id)))[0].at).toBeInstanceOf(Date)
  expect(await redirige(miLista())).toBeNull()
})

test('"Pegar un link" sin un link copiado: no hay nada que traer, y el formulario avisa cómo copiarlo', () => {
  // sin nada copiado (o sin permiso para leerlo): sin link, y con el aviso
  expect(loCopiadoParaAgregar('')).toEqual({ link: null, pendiente: { tipo: 'sin-link' } })
  // un link (solo, o adentro de lo que comparte una tienda): ese es el que se trae
  const ml = 'https://articulo.mercadolibre.com.ar/MLA-1418506688-mate-imperial-_JM'
  expect(loCopiadoParaAgregar(ml)).toEqual({ link: ml, pendiente: { tipo: 'link', texto: ml } })
  expect(loCopiadoParaAgregar(`Mirá este mate ${ml}`)).toEqual({ link: ml, pendiente: { tipo: 'link', texto: `Mirá este mate ${ml}` } })
  // un texto que no es un link va a "¿Qué querés?", pero tampoco hay nada que traer
  expect(loCopiadoParaAgregar('zapatillas de running')).toEqual({ link: null, pendiente: { tipo: 'link', texto: 'zapatillas de running' } })
})
