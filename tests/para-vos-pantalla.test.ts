import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import type { Db } from '@/db/types'
import { claims, lists } from '@/db/schema'
import { upsertUserFromGoogle } from '@/lib/users'
import { createItem } from '@/lib/items'
import { pedirAmistad } from '@/lib/amigos'
import { mandarCodazo } from '@/lib/codazos'
import { iniciarRegaloGrupal } from '@/lib/regalos'
import { invitarARegalo } from '@/lib/invitaciones'
import { crearAmigoInvisible, type MiJuego } from '@/lib/amigo-invisible'
import { guardarAviso } from '@/lib/bandeja'
import { hoyLocal } from '@/lib/events'
import {
  armarPendientes, EN_INICIO, juegoParaProponer, pendientesDe, PROPONER_DESDE, PROPONER_HASTA, tocaSortear, type Fuentes, type Pendiente,
} from '@/lib/para-vos'

// "Para vos": lo que espera que hagas algo, en un solo bloque y por urgencia. En Inicio los primeros, con "Ver todos (N)";
// en Avisos, todos enteros. Con la base en PGlite y la sesión de Next simulada.
const h = vi.hoisted(() => ({ db: undefined as unknown as Db, session: null as { userId: string } | null }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))

import Avisos from '@/app/(menu)/avisos/page'
import { ArmarJuegoDeFecha, ParaVosEnInicio, ParaVosEntero } from '@/components/ParaVos'

const usuario = (db: Db, nombre: string) => upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
const amigos = async (db: Db, a: string, b: string) => { await pedirAmistad(db, a, b); await pedirAmistad(db, b, a) }
const DIA = 86_400_000
const enDias = (n: number) => new Date(hoyLocal().getTime() + n * DIA).toISOString().slice(0, 10)
const sinPush = async () => 201
const tipos = (ps: Pendiente[]) => ps.map((p) => p.tipo)
const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replaceAll('&quot;', '"').replace(/\s+/g, ' ')

const juego = (o: Partial<MiJuego>): MiJuego => ({
  id: 'j', nombre: 'Navidad', regla: null, fecha: enDias(20), fechaEspecial: null, presupuesto: null, dias: 20, miEstado: 'juega', sorteado: false,
  faltaSortearDeNuevo: false, vi: false, revelado: false, organizador: 'Euge', soyOrganizador: false, invitados: 4, contestaron: 4, meToca: null,
  yaLoTengo: false, preguntasSinContestar: 0, ...o,
})
const NADA: Fuentes = { invitado: null, reservas: [], regalosAbiertos: [], codazos: [], solicitudes: [], invitaciones: [], juegos: [], avisos: [] }

/**
 * A Yo le esperan seis cosas: una reserva que vence en 2 días, una propuesta de regalo grupal de Euge, una invitación a su
 * amigo invisible, la solicitud de Sofi, el codazo de Juan y un aviso de que le pagaron.
 */
async function conTodo() {
  const db = await createTestDb()
  const [yo, sofi, juan, euge, rodri] = await Promise.all(['Yo', 'Sofi', 'Juan', 'Euge', 'Rodri'].map((n) => usuario(db, n)))
  await amigos(db, euge.id, yo.id)
  const [termo, mate] = [
    (await createItem(db, rodri.id, { tipo: 'exacto', titulo: 'Termo' }))!, (await createItem(db, rodri.id, { tipo: 'exacto', titulo: 'Mate' }))!,
  ]
  await db.insert(claims).values({ itemId: termo.id, claimerUserId: yo.id, createdAt: new Date(Date.now() - 10 * DIA), expiresAt: new Date(Date.now() + 1.5 * DIA) })
  const r = await iniciarRegaloGrupal(db, mate.id, euge.id)
  if (!r.ok) throw new Error(r.reason)
  expect(await invitarARegalo(db, r.giftId, euge.id, [yo.id], sinPush)).toBe(1)
  const j = await crearAmigoInvisible(db, euge.id, { nombre: 'Los del trabajo', fecha: enDias(20) }, [yo.id], sinPush)
  if (!j.ok) throw new Error(j.reason)
  await pedirAmistad(db, sofi.id, yo.id, sinPush)
  const [mia] = await db.select().from(lists).where(eq(lists.ownerId, yo.id))
  expect(await mandarCodazo(db, mia.shareToken, { userId: juan.id }, 'Juan', sinPush)).toMatchObject({ ok: true })
  await guardarAviso(db, yo.id, { tipo: 'pago', title: '💸 Sofi te pagó $1', body: '', url: '/cuentas' })
  return { db, yo, juegoId: j.id }
}

