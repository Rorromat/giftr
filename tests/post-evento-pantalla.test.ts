import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import type { Db } from '@/db/types'
import { avisos, claims, items, lists } from '@/db/schema'
import { saltearBienvenida } from '@/lib/bienvenida'
import { guardarCumple, hoyLocal } from '@/lib/events'
import { createItem } from '@/lib/items'
import { misRegalos } from '@/lib/mis-regalos'
import { marcarRecibidos, postEvento, recibidosDe, textoGracias } from '@/lib/post-evento'
import { upsertUserFromGoogle } from '@/lib/users'

// Las pantallas de después del cumple tal cual, con la base en PGlite y la sesión y las redirecciones de Next simuladas.
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

import { agradecerAction, cerrarPostEventoAction, marcarRecibidosAction, restoreItemAction, revelarRegaloAction } from '@/app/actions'
import MiLista from '@/app/(menu)/mi-lista/page'
import QueTeRegalaron from '@/app/(menu)/mi-lista/recibidos/page'
import Deseo from '@/app/(menu)/deseo/[id]/page'
import { FilaRegalo } from '@/components/FilaRegalo'
import { Archivados } from '@/components/OwnerItemsGrid'
import { Recibidos, TarjetaPostEvento } from '@/components/PostEvento'

const DIA = 86400_000
const AHORA = new Date()
const HOY = hoyLocal(AHORA)
const en = (dias: number) => new Date(AHORA.getTime() + dias * DIA)

function form(campos: Record<string, string | string[]>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) for (const uno of [v].flat()) fd.append(k, uno)
  return fd
}
/** A dónde redirige (null si no redirige). */
async function redirige(p: Promise<unknown>): Promise<string | null> {
  try { await p } catch (e) { return (e as { url: string }).url }
  return null
}

async function usuario(nombre: string) {
  const u = await upsertUserFromGoogle(h.db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
  await saltearBienvenida(h.db, u.id)
  return u
}
/** Euge cumplió hace tantos días y tiene Termo, Mate y Bici en su lista; Rodri le regala. La sesión, la de Euge. */
async function preparar(hace = 1) {
  h.db = await createTestDb()
  const [euge, rodri] = [await usuario('Euge'), await usuario('Rodri')]
  const f = new Date(HOY.getTime() - hace * DIA)
  await guardarCumple(h.db, euge.id, f.getUTCDate(), f.getUTCMonth() + 1)
  const nuevo = async (titulo: string) => (await createItem(h.db, euge.id, { tipo: 'exacto', titulo }))!
  const [termo, mate, bici] = [await nuevo('Termo'), await nuevo('Mate'), await nuevo('Bici')]
  h.session = { userId: euge.id, user: { name: 'Euge' } }
  return { euge, rodri, termo, mate, bici }
}
const comprado = async (itemId: string, userId: string) =>
  (await h.db.insert(claims).values({ itemId, claimerUserId: userId, estado: 'comprado', createdAt: en(-10), updatedAt: en(-10) }).returning())[0]

const paso = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await QueTeRegalaron({ searchParams: Promise.resolve(sp) }))

type Elemento = React.ReactElement<{ children?: React.ReactNode } & Record<string, unknown>>
/** Todos los elementos de lo que devuelve una página (sin renderizar los componentes: solo el árbol). */
function elementos(nodo: React.ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (!nodo || typeof nodo !== 'object' || !('props' in nodo)) return []
  const el = nodo as Elemento
  return [el, ...elementos(el.props.children)]
}
const miLista = async () => elementos(await MiLista({ searchParams: Promise.resolve({}) }))
const tiene = (arbol: Elemento[], componente: unknown) => arbol.some((e) => e.type === componente)

