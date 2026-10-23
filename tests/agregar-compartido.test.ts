import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { crearGrupo } from '@/lib/groups'
import { VUELTA_MAX } from '@/lib/recibir-compartido'

// /agregar con lo compartido desde otra app, tal cual: la base en PGlite y la sesión, los headers del pedido y las
// redirecciones de Next simulados.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  session: null as { userId: string } | null,
  headers: {} as Record<string, string>,
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(h.headers),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

import Agregar from '@/app/(menu)/agregar/page'
import { FOTO_NO_LLEGO as NO_LLEGO } from '@/components/RecibirCompartido'

const ML = 'https://articulo.mercadolibre.com.ar/MLA-1418506688-mate-imperial-de-calabaza-_JM'
const ID = '0b6a3a9e-5d2c-4f1e-9a7b-3c4d5e6f7a8b'

type Busqueda = Record<string, string | string[]>

async function preparar(conSesion = true) {
  h.db = await createTestDb()
  h.headers = { 'sec-fetch-site': 'same-origin' }
  const seed = await seedOwnerAndGiver(h.db)
  h.session = conSesion ? { userId: seed.owner.id } : null
  return seed
}

const pagina = async (q: Busqueda) => renderToStaticMarkup(await Agregar({ searchParams: Promise.resolve(q) }))

/** A dónde redirige (null si no redirige). */
async function redirige(q: Busqueda): Promise<string | null> {
  try { await Agregar({ searchParams: Promise.resolve(q) }) } catch (e) { return (e as { url: string }).url }
  return null
}

/** El input del título, tal cual quedó en el HTML. */
const titulo = (html: string) => /<input[^>]*name="titulo"[^>]*>/.exec(html)?.[0] ?? ''
const notas = (html: string) => /<textarea[^>]*name="notas"[^>]*>([^<]*)<\/textarea>/.exec(html)?.[1] ?? null

test('?link= deja el link en "¿Qué querés?", como uno pegado (sin ?foto=no, sin el aviso de la foto)', async () => {
  await preparar()
  const html = await pagina({ link: ML })
  expect(titulo(html)).toContain(`value="${ML}"`)
  expect(html).not.toContain(NO_LLEGO)
  // las ideas para arrancar sin link no aparecen: ya hay algo
  expect(html).not.toContain('Arrancá por una idea')
})

test('?texto= llena el título con la primera línea y las notas con el texto entero', async () => {
  await preparar()
  const html = await pagina({ texto: 'Mate de calabaza\ncon bombilla' })
  expect(titulo(html)).toContain('value="Mate de calabaza"')
  expect(notas(html)).toBe('Mate de calabaza\ncon bombilla')
})

test('?texto= con un link de más de 2000 caracteres no deja un pedazo en el título (ni en las notas)', async () => {
  await preparar()
  const largo = `https://www.otro-sitio.com/p/${'a'.repeat(2100)}`
  expect(titulo(await pagina({ texto: largo }))).not.toContain('value=')
  const html = await pagina({ texto: `Mate de calabaza ${largo}\ncon bombilla` })
  expect(titulo(html)).toContain('value="Mate de calabaza"')
  expect(notas(html)).toBe('Mate de calabaza\ncon bombilla')
})

test('lo que no sirve deja el formulario vacío: javascript:, un link repetido en la URL, un id del buzón que no es uno', async () => {
  await preparar()
  for (const q of [{ link: 'javascript:alert(1)' }, { link: [ML, ML] }, { compartido: '../x' }, { texto: '  ' }] as Busqueda[]) {
    const html = await pagina(q)
    expect(titulo(html), JSON.stringify(q)).not.toContain('value=')
    expect(notas(html), JSON.stringify(q)).toBe('')
    // ni RecibirCompartido
    expect(html, JSON.stringify(q)).not.toContain('empty:-mt-4')
  }
})

test('&foto=no muestra que la foto no llegó (también solo, sin link)', async () => {
  await preparar()
  expect(await pagina({ link: ML, foto: 'no' })).toContain(NO_LLEGO)
  expect(await pagina({ foto: 'no' })).toContain(NO_LLEGO)
  expect(await pagina({ link: ML, foto: 'si' })).not.toContain(NO_LLEGO)
})

test('con buzón el formulario arranca vacío (lo llena RecibirCompartido), con la línea de la foto vacía', async () => {
  await preparar()
  const html = await pagina({ compartido: ID })
  expect(titulo(html)).not.toContain('value=')
  expect(html).toContain('<p role="status" class="-mt-2 text-xs font-semibold empty:-mt-4"></p>')
})

test('?lista= sigue andando con lo compartido (y una lista repetida en la URL no se toma)', async () => {
  const { owner } = await preparar()
  const grupo = await crearGrupo(h.db, owner.id, { nombre: 'Familia' })
  const conLista = await pagina({ lista: grupo, link: ML })
  const elegida = `name="listaId" checked="" value="${grupo}"`
  expect(conLista).toContain(elegida)
  expect(titulo(conLista)).toContain(`value="${ML}"`)
  expect(await pagina({ lista: [grupo, grupo] })).not.toContain(elegida)
})

test('sin sesión, entra con Google y vuelve con lo compartido; sin nada, a la portada como siempre', async () => {
  await preparar(false)
  expect(await redirige({ link: ML })).toBe(`/?volver=${encodeURIComponent(`/agregar?link=${encodeURIComponent(ML)}`)}`)
  expect(await redirige({ texto: 'Mate', foto: 'no' })).toBe(`/?volver=${encodeURIComponent('/agregar?texto=Mate&foto=no')}`)
  expect(await redirige({})).toBe('/')
  expect(await redirige({ lista: 'x' })).toBe('/')
  expect(await redirige({ link: 'javascript:alert(1)' })).toBe('/')
  // una vuelta que no entra en la cookie de Auth.js: a la portada, sin lo compartido
  expect(await redirige({ link: `${ML}?${'x'.repeat(VUELTA_MAX)}` })).toBe('/')
})

test('sin sesión y con buzón: la vuelta lleva auto=1 solo si se llegó desde GiftR o desde otra app', async () => {
  await preparar(false)
  for (const sitio of ['none', 'same-origin']) {
    h.headers = { 'sec-fetch-site': sitio }
    expect(await redirige({ compartido: ID }), sitio).toBe(`/?volver=${encodeURIComponent(`/agregar?compartido=${ID}&auto=1`)}`)
  }
  // sin Sec-Fetch-Site (un navegador viejo) no se sabe de dónde vino: como desde otro sitio
  for (const sitio of ['cross-site', 'same-site', null]) {
    h.headers = sitio ? { 'sec-fetch-site': sitio } : {}
    expect(await redirige({ compartido: ID }), String(sitio)).toBe(`/?volver=${encodeURIComponent(`/agregar?compartido=${ID}`)}`)
  }
  // la vuelta de Google llega cross-site: con auto=1 y el buzón sigue valiendo (y vuelve igual)
  h.headers = { 'sec-fetch-site': 'cross-site' }
  expect(await redirige({ compartido: ID, auto: '1' })).toBe(`/?volver=${encodeURIComponent(`/agregar?compartido=${ID}&auto=1`)}`)
})