test('todo lo que espera, por urgencia: lo que vence primero; nada se pierde, y los avisos de la campanita se cuentan todos', async () => {
  const { db, yo } = await conTodo()
  const { pendientes, total } = await pendientesDe(db, yo.id, hoyLocal(), null)
  expect(tipos(pendientes)).toEqual(['reserva', 'propuesta', 'juego', 'solicitudes', 'codazos', 'aviso'])
  expect(total).toBe(6)
  // con el invitado de este navegador por contestar, eso va primero
  expect(tipos((await pendientesDe(db, yo.id, hoyLocal(), 'Yoyo')).pendientes)[0]).toBe('invitado')
  // de los avisos vienen los primeros, pero se cuentan todos
  for (const n of [2, 3, 4, 5]) await guardarAviso(db, yo.id, { tipo: 'pago', title: `💸 Sofi te pagó $${n}`, body: '', url: '/cuentas' })
  const conMas = await pendientesDe(db, yo.id, hoyLocal(), null)
  expect(tipos(conMas.pendientes).filter((t) => t === 'aviso')).toHaveLength(3)
  expect(conMas.total).toBe(10)
})

test('el orden: una invitación a un juego que es pasado mañana pasa adelante; "¿Quién te regaló?" va último', () => {
  const reserva = (diasRestantes: number) => ({ claimId: `c${diasRestantes}`, itemTitulo: 'Termo', diasRestantes, href: null })
  const orden = armarPendientes({
    ...NADA,
    solicitudes: [{ id: 's', de: { id: 'u', nombre: 'Sofi', usuario: null, foto: null } }],
    reservas: [reserva(6), reserva(1)],
    regalosAbiertos: [{ giftId: 'g', itemTitulo: 'Bici', href: '/cuentas' }],
    juegos: [
      juego({ id: 'pasado', dias: -3, sorteado: true }), juego({ id: 'invitan', miEstado: 'invitado', dias: 2 }),
      juego({ id: 'organizo', soyOrganizador: true, dias: 20 }),
    ],
  })
  expect(orden.map((p) => (p.tipo === 'reserva' ? `reserva ${p.reserva.diasRestantes}` : p.tipo)))
    .toEqual(['reserva 1', 'juego', 'sortear', 'reserva 6', 'solicitudes', 'regalo_abierto', 'quien_regalo'])
  expect(armarPendientes(NADA)).toEqual([])
})

test('al que organiza se le pide sortear cuando ya puede: contestaron todos, falta poco o cambió quiénes juegan', () => {
  const j = (o: Partial<MiJuego>) => tocaSortear(juego({ soyOrganizador: true, ...o }))
  expect(j({})).toBe(true)
  // recién armado, con gente sin contestar y tiempo: todavía no
  expect(j({ invitados: 6, contestaron: 3 })).toBe(false)
  expect(j({ invitados: 6, contestaron: 3, dias: 5 })).toBe(true)
  // con menos de los que hacen falta para jugar no hay nada que sortear
  expect(j({ invitados: 2, contestaron: 2 })).toBe(false)
  expect(j({ sorteado: true })).toBe(false)
  expect(j({ sorteado: true, faltaSortearDeNuevo: true })).toBe(true)
  expect(j({ dias: -1 })).toBe(false)
  expect(j({ soyOrganizador: false })).toBe(false)
})

