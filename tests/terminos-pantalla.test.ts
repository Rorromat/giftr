import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { lists } from '@/db/schema'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { saltearBienvenida } from '@/lib/bienvenida'

// Los nombres de las cosas, iguales en toda la app (ver el glosario): "lista en común" y no "grupo", "Todo el año" y no
// "Eventos", "regalo grupal" y no "Lo dividimos". Y los textos que prometían algo que no pasa. Con la base en PGlite y la
// sesión de Next simulada.
const h = vi.hoisted(() => ({ db: undefined as unknown as Db, session: null as { userId: string; user?: { name: string; email?: string } } | null }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => '/regalos',
}))

import ListaEnComun from '@/app/(menu)/grupos/[id]/page'
import Unirme from '@/app/grupos/unirme/[token]/page'
import AgregarAmigo from '@/app/(menu)/gente/agregar/page'
import Gente from '@/app/(menu)/gente/page'
import Perfil from '@/app/(menu)/perfil/page'
import { PestanasRegalos } from '@/components/PestanasRegalos'
import { FormDividir } from '@/components/Dividir'
import { ArmarRegaloGrupal } from '@/components/RegaloGrupal'
import { TarjetaNovedad } from '@/components/Novedades'
import { SkeletonListaAjena } from '@/components/Skeleton'

const html = async (p: Promise<React.ReactNode>) => renderToStaticMarkup(await p as React.ReactElement)
const texto = (s: string) => s.replace(/<[^>]+>/g, ' ').replaceAll('&quot;', '"').replace(/\s+/g, ' ')
/**
 * Dónde dice "grupo" como nombre de la lista; null si en ningún lado. No cuentan "regalo grupal", el grupo de WhatsApp ni
 * el link de invitación que se ve para copiar (las rutas siguen siendo /grupos/…: hay links compartidos).
 */
const diceGrupo = (s: string) => texto(s).replace(/grupo de WhatsApp|\/grupos\/unirme\//gi, '').match(/.{0,30}\bgrupos?\b.{0,30}/gi)

async function preparar() {
  h.db = await createTestDb()
  const seed = await seedOwnerAndGiver(h.db)
  h.session = { userId: seed.owner.id, user: { name: 'Euge', email: 'euge@test.com' } }
  await saltearBienvenida(h.db, seed.owner.id)
  return seed
}

test('una lista en común: cada botón de WhatsApp dice a quién va, y nunca se la llama "grupo"', async () => {
  const { owner, giver } = await preparar()
  const id = await crearGrupo(h.db, owner.id, { nombre: 'Nuestra casa' })
  const [lista] = await h.db.select().from(lists).where(eq(lists.id, id))
  await unirseAGrupo(h.db, lista.inviteToken!, giver.id)
  const p = await html(ListaEnComun({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }))
  const t = texto(p)
  // el link para regalar, en la tapa, y el que deja editar, abajo: cada uno con su línea de ayuda
  expect(t).toContain('Mandar a quienes regalan Con este link ven la lista y reservan. No deja editar.')
  expect(t).toContain('Invitar a armarla (puede editar) Solo para quien arma la lista con vos: va a poder agregar y editar, y ya no va a poder reservar.')
  expect(p.indexOf('Mandar a quienes regalan')).toBeLessThan(p.indexOf('Invitar a armarla (puede editar)'))
  expect(p).toMatch(new RegExp(`href="https://wa\\.me/\\?text=[^"]*${encodeURIComponent(`/l/${lista.shareToken}`)}"[^>]*>(<svg.*?</svg>)?Mandar a quienes regalan`))
  expect(p).toMatch(new RegExp(`href="https://wa\\.me/\\?text=[^"]*${encodeURIComponent(`/grupos/unirme/${lista.inviteToken}`)}"[^>]*>(<svg.*?</svg>)?Invitar a armarla`))
  for (const viejo of ['Mandala por WhatsApp', 'Invitar por WhatsApp', 'Salir del grupo', 'Eventos', 'sus eventos']) expect(t, viejo).not.toContain(viejo)
  expect(t).toContain('Salir de la lista en común')
  expect(p).toContain('aria-label="Agregar un deseo a la lista"')
  expect(diceGrupo(p)).toBeNull()
  // sacaron a alguien: el aviso tampoco
  const sacado = await html(ListaEnComun({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ nuevo: 'sacado' }) }))
  expect(texto(sacado)).toContain('Listo: ya no es parte de la lista en común.')
  expect(diceGrupo(sacado)).toBeNull()

  // la invitación a armarla
  h.session = null
  const invitacion = await html(Unirme({ params: Promise.resolve({ token: lista.inviteToken! }) }))
  expect(diceGrupo(invitacion)).toBeNull()
})

