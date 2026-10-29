import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestDb } from './helpers'
import { amistades } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { createItem } from '@/lib/items'
import { comprarRegalo, iniciarRegaloGrupal, sumarseARegalo } from '@/lib/regalos'

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
