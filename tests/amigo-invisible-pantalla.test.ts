import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestDb } from './helpers'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { hoyLocal } from '@/lib/events'
import { amigoInvisibleParaViewer, crearAmigoInvisible, linkDelJuego, responderJuego, sortear, unirsePorLink } from '@/lib/amigo-invisible'

// Las pantallas del amigo invisible por link: la invitación que abre cualquiera (con o sin cuenta), el juego del que
// organiza (con "Invitar por WhatsApp" y, si alguien se sumó o se bajó después, "Volver a sortear" con su advertencia) y
// la entrada, arriba en Regalos.
const h = vi.hoisted(() => ({ db: undefined as unknown as Db, session: null as { userId: string } | null }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/regalos',
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))

import Unirme from '@/app/invisible/unirme/[token]/page'
import Juego from '@/app/(menu)/invisible/[id]/page'
import MisRegalos from '@/app/(menu)/(regalos)/regalos/page'
import { unirseAlJuegoAction } from '@/app/actions'

const enDias = (n: number) => new Date(hoyLocal().getTime() + n * 86400_000).toISOString().slice(0, 10)
const usuario = (nombre: string) => upsertUserFromGoogle(h.db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
const unirme = async (token: string) => renderToStaticMarkup(await Unirme({ params: Promise.resolve({ token }) }))
const juego = async (id: string) => renderToStaticMarkup(await Juego({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }))
/** A dónde redirige (null si no redirige). */
async function redirige(p: Promise<unknown>): Promise<string | null> {
  try { await p } catch (e) { return (e as { url?: string }).url ?? null }
  return null
}
const form = (campos: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

async function setup() {
  h.db = await createTestDb()
  h.session = null
  const [euge, sofi, rodri, caro] = await Promise.all(['Euge', 'Sofi', 'Rodri', 'Caro'].map(usuario))
  const r = await crearAmigoInvisible(h.db, euge.id, { nombre: 'Oficina', descripcion: 'Algo hecho a mano', presupuesto: 20000, fecha: enDias(30) }, [])
  if (!r.ok) throw new Error('no se armó')
  const token = (await linkDelJuego(h.db, r.id, euge.id))!
  return { euge, sofi, rodri, caro, id: r.id, token }
}

test('la invitación se abre sin cuenta: quién organiza, el juego y "Entrar con Google", que vuelve a la misma pantalla', async () => {
  const s = await setup()
  await unirsePorLink(h.db, s.token, s.sofi.id)
  const sinSesion = await unirme(s.token)
  expect(sinSesion).toContain('Euge te invita a un amigo invisible')
  expect(sinSesion).toContain('Oficina')
  expect(sinSesion).toContain('Algo hecho a mano')
  expect(sinSesion).toMatch(/hasta \$\s?20\.000/)
  expect(sinSesion).toContain('Ya juegan 2')
  // de los que juegan, solo cuántos: el link puede terminar en cualquier chat
  expect(sinSesion).not.toContain('Sofi')
  expect(sinSesion).toContain('Entrar con Google para sumarme')
  expect(sinSesion).toContain(`value="/invisible/unirme/${s.token}"`)
  expect(sinSesion).not.toContain('Sumarme al amigo invisible')
  // sumarse pide sesión: sin ella, vuelve a la invitación (WhatsApp abre el link para la vista previa y no suma a nadie)
  expect(await redirige(unirseAlJuegoAction(form({ token: s.token })))).toBe(`/invisible/unirme/${s.token}`)

  // con cuenta (sin ser amigo de nadie): un toque y adentro
  h.session = { userId: s.rodri.id }
  const conSesion = await unirme(s.token)
  expect(conSesion).toContain('Sumarme al amigo invisible')
  expect(conSesion).not.toContain('Entrar con Google')
  expect(await amigoInvisibleParaViewer(h.db, s.id, s.rodri.id)).toBeNull() // abrir la pantalla no lo sumó
  expect(await redirige(unirseAlJuegoAction(form({ token: s.token })))).toBe(`/invisible/${s.id}`)
  expect((await amigoInvisibleParaViewer(h.db, s.id, s.rodri.id))!.miEstado).toBe('juega')
  // el que ya está va derecho al juego
  expect(await redirige(Unirme({ params: Promise.resolve({ token: s.token }) }))).toBe(`/invisible/${s.id}`)

  // un link que cambió (o que no es de nadie) lo dice, sin datos de ningún juego
  h.session = { userId: s.caro.id }
  const roto = await unirme('ya-no-sirve')
  expect(roto).toContain('Este link ya no sirve')
  expect(roto).not.toContain('Oficina')
  expect(await redirige(unirseAlJuegoAction(form({ token: 'ya-no-sirve' })))).toBe('/invisible/unirme/ya-no-sirve')
  expect(await redirige(unirseAlJuegoAction(form({ token: 'con espacio' })))).toBe('/regalos')
})

test('el juego, para el que organiza: "Invitar por WhatsApp" con el link; los demás no lo tienen', async () => {
  const s = await setup()
  await unirsePorLink(h.db, s.token, s.sofi.id)
  h.session = { userId: s.euge.id }
  const org = await juego(s.id)
  expect(org).toContain('Invitar por WhatsApp')
  expect(org).toContain(`https://wa.me/?text=${encodeURIComponent('Sumate al amigo invisible «Oficina» 🎁')}`)
  expect(org).toContain(encodeURIComponent(`/invisible/unirme/${s.token}`))
  expect(org).toContain('Cambiar el link')
  expect(org).toContain('Cerrar las altas')
  expect(org).toContain('Sacar a Sofi')
  h.session = { userId: s.sofi.id }
  const jugador = await juego(s.id)
  expect(jugador).not.toContain('wa.me')
  expect(jugador).not.toContain(s.token)
  expect(jugador).not.toContain('Sacar a')
})

test('si alguien se suma después del sorteo, el que organiza lo ve y "Volver a sortear" avisa qué pasa antes de hacerlo', async () => {
  const s = await setup()
  await unirsePorLink(h.db, s.token, s.sofi.id)
  await unirsePorLink(h.db, s.token, s.rodri.id)
  h.session = { userId: s.euge.id }
  expect(await juego(s.id)).toContain('Si después alguien se baja o se suma, vas a poder sortear')
  await sortear(h.db, s.id, s.euge.id, async () => 201)
  // recién sorteado y sin cambios: no hay nada que sortear de nuevo
  expect(await juego(s.id)).not.toContain('Volver a sortear')

  await unirsePorLink(h.db, s.token, s.caro.id, async () => 201)
  const org = await juego(s.id)
  expect(org).toContain('<b>Caro</b> se sumó después del sorteo: sorteá de nuevo para que entre.')
  expect(org).toContain('Entra en el próximo sorteo')
  expect(org).toContain('Volver a sortear')
  // la consecuencia, antes de confirmar: les cambia a todos, también al que ya compró
  expect(org).toContain('a todos les puede cambiar a quién le regalan')
  expect(org).toContain('si alguien ya reservó o compró un regalo para quien le había tocado, le puede quedar para')
  expect(org).toContain('Sí, sortear de nuevo')

  // la que se sumó tarde no ve un "te tocó": espera, y lo sabe
  h.session = { userId: s.caro.id }
  const tarde = await juego(s.id)
  expect(tarde).toContain('Falta sortear de nuevo')
  expect(tarde).toContain('Te sumaste con el sorteo ya hecho.')
  expect(tarde).not.toContain('Ver a quién le regalo')
  expect(tarde).not.toContain('Volver a sortear')
  // el que ya jugaba sigue con lo suyo, y se puede bajar
  h.session = { userId: s.sofi.id }
  const jugador = await juego(s.id)
  expect(jugador).toContain('Ver a quién le regalo')
  expect(jugador).toContain('Bajarme de este amigo invisible')
  expect(jugador).not.toContain('se sumó después del sorteo')
})

test('si alguien se baja después del sorteo, el que organiza ve si se arregló solo o si hay que sortear de nuevo', async () => {
  const s = await setup()
  for (const u of [s.sofi, s.rodri, s.caro]) await unirsePorLink(h.db, s.token, u.id)
  await sortear(h.db, s.id, s.euge.id, async () => 201)
  // con cuatro el sorteo es una sola ronda: se baja Caro y se arregla solo
  await responderJuego(h.db, s.id, s.caro.id, false, async () => 201)
  h.session = { userId: s.euge.id }
  const arreglado = await juego(s.id)
  expect(arreglado).toContain('<b>Caro</b> se bajó. Al que le había tocado ya le toca otra persona (le avisamos) y a los demás no les cambió nada: no hace falta sortear de nuevo.')
  // puede sortear de nuevo si quiere, sabiendo que no hace falta
  expect(arreglado).toContain('No hace falta: el sorteo de ahora sigue valiendo.')
  // quedan tres; si se baja Rodri quedan dos y no hay sorteo que valga
  await responderJuego(h.db, s.id, s.rodri.id, false, async () => 201)
  const falta = await juego(s.id)
  expect(falta).toContain('<b>Rodri y Caro</b> se bajaron: hay que sortear de nuevo.')
  expect(falta).toContain('Quedaron 2 jugando y hacen falta al menos 3')
  expect(falta).not.toContain('Sí, sortear de nuevo')
  // el que se bajó puede volver mientras las altas estén abiertas
  h.session = { userId: s.rodri.id }
  expect(await juego(s.id)).toContain('Si te sumás, entrás cuando Euge sortee de nuevo.')
})

test('en Regalos, armar un amigo invisible está arriba y dice para qué sirve', async () => {
  const s = await setup()
  h.session = { userId: s.caro.id }
  const html = renderToStaticMarkup(await MisRegalos())
  expect(html).toContain('Armar un amigo invisible')
  expect(html).toContain('mandás un link por WhatsApp, se sortea y cada uno ve solo a quién le regala')
  expect(html.indexOf('Armar un amigo invisible')).toBeLessThan(html.indexOf('Todavía no reservaste nada'))
  // el que ya está en uno ve sus juegos arriba, con "+ Armar uno"
  h.session = { userId: s.euge.id }
  const conJuego = renderToStaticMarkup(await MisRegalos())
  expect(conJuego).toContain('+ Armar uno')
  expect(conJuego.indexOf('Oficina')).toBeLessThan(conJuego.indexOf('Todavía no reservaste nada'))
})