test('la invitación a armar una lista en común, con sesión: "Unirme a la lista en común"', async () => {
  const { owner, giver } = await preparar()
  const id = await crearGrupo(h.db, owner.id, { nombre: 'Nuestra casa' })
  const [lista] = await h.db.select().from(lists).where(eq(lists.id, id))
  h.session = { userId: giver.id }
  const p = await html(Unirme({ params: Promise.resolve({ token: lista.inviteToken! }) }))
  expect(texto(p)).toContain('Unirme a la lista en común')
  expect(texto(p)).toContain('aunque después salgas (o te saquen) de la lista no vas a poder reservar en ella')
  expect(diceGrupo(p)).toBeNull()
})

test('la solicitud por mail no promete un mail: dice dónde la ve y ofrece avisarle por WhatsApp', async () => {
  await preparar()
  const agregar = (sp: Record<string, string>) => html(AgregarAmigo({ searchParams: Promise.resolve(sp) }))
  const antes = await agregar({ q: 'sofi@test.com' })
  expect(texto(antes)).toContain('No le llega ningún mail: la solicitud le aparece en GiftR cuando entre con ese mail.')
  expect(texto(antes)).toContain('Dejarle la solicitud en GiftR')
  expect(antes).toMatch(/href="https:\/\/wa\.me\/\?text=[^"]*%2Famigo%2F[^"]*"[^>]*>(<svg.*?<\/svg>)?Avisarle por WhatsApp/)
  expect(texto(antes)).not.toContain('le llega ahora')
  // mandada: lo mismo tenga o no cuenta (no se averigua quién usa GiftR), y otra vez el WhatsApp
  const despues = await agregar({ q: 'sofi@test.com', amigo: 'enviada' })
  expect(texto(despues)).toContain('Listo, la solicitud quedó esperando en GiftR.')
  expect(texto(despues)).toContain('No le mandamos ningún mail: la va a ver cuando entre a GiftR con sofi@test.com.')
  expect(despues).toContain('Avisarle por WhatsApp')
  expect(texto(despues)).not.toContain('le mandaste la solicitud')
  // por @usuario sí le llega (el aviso en GiftR): el mensaje de siempre
  expect(texto(await agregar({ q: '@rodri', amigo: 'enviada' }))).toContain('Listo, le mandaste la solicitud.')
})

test('"Todo el año", no "Eventos", en Tu gente y en Perfil; y la pestaña y el título de Tus regalos dicen lo mismo', async () => {
  await preparar()
  expect(texto(await html(Gente({ searchParams: Promise.resolve({}) })))).not.toContain('Eventos')
  const perfil = await html(Perfil({ searchParams: Promise.resolve({}) }))
  expect(texto(perfil)).toContain('Tu gente lo ve en Todo el año')
  expect(texto(perfil)).not.toMatch(/Eventos|sus eventos/)
  const pestanas = renderToStaticMarkup(createElement(PestanasRegalos))
  expect(pestanas).toContain('<h1 class="gr-title">Tus regalos</h1>')
  expect(pestanas).toMatch(/aria-current="page"[^>]*>Tus regalos<\/a>/)
  expect(pestanas).not.toContain('Mis regalos')
})

