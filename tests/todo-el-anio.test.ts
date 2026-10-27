import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb, seguir } from './helpers'
import type { Db } from '@/db/types'
import { claims, items, lists } from '@/db/schema'

// Todo el año, para recorrerlo: del año a un mes (?mes=8), de un mes a un día (?mes=8&dia=22) y de ahí a la lista de quien
// cumple. La dirección la lee el calendario con useSearchParams (simulado acá); la sesión y la base, como en las demás.
const h = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  session: null as { userId: string } | null,
  params: new URLSearchParams(),
}))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  useSearchParams: () => h.params,
}))

import Eventos from '@/app/(menu)/eventos/page'
import { TodoElAnio } from '@/components/Eventos'
import { claveDelDia, urlDe, vistaDe, type DiaDelCalendario } from '@/lib/calendario'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo } from '@/lib/groups'
import { guardarCumple, guardarFechaGrupo, misEventos } from '@/lib/events'
import { todasLasFechas } from '@/lib/fechas-especiales'

const HOY = new Date(Date.UTC(2026, 7, 8)) // sábado 8 de agosto de 2026

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}
const listaDe = async (db: Db, userId: string) => (await db.select().from(lists).where(eq(lists.ownerId, userId)))[0]

/**
 * Sofi sigue a Euge y a Martín (los dos cumplen el 22/8), a Lucía (1/3: este año ya pasó) y el grupo de los mellizos de
 * Caro (12/10). Euge tiene un deseo con foto, y Rodri se lo reservó.
 */
async function setup() {
  const db = await createTestDb()
  const [euge, martin, lucia, sofi, caro, rodri] = await Promise.all(
    ['Euge Mateus', 'Martín', 'Lucía', 'Sofi', 'Caro', 'Rodri'].map((n) => usuario(db, n)))
  await guardarCumple(db, euge.id, 22, 8)
  await guardarCumple(db, martin.id, 22, 8)
  await guardarCumple(db, lucia.id, 1, 3)
  const deEuge = await listaDe(db, euge.id)
  const [mate] = await db.insert(items).values({ listId: deEuge.id, tipo: 'exacto', titulo: 'Mate', prioridad: 'mucho', fotoUrl: 'mate.jpg' }).returning()
  await db.insert(claims).values({ itemId: mate.id, claimerUserId: rodri.id, expiresAt: new Date(Date.now() + 86400_000) })
  const mellizos = await crearGrupo(db, caro.id, { nombre: 'Cumple de los mellizos' })
  await guardarFechaGrupo(db, mellizos, caro.id, '2026-10-12', true)
  for (const l of [deEuge.id, (await listaDe(db, martin.id)).id, (await listaDe(db, lucia.id)).id, mellizos]) await seguir(db, sofi.id, l)
  return { db, euge, sofi, deEuge, deMartin: await listaDe(db, martin.id) }
}

/** El calendario de alguien en una dirección (?mes=…&dia=…), como texto (sin etiquetas) y como HTML. */
async function calendario(db: Db, userId: string, direccion: string) {
  h.params = new URLSearchParams(direccion)
  const html = renderToStaticMarkup(createElement(TodoElAnio, { eventos: await misEventos(db, userId, HOY), hoy: HOY, especiales: todasLasFechas(HOY) }))
  return { html, texto: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }
}

const titulo = (html: string) => /<h1[^>]*>([^<]*)<\/h1>/.exec(html)?.[1]

test('la dirección dice dónde se está: el año, un mes o un día en el que cae algo (si no, su mes)', () => {
  const dias: Record<string, DiaDelCalendario> = { [claveDelDia(8, 22)]: { titulo: '22 de agosto', semana: 'Sábado', cuando: 'en 14 días', cosas: ['x'] } }
  const vista = (q: string) => vistaDe(new URLSearchParams(q), dias)
  expect(vista('')).toEqual({})
  expect(vista('mes=8')).toEqual({ mes: 8 })
  expect(vista('mes=8&dia=22')).toEqual({ mes: 8, dia: 22 })
  expect(vista('mes=8&dia=5')).toEqual({ mes: 8 }) // ese día no cae nada
  expect(vista('mes=8&dia=hoy')).toEqual({ mes: 8 })
  for (const q of ['mes=0', 'mes=13', 'mes=8.5', 'mes=agosto', 'dia=22']) expect(vista(q)).toEqual({})
  expect(vistaDe(null, dias)).toEqual({})
  expect([urlDe({}), urlDe({ mes: 8 }), urlDe({ mes: 8, dia: 22 })]).toEqual(['/eventos', '/eventos?mes=8', '/eventos?mes=8&dia=22'])
})

test('todo el año: cada mes lleva a su mes y dice cuántas fechas tiene; la lista lleva directo a cada lista', async () => {
  const { db, sofi, deEuge } = await setup()
  const { html } = await calendario(db, sofi.id, '')
  expect(titulo(html)).toBe('Todo el año')
  expect(html).toContain('href="/inicio"')
  // agosto: Euge, Martín y el Día del Niño (el 16); octubre: los mellizos y el Día de la Madre (el 18)
  expect(html).toContain('href="/eventos?mes=8" aria-label="Agosto: 3 fechas"')
  expect(html).toContain('href="/eventos?mes=10" aria-label="Octubre: 2 fechas"')
  expect(html).toContain('href="/eventos?mes=3" aria-label="Marzo: 1 fecha"')
  expect(html).toContain('href="/eventos?mes=1" aria-label="Enero: sin fechas"')
  expect(html).toContain(`href="/l/${deEuge.shareToken}"`)
})

