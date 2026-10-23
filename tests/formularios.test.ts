import { expect, test, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { claims, comments, items, lists, notifications } from '@/db/schema'
import { archiveItem, createItem, updateItem } from '@/lib/items'
import { addComment } from '@/lib/comments'
import { markBought, reserveItem } from '@/lib/claims'
import { AVISO_LINK_LARGO, AVISO_NO_ES_LINK, avisoDelLink, avisoDelTitulo, deseoDesdeForm, paraAgregar } from '@/lib/deseo-form'
import { largo, recortar } from '@/lib/limites'
import { linkHttp } from '@/lib/links'
import { guardarGustos, misGustos } from '@/lib/bienvenida'
import { sanitizarGustos } from '@/lib/gustos'
import { validarNombre } from '@/lib/guest'

// Lo que se carga a mano en los formularios, con la base en PGlite y la sesión y las redirecciones de Next simuladas.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  session: null as { userId: string } | null,
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
}))

import { addItemAction, createGroupAction, updateItemAction } from '@/app/actions'

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

async function redirigeA(p: Promise<unknown>): Promise<string> {
  try { await p } catch (e) { return (e as { url: string }).url }
  throw new Error('esperaba una redirección')
}

async function preparar() {
  h.db = await createTestDb()
  const seed = await seedOwnerAndGiver(h.db)
  h.session = { userId: seed.owner.id }
  return seed
}

const ML = 'https://articulo.mercadolibre.com.ar/MLA-123456-mate-imperial-_JM'

test('recortar: por caracteres de verdad, sin partir un emoji, y sin caracteres de control', () => {
  expect(recortar('  hola  ', 10)).toBe('hola')
  expect(recortar('x'.repeat(29) + '😀z', 30)).toBe('x'.repeat(29) + '😀')
  // una familia o una bandera son un solo carácter: entran enteras o no entran
  expect(recortar('ab👨‍👩‍👧‍👦cd', 3)).toBe('ab👨‍👩‍👧‍👦')
  expect(recortar('ab🇦🇷', 2)).toBe('ab')
  expect(recortar('a\u0000b\u0007c\nd', 10)).toBe('abc\nd')
  expect(largo('🇦🇷👨‍👩‍👧‍👦é')).toBe(3)
  for (const t of [recortar('😀'.repeat(200), 120), recortar('x' + '🇦🇷'.repeat(80), 41)]) expect(t.isWellFormed()).toBe(true)
  // los emojis más largos (una familia con tonos de piel, la bandera de Inglaterra, 1️⃣) y las tildes quedan enteros
  const largos = '👨🏻‍👩🏻‍👧🏻‍👦🏻🏴󠁧󠁢󠁥󠁮󠁧󠁿1️⃣🏳️‍⚧️ ñandú e\u0301\u0302'
  expect(recortar(largos, 120)).toBe(largos)
})

test('recortar: un carácter con cientos de miles de marcas encimadas (texto "zalgo") no pasa entero', async () => {
  const zalgo = 'a' + '\u0301'.repeat(200_000)
  expect(largo(zalgo)).toBe(1)
  expect(recortar(zalgo, 500)).toBe('a\u0301\u0301\u0301\u0301')
  // también entre otras letras, y con lo que no es una marca (un ZWJ) en el medio
  expect(recortar(`hola ${'\u0300\u200d'.repeat(1000)}chau`, 500).length).toBeLessThan(50)
  expect(recortar('b' + '\u0301'.repeat(400), 500)).toBe('b\u0301\u0301\u0301\u0301')
  expect(validarNombre('Z' + '\u0336'.repeat(59))).toEqual({ ok: true, nombre: 'Z\u0336\u0336\u0336\u0336' })

  const { owner, giver } = await preparar()
  const item = (await createItem(h.db, owner.id, { tipo: 'exacto', titulo: zalgo, precio: zalgo }))!
  expect(item.titulo.length).toBe(5)
  expect(item.precio!.length).toBe(5)
  expect(await addComment(h.db, item.id, { userId: giver.id }, zalgo)).toBe(true)
  expect((await h.db.select().from(comments))[0].texto.length).toBe(5)
})

