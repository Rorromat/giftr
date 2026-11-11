import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestDb } from './helpers'
import { eq } from 'drizzle-orm'
import { amistades, items } from '@/db/schema'
import type { Db } from '@/db/types'
import { guardarAliasPago, upsertUserFromGoogle } from '@/lib/users'
import { createItem } from '@/lib/items'
import { comprarRegalo, iniciarRegaloGrupal, marcarPagado, misCuentas, pagarParte, saldarCon, sumarseARegalo } from '@/lib/regalos'

// Cuentas tal cual, con la base en PGlite y la sesión de Next simulada: lo simplificado, las partes y las rondas.
const h = vi.hoisted(() => ({ db: undefined as unknown as Db, session: null as { userId: string } | null }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))

import Cuentas from '@/app/(menu)/(regalos)/cuentas/page'
import { cancelGroupGiftAction, markPaidAction } from '@/app/actions'

const usuario = (nombre: string) => upsertUserFromGoogle(h.db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })

async function regalo(duenoId: string, titulo: string, encargado: string, otro: string, total: number) {
  const item = (await createItem(h.db, duenoId, { tipo: 'exacto', titulo }))!
  const g = await iniciarRegaloGrupal(h.db, item.id, encargado)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(h.db, g.giftId, otro)
  await comprarRegalo(h.db, g.giftId, encargado, { total })
}

/** Lo que se lee en Cuentas de userId, sin etiquetas; y el HTML, para los formularios. */
async function pantalla(userId: string) {
  h.session = { userId }
  const html = renderToStaticMarkup(await Cuentas({ searchParams: Promise.resolve({}) }))
  return { html, texto: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }
}

/** Ana le debe $30.000 a Bruno (la bici de Mamá) y Bruno a Carla (el libro del Tío, de $libro); Ana y Carla son amigas. */
async function cadena(libro: number) {
  h.db = await createTestDb()
  const [mama, tio, ana, bruno, carla] = await Promise.all(['Mamá', 'Tío', 'Ana', 'Bruno', 'Carla'].map(usuario))
  await regalo(mama.id, 'Bici', bruno.id, ana.id, 60000)
  await regalo(tio.id, 'Libro', carla.id, bruno.id, libro)
  await h.db.insert(amistades).values({ deUserId: ana.id, paraUserId: carla.id, estado: 'aceptada' })
  return { mama, tio, ana, bruno, carla }
}

test('simplificado: cada tarjeta dice a quién pagarle y por qué, y se salda toda junta (o una parte)', async () => {
  const { ana, bruno, carla } = await cadena(20000)
  const deAna = await pantalla(ana.id)
  expect(deAna.texto).toContain('Le debés $20.000 a Bruno')
  expect(deAna.texto).toContain('Bici para Mamá · tu parte $30.000')
  expect(deAna.texto).toContain('Se lo pagás a Carla simplificado −$10.000')
  expect(deAna.texto).toContain('Le debés $10.000 a Carla')
  expect(deAna.texto).toContain('En vez de pagarle a Bruno simplificado $10.000')
  expect(deAna.texto).toContain('Simplificado, como en Splitwise')
  expect(deAna.texto).toContain('Ya le pagué todo ($20.000)')
  expect(deAna.texto).toContain('Le pagué una parte')
  // las partes de una tarjeta simplificada no se marcan sueltas: no suman lo de arriba
  expect(deAna.html).not.toContain('name="deudorId"')

  const deBruno = await pantalla(bruno.id)
  expect(deBruno.texto).toContain('Ana te debe $20.000')
  expect(deBruno.texto).toContain('Me pagó una parte')
  expect(deBruno.texto).toContain('Lo pagan por vos')
  expect(deBruno.texto).toContain('Ana le paga $10.000 a Carla por vos')
  expect(deBruno.texto).toContain('Así vos no le pagás eso a Carla y Ana no te lo paga a vos.')

  expect((await pantalla(carla.id)).texto).toContain('Ana te debe $10.000')
})

test('lo que pasa por vos entero: nada que pagar, pero no "están todos a mano" hasta que lo marquen', async () => {
  const { bruno } = await cadena(60000)
  const { texto } = await pantalla(bruno.id)
  expect(texto).toContain('Ana le paga $30.000 a Carla por vos')
  expect(texto).not.toContain('Están todos a mano')
  expect(texto).toMatch(/Debés \$0 .*Te deben \$0/)
})