test('REGLA DE LA SORPRESA: el paso "¿Qué te regalaron?" muestra todos sus deseos, en el orden de su lista, sin tildar ni sugerir nada, haya o no reservas', async () => {
  const { rodri, termo, mate, bici } = await preparar()
  const sinReservas = await paso()
  // los tres, en el orden en que los cargó, cada uno con su casilla sin tildar
  const casillas = [...sinReservas.matchAll(/<input type="checkbox"[^>]*name="itemId"[^>]*value="([^"]+)"/g)]
  expect(casillas.map((c) => c[1])).toEqual([termo.id, mate.id, bici.id])
  expect(sinReservas).not.toMatch(/<input[^>]*\schecked/)
  expect(sinReservas).toContain('Tildá lo que te regalaron de tu lista')
  expect(sinReservas).toContain('Solo vos sabés qué recibiste: acá no te mostramos qué reservó tu gente.')

  // Rodri compró la Bici y tiene reservado el Mate: la pantalla es la misma, letra por letra
  await comprado(bici.id, rodri.id)
  await h.db.insert(claims).values({ itemId: mate.id, claimerUserId: rodri.id, createdAt: en(-5), expiresAt: en(1) })
  expect(await paso()).toBe(sinReservas)
  expect(sinReservas).not.toContain('Rodri')
  expect(sinReservas).not.toMatch(/\d+\s+reserv/i)
})

test('el paso manda todo de una vez y lleva a "Listo": cuántos marcó, agradecer por WhatsApp y repasar lo que quedó', async () => {
  const { euge, termo, mate, bici } = await preparar()
  expect(await redirige(marcarRecibidosAction(form({ itemId: [termo.id, bici.id] })))).toBe('/mi-lista/recibidos?listo=2')
  expect((await h.db.select().from(items).where(eq(items.estadoDueno, 'me_lo_regalaron'))).map((i) => i.titulo).sort()).toEqual(['Bici', 'Termo'])
  expect((await h.db.select().from(items).where(eq(items.id, mate.id)))[0].estadoDueno).toBe('activo')

  const listo = await paso({ listo: '2' })
  expect(listo).toContain('¡Tu lista quedó al día!')
  expect(listo).toContain('Marcaste 2 regalos: quedaron en Recibidos, abajo en tu lista.')
  // WhatsApp sin destinatario, con el texto ya escrito
  expect(listo).toContain(`href="https://wa.me/?text=${encodeURIComponent(textoGracias())}"`)
  expect(listo).toContain('Agradecer por WhatsApp')
  // la lista al día para el año que viene: lo que quedó, y a Mi lista
  expect(listo).toContain('¿Seguís queriendo esto?')
  expect(listo).toContain('Te quedó 1 deseo en la lista.')
  expect(listo).toContain('href="/mi-lista#mis-deseos"')
  // sin tildar nada también va a "Listo", sin lo de agradecer
  expect(await redirige(marcarRecibidosAction(form({})))).toBe('/mi-lista/recibidos?listo=0')
  const nada = await paso({ listo: '0' })
  expect(nada).toContain('No marcaste nada: tu lista sigue como estaba.')
  expect(nada).not.toContain('wa.me')
  // un número cualquiera en la dirección no rompe nada
  expect(await paso({ listo: 'x' })).toContain('No marcaste nada')
  expect(await postEvento(h.db, euge.id)).toMatchObject({ pendiente: false })
})

test('el paso solo se abre con sesión y con un cumple que ya pasó', async () => {
  const { euge } = await preparar()
  h.session = null
  expect(await redirige(paso())).toBe('/')
  expect(await redirige(marcarRecibidosAction(form({})))).toBe('/')
  h.session = { userId: euge.id }
  await guardarCumple(h.db, euge.id, null, null)
  expect(await redirige(paso())).toBe('/mi-lista')
  expect(await redirige(marcarRecibidosAction(form({})))).toBe('/mi-lista')
})