test('recortar: un carácter de cientos de unidades sin marcas (emojis con ZWJ, tonos de piel, etiquetas, jamo) no pasa entero', async () => {
  // cada uno es un solo carácter de verdad, sin un \p{M}: antes entraba entero si el largo de JS entraba
  const enteros = ['😀\u200d'.repeat(160) + '😀', '👍' + '🏻'.repeat(240), '🏴' + '\u{E0067}'.repeat(240), 'ᄀ'.repeat(480)]
  for (const uno of enteros) {
    expect(largo(uno)).toBe(1)
    expect(recortar(uno, 500).length).toBeLessThanOrEqual(32)
    expect(recortar(`Mate ${uno} rojo`, 120)).toMatch(/^Mate \S+ rojo$/u)
    expect(recortar(`Mate ${uno} rojo`, 120).length).toBeLessThan(45)
  }
  const nombre = validarNombre(`Ro${enteros[0]}`)
  expect(nombre.ok && nombre.nombre.length).toBeLessThanOrEqual(34)

  const { owner, giver } = await preparar()
  const item = (await createItem(h.db, owner.id, { tipo: 'exacto', titulo: enteros[0].slice(0, 119) }))!
  expect(item.titulo.length).toBeLessThanOrEqual(32)
  expect(await addComment(h.db, item.id, { userId: giver.id }, enteros[1])).toBe(true)
  expect((await h.db.select().from(comments))[0].texto.length).toBeLessThanOrEqual(32)
})

test('sin los caracteres que dan vuelta lo que sigue: un nombre con U+202E no da vuelta "Reservado por …"', () => {
  expect(validarNombre('Rodri\u202e\u2066x\u2069')).toEqual({ ok: true, nombre: 'Rodrix' })
  expect(recortar('hola\u202a\u202b\u202c\u202d\u202e\u2067\u2068chau', 20)).toBe('holachau')
  // los de dirección que no dan vuelta nada (y el texto en otro alfabeto) quedan
  expect(recortar('שלום\u200f ok', 20)).toBe('שלום\u200f ok')
})

test('links: sin https:// se lo agrega si tiene pinta de dominio; lo que no es un link de una página, no', () => {
  const casos: [string, string | null][] = [
    ['mercadolibre.com.ar/MLA-1', 'https://mercadolibre.com.ar/MLA-1'],
    ['www.zara.com/ar/campera-123', 'https://www.zara.com/ar/campera-123'],
    ['//www.zara.com/x', 'https://www.zara.com/x'],
    ['https://tienda.com.ar/a?b=1#c', 'https://tienda.com.ar/a?b=1#c'],
    ['HTTP://TIENDA.COM/X', 'HTTP://TIENDA.COM/X'],
    ['  https://ñandú.com.ar/x  ', 'https://ñandú.com.ar/x'],
    ['javascript:alert(1)', null],
    ['data:text/html,<b>hola</b>', null],
    ['ftp://tienda.com/x', null],
    ['zara', null],
    ['una campera.negra linda', null],
    ['https://localhost/x', null],
    ['https://', null],
    [`https://tienda.com/${'x'.repeat(2000)}`, null],
    // un \u0000 que new URL acepta y Postgres no (guardar daba la pantalla de error), u otro carácter de control
    ['https://x.com/a\u0000b', null],
    ['mercadolibre.com.ar/x\u0000y', null],
    ['https://x.com/a\u007fb', null],
    ['https://x.com/a\u001bb', null],
  ]
  for (const [v, esperado] of casos) expect(linkHttp(v), JSON.stringify(v)).toBe(esperado)
})

test('un link con un carácter de control no rompe al guardar: ni en la tienda, ni en la foto, ni pegado en el título', async () => {
  const { list } = await preparar()
  const conNul = 'https://articulo.mercadolibre.com.ar/MLA-1\u0000x'
  expect(await redirigeA(addItemAction(form({ titulo: 'Mate', linkTienda: conNul, fotoUrl: conNul })))).toBe('/mi-lista')
  expect(await redirigeA(addItemAction(form({ titulo: conNul })))).toBe('/mi-lista')
  const filas = await h.db.select().from(items).where(eq(items.listId, list.id))
  expect(filas).toHaveLength(2)
  expect(filas.map((f) => [f.linkTienda, f.fotoUrl])).toEqual([[null, null], [null, null]])
})