test('sin simplificar, todo como antes: cada parte con su botón', async () => {
  h.db = await createTestDb()
  const [mama, rodri, sofi] = await Promise.all(['Mamá', 'Rodri', 'Sofi'].map(usuario))
  await regalo(mama.id, 'Bici', rodri.id, sofi.id, 60000)
  const { html, texto } = await pantalla(sofi.id)
  expect(texto).toContain('Le debés $30.000 a Rodri')
  expect(texto).toContain('Bici para Mamá · tu parte $30.000 Ya le pagué')
  expect(html).toContain('name="deudorId"')
  expect(texto).not.toContain('Ya le pagué todo')
  expect(texto).not.toContain('simplificado')
  expect(texto).toContain('Le pagué una parte')
})

test('una ronda: quiénes y cuánto, y el botón para marcarla', async () => {
  h.db = await createTestDb()
  const [mama, tio, tia, ana, bruno, carla] = await Promise.all(['Mamá', 'Tío', 'Tía', 'Ana', 'Bruno', 'Carla'].map(usuario))
  await regalo(mama.id, 'Bici', bruno.id, ana.id, 60000)
  await regalo(tio.id, 'Libro', carla.id, bruno.id, 60000)
  await regalo(tia.id, 'Taza', ana.id, carla.id, 60000)
  const { html, texto } = await pantalla(bruno.id)
  expect(texto).toContain('Con Carla y Ana quedan a mano')
  expect(texto).toContain('Se deben $30.000 en ronda: vos le debés a Carla, Carla a Ana y Ana a vos.')
  expect(texto).toContain('Marcar como saldado')
  expect(html).toContain('name="clave"')
  expect(texto).not.toContain('Están todos a mano')
})

/** Los campos ocultos del formulario que tiene el botón `boton`, como los mandaría el navegador. */
function formularioDe(html: string, boton: string) {
  const form = html.split('<form').find((f) => f.includes(`>${boton}</button>`))
  if (!form) throw new Error(`no hay un formulario con el botón ${boton}`)
  const fd = new FormData()
  for (const [, k, v] of form.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)) fd.set(k, v)
  return fd
}

test('sin nada: de dónde salen las cuentas y un link que lleva a donde se arma un regalo grupal', async () => {
  h.db = await createTestDb()
  const sofi = await usuario('Sofi')
  const { html, texto } = await pantalla(sofi.id)
  expect(texto).toContain('Las cuentas salen de los regalos grupales')
  expect(texto).toContain('abrí un deseo de la lista de alguien de tu gente: ahí está “Armar regalo grupal”')
  expect(html).toMatch(/<a [^>]*href="\/gente"[^>]*>Ir a Tu gente<\/a>/)
  // sin cuentas no hay a quién transferirle: no se lo invita a cargar el alias
  expect(texto).not.toContain('Poné tu alias')
})

test('adónde transferir: el alias de a quien le debés, con su botón; sin alias, se dice; y al que le deben se lo invita a cargarlo', async () => {
  h.db = await createTestDb()
  const [mama, rodri, sofi] = await Promise.all(['Mamá', 'Rodri', 'Sofi'].map(usuario))
  await regalo(mama.id, 'Bici', rodri.id, sofi.id, 60000)
  let deSofi = await pantalla(sofi.id)
  expect(deSofi.texto).toContain('Rodri todavía no cargó su alias para transferirle: pedíselo.')
  expect(deSofi.texto).not.toContain('Copiar')
  // a Sofi no le deben nada: no se la invita
  expect(deSofi.texto).not.toContain('Poné tu alias')
  let deRodri = await pantalla(rodri.id)
  expect(deRodri.texto).toContain('Poné tu alias así te transfieren')
  expect(deRodri.html).toContain('href="/perfil#alias"')
  // de Sofi no dice nada: es ella la que le debe
  expect(deRodri.texto).not.toContain('todavía no cargó su alias')

  await guardarAliasPago(h.db, rodri.id, 'Rodri.Plata.MP')
  await guardarAliasPago(h.db, sofi.id, '0000003100012345678901')
  deSofi = await pantalla(sofi.id)
  expect(deSofi.texto).toContain('Transferile a su alias rodri.plata.mp Copiar alias')
  expect(deSofi.texto).not.toContain('todavía no cargó')
  deRodri = await pantalla(rodri.id)
  expect(deRodri.texto).not.toContain('Poné tu alias')
  // el CVU de Sofi no aparece en la pantalla de quien le cobra
  expect(deRodri.html).not.toContain('0000003100012345678901')
  expect(deRodri.texto).not.toContain('Copiar')

  // al revés (Rodri le debe a Sofi el libro): ahí sí, y dice que es un CVU
  await regalo(mama.id, 'Libro', sofi.id, rodri.id, 100000)
  deRodri = await pantalla(rodri.id)
  expect(deRodri.texto).toContain('Le debés $20.000 a Sofi')
  expect(deRodri.texto).toContain('Transferile a su CVU 0000003100012345678901 Copiar CVU')
})