test('Mi lista: la tarjeta "¿Cómo te fue en tu cumple?" desde el día siguiente, haya o no reservas; con "Ahora no" no vuelve', async () => {
  const { euge, rodri, termo } = await preparar()
  expect(tiene(await miLista(), TarjetaPostEvento)).toBe(true)
  await comprado(termo.id, rodri.id)
  expect(tiene(await miLista(), TarjetaPostEvento)).toBe(true)
  const tarjeta = renderToStaticMarkup(createElement(TarjetaPostEvento))
  expect(tarjeta).toContain('¿Cómo te fue en tu cumple?')
  expect(tarjeta).toContain('Marcá lo que te regalaron así tu lista queda al día.')
  expect(tarjeta).toContain('href="/mi-lista/recibidos"')
  expect(tarjeta).toContain('Ahora no')
  expect(tarjeta.toLowerCase()).not.toContain('reserv')

  await cerrarPostEventoAction()
  const cerrada = await miLista()
  expect(tiene(cerrada, TarjetaPostEvento)).toBe(false)
  // todavía en el mes: lo puede marcar igual, desde abajo
  const abajo = cerrada.find((e) => e.type === Recibidos)!
  expect(abajo.props).toMatchObject({ recibidos: [], contados: [], marcarMas: true })
  expect(renderToStaticMarkup(createElement(Recibidos, abajo.props as Parameters<typeof Recibidos>[0]))).toContain('¿Te regalaron algo de tu lista? Marcalo')
  expect(await postEvento(h.db, euge.id)).toMatchObject({ enVentana: true, pendiente: false })
})

test('Mi lista: antes del cumple, el mismo día o pasado el mes no hay tarjeta; sin deseos para marcar, tampoco', async () => {
  for (const hace of [-3, 0, 31]) {
    await preparar(hace)
    expect(tiene(await miLista(), TarjetaPostEvento)).toBe(false)
  }
  const { euge, termo, mate, bici } = await preparar(1)
  expect(await marcarRecibidos(h.db, euge.id, [termo.id, mate.id, bici.id], AHORA, { cerrar: false })).toBe(3)
  expect(tiene(await miLista(), TarjetaPostEvento)).toBe(false)
})

test('Mi lista: lo recibido va en "Recibidos" (no en Archivados), con "Me equivoqué" y agradecer; "De parte de" solo si alguien se lo contó', async () => {
  const { euge, rodri, termo, mate } = await preparar()
  const compra = await comprado(termo.id, rodri.id)
  expect(await marcarRecibidos(h.db, euge.id, [termo.id], AHORA)).toBe(1)
  await h.db.update(items).set({ estadoDueno: 'lo_tengo' }).where(eq(items.id, mate.id))

  const arbol = await miLista()
  expect((arbol.find((e) => e.type === Archivados)!.props.items as { titulo: string }[]).map((i) => i.titulo)).toEqual(['Mate'])
  const props = () => recibidosDe(h.db, euge.id).then((r) => ({ ...r, abierto: true, marcarMas: true }))
  const seccion = async () => renderToStaticMarkup(createElement(Recibidos, await props()))
  const sinRevelar = await seccion()
  expect(sinRevelar).toContain('Recibidos (1)')
  expect(sinRevelar).toContain('Termo')
  expect(sinRevelar).toContain(`Cumple ${new Date(HOY.getTime() - DIA).getUTCFullYear()}`)
  expect(sinRevelar).toContain('Me equivoqué')
  expect(sinRevelar).toContain(`href="https://wa.me/?text=${encodeURIComponent(textoGracias())}"`)
  for (const no of ['Rodri', 'De parte de', 'Mandarle gracias']) expect(sinRevelar).not.toContain(no)

  // Rodri, desde Tus regalos, le cuenta que fue suyo
  h.session = { userId: rodri.id }
  await revelarRegaloAction(form({ tipo: 'suelto', id: compra.id }))
  h.session = { userId: euge.id }
  const revelado = await seccion()
  expect(revelado).toContain('De parte de Rodri')
  expect(revelado).toContain('Mandarle gracias')
  // le manda las gracias: una vez, y queda dicho
  await agradecerAction(form({ tipo: 'suelto', id: compra.id, de: rodri.id }))
  await agradecerAction(form({ tipo: 'suelto', id: compra.id, de: rodri.id }))
  expect((await h.db.select().from(avisos).where(eq(avisos.userId, rodri.id))).map((a) => a.titulo)).toEqual(['💛 Euge te da las gracias'])
  const agradecido = await seccion()
  expect(agradecido).toContain('Le diste las gracias')
  expect(agradecido).not.toContain('Mandarle gracias')

  // "Me equivoqué": vuelve a su lista
  await restoreItemAction(form({ itemId: termo.id }))
  expect((await h.db.select().from(items).where(eq(items.id, termo.id)))[0].estadoDueno).toBe('activo')
  // pasado el mes, el botón dice lo que hace: volver a pedirlo
  expect(await marcarRecibidos(h.db, euge.id, [termo.id], AHORA)).toBe(1)
  const masAdelante = renderToStaticMarkup(createElement(Recibidos, { ...(await recibidosDe(h.db, euge.id, en(40))), abierto: false, marcarMas: false }))
  expect(masAdelante).toContain('Volver a pedir')
  expect(masAdelante).not.toContain('Me equivoqué')
})

