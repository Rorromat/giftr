import { expect, test, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { claims, comments, items, lists } from '@/db/schema'
import { createItem, updateItem } from '@/lib/items'
import { addComment } from '@/lib/comments'
import { markBought, reserveItem } from '@/lib/claims'
import { deseoDesdeForm, paraAgregar } from '@/lib/deseo-form'
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
  ]
  for (const [v, esperado] of casos) expect(linkHttp(v), v).toBe(esperado)
})

test('el formulario de un deseo: el link pegado en el título pasa a "Link a la tienda" y el título queda legible', () => {
  expect(deseoDesdeForm(form({ titulo: ML }))).toMatchObject({ titulo: 'mercadolibre.com.ar', linkTienda: ML })
  expect(deseoDesdeForm(form({ titulo: `Mate imperial ${ML}` }))).toMatchObject({ titulo: 'Mate imperial', linkTienda: ML })
  expect(deseoDesdeForm(form({ titulo: 'www.zara.com/ar/campera' }))).toMatchObject({ titulo: 'zara.com', linkTienda: 'https://www.zara.com/ar/campera' })
  // si ya puso un link a la tienda, no se pisa: el del título se va
  expect(deseoDesdeForm(form({ titulo: ML, linkTienda: 'https://otra.com/x' }))).toMatchObject({ titulo: 'mercadolibre.com.ar', linkTienda: 'https://otra.com/x' })
  // un título sin link queda como está
  expect(deseoDesdeForm(form({ titulo: 'Zara.com gift card' }))).toMatchObject({ titulo: 'Zara.com gift card', linkTienda: null })
  expect(deseoDesdeForm(form({ titulo: '   ' }))).toBeNull()
})

test('el formulario de un deseo: vacío es null, un link que no es link es undefined (al editar no borra), cantidad de 1 a 99', () => {
  const d = deseoDesdeForm(form({ titulo: 'Campera', linkTienda: 'www.zara.com/x', fotoUrl: 'no es un link', notas: '', cantidad: '99999999999' }))!
  expect(d).toMatchObject({ linkTienda: 'https://www.zara.com/x', fotoUrl: undefined, notas: null, cantidad: 99 })
  expect(paraAgregar(d)).not.toHaveProperty('fotoUrl')
  expect(paraAgregar(d)).not.toHaveProperty('notas')
  for (const [cantidad, esperado] of [['0', 1], ['-3', 1], ['1e20', 99], ['abc', 1], ['2.7', 2], ['42', 42]] as const) {
    expect(deseoDesdeForm(form({ titulo: 'x', cantidad }))!.cantidad, cantidad).toBe(esperado)
  }
  expect(deseoDesdeForm(form({ titulo: 'x', fotoUrl: '/foto/deseo/6a1c701f-89b2-4797-ad8e-0bec5918fc9a' }))!.fotoUrl)
    .toBe('/foto/deseo/6a1c701f-89b2-4797-ad8e-0bec5918fc9a')
  expect(deseoDesdeForm(form({ titulo: 'x', fotoUrl: 'javascript:alert(1)' }))!.fotoUrl).toBeUndefined()
})

test('agregar pegando el link en el título guarda el link a la tienda; una cantidad enorme queda en 99 y no rompe', async () => {
  const { list } = await preparar()
  expect(await redirigeA(addItemAction(form({ titulo: ML, cantidad: '99999999999' })))).toBe('/mi-lista')
  const [fila] = await h.db.select().from(items).where(eq(items.listId, list.id))
  expect(fila).toMatchObject({ titulo: 'mercadolibre.com.ar', linkTienda: ML, cantidad: 99 })
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
