import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { items, lists, users } from '@/db/schema'
import { guardarCumple, miCumple } from '@/lib/events'
import { guardarGustos, misGustos, necesitaBienvenida, saltearBienvenida } from '@/lib/bienvenida'
import { preguntarAvisos } from '@/lib/codazos'
import { miAliasPago } from '@/lib/users'
import { sanitizarGustos } from '@/lib/gustos'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { CumpleCampos } from '@/components/CumpleCampos'
import { TallesIlustrados } from '@/components/TallesIlustrados'
import { TEXTOS_APPS } from '@/lib/agregar-desde-apps'

// Perfil, la bienvenida y el perfil público tal cual, con la base en PGlite y la sesión, el user-agent y las redirecciones
// de Next simulados.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  session: null as { userId: string; user?: { name: string } } | null,
  ua: '',
  atajo: null as string | null,
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(h.ua ? { 'user-agent': h.ua } : {}),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
// el link del atajo del iPhone, sin depender del de verdad (el dueño lo pega en ATAJO_IPHONE cuando lo arma)
vi.mock('@/lib/agregar-desde-apps', async (original) => ({
  ...await original<typeof import('@/lib/agregar-desde-apps')>(),
  get ATAJO_IPHONE() { return h.atajo },
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

import { bienvenidaAction, guardarAliasAction, saveBirthdayAction, saveGustosAction } from '@/app/actions'
import AvisosBienvenida from '@/app/bienvenida/avisos/page'
import Listo from '@/app/bienvenida/listo/page'
import Bienvenida from '@/app/bienvenida/page'
import PerfilPublico from '@/app/l/[token]/perfil/page'
import Perfil from '@/app/(menu)/perfil/page'
import TusGustos from '@/app/(menu)/perfil/gustos/page'
import EditarGustos from '@/app/(menu)/perfil/gustos/[paso]/page'

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
  h.atajo = null
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

test('bienvenida: una sola pantalla; con el cumple o con "Ahora no" sigue a su primer deseo (o a su lista, si ya tenía alguno)', async () => {
  const { owner, list } = await preparar()
  // un cumple a medias o que no existe no se pierde en silencio: vuelve con el aviso, sin dar la bienvenida por pasada
  expect(await redirige(bienvenidaAction(form({ dia: '15', mes: '' })))).toBe('/bienvenida?cumple=invalido')
  expect(await redirige(bienvenidaAction(form({ dia: '31', mes: '4' })))).toBe('/bienvenida?cumple=invalido')
  expect(await miCumple(h.db, owner.id)).toBeNull()
  expect(await necesitaBienvenida(h.db, owner.id)).toBe(true)
  // con el cumple: guardado, y de ahí a anotar su primer deseo (no a los gustos, ni a los avisos, ni a un resumen)
  expect(await redirige(bienvenidaAction(form({ dia: '12', mes: '10' })))).toBe('/agregar')
  expect(await miCumple(h.db, owner.id)).toEqual({ dia: 12, mes: 10 })
  expect(await necesitaBienvenida(h.db, owner.id)).toBe(false)
  expect(await misGustos(h.db, owner.id)).toBeNull()
  // por los avisos todavía no se le pregunta: no anotó nada
  expect(await preguntarAvisos(h.db, owner.id)).toBe(false)

  // "Ahora no": sigue igual, sin tocar el cumple (ni el guardado, ni lo que haya dejado a medias en los campos)
  await h.db.update(users).set({ bienvenidaAt: null }).where(eq(users.id, owner.id))
  expect(await redirige(bienvenidaAction(form({ dia: '', mes: '7', ahoraNo: '1' })))).toBe('/agregar')
  expect(await miCumple(h.db, owner.id)).toEqual({ dia: 12, mes: 10 })
  expect(await necesitaBienvenida(h.db, owner.id)).toBe(false)
  // "Seguir" con los dos vacíos no es un error: lo deja para después
  await h.db.update(users).set({ bienvenidaAt: null, cumpleDia: null, cumpleMes: null }).where(eq(users.id, owner.id))
  expect(await redirige(bienvenidaAction(form({ dia: '', mes: '' })))).toBe('/agregar')
  expect(await miCumple(h.db, owner.id)).toBeNull()

  // con un deseo ya anotado (lo compartió a GiftR desde una tienda antes de pasar por acá), a su lista
  await h.db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Mate' })
  await h.db.update(users).set({ bienvenidaAt: null }).where(eq(users.id, owner.id))
  expect(await redirige(bienvenidaAction(form({ ahoraNo: '1' })))).toBe('/mi-lista')
  // sin sesión, a la portada
  h.session = null
  expect(await redirige(bienvenidaAction(form({ ahoraNo: '1' })))).toBe('/')
})

test('la bienvenida de antes (los ocho pasos), en una pestaña que quedó abierta: guarda y sigue como la de ahora', async () => {
  const { owner, list } = await preparar()
  await guardarCumple(h.db, owner.id, 3, 4)
  // el cumple a medias: lo demás se guarda, y a Perfil, que avisa al lado de su cumple
  expect(await redirige(saveGustosAction(form({ deportes: 'Pádel', dia: '15', mes: '' })))).toBe('/perfil?cumple=invalido#cumple')
  expect((await misGustos(h.db, owner.id))?.deportes).toEqual(['Pádel'])
  expect(await miCumple(h.db, owner.id)).toEqual({ dia: 3, mes: 4 })
  expect(await redirige(saveGustosAction(form({ dia: '31', mes: '4', volver: 'perfil', corte: '1' })))).toBe('/perfil?cumple=invalido#cumple')
  // ya no pasa por los avisos ni por "¡Todo listo!": a su primer deseo, o a su lista si ya tiene alguno
  expect(await redirige(saveGustosAction(form({ hobbies: 'Leer', corte: '1' })))).toBe('/agregar')
  expect(await necesitaBienvenida(h.db, owner.id)).toBe(false)
  expect(await redirige(saveGustosAction(form({ hobbies: 'Leer', volver: 'perfil' })))).toBe('/perfil/gustos')
  await h.db.insert(items).values({ listId: list.id, tipo: 'exacto', titulo: 'Mate' })
  // los dos vacíos es que sacó el cumple (los campos vienen con el guardado)
  expect(await redirige(saveGustosAction(form({ dia: '', mes: '' })))).toBe('/mi-lista')
  expect(await miCumple(h.db, owner.id)).toBeNull()
  // las pantallas que ya no son un paso no dejan a nadie trabado: la de los avisos sigue a su lista
  expect(await redirige((async () => AvisosBienvenida())())).toBe('/mi-lista')
})

test('bienvenida: el cumple y dos botones ("Seguir" y "Ahora no"); con el aviso del cumple se arma de nuevo y el aviso se ve', async () => {
  const { owner } = await preparar()
  type Pagina = React.ReactElement<{ children: React.ReactElement[] }>
  const pagina = async (sp: Record<string, string>) => await Bienvenida({ searchParams: Promise.resolve(sp) }) as Pagina
  const formulario = (p: Pagina) => p.props.children.find((c) => c.type === 'form')!
  // Cambiar solo la dirección no vuelve a montar el formulario (los selects quedaban con lo que había elegido mal). Con
  // otra key, sí.
  const [antes, despues] = [await pagina({}), await pagina({ cumple: 'invalido' })]
  expect(formulario(despues).key).not.toBe(formulario(antes).key)
  expect(renderToStaticMarkup(despues)).toContain('Tu cumple no se guardó')
  const visto = renderToStaticMarkup(antes)
  expect(visto).not.toContain('Tu cumple no se guardó')
  expect(visto).toContain('¡Hola, Euge!')
  expect(visto).toContain('name="dia"')
  expect(visto).toContain('name="mes"')
  // "Ahora no" es un botón como los demás, no un texto chico
  expect(visto).toMatch(/<button[^>]*class="gr-btn-primary[^"]*"[^>]*>Seguir</)
  expect(visto).toMatch(/<button[^>]*class="gr-btn w-full[^"]*"[^>]*name="ahoraNo"[^>]*>Ahora no</)
  // una sola pantalla: nada de los gustos, ni pasos
  for (const no of ['Más tarde', 'Siguiente', 'name="deportes"', 'name="remera"', ' de 8']) expect(visto).not.toContain(no)
  // la pantalla de las fechas se llama "Todo el año"
  expect(visto).toContain('Todo el año')
  expect(visto).not.toContain('Eventos')
  // quien ya la pasó no la vuelve a ver
  await saltearBienvenida(h.db, owner.id)
  expect(await redirige(pagina({}))).toBe('/inicio')
  expect(await redirige(pagina({ paso: '3', cumple: 'invalido' }))).toBe('/inicio')
})

test('los días del cumple son los del mes elegido (29 en febrero)', () => {
  const opciones = (mes?: number) => (renderToStaticMarkup(createElement(CumpleCampos, { mes })).match(/<option value="\d+"/g) ?? []).length
  expect(opciones(2)).toBe(29 + 12)
  expect(opciones(4)).toBe(30 + 12)
  expect(opciones()).toBe(31 + 12)
  expect(renderToStaticMarkup(createElement(CumpleCampos, { exigir: true }))).toContain('required')
})

test('"¡Todo listo!": completar uno edita solo ese paso y vuelve ahí (no sigue por los que venían después)', async () => {
  await preparar()
  const primera = await html(Listo({ searchParams: Promise.resolve({}) }))
  expect(primera).toContain('href="/perfil/gustos/deportes?volver=listo"')
  expect(primera).toContain('href="/perfil/gustos/cumple?volver=listo"') // la foto y el cumple
  expect(primera).toContain('Agregar mi primer deseo')
  const desdePerfil = await html(Listo({ searchParams: Promise.resolve({ desde: 'perfil' }) }))
  expect(desdePerfil).toContain('href="/perfil/gustos/deportes?volver=listo-perfil"')
  expect(desdePerfil).toContain('Volver a Perfil')
})

test('editar un paso solo: guarda y vuelve a Tus gustos (o a "¡Todo listo!"); el cumple que no se guardó, al mismo paso', async () => {
  const { owner } = await preparar()
  expect(await redirige(saveGustosAction(form({ solo: 'deportes', deportes: 'Pádel' })))).toBe('/perfil/gustos?guardado=deportes')
  expect((await misGustos(h.db, owner.id))?.deportes).toEqual(['Pádel'])
  expect(await redirige(saveGustosAction(form({ solo: 'bebidas', bebidas: 'Mate', volver: 'listo' })))).toBe('/bienvenida/listo')
  expect(await redirige(saveGustosAction(form({ solo: 'bebidas', volver: 'listo-perfil' })))).toBe('/bienvenida/listo?desde=perfil')
  expect(await redirige(saveGustosAction(form({ solo: 'cumple', dia: '31', mes: '4' })))).toBe('/perfil/gustos/cumple?cumple=invalido')
  expect(await redirige(saveGustosAction(form({ solo: 'cumple', dia: '15', mes: '', volver: 'listo' })))).toBe('/perfil/gustos/cumple?cumple=invalido&volver=listo')
  // un paso que no existe no arma direcciones: sigue como la bienvenida
  expect(await redirige(saveGustosAction(form({ solo: '../../afuera' })))).toBe('/agregar')
})

test('desde la tarjeta de Mi lista (volver=lista): guardado un paso sigue por el próximo que falta, y al final "¡Todo listo!"', async () => {
  const { owner } = await preparar()
  const guardar = (campos: Record<string, string>) => redirige(saveGustosAction(form({ volver: 'lista', ...campos })))
  expect(await guardar({ solo: 'deportes', deportes: 'Pádel' })).toBe('/perfil/gustos/futbol?volver=lista')
  // el que dejó vacío no se le vuelve a preguntar: sigue por el que viene después
  expect(await guardar({ solo: 'futbol', deportes: 'Pádel' })).toBe('/perfil/gustos/hobbies?volver=lista')
  // los que ya contó se saltean
  const todoMenos = { deportes: 'Pádel', hobbies: 'Leer', marcas: 'Nike', bebidas: 'Mate' }
  expect(await guardar({ solo: 'hobbies', ...todoMenos })).toBe('/perfil/gustos/colores?volver=lista')
  expect(await guardar({ solo: 'colores', ...todoMenos, colores: 'Verde' })).toBe('/perfil/gustos/no-regalar?volver=lista')
  // no queda ninguno más adelante: "¡Todo listo!", con lo que falta a la vista (el fútbol, que dejó vacío)
  expect(await guardar({ solo: 'no-regalar', ...todoMenos, colores: 'Verde', noRegalar: 'Perfumes' })).toBe('/bienvenida/listo')
  expect((await misGustos(h.db, owner.id))?.noRegalar).toEqual(['Perfumes'])
  expect(await html(Listo({ searchParams: Promise.resolve({}) }))).toContain('href="/perfil/gustos/futbol?volver=listo"')
  // el cumple que no se guardó, al mismo paso, sin perder de dónde venía
  expect(await guardar({ solo: 'cumple', dia: '15', mes: '' })).toBe('/perfil/gustos/cumple?cumple=invalido&volver=lista')
})

test('la bienvenida desde Perfil (?editar=1, los links de antes) lleva a Tus gustos, o al paso que pedía', async () => {
  await preparar()
  const ir = (sp: Record<string, string>) => redirige(Bienvenida({ searchParams: Promise.resolve(sp) }))
  expect(await ir({ editar: '1' })).toBe('/perfil/gustos')
  expect(await ir({ editar: '1', paso: '5' })).toBe('/perfil/gustos/colores')
  expect(await ir({ editar: '1', paso: '99' })).toBe('/perfil/gustos')
  expect(await ir({})).toBeNull()
  // también para quien ya pasó la bienvenida (antes de fijarse si la pasó)
  await saltearBienvenida(h.db, h.session!.userId)
  expect(await ir({ editar: '1', paso: '5' })).toBe('/perfil/gustos/colores')
})

test('Tus gustos: cada bloque con lo cargado y su link para editarlo solo; lo vacío, para sumar', async () => {
  const { owner, list } = await preparar()
  await guardarGustos(h.db, owner.id, sanitizarGustos({ deportes: ['Pádel', 'Running'], colores: ['Verde'], talles: { remera: 'M' } }))
  const p = await html(TusGustos({ searchParams: Promise.resolve({}) }))
  expect(p).toContain('2 de 7')
  expect(p).toContain('href="/perfil/gustos/deportes"')
  expect(p).toContain('Pádel')
  expect(p).toContain('background:#2E8B57') // la muestra del verde
  expect(p).toMatch(/Remera<\/span><span[^>]*>M</)
  expect(p).toMatch(/Calzado<\/span><span[^>]*>—</)
  expect(p.match(/>Sumar</g)).toHaveLength(5)
  expect(p).toContain(`href="/l/${list.shareToken}/perfil"`)
  expect(p).not.toContain('role="status"')
  expect(await html(TusGustos({ searchParams: Promise.resolve({ guardado: 'deportes' }) }))).toContain('role="status"')
  // en Perfil, la fila lleva acá y dice cuánto completó
  const perfil = await html(Perfil({ searchParams: Promise.resolve({}) }))
  expect(perfil).toContain('href="/perfil/gustos"')
  expect(perfil).toContain('2 de 7')
})

test('editar un paso: se ve solo ese, con Guardar y Cancelar (a Tus gustos, o a "¡Todo listo!")', async () => {
  await preparar()
  const editar = (paso: string, sp: Record<string, string> = {}) =>
    html(EditarGustos({ params: Promise.resolve({ paso }), searchParams: Promise.resolve(sp) }))
  const p = await editar('colores')
  expect(p).toContain('name="solo" value="colores"')
  expect(p.match(/<section class="(?!hidden)/g)).toHaveLength(1)
  expect(p).toContain('Colores y talles')
  expect(p).not.toContain('Más tarde')
  expect(p).toContain('>Guardar<')
  expect(p).toContain('href="/perfil/gustos"')
  const desdeListo = await editar('bebidas', { volver: 'listo' })
  expect(desdeListo).toContain('name="volver" value="listo"')
  expect(desdeListo).toContain('href="/bienvenida/listo"')
  expect(await editar('bebidas', { volver: 'https://otro.sitio' })).not.toContain('name="volver"')
  // desde la tarjeta de Mi lista: cancelar vuelve a Mi lista y, si después falta otro, el botón dice que sigue
  const desdeLista = await editar('deportes', { volver: 'lista' })
  expect(desdeLista).toContain('name="volver" value="lista"')
  expect(desdeLista).toContain('href="/mi-lista"')
  expect(desdeLista).toContain('>Guardar y seguir<')
  expect(await editar('no-regalar', { volver: 'lista' })).toContain('>Guardar<')
  expect(p).not.toContain('Guardar y seguir')
  // el cumple, con el nombre de la pantalla de las fechas
  expect(await editar('cumple')).toContain('Tu gente lo ve en Todo el año')
  await expect(editar('nada')).rejects.toThrow('NEXT_NOT_FOUND')
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
  expect(p).toContain('Volver a la lista en común')

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

  const uaIPhone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
  const iphone = await perfil(uaIPhone)
  expect(iphone).toContain(TEXTOS_APPS.titulo)
  expect(iphone).toContain(TEXTOS_APPS.ios.texto)
  expect(iphone).toContain(`<details open=""`)
  expect(iphone).toContain(`>${TEXTOS_APPS.receta.sinAtajo}</summary>`)
  expect(iphone).toContain('/compartir?url=')
  expect(iphone).not.toContain(`>${TEXTOS_APPS.ios.boton}</a>`)
  // con el link en ATAJO_IPHONE: el botón, y la receta cerrada
  h.atajo = 'https://www.icloud.com/shortcuts/abc123'
  const conAtajo = await perfil(uaIPhone)
  expect(conAtajo).toContain(`href="https://www.icloud.com/shortcuts/abc123"`)
  expect(conAtajo).toContain(`>${TEXTOS_APPS.ios.boton}</a>`)
  expect(conAtajo).not.toContain('<details open')
  expect(conAtajo).toContain(`>${TEXTOS_APPS.receta.conAtajo}</summary>`)

  for (const ua of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', '']) {
    const compu = await perfil(ua)
    expect(compu).toContain('>Avisos<')
    expect(compu).not.toContain(TEXTOS_APPS.titulo)
  }
})

test('los talles ilustrados: cada prenda con su etiqueta y el talle; el que falta, con un guión (y lo dice para quien no ve)', () => {
  const svg = renderToStaticMarkup(createElement(TallesIlustrados, { talles: { remera: '3XL', pantalon: '40', calzado: null }, nombre: 'Ana' }))
  expect(svg).toContain('aria-label="Talles de Ana: remera 3XL, pantalón 40, calzado sin cargar"')
  const etiquetas = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1])
  expect(etiquetas).toEqual(['REMERA', '3XL', 'PANTALÓN', '40', 'CALZADO', '—'])
})

test('"Tu alias o CVU" en Perfil: dice quién lo ve, se guarda normalizado, uno que no vale vuelve con el aviso y vacío lo borra', async () => {
  const { owner } = await preparar()
  const perfil = (alias?: string) => html(Perfil({ searchParams: Promise.resolve(alias ? { alias } : {}) }))
  let p = await perfil()
  expect(p).toContain('Tu alias o CVU')
  expect(p).toContain('Lo ve solo quien te debe su parte de un regalo grupal')
  expect(p).toContain('No aparece en tu')
  // en su sección, no en "Lo que ve tu gente"
  expect(p.indexOf('Para que te transfieran')).toBeGreaterThan(p.indexOf('Ver cómo me ven los demás'))

  expect(await redirige(guardarAliasAction(form({ alias: ' Euge.Cobra.MP ' })))).toBe('/perfil?alias=ok#alias')
  expect(await miAliasPago(h.db, owner.id)).toBe('euge.cobra.mp')
  p = await perfil('ok')
  expect(p).toContain('value="euge.cobra.mp"')
  expect(p).toContain('Listo, te transfieren a tu alias euge.cobra.mp.')

  expect(await redirige(guardarAliasAction(form({ alias: 'no vale!' })))).toBe('/perfil?alias=formato#alias')
  expect(await miAliasPago(h.db, owner.id)).toBe('euge.cobra.mp')
  expect(await perfil('formato')).toContain('No se guardó: un alias tiene de 6 a 20 letras, números, puntos o guiones; un CVU o CBU, 22 números.')

  expect(await redirige(guardarAliasAction(form({ alias: '' })))).toBe('/perfil?alias=borrado#alias')
  expect(await miAliasPago(h.db, owner.id)).toBeNull()
  expect(await perfil('borrado')).toContain('Listo, lo borramos.')

  // sin sesión no guarda nada
  h.session = null
  expect(await redirige(guardarAliasAction(form({ alias: 'otro.alias' })))).toBe('/')
  expect(await miAliasPago(h.db, owner.id)).toBeNull()
})

test('perfil público: el alias no aparece, ni para quien abre el link sin sesión ni para alguien con sesión', async () => {
  const { owner, giver, list } = await preparar()
  expect(await redirige(guardarAliasAction(form({ alias: 'euge.cobra.mp' })))).toBe('/perfil?alias=ok#alias')
  const ver = () => html(PerfilPublico({ params: Promise.resolve({ token: list.shareToken }), searchParams: Promise.resolve({}) }))
  for (const sesion of [null, { userId: giver.id, user: { name: 'Rodri' } }, { userId: owner.id, user: { name: 'Euge' } }]) {
    h.session = sesion
    const p = await ver()
    expect(p).toContain('Euge')
    expect(p).not.toContain('euge.cobra.mp')
    expect(p).not.toContain('alias')
  }
})