test('Perfil: cada error se lee con su campo, y "Volver" lleva a donde estaba', async () => {
  await preparar()
  const perfil = (sp: Record<string, string>) => html(Perfil({ searchParams: Promise.resolve(sp) }))
  const campo = (p: string, id: string) => new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(p)![0]
  const bien = await perfil({})
  expect(campo(bien, 'nombre-campo')).toContain('aria-describedby="nombre-ayuda"')
  expect(campo(bien, 'nombre-campo')).not.toContain('aria-invalid')
  expect(campo(bien, 'usuario-campo')).not.toContain('aria-invalid')
  expect(bien).toContain('<p id="nombre-ayuda"')
  const mal = await perfil({ nombre: 'vacio', usuario: 'ocupado', cumple: 'invalido' })
  expect(campo(mal, 'nombre-campo')).toContain('aria-invalid="true"')
  expect(campo(mal, 'usuario-campo')).toContain('aria-invalid="true"')
  expect(campo(mal, 'usuario-campo')).toContain('aria-describedby="usuario-ayuda"')
  expect(mal).toMatch(/<p id="nombre-ayuda" role="alert"[^>]*>Poné tu nombre/)
  expect(mal).toMatch(/<p id="usuario-ayuda" role="alert"[^>]*>Ese usuario ya lo tiene alguien/)
  expect(mal).toMatch(/<p id="cumple-error" role="alert"/)
  expect(mal.match(/<select[^>]*aria-invalid="true"[^>]*aria-describedby="cumple-error"|<select[^>]*aria-describedby="cumple-error"[^>]*aria-invalid="true"/g)).toHaveLength(2)
  expect(bien).not.toContain('cumple-error')

  // tu foto está en las cuatro secciones: desde Regalos vuelve a Regalos; por un link, a tu lista
  const volver = (p: string) => /<a [^>]*aria-label="Volver[^"]*"[^>]*>/.exec(p)![0]
  expect(volver(bien)).toContain('href="/mi-lista"')
  expect(volver(await perfil({ volver: '/regalos' }))).toContain('href="/regalos"')
  expect(volver(await perfil({ volver: '//otro.com' }))).toContain('href="/mi-lista"')
})

test('el regalo grupal se llama igual en todos lados, y la acción es "Armar regalo grupal"', () => {
  const amigos = [{ id: 'a', nombre: 'Sofi', usuario: null, foto: null }]
  const con = texto(renderToStaticMarkup(createElement(FormDividir, { token: 'tok', itemId: 'i', amigos })))
  const sin = texto(renderToStaticMarkup(createElement(FormDividir, { token: 'tok', itemId: 'i', amigos: [] })))
  expect(con).toContain('¿Con quién armás el regalo grupal?')
  for (const t of [con, sin]) {
    expect(t).toContain('Armar regalo grupal')
    for (const viejo of ['Proponerles dividirlo', 'Armar el regalo ', 'Lo dividimos', 'Entre todos']) expect(t).not.toContain(viejo)
  }
  // con la reserva propia, la misma acción (abajo dice qué pasa con la reserva)
  const propia = texto(renderToStaticMarkup(createElement(ArmarRegaloGrupal, { token: 'tok', itemId: 'i', logueado: true, convertir: true })))
  expect(propia).toContain('Armar regalo grupal')
  expect(propia).toContain('Tu reserva pasa a ser un regalo grupal.')
  expect(propia).not.toContain('Hacerlo regalo grupal')
})

test('"Reservar" en lo nuevo de tus amigos lleva al deseo, sin el ?reservar=1 que ya no hace nada', () => {
  const n = {
    token: 'tok-rodri', hace: 'hace 2 h', dueno: { nombre: 'Rodri', foto: null },
    item: { id: 'item-1', titulo: 'Mate', fotoUrl: null, precio: null, rangoPrecio: null, prioridad: 'mucho', disponible: true, claims: [] },
  } as unknown as Parameters<typeof TarjetaNovedad>[0]['n']
  const p = renderToStaticMarkup(createElement(TarjetaNovedad, { n }))
  expect(p).toMatch(/<a [^>]*href="\/l\/tok-rodri\/item\/item-1"[^>]*>Reservar<\/a>/)
  expect(p).not.toContain('reservar=1')
})

test('la bienvenida: las fotos de los estilos se alternan dos veces y quedan quietas; .gr-cuanto ya no existe', () => {
  const css = readFileSync('src/app/tokens.css', 'utf8')
  expect(css).toMatch(/\.gr-alternar \{[^}]*animation: gr-alternar 8s ease-in-out 2;/)
  expect(css).not.toMatch(/\.gr-alternar \{[^}]*infinite/)
  expect(css).toContain('@media (prefers-reduced-motion: reduce) { .gr-alternar { animation: none; } }')
  expect(css).not.toContain('gr-cuanto')
})

test('la pantalla de carga de la lista de alguien copia su tapa compacta: la foto de 56 al lado del nombre, sin el botón grande', () => {
  const p = renderToStaticMarkup(createElement(SkeletonListaAjena))
  expect(p).toContain('aria-busy="true"')
  expect(p).toContain('class="gr-tapa"')
  expect(p).toContain('size-14 flex-none rounded-full')
  // la tapa grande tenía el nombre de 46 de alto y el botón de WhatsApp de 50
  expect(p).not.toContain('h-[46px]')
  expect(p).not.toContain('h-[50px]')
  expect(p).toContain('-mt-14')
})