test('Tus regalos: "Contarle a Euge que fue tuyo" solo después del cumple y sobre lo comprado, con la confirmación de que no se deshace', async () => {
  const { euge, rodri, termo, mate } = await preparar(-2)
  const compra = await comprado(termo.id, rodri.id)
  await h.db.insert(claims).values({ itemId: mate.id, claimerUserId: rodri.id, createdAt: en(-5), expiresAt: en(6) })
  const filas = async (ahora: Date) => {
    const r = await misRegalos(h.db, rodri.id, ahora)
    return renderToStaticMarkup(createElement('ul', null, [...r.porComprar, ...r.comprados, ...r.historial].map((x) => createElement(FilaRegalo, { key: x.id, r: x }))))
  }
  // antes del cumple y el mismo día: nada que contar
  for (const d of [0, 2]) expect(await filas(en(d))).not.toContain('Contarle')
  // al día siguiente, solo en lo comprado (el Mate, reservado, no)
  const despues = await filas(en(3))
  expect(despues.match(/Contarle a Euge que fue tuyo/g)).toHaveLength(1)
  expect(despues).toContain('Sí, contarle')
  expect(despues).toContain('No se puede deshacer: una vez que lo ve, ya lo sabe.')
  expect(despues).toContain(`name="id" value="${compra.id}"`)

  h.session = { userId: rodri.id }
  // antes de tiempo, la acción no hace nada aunque le llegue el formulario
  await revelarRegaloAction(form({ tipo: 'suelto', id: compra.id }))
  expect((await h.db.select().from(claims).where(eq(claims.id, compra.id)))[0].reveladoAt).toBeNull()
  expect(await h.db.select().from(avisos).where(eq(avisos.userId, euge.id))).toEqual([])
})

test('Tus regalos: después de contarlo, la fila lo dice y ya no lo ofrece; y el deseo del dueño muestra "De parte de"', async () => {
  const { euge, rodri, termo } = await preparar()
  const compra = await comprado(termo.id, rodri.id)
  const deseo = async () => renderToStaticMarkup(await Deseo({ params: Promise.resolve({ id: termo.id }) }))
  // sin revelado, el deseo del dueño no dice nada de quien regaló
  for (const no of ['Rodri', 'De parte de', 'regalaron']) expect(await deseo()).not.toContain(no)

  h.session = { userId: rodri.id }
  await revelarRegaloAction(form({ tipo: 'suelto', id: compra.id }))
  const r = await misRegalos(h.db, rodri.id)
  const fila = renderToStaticMarkup(createElement('ul', null, createElement(FilaRegalo, { r: r.historial[0], pasado: true })))
  expect(fila).toContain('Le contaste a Euge que fue tuyo')
  expect(fila).not.toContain('Contarle a')

  h.session = { userId: euge.id }
  expect((await h.db.select().from(avisos).where(eq(avisos.userId, euge.id))).map((a) => a.url)).toEqual(['/mi-lista#recibidos'])
  const conRevelado = await deseo()
  expect(conRevelado).toContain('De parte de Rodri')
  expect(conRevelado).toContain('Mandarle gracias')
  // desde Recibidos lo marca con un toque, y la tarjeta del cumple sigue ahí
  await marcarRecibidosAction(form({ itemId: termo.id, aca: '1' }))
  expect((await h.db.select().from(lists).where(eq(lists.ownerId, euge.id)))[0].postEventoHecho).toBeNull()
  expect((await recibidosDe(h.db, euge.id)).recibidos).toMatchObject([{ titulo: 'Termo', dePartede: [{ nombre: 'Rodri' }] }])
})