test('en Inicio van los tres primeros en un solo bloque, con "Ver todos (N)"; "Listo" solo en lo que se puede sacar', async () => {
  const { db, yo, juegoId } = await conTodo()
  const { pendientes, total } = await pendientesDe(db, yo.id, hoyLocal(), null)
  expect(EN_INICIO).toBe(3)
  const html = renderToStaticMarkup(createElement(ParaVosEnInicio, { pendientes, total }))
  expect(html.match(/<li/g)).toHaveLength(3)
  const t = texto(html)
  expect(t).toContain('Para vos · 6')
  expect(t).toContain('¿Conseguiste "Termo"?')
  expect(t).toContain('Te quedan 2 días de reserva')
  expect(t).toContain('Euge te propone un regalo grupal')
  expect(t).toContain('Euge te invita a un amigo invisible')
  expect(html).toContain('href="/l/')
  expect(html).toContain('href="/avisos#invitaciones"')
  expect(html).toContain(`href="/invisible/${juegoId}"`)
  // lo demás, en Avisos
  expect(html).toContain('href="/avisos#para-vos"')
  expect(t).toContain('Ver todos (6)')
  expect(t).not.toContain('solicitud de amistad')
  // una reserva, una propuesta y una invitación no se sacan con "Listo": se van al contestar
  expect(html).not.toContain('Listo')

  // lo que se puede sacar sin contestar (el codazo, el aviso de la campanita) lleva "Listo", y nada más
  const sacables = renderToStaticMarkup(createElement(ParaVosEnInicio, { pendientes: pendientes.slice(3), total: 3 }))
  expect(texto(sacables)).toContain('Sofi te mandó una solicitud de amistad')
  expect(sacables).toContain('href="/avisos#solicitudes"')
  expect(sacables).toContain('href="/agregar"')
  expect(sacables.match(/aria-label="Listo: [^"]+"/g)).toEqual(['aria-label="Listo: Juan te dio un codazo"', 'aria-label="Listo: Sofi te pagó $1"'])
  expect(sacables.match(/>Listo</g)).toHaveLength(2)
  expect(sacables).not.toContain('Ver todos')
  for (const viejo of ['Limpiar', 'Archivar', 'Marcar como leídas']) expect(html + sacables).not.toContain(viejo)
})

test('en Avisos está todo entero, con sus botones, y vuelve a donde la persona estaba', async () => {
  const { db, yo } = await conTodo()
  h.db = db
  h.session = { userId: yo.id }
  const avisos = async (sp: Record<string, string | string[]> = {}) => renderToStaticMarkup(await Avisos({ searchParams: Promise.resolve(sp) }))
  const html = await avisos()
  const t = texto(html)
  const lugares = ['Reservas por vencer', 'Te proponen un regalo grupal', 'Amigo invisible', 'Solicitudes de amistad', 'Codazos', 'Nuevos'].map((r) => t.indexOf(r))
  expect(lugares.every((i) => i > -1)).toBe(true)
  expect([...lugares].sort((a, b) => a - b)).toEqual(lugares)
  for (const boton of ['Marcalo o liberalo', 'Me sumo', 'No puedo', 'Juego', 'No juego', 'Aceptar', 'Rechazar', 'Agregar algo', 'Listo']) {
    expect(t, boton).toContain(boton)
  }
  expect(html).toContain('id="para-vos"')
  expect(html).toContain('id="invitaciones"')
  expect(html).toContain('id="solicitudes"')
  // lo que avisa la campanita sigue abajo, una sola vez; lo que ya espera arriba con sus botones no se repite como aviso
  expect(t.match(/Sofi te pagó \$1/g)).toHaveLength(1)
  for (const repetido of ['¡Codazo de Juan!', 'quiere ser tu amigo en GiftR', '¿Jugás?', 'en partes iguales. ¿Te sumás?']) {
    expect(t, repetido).not.toContain(repetido)
  }

  // entró por un link: vuelve a Inicio. Desde la campanita de Tu gente, a Tu gente; lo que no es una ruta de GiftR no vale
  const volver = (h: string) => /<a [^>]*aria-label="Volver[^"]*"[^>]*>/.exec(h)?.[0]
  expect(volver(html)).toContain('href="/inicio"')
  expect(volver(html)).toContain('aria-label="Volver a Inicio"')
  const desdeGente = volver(await avisos({ volver: '/gente' }))
  expect(desdeGente).toContain('href="/gente"')
  expect(desdeGente).toContain('aria-label="Volver a tu gente"')
  for (const malo of ['//otro.com', 'https://otro.com', '/\\otro.com', 'javascript:alert(1)', ['/gente', '/regalos']]) {
    expect(volver(await avisos({ volver: malo })), String(malo)).toContain('href="/inicio"')
  }
})

test('sin nada que espere, Avisos no arma "Para vos"; si quiso sumarse a un regalo y ya no se podía, se lo dice', async () => {
  h.db = await createTestDb()
  const yo = await usuario(h.db, 'Yo')
  h.session = { userId: yo.id }
  expect(renderToStaticMarkup(createElement(ParaVosEntero, { pendientes: [], noSePudo: false }))).toBe('')
  const html = renderToStaticMarkup(await Avisos({ searchParams: Promise.resolve({ invitacion: 'no_se_pudo' }) }))
  expect(html).toContain('No te pudimos sumar')
})

test('cerca de Navidad, sin estar en ningún amigo invisible de Navidad, Inicio propone armarlo', () => {
  const el = (mes: number, dia: number) => new Date(Date.UTC(2026, mes - 1, dia))
  expect(juegoParaProponer(el(11, 11), [])).toMatchObject({ id: 'navidad', dias: 44 })
  // todavía falta mucho, o ya no da el tiempo para invitar, sortear y comprar
  expect([PROPONER_DESDE, PROPONER_HASTA]).toEqual([45, 3])
  expect(juegoParaProponer(el(11, 10), [])).toMatchObject({ id: 'navidad', dias: 45 })
  expect(juegoParaProponer(el(11, 9), [])).toBeNull()
  expect(juegoParaProponer(el(12, 22), [])).toMatchObject({ id: 'navidad', dias: 3 })
  expect(juegoParaProponer(el(12, 23), [])).toBeNull()
  // ya está en uno de Navidad (aunque sea invitado): no; uno aparte, o uno de Navidad que ya pasó, no cuentan
  expect(juegoParaProponer(el(11, 11), [{ fechaEspecial: 'navidad', dias: 44 }])).toBeNull()
  expect(juegoParaProponer(el(11, 11), [{ fechaEspecial: null, dias: 10 }, { fechaEspecial: 'navidad', dias: -320 }])).toMatchObject({ id: 'navidad' })
  // en julio, el del Día del Amigo
  expect(juegoParaProponer(el(7, 1), [])).toMatchObject({ id: 'amigo', dias: 19 })

  const html = renderToStaticMarkup(createElement(ArmarJuegoDeFecha, { fecha: juegoParaProponer(el(11, 11), [])! }))
  expect(html).toContain('href="/invisible/nuevo?fecha=navidad"')
  expect(texto(html)).toContain('Armá el amigo invisible de Navidad')
  expect(texto(html)).toContain('Faltan 44 días')
})