test('"Cancelar el regalo grupal" desde Cuentas pide confirmación y dice qué pasa, como en el deseo', async () => {
  h.db = await createTestDb()
  const [mama, rodri, sofi] = await Promise.all(['Mamá', 'Rodri', 'Sofi'].map(usuario))
  const item = (await createItem(h.db, mama.id, { tipo: 'exacto', titulo: 'Bici' }))!
  const g = await iniciarRegaloGrupal(h.db, item.id, rodri.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(h.db, g.giftId, sofi.id)
  // Mamá lo sacó de la lista ("Ya lo tengo"): Rodri lo termina desde Cuentas
  await h.db.update(items).set({ estadoDueno: 'lo_tengo' }).where(eq(items.id, item.id))
  const { html, texto } = await pantalla(rodri.id)
  expect(texto).toContain('Cancelar el regalo grupal')
  expect(texto).toContain('El regalo grupal se termina acá y les avisamos a los que se sumaron: el deseo ya no está en la lista. Todavía no se compró: nadie le queda debiendo nada a nadie.')
  // el botón que cancela está adentro de la explicación (un details cerrado), no suelto
  const confirmar = html.split('<details').find((d) => d.includes('Cancelar el regalo grupal'))!
  expect(confirmar).toContain('>Sí, cancelarlo</button>')
  expect(html.match(/Sí, cancelarlo/g)).toHaveLength(1)
  expect(html).not.toContain('>Cancelar el regalo</button>')

  await cancelGroupGiftAction(formularioDe(html, 'Sí, cancelarlo'))
  expect((await misCuentas(h.db, rodri.id)).enCurso).toEqual([])
})

test('"Deshacer" en Ya saldado: dice cuánto vuelve a figurar y que al otro no le avisa, y deshace lo último que se anotó', async () => {
  h.db = await createTestDb()
  const [mama, rodri, sofi] = await Promise.all(['Mamá', 'Rodri', 'Sofi'].map(usuario))
  await regalo(mama.id, 'Bici', rodri.id, sofi.id, 60000)
  // Rodri tocó "Me pagó" de más
  h.session = { userId: rodri.id }
  expect(await saldarCon(h.db, rodri.id, sofi.id, 30000)).toBe(1)
  let deRodri = await pantalla(rodri.id)
  expect(deRodri.texto).toContain('Sofi te pagó · Bici $30.000 Deshacer')
  expect(deRodri.texto).toContain('Vuelve a figurar que Sofi te debe $30.000 por Bici. A Sofi no le llega ningún aviso: contale vos.')
  // Sofi también lo puede deshacer, desde su lado
  expect((await pantalla(sofi.id)).texto).toContain('Vuelve a figurar que le debés $30.000 a Rodri por Bici. A Rodri no le llega ningún aviso: contale vos.')
  h.session = { userId: rodri.id }
  await markPaidAction(formularioDe(deRodri.html, 'Sí, deshacer'))
  deRodri = await pantalla(rodri.id)
  expect(deRodri.texto).toContain('Sofi te debe $30.000')
  expect(deRodri.texto).not.toContain('Ya saldado')

  // de a partes: deshacer vuelve a lo que faltaba antes del último pago, no a toda la parte
  expect(await pagarParte(h.db, sofi.id, rodri.id, 10000, -30000)).toEqual({ ok: true })
  expect(await marcarPagado(h.db, (await misCuentas(h.db, sofi.id)).personas[0].lineas[0].giftId, sofi.id, sofi.id)).toBe(true)
  const deSofi = await pantalla(sofi.id)
  expect(deSofi.texto).toContain('Le pagaste a Rodri · Bici $30.000 Deshacer')
  expect(deSofi.texto).toContain('Vuelve a figurar que le debés $20.000 a Rodri por Bici.')
  h.session = { userId: sofi.id }
  await markPaidAction(formularioDe(deSofi.html, 'Sí, deshacer'))
  expect((await misCuentas(h.db, sofi.id)).debes).toBe(20000)
})