test('un mes: la cara (o las iniciales) de quién cumple cada día, cuántos son, y cada día lleva a ese día', async () => {
  const { db, sofi, deEuge, deMartin } = await setup()
  const { html, texto } = await calendario(db, sofi.id, 'mes=8')
  expect(titulo(html)).toBe('Agosto')
  expect(html).toContain('href="/eventos" aria-label="Volver a todo el año"')
  expect(html).toContain('href="/eventos?mes=7" aria-label="Ir a Julio"')
  expect(html).toContain('href="/eventos?mes=9" aria-label="Ir a Septiembre"')
  // el 1 de agosto de 2026 es sábado: la grilla arranca con 5 lugares vacíos (de lunes a viernes)
  expect(html.match(/<li aria-hidden="true"><\/li>/g)).toHaveLength(5)
  // el 22, los dos (primero Euge, sus iniciales, y cuántos son); el 16, el Día del Niño; hoy, marcado
  const el22 = /<a href="\/eventos\?mes=8&amp;dia=22"[^>]*aria-label="Sábado 22 de agosto: Cumple de Euge, Cumple de Martín"[^>]*>.*?<\/a>/.exec(html)?.[0]
  expect(el22).toBeDefined()
  expect(el22).toContain('>EM<')
  expect(el22).toMatch(/>2<\/span>/)
  expect(html).toContain('aria-label="Domingo 16 de agosto: Día del Niño"')
  expect(html).toMatch(/<li aria-current="date"[^>]*><span[^>]*>8<\/span><\/li>/)
  // abajo, lo del mes en orden y cada fila directo a su lista
  expect(texto.indexOf('Día del Niño')).toBeLessThan(texto.indexOf('Cumple de Euge'))
  expect(texto.indexOf('Cumple de Euge')).toBeLessThan(texto.indexOf('Cumple de Martín'))
  expect(html).toContain(`href="/l/${deEuge.shareToken}"`)
  expect(html).toContain(`href="/l/${deMartin.shareToken}"`)

  // un grupo, con su ícono (no la cara de quien lo armó)
  const octubre = await calendario(db, sofi.id, 'mes=10')
  const el12 = /<a href="\/eventos\?mes=10&amp;dia=12"[^>]*aria-label="Lunes 12 de octubre: Cumple de los mellizos"[^>]*>.*?<\/a>/.exec(octubre.html)?.[0]
  expect(el12).toBeDefined()
  expect(el12).not.toContain('>C<')
  // un mes sin nada
  expect((await calendario(db, sofi.id, 'mes=1')).texto).toContain('Este mes no cumple nadie de tu gente.')
  // en la lista del mes, el día de ese mes (como en la grilla), aunque este año ya haya pasado: el Día del Padre fue el
  // 21/6 (el próximo es el 20/6/2027)
  const junio = await calendario(db, sofi.id, 'mes=6')
  expect(junio.texto).toContain('21 jun Día del Padre')
  expect(junio.texto).not.toContain('2027')
  expect((await calendario(db, sofi.id, '')).texto).toContain('20 jun 2027 Día del Padre') // en todo el año, la próxima
})

test('un día: los que cumplen, con lo que más quieren, y cada tarjeta lleva a su lista', async () => {
  const { db, sofi, deEuge, deMartin } = await setup()
  const { html, texto } = await calendario(db, sofi.id, 'mes=8&dia=22')
  expect(titulo(html)).toBe('22 de agosto')
  expect(texto).toContain('Sábado · en 14 días')
  expect(html).toContain('href="/eventos?mes=8" aria-label="Volver a Agosto"')
  expect(html).toContain(`href="/l/${deEuge.shareToken}"`)
  expect(html).toContain(`href="/l/${deMartin.shareToken}"`)
  expect(texto).toContain('Cumple de Euge')
  expect(texto).toContain('Cumple de Martín')
  expect(texto).toContain('Todavía no reservaste nada')
  // al día de antes en que cae algo en agosto; después del 22 no hay
  expect(html).toContain('href="/eventos?mes=8&amp;dia=16" aria-label="Ir al 16 de agosto"')
  expect(html.match(/aria-label="Ir al /g)).toHaveLength(1)

  // uno que este año ya pasó: cuándo es el próximo
  expect((await calendario(db, sofi.id, 'mes=3&dia=1')).texto).toContain('Domingo · este año ya pasó (el próximo, en 205 días)')
  // un día en el que no cae nada es su mes
  expect(titulo((await calendario(db, sofi.id, 'mes=8&dia=5')).html)).toBe('Agosto')
})

test('REGLA DE LA SORPRESA: en su propio día, el dueño no ve nada de reservas', async () => {
  const { db, euge } = await setup()
  const { html, texto } = await calendario(db, euge.id, 'mes=8&dia=22')
  expect(titulo(html)).toBe('22 de agosto')
  expect(texto).toContain('Tu cumple')
  expect(texto).toContain('¿Tu lista está al día?')
  for (const palabra of ['rodri', 'reserv', 'comprado']) expect(texto.toLowerCase()).not.toContain(palabra)
})

test('la pantalla: sin sesión, a la portada; con sesión, todo el año', async () => {
  const { db, sofi } = await setup()
  h.db = db
  h.params = new URLSearchParams()
  h.session = null
  await expect(Eventos()).rejects.toMatchObject({ url: '/' })
  h.session = { userId: sofi.id }
  expect(titulo(renderToStaticMarkup(await Eventos()))).toBe('Todo el año')
})
