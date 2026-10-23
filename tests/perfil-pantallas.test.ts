import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { lists, users } from '@/db/schema'
import { guardarCumple, miCumple } from '@/lib/events'
import { guardarGustos, misGustos } from '@/lib/bienvenida'
import { sanitizarGustos } from '@/lib/gustos'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { CumpleCampos } from '@/components/CumpleCampos'
import { ATAJO_IPHONE, TEXTOS_APPS } from '@/lib/agregar-desde-apps'

// Perfil, la bienvenida y el perfil público tal cual, con la base en PGlite y la sesión, el user-agent y las redirecciones
// de Next simulados.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  session: null as { userId: string; user?: { name: string } } | null,
  ua: '',
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(h.ua ? { 'user-agent': h.ua } : {}),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

import { saveBirthdayAction, saveGustosAction } from '@/app/actions'
import Listo from '@/app/bienvenida/listo/page'
import Bienvenida from '@/app/bienvenida/page'
import PerfilPublico from '@/app/l/[token]/perfil/page'
import Perfil from '@/app/(menu)/perfil/page'

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
  h.ua = ''
  return seed
}

const html = async (p: Promise<React.ReactNode>) => renderToStaticMarkup(await p as React.ReactElement)

test('Tu cumple en Perfil: se borra solo con "Quitar"; vacío, a medias o imposible vuelve con el aviso y no toca lo guardado', async () => {
  const { owner } = await preparar()
  expect(await redirige(saveBirthdayAction(form({ dia: '12', mes: '10' })))).toBeNull()
  expect(await miCumple(h.db, owner.id)).toEqual({ dia: 12, mes: 10 })
  // el segundo "Guardar" con los selects vueltos a vacío ya no lo borra
  for (const campos of [{ dia: '', mes: '' }, { dia: '15', mes: '' }, { dia: '', mes: '3' }, { dia: '30', mes: '2' }]) {
    expect(await redirige(saveBirthdayAction(form(campos)))).toBe('/perfil?cumple=invalido#cumple')
  }
  expect(await miCumple(h.db, owner.id)).toEqual({ dia: 12, mes: 10 })
  // con el aviso arriba, guardar bien lo saca
  expect(await redirige(saveBirthdayAction(form({ dia: '29', mes: '2', conAviso: '1' })))).toBe('/perfil#cumple')
  expect(await miCumple(h.db, owner.id)).toEqual({ dia: 29, mes: 2 })
  expect(await redirige(saveBirthdayAction(form({ dia: '', mes: '', quitar: '1' })))).toBeNull()
  expect(await miCumple(h.db, owner.id)).toBeNull()
})

/** El elemento con ese id en lo que devuelve una página (sin renderizar los componentes: solo el árbol). */
function conId(nodo: React.ReactNode, id: string): React.ReactElement | null {
  if (Array.isArray(nodo)) {
    for (const n of nodo) {
      const r = conId(n, id)
      if (r) return r
    }
    return null
  }
  if (!nodo || typeof nodo !== 'object' || !('props' in nodo)) return null
  const el = nodo as React.ReactElement<{ id?: string; children?: React.ReactNode }>
  return el.props.id === id ? el : conId(el.props.children, id)
}

test('Tu cumple en Perfil: el formulario se vuelve a armar con lo guardado (si no, un select quedaba en el valor viejo)', async () => {
  const { owner } = await preparar()
  const formCumple = async (sp: Record<string, string> = {}) => conId(await Perfil({ searchParams: Promise.resolve(sp) }), 'cumple')!.key
  const sinCumple = await formCumple()
  await guardarCumple(h.db, owner.id, 12, 10)
  const conCumple = await formCumple()
  // con el aviso de un cumple que no se guardó también se arma de nuevo (el aviso y los selects con lo guardado)
  const conAviso = await formCumple({ cumple: 'invalido' })
  expect(new Set([sinCumple, conCumple, conAviso]).size).toBe(3)
  await guardarCumple(h.db, owner.id, 3, 4)
  expect(await formCumple()).not.toBe(conCumple)
  expect(await formCumple()).toBe(await formCumple())
})