test('el formulario de un deseo: el link pegado en el título pasa a "Link a la tienda" y el título queda legible', () => {
  // solo el link: el nombre que trae ("…-mate-imperial-_JM"), o el sitio si no trae uno (una sola palabra, como el de Zara)
  expect(deseoDesdeForm(form({ titulo: ML }))).toMatchObject({ titulo: 'Mate imperial', linkTienda: ML })
  expect(deseoDesdeForm(form({ titulo: `Mate imperial ${ML}` }))).toMatchObject({ titulo: 'Mate imperial', linkTienda: ML })
  expect(deseoDesdeForm(form({ titulo: 'www.zara.com/ar/campera' }))).toMatchObject({ titulo: 'zara.com', linkTienda: 'https://www.zara.com/ar/campera' })
  // si ya puso otro link a la tienda, no se pisa ni se pierde el del título: queda en el título
  expect(deseoDesdeForm(form({ titulo: ML, linkTienda: 'https://otra.com/x' }))).toMatchObject({ titulo: ML, linkTienda: 'https://otra.com/x' })
  expect(deseoDesdeForm(form({ titulo: `Mate ${ML}`, linkTienda: 'otra.com/x' }))).toMatchObject({ titulo: `Mate ${ML}`, linkTienda: 'https://otra.com/x' })
  // el mismo link pegado en los dos lados (con o sin https://) no deja la URL de título
  expect(deseoDesdeForm(form({ titulo: ML, linkTienda: ML }))).toMatchObject({ titulo: 'Mate imperial', linkTienda: ML })
  expect(deseoDesdeForm(form({ titulo: `Mate ${ML}`, linkTienda: ML.replace('https://', '') }))).toMatchObject({ titulo: 'Mate', linkTienda: ML })
  // un título sin link queda como está
  expect(deseoDesdeForm(form({ titulo: 'Zara.com gift card' }))).toMatchObject({ titulo: 'Zara.com gift card', linkTienda: null })
  expect(deseoDesdeForm(form({ titulo: '   ' }))).toBeNull()
})

test('el link pegado en el título no se lleva la puntuación de la oración (la tienda daba una página que no existe)', () => {
  const casos: [string, { titulo: string; linkTienda: string }][] = [
    ['Mate, https://a.com/m, el negro', { titulo: 'Mate, el negro', linkTienda: 'https://a.com/m' }],
    ['Quiero este: https://tienda.com/x.', { titulo: 'Quiero este:', linkTienda: 'https://tienda.com/x' }],
    ['Remera (ver www.zara.com/ar)', { titulo: 'Remera (ver', linkTienda: 'https://www.zara.com/ar' }],
    ['Mirá https://a.com/x!', { titulo: 'Mirá', linkTienda: 'https://a.com/x' }],
    // los paréntesis del link, y lo que termina en "=", son del link
    ['Mate https://es.wikipedia.org/wiki/Mate_(infusión)', { titulo: 'Mate', linkTienda: 'https://es.wikipedia.org/wiki/Mate_(infusión)' }],
    ['(Mate https://es.wikipedia.org/wiki/Mate_(infusión)).', { titulo: '(Mate', linkTienda: 'https://es.wikipedia.org/wiki/Mate_(infusión)' }],
    ['Termo https://tienda.com/x?ref=', { titulo: 'Termo', linkTienda: 'https://tienda.com/x?ref=' }],
    // lo que pone solo el teclado del iPhone ("..." pasa a "…", "'" a "’"), y los corchetes o <> alrededor
    ['Mate https://a.com/x…', { titulo: 'Mate', linkTienda: 'https://a.com/x' }],
    ['Mirá ‘https://a.com/x’', { titulo: 'Mirá ‘', linkTienda: 'https://a.com/x' }],
    ['Ver [https://x.com/a]', { titulo: 'Ver [', linkTienda: 'https://x.com/a' }],
    ['Mate <https://x.com/a>', { titulo: 'Mate <', linkTienda: 'https://x.com/a' }],
    ['Ver https://x.com/a?f[0]=1', { titulo: 'Ver', linkTienda: 'https://x.com/a?f[0]=1' }],
    [ML, { titulo: 'Mate imperial', linkTienda: ML }],
  ]
  for (const [titulo, esperado] of casos) expect(deseoDesdeForm(form({ titulo })), titulo).toMatchObject(esperado)
  expect(deseoDesdeForm(form({ titulo: 'www.' }))).toMatchObject({ titulo: 'www.', linkTienda: null })
  // un título enorme de puntuación no traba el servidor
  const inicio = Date.now()
  expect(deseoDesdeForm(form({ titulo: `https://a.com/${'.'.repeat(200_000)}x` }))!.linkTienda).toBeNull()
  expect(deseoDesdeForm(form({ titulo: `https://a.com/x${')'.repeat(200_000)}` }))!.linkTienda).toBe('https://a.com/x')
  expect(deseoDesdeForm(form({ titulo: `https://a.com/x${']…'.repeat(100_000)}` }))!.linkTienda).toBe('https://a.com/x')
  expect(Date.now() - inicio).toBeLessThan(2000)
})

test('el formulario de un deseo: vacío es null, un link que no es link es undefined (al editar no borra), cantidad entera desde 1', () => {
  // el tope de 99 lo pone createItem/updateItem (ver el test de abajo)
  const d = deseoDesdeForm(form({ titulo: 'Campera', linkTienda: 'www.zara.com/x', fotoUrl: 'no es un link', notas: '', cantidad: '99999999999' }))!
  expect(d).toMatchObject({ linkTienda: 'https://www.zara.com/x', fotoUrl: undefined, notas: null, cantidad: 99999999999 })
  expect(paraAgregar(d)).not.toHaveProperty('fotoUrl')
  expect(paraAgregar(d)).not.toHaveProperty('notas')
  for (const [cantidad, esperado] of [['0', 1], ['-3', 1], ['1e999', 1], ['abc', 1], ['2.7', 2], ['42', 42]] as const) {
    expect(deseoDesdeForm(form({ titulo: 'x', cantidad }))!.cantidad, cantidad).toBe(esperado)
  }
  expect(deseoDesdeForm(form({ titulo: 'x', fotoUrl: '/foto/deseo/6a1c701f-89b2-4797-ad8e-0bec5918fc9a' }))!.fotoUrl)
    .toBe('/foto/deseo/6a1c701f-89b2-4797-ad8e-0bec5918fc9a')
  expect(deseoDesdeForm(form({ titulo: 'x', fotoUrl: 'javascript:alert(1)' }))!.fotoUrl).toBeUndefined()
  // una foto subida va como la ruta, en minúsculas (con mayúsculas la ruta no la encuentra, y la limpieza tampoco)
  expect(deseoDesdeForm(form({ titulo: 'x', fotoUrl: '/FOTO/DESEO/6A1C701F-89B2-4797-AD8E-0BEC5918FC9A' }))!.fotoUrl)
    .toBe('/foto/deseo/6a1c701f-89b2-4797-ad8e-0bec5918fc9a')
})

test('volver a cargar enseguida el mismo deseo con otra cantidad, prioridad o "se puede repetir" no es un doble toque', async () => {
  const { owner, list } = await preparar()
  const base = { tipo: 'idea' as const, titulo: 'Velas', linkTienda: 'https://velas.com/x' }
  const primero = (await createItem(h.db, owner.id, base))!
  // un doble toque manda lo mismo: sin venir, la cantidad, la prioridad y la marca son las de la columna
  expect((await createItem(h.db, owner.id, { ...base, cantidad: 1, prioridad: 'gustaria', repetible: false }))!.id).toBe(primero.id)
  for (const otro of [{ cantidad: 3 }, { prioridad: 'mucho' as const }, { repetible: true }]) {
    const creado = (await createItem(h.db, owner.id, { ...base, ...otro }))!
    expect(creado.id).not.toBe(primero.id)
    expect(creado).toMatchObject(otro)
  }
  expect(await h.db.select().from(items).where(eq(items.listId, list.id))).toHaveLength(4)
})