test('bienvenida: un cumple a medias no se pierde en silencio: se guardan los gustos y vuelve al primer paso con el aviso', async () => {
  const { owner } = await preparar()
  await guardarCumple(h.db, owner.id, 3, 4)
  expect(await redirige(saveGustosAction(form({ deportes: 'Pádel', dia: '15', mes: '' })))).toBe('/bienvenida?paso=0&cumple=invalido')
  expect((await misGustos(h.db, owner.id))?.deportes).toEqual(['Pádel'])
  expect(await miCumple(h.db, owner.id)).toEqual({ dia: 3, mes: 4 })
  expect(await redirige(saveGustosAction(form({ dia: '31', mes: '4', volver: 'perfil' })))).toBe('/bienvenida?editar=1&paso=0&cumple=invalido')
  // "Más tarde" (o "Guardar" arriba, desde Perfil) quería salir: sale a Perfil, que avisa al lado de su cumple
  expect(await redirige(saveGustosAction(form({ hobbies: 'Cocinar', dia: '', mes: '7', corte: '1' })))).toBe('/perfil?cumple=invalido#cumple')
  expect((await misGustos(h.db, owner.id))?.hobbies).toEqual(['Cocinar'])
  expect(await redirige(saveGustosAction(form({ dia: '31', mes: '4', volver: 'perfil', corte: '1' })))).toBe('/perfil?cumple=invalido#cumple')
  // los dos vacíos es que lo sacó (los campos vienen con el guardado)
  expect(await redirige(saveGustosAction(form({ dia: '', mes: '' })))).toBe('/bienvenida/listo')
  expect(await miCumple(h.db, owner.id)).toBeNull()
})

test('bienvenida con el aviso del cumple: se arma de nuevo en el primer paso y el aviso se ve', async () => {
  await preparar()
  type Pagina = React.ReactElement<{ children: React.ReactElement }>
  const pagina = async (sp: Record<string, string>) => await Bienvenida({ searchParams: Promise.resolve(sp) }) as Pagina
  // Cambiar solo la dirección no vuelve a montar el formulario (el router guarda su estado: seguía en el último paso,
  // con el aviso escondido en el primero). Con otra key, sí.
  const [antes, despues] = [await pagina({}), await pagina({ paso: '0', cumple: 'invalido' })]
  expect(despues.props.children.key).not.toBe(antes.props.children.key)
  const visto = renderToStaticMarkup(despues)
  const aviso = visto.indexOf('Tu cumple no se guardó')
  expect(aviso).toBeGreaterThan(-1)
  // en la sección del paso que se ve, no en una escondida
  expect(visto.slice(visto.lastIndexOf('<section', aviso), aviso)).not.toContain('class="hidden"')
  expect(renderToStaticMarkup(antes)).not.toContain('Tu cumple no se guardó')
})

test('los días del cumple son los del mes elegido (29 en febrero)', () => {
  const opciones = (mes?: number) => (renderToStaticMarkup(createElement(CumpleCampos, { mes })).match(/<option value="\d+"/g) ?? []).length
  expect(opciones(2)).toBe(29 + 12)
  expect(opciones(4)).toBe(30 + 12)
  expect(opciones()).toBe(31 + 12)
  expect(renderToStaticMarkup(createElement(CumpleCampos, { exigir: true }))).toContain('required')
})

test('"¡Todo listo!" la primera vez: completar un paso sigue en la bienvenida, no pasa al modo de Perfil', async () => {
  await preparar()
  const primera = await html(Listo({ searchParams: Promise.resolve({}) }))
  expect(primera).toContain('href="/bienvenida?paso=1"')
  expect(primera).not.toContain('editar=1')
  expect(primera).toContain('Agregar mi primer deseo')
  const desdePerfil = await html(Listo({ searchParams: Promise.resolve({ desde: 'perfil' }) }))
  expect(desdePerfil).toContain('href="/bienvenida?editar=1&amp;paso=1"')
  expect(desdePerfil).toContain('Volver a Perfil')
})