test('archivar un deseo y volver a cargarlo igual enseguida lo agrega de nuevo (no es un doble toque)', async () => {
  const { owner, list } = await preparar()
  const termo = (await createItem(h.db, owner.id, { tipo: 'exacto', titulo: 'Termo' }))!
  expect(await archiveItem(h.db, termo.id, owner.id, 'lo_tengo')).toBe(true)
  const otro = (await createItem(h.db, owner.id, { tipo: 'exacto', titulo: 'Termo' }))!
  expect(otro.id).not.toBe(termo.id)
  expect(otro.estadoDueno).toBe('activo')
  const filas = await h.db.select({ id: items.id, estado: items.estadoDueno }).from(items).where(eq(items.listId, list.id))
  expect(filas.map((f) => f.estado).sort()).toEqual(['activo', 'lo_tengo'])
})

test('editar un deseo de antes con un link en el título y otro a la tienda: cambiar la prioridad no le toca el título ni avisa', async () => {
  const { owner, giver } = await preparar()
  const titulo = `Mate ${ML}`
  const item = (await createItem(h.db, owner.id, { tipo: 'exacto', titulo: 'Mate', linkTienda: 'https://otra.com/x' }))!
  await h.db.update(items).set({ titulo }).where(eq(items.id, item.id))
  const r = await reserveItem(h.db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error('no reservó')
  expect(await redirigeA(updateItemAction(form({ itemId: item.id, titulo, linkTienda: 'https://otra.com/x', prioridad: 'mucho' }))))
    .toBe(`/deseo/${item.id}`)
  expect((await h.db.select().from(items).where(eq(items.id, item.id)))[0])
    .toMatchObject({ titulo, linkTienda: 'https://otra.com/x', prioridad: 'mucho' })
  expect(await h.db.select().from(notifications)).toEqual([])
})

test('editar un deseo de antes con un link en el título y uno a la tienda que hoy no vale: no pisa el de la tienda ni avisa', async () => {
  const { owner, giver } = await preparar()
  const titulo = 'https://www.mercadolibre.com.ar/mate-x'
  const viejo = 'https://www.tienda.com/x talle M'
  const item = (await createItem(h.db, owner.id, { tipo: 'exacto', titulo: 'Mate' }))!
  await h.db.update(items).set({ titulo, linkTienda: viejo }).where(eq(items.id, item.id))
  const r = await reserveItem(h.db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error('no reservó')
  expect(await redirigeA(updateItemAction(form({ itemId: item.id, titulo, linkTienda: viejo, prioridad: 'mucho' })))).toBe(`/deseo/${item.id}`)
  expect((await h.db.select().from(items).where(eq(items.id, item.id)))[0]).toMatchObject({ titulo, linkTienda: viejo, prioridad: 'mucho' })
  expect(await h.db.select().from(notifications)).toEqual([])
  // en el navegador cuenta igual: el link del título se queda y cuenta en el largo
  expect(avisoDelTitulo(`${'x'.repeat(100)} ${titulo}`, undefined)).toContain('sobran')
})

test('agregar sin JS un link en el título y algo que no es link a la tienda: el del título pasa igual (no se corta)', async () => {
  const { list } = await preparar()
  // más largo que el título: quedarse ahí lo cortaba a 120 y se perdían los dos links
  const largo = `${ML}-${'x'.repeat(80)}`
  expect(await redirigeA(addItemAction(form({ titulo: largo, linkTienda: '@lacasadelmate' })))).toBe('/mi-lista')
  expect((await h.db.select().from(items).where(eq(items.listId, list.id)))[0]).toMatchObject({ titulo: 'Mate imperial', linkTienda: largo })
  // al editar sigue quedando en el título: el undefined conserva el link guardado (test de arriba)
  expect(deseoDesdeForm(form({ titulo: largo, linkTienda: '@lacasadelmate' }))).toMatchObject({ titulo: largo, linkTienda: undefined })
})

test('dos productos de la misma tienda pegados seguidos en el título son dos deseos (no un doble toque)', async () => {
  const { list } = await preparar()
  const mate = 'https://articulo.mercadolibre.com.ar/MLA-111-mate-imperial-_JM'
  const termo = 'https://articulo.mercadolibre.com.ar/MLA-222-termo-stanley-_JM'
  for (const titulo of [mate, termo]) expect(await redirigeA(addItemAction(form({ titulo })))).toBe('/mi-lista')
  const filas = await h.db.select().from(items).where(eq(items.listId, list.id))
  expect(filas.map((f) => [f.titulo, f.linkTienda]).sort()).toEqual([['Mate imperial', mate], ['Termo stanley', termo]])
  // el mismo dos veces (un doble toque) sigue siendo uno, y lo mismo con otra foto u otras notas son dos
  expect(await redirigeA(addItemAction(form({ titulo: termo })))).toBe('/mi-lista')
  expect(await redirigeA(addItemAction(form({ titulo: 'Remera', notas: 'la roja' })))).toBe('/mi-lista')
  expect(await redirigeA(addItemAction(form({ titulo: 'Remera', notas: 'la azul' })))).toBe('/mi-lista')
  expect(await redirigeA(addItemAction(form({ titulo: 'Remera', notas: 'la azul' })))).toBe('/mi-lista')
  expect(await h.db.select().from(items).where(eq(items.listId, list.id))).toHaveLength(4)
})

test('agregar pegando el link en el título guarda el link a la tienda; una cantidad enorme queda en 99 y no rompe', async () => {
  const { list } = await preparar()
  expect(await redirigeA(addItemAction(form({ titulo: ML, cantidad: '99999999999' })))).toBe('/mi-lista')
  const [fila] = await h.db.select().from(items).where(eq(items.listId, list.id))
  expect(fila).toMatchObject({ titulo: 'Mate imperial', linkTienda: ML, cantidad: 99 })
})

test('editar: un link sin https:// se guarda con https://; uno que no es link deja el que había; vacío lo borra', async () => {
  const { owner } = await preparar()
  const item = (await createItem(h.db, owner.id, { tipo: 'exacto', titulo: 'Campera', linkTienda: 'https://www.zara.com/a', fotoUrl: 'https://x.com/a.jpg' }))!
  const editar = (campos: Record<string, string>) => redirigeA(updateItemAction(form({ itemId: item.id, titulo: 'Campera', ...campos })))
  const fila = async () => (await h.db.select().from(items).where(eq(items.id, item.id)))[0]

  await editar({ linkTienda: 'www.zara.com/b', fotoUrl: 'https://x.com/a.jpg', cantidad: '3000000000' })
  expect(await fila()).toMatchObject({ linkTienda: 'https://www.zara.com/b', cantidad: 99 })
  await editar({ linkTienda: 'zara campera', fotoUrl: 'cualquier cosa' })
  expect(await fila()).toMatchObject({ linkTienda: 'https://www.zara.com/b', fotoUrl: 'https://x.com/a.jpg' })
  await editar({ linkTienda: '', fotoUrl: '' })
  expect(await fila()).toMatchObject({ linkTienda: null, fotoUrl: null })
})

test('createItem y updateItem acotan lo que les llegue: textos largos cortados, cantidad de 1 a 99, un link larguísimo no va', async () => {
  const { owner } = await preparar()
  const largoLink = `https://tienda.com/${'x'.repeat(2100)}`
  const item = (await createItem(h.db, owner.id, {
    tipo: 'exacto', titulo: `${'😀'.repeat(119)}🇦🇷🇦🇷`, notas: 'n'.repeat(5000), precio: '$'.repeat(100), cantidad: 3_000_000_000, linkTienda: largoLink,
  }))!
  const [fila] = await h.db.select().from(items).where(eq(items.id, item.id))
  expect(fila.titulo).toBe(`${'😀'.repeat(119)}🇦🇷`)
  expect(fila).toMatchObject({ notas: 'n'.repeat(500), precio: '$'.repeat(40), cantidad: 99, linkTienda: null })

  expect(await updateItem(h.db, item.id, owner.id, { cantidad: 2 ** 40, linkTienda: largoLink, notas: 'corta' })).toBe(true)
  expect((await h.db.select().from(items).where(eq(items.id, item.id)))[0]).toMatchObject({ cantidad: 99, linkTienda: null, notas: 'corta' })
  expect(await updateItem(h.db, item.id, owner.id, { cantidad: -5 })).toBe(true)
  expect((await h.db.select().from(items).where(eq(items.id, item.id)))[0].cantidad).toBe(1)
  // un título que no tiene nada no crea nada
  expect(await createItem(h.db, owner.id, { tipo: 'exacto', titulo: '\u0000 ' })).toBeNull()
})

test('editar un deseo de antes de los topes sin tocar lo largo no lo corta ni les avisa a los que lo reservaron', async () => {
  const { owner, giver } = await preparar()
  const item = (await createItem(h.db, owner.id, { tipo: 'exacto', titulo: 'Termo' }))!
  const titulo = `Termo Stanley Classic Legendary ${'x'.repeat(150)}`
  await h.db.update(items).set({ titulo, precio: '$'.repeat(60), cantidad: 150 }).where(eq(items.id, item.id))
  const r = await reserveItem(h.db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error('no reservó')
  // cambia solo la prioridad (que no avisa), con lo demás como vino en el formulario
  expect(await redirigeA(updateItemAction(form({ itemId: item.id, titulo, precio: '$'.repeat(60), cantidad: '150', prioridad: 'mucho' }))))
    .toBe(`/deseo/${item.id}`)
  expect((await h.db.select().from(items).where(eq(items.id, item.id)))[0])
    .toMatchObject({ titulo, precio: '$'.repeat(60), cantidad: 150, prioridad: 'mucho' })
  expect(await h.db.select().from(notifications)).toEqual([])
  // lo que sí cambia se acota; la cantidad, hasta la que ya tenía (como deja el formulario): bajarla no la manda a 99
  expect(await updateItem(h.db, item.id, owner.id, { titulo: `${titulo}!`, cantidad: 151 })).toBe(true)
  expect((await h.db.select().from(items).where(eq(items.id, item.id)))[0]).toMatchObject({ titulo: titulo.slice(0, 120), cantidad: 150 })
  expect(await redirigeA(updateItemAction(form({ itemId: item.id, titulo: titulo.slice(0, 120), cantidad: '140' })))).toBe(`/deseo/${item.id}`)
  expect((await h.db.select().from(items).where(eq(items.id, item.id)))[0].cantidad).toBe(140)
  // una vez bajada, el tope es la nueva: no vuelve a subir a la de antes
  expect(await updateItem(h.db, item.id, owner.id, { cantidad: 150 })).toBe(true)
  expect((await h.db.select().from(items).where(eq(items.id, item.id)))[0].cantidad).toBe(140)
})

test('el título y el link avisan en el navegador antes de que el servidor los corte o los descarte', () => {
  expect(avisoDelTitulo('Mate imperial', null)).toBe('')
  expect(avisoDelTitulo('x'.repeat(120), null)).toBe('')
  expect(avisoDelTitulo('😀'.repeat(120), null)).toBe('')
  expect(avisoDelTitulo('x'.repeat(135), null)).toBe('Hasta 120 letras: sobran 15. Lo demás va en Notas.')
  // un link pegado no cuenta (pasa a "Link a la tienda"), pero el texto que lo acompaña sí
  expect(avisoDelTitulo(ML, null)).toBe('')
  expect(avisoDelTitulo(`${'x'.repeat(100)} ${ML}`, null)).toBe('')
  expect(avisoDelTitulo(`${'x'.repeat(121)} ${ML}`, null)).toContain('sobran 1.')
  const largoLink = `https://tienda.com/${'x'.repeat(2000)}`
  expect(avisoDelTitulo(largoLink, null)).toBe(AVISO_LINK_LARGO)
  expect(avisoDelLink(largoLink)).toBe(AVISO_LINK_LARGO)
  expect(avisoDelLink(ML)).toBe('')
  expect(avisoDelLink('')).toBe('')
  // lo que el servidor no toma como link (y descartaba sin avisar: al agregar no se guardaba, al editar quedaba el de antes)
  for (const v of ['@lacasadelmate.ar', 'tienda.com.ar.', 'tienda..com', 'zara campera']) {
    expect(avisoDelLink(v), v).toBe(AVISO_NO_ES_LINK)
    expect(deseoDesdeForm(form({ titulo: 'Mate', linkTienda: v }))!.linkTienda, v).toBeUndefined()
  }
  expect(avisoDelLink('mercadolibre.com.ar/MLA-1')).toBe('')
  // con otro link a la tienda, el del título se queda en el título: ahí cuenta en el largo
  expect(avisoDelTitulo(`${'x'.repeat(100)} ${ML}`, 'https://otra.com/x')).toContain('sobran')
  expect(avisoDelTitulo('Mate imperial', 'https://otra.com/x')).toBe('')
  // con el mismo link en los dos lados, el del título pasa a la tienda: no cuenta
  const mlLargo = `${ML}#position=12&search_layout=grid&type=item&tracking_id=${'a'.repeat(60)}`
  expect(avisoDelTitulo(mlLargo, mlLargo)).toBe('')
})

test('sin Intl.Segmenter (Firefox antes de 125, Safari antes de 14.1) los formularios cargan igual', async () => {
  const original = Intl.Segmenter
  Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true, writable: true })
  vi.resetModules()
  try {
    // antes se creaba al cargar el archivo, y la página de agregar ni hidrataba
    const viejo = await import('@/lib/deseo-form')
    expect(viejo.avisoDelTitulo('x'.repeat(121), null)).toContain('sobran 1.')
    const limites = await import('@/lib/limites')
    expect(limites.recortar('ab😀cd', 3)).toBe('ab😀')
    expect(limites.largo('hola')).toBe(4)
  } finally {
    Object.defineProperty(Intl, 'Segmenter', { value: original, configurable: true, writable: true })
  }
})

test('comentarios de hasta 500 caracteres; con un id que no es de un deseo, no hace nada (ni un error)', async () => {
  const { owner, giver } = await preparar()
  const item = (await createItem(h.db, owner.id, { tipo: 'exacto', titulo: 'Termo' }))!
  expect(await addComment(h.db, item.id, { userId: giver.id }, 'a'.repeat(500_000))).toBe(true)
  const [c] = await h.db.select().from(comments)
  expect(c.texto).toBe('a'.repeat(500))
  expect(await addComment(h.db, 'no-es-uuid', { userId: giver.id }, 'hola')).toBe(false)
  expect(await addComment(h.db, item.id, { userId: giver.id }, '\u0000  ')).toBe(false)
})

test('lo que anota al comprar es corto', async () => {
  const { owner, giver } = await preparar()
  const item = (await createItem(h.db, owner.id, { tipo: 'exacto', titulo: 'Termo' }))!
  const r = await reserveItem(h.db, item.id, { userId: giver.id })
  if (!r.ok) throw new Error('no reservó')
  expect((await markBought(h.db, r.claimId, { userId: giver.id }, 'n'.repeat(10_000))).ok).toBe(true)
  expect((await h.db.select().from(claims).where(eq(claims.id, r.claimId)))[0].notaQueCompre).toBe('n'.repeat(200))
})

test('gustos: una marca con un emoji justo en el corte se guarda entera (antes rompía el jsonb y no se guardaba nada)', async () => {
  const { owner } = await preparar()
  const g = sanitizarGustos({ marcasOtras: `${'x'.repeat(29)}😀 más`, nota: 'soy a\u0000lérgica', club: `${'y'.repeat(39)}🇦🇷` })
  expect(g.marcas).toEqual([`${'x'.repeat(29)}😀`])
  expect(g.nota).toBe('soy alérgica')
  expect(g.club).toBe(`${'y'.repeat(39)}🇦🇷`)
  await guardarGustos(h.db, owner.id, g)
  expect((await misGustos(h.db, owner.id))?.marcas).toEqual([`${'x'.repeat(29)}😀`])
})

test('nombres: el de un invitado sin caracteres de control; el de un grupo cortado sin partir un emoji', async () => {
  expect(validarNombre('Ro\u0000dri')).toEqual({ ok: true, nombre: 'Rodri' })
  await preparar()
  const url = await redirigeA(createGroupAction(form({ nombre: `${'g'.repeat(59)}🎉🎉`, descripcion: 'd'.repeat(500) })))
  const [g] = await h.db.select().from(lists).where(eq(lists.id, url.split('/').at(-1)!))
  expect(g).toMatchObject({ nombre: `${'g'.repeat(59)}🎉`, descripcion: 'd'.repeat(120) })
})