test('perfil público: con talles o "lo que no" pero sin gustos, no dice que no cargó nada', async () => {
  const { owner, list } = await preparar()
  await guardarGustos(h.db, owner.id, sanitizarGustos({ talles: { remera: 'M' }, noRegalar: ['Perfumes'] }))
  h.session = null
  const ver = () => html(PerfilPublico({ params: Promise.resolve({ token: list.shareToken }), searchParams: Promise.resolve({}) }))
  let p = await ver()
  expect(p).not.toContain('todavía no cargó')
  expect(p).toContain('Perfumes')
  expect(p).not.toContain('Lo que le gusta')
  // sin nada de nada, sí
  await h.db.update(users).set({ gustos: null }).where(eq(users.id, owner.id))
  p = await ver()
  expect(p).toContain('Euge todavía no cargó sus gustos.')
})

test('perfil público visto por su dueño: no promete "ver mi lista como la ven", vuelve a su lista o a su grupo', async () => {
  const { owner, giver, list } = await preparar()
  const ver = (token: string, quien?: string) =>
    html(PerfilPublico({ params: Promise.resolve({ token }), searchParams: Promise.resolve(quien ? { quien } : {}) }))
  let p = await ver(list.shareToken)
  expect(p).not.toContain('como la ven</')
  expect(p).toContain('href="/mi-lista"')
  expect(p).toContain('Volver a mi lista')
  expect(p).toContain('href="/perfil"')

  // un co-dueño del grupo que mira el perfil del otro: al grupo
  const grupoId = await crearGrupo(h.db, owner.id, { nombre: 'Nuestra casa' })
  const [grupo] = await h.db.select().from(lists).where(eq(lists.id, grupoId))
  await unirseAGrupo(h.db, grupo.inviteToken!, giver.id)
  h.session = { userId: giver.id }
  p = await ver(grupo.shareToken, owner.id)
  expect(p).toContain(`href="/grupos/${grupoId}"`)
  expect(p).toContain('Volver al grupo')

  // el que regala, a la lista
  h.session = null
  p = await ver(list.shareToken)
  expect(p).toContain(`href="/l/${list.shareToken}"`)
  expect(p).toContain('Ver la lista de Euge')
})

test('"Agregar desde otras apps" en Perfil: en Android y en iPhone (con la receta del atajo mientras no haya link); en la compu, no', async () => {
  await preparar()
  const perfil = (ua: string) => { h.ua = ua; return html(Perfil({ searchParams: Promise.resolve({}) })) }
  const android = await perfil('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36')
  expect(android).toContain(TEXTOS_APPS.titulo)
  // después de Avisos
  expect(android.indexOf(TEXTOS_APPS.titulo)).toBeGreaterThan(android.indexOf('>Avisos<'))
  expect(android).toContain(TEXTOS_APPS['android-manual'].texto)
  expect(android).not.toContain(TEXTOS_APPS.receta.sinAtajo)

  expect(ATAJO_IPHONE).toBeNull()
  const iphone = await perfil('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1')
  expect(iphone).toContain(TEXTOS_APPS.titulo)
  expect(iphone).toContain(TEXTOS_APPS.ios.texto)
  expect(iphone).toContain(`<details open=""`)
  expect(iphone).toContain(`>${TEXTOS_APPS.receta.sinAtajo}</summary>`)
  expect(iphone).toContain('/compartir?url=')

  for (const ua of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', '']) {
    const compu = await perfil(ua)
    expect(compu).toContain('>Avisos<')
    expect(compu).not.toContain(TEXTOS_APPS.titulo)
  }
})
