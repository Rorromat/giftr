import { expect, test, vi } from 'vitest'
import { createECDH, randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { conConsultas, createTestDb } from './helpers'
import { amigoInvisibleGente, amigosInvisibles, avisos, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { misAmigos, pedirAmistad } from '@/lib/amigos'
import { bandeja } from '@/lib/bandeja'
import { guardarSuscripcion, type Aviso, type Enviar } from '@/lib/codazos'
import { hoyLocal } from '@/lib/events'
import {
  amigoInvisibleParaViewer, cambiarExcluidos, cambiarLinkDelJuego, cerrarAltas, crearAmigoInvisible, dejarVolverAlJuego, estadoDeJuegos,
  invitarAlJuego, juegoPorInvitacion, linkDelJuego, marcarYaLoTengo, MAX_JUGADORES, misAmigosInvisibles, preguntar, responderJuego, sacarDelJuego,
  sortear, unirsePorLink, verAQuienLeRegalo,
} from '@/lib/amigo-invisible'

// El amigo invisible por link (la oficina, la familia grande): se suma cualquiera con cuenta, sin ser amigo del que
// organiza; y después del sorteo se puede bajar o sumar gente sin tener que borrar el juego y armarlo de nuevo.

const iso = (d: Date) => d.toISOString().slice(0, 10)
const enDias = (n: number) => iso(new Date(hoyLocal().getTime() + n * 86400_000))

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}
const ecdh = createECDH('prime256v1')
const CLAVES = { p256dh: ecdh.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') }
function pushFalso() {
  const enviados: { para: string; aviso: Aviso }[] = []
  const enviar: Enviar = async (s, aviso) => { enviados.push({ para: s.endpoint.split('/').at(-1)!, aviso }); return 201 }
  return { enviados, enviar }
}

type U = { id: string }

/** Euge arma "Oficina" sin elegir a nadie: nadie es amigo de nadie. Todos reciben avisos en el celular. */
async function setup() {
  const db = await createTestDb()
  const [euge, sofi, rodri, juan, ana, caro] = await Promise.all(['Euge', 'Sofi', 'Rodri', 'Juan', 'Ana', 'Caro'].map((n) => usuario(db, n)))
  for (const u of [euge, sofi, rodri, juan, ana, caro]) await guardarSuscripcion(db, u.id, { endpoint: `https://fcm.googleapis.com/fcm/send/${u.id}`, keys: CLAVES })
  const r = await crearAmigoInvisible(db, euge.id, { nombre: 'Oficina', presupuesto: 20000, fecha: enDias(30) }, [])
  if (!r.ok) throw new Error('no se armó')
  const token = (await linkDelJuego(db, r.id, euge.id))!
  return { db, euge, sofi, rodri, juan, ana, caro, id: r.id, token }
}

/** A quién le regala cada uno, leído de la base (lo que ninguna vista devuelve). */
async function cadena(db: Db, id: string) {
  const filas = await db.select().from(amigoInvisibleGente).where(eq(amigoInvisibleGente.amigoInvisibleId, id))
  return new Map(filas.filter((f) => f.estado === 'juega').map((f) => [f.userId, f.regalaA]))
}

/** Pone el sorteo que el test necesita: cada uno le regala al siguiente, y el último al primero. */
async function ponerRonda(db: Db, id: string, ronda: U[]) {
  for (const [i, u] of ronda.entries()) {
    await db.update(amigoInvisibleGente).set({ regalaA: ronda[(i + 1) % ronda.length].id })
      .where(and(eq(amigoInvisibleGente.amigoInvisibleId, id), eq(amigoInvisibleGente.userId, u.id)))
  }
}

/** Se suman por el link, se sortea, queda la ronda pedida y cada uno ya vio a quién le regala. */
async function sorteado(s: Awaited<ReturnType<typeof setup>>, ronda: U[]) {
  for (const u of ronda) if (u.id !== s.euge.id) await unirsePorLink(s.db, s.token, u.id, pushFalso().enviar)
  expect(await sortear(s.db, s.id, s.euge.id, pushFalso().enviar)).toEqual({ ok: true })
  await ponerRonda(s.db, s.id, ronda)
  for (const u of ronda) await verAQuienLeRegalo(s.db, s.id, u.id)
}

const vista = async (db: Db, id: string, u: U) => (await amigoInvisibleParaViewer(db, id, u.id))!
const titulos = (enviados: { para: string; aviso: Aviso }[]) => enviados.map((e) => [e.para, e.aviso.title]).sort()

test('sumarse por el link: cualquiera con cuenta, sin ser amigo del que organiza y sin quedar amigo de nadie', async () => {
  const s = await setup()
  // lo que ve cualquiera que abre el link, con o sin cuenta: el juego y quién organiza; de los que juegan, solo cuántos
  const espia = conConsultas(s.db)
  const inv = (await juegoPorInvitacion(espia.db, s.token))!
  expect(inv).toMatchObject({
    id: s.id, nombre: 'Oficina', presupuesto: 20000, dias: 30, organizador: { nombre: 'Euge' }, juegan: 1, sorteado: false, estado: 'abierto', yo: null,
  })
  expect(espia.consultas.join('\n')).not.toContain('regala_a')
  expect(JSON.stringify(inv)).not.toContain(s.token)
  // el link lo tiene solo el que organiza
  expect(await linkDelJuego(s.db, s.id, s.sofi.id)).toBeNull()
  expect(await linkDelJuego(s.db, s.id, s.euge.id)).toBe(s.token)

  const { enviados, enviar } = pushFalso()
  expect(await unirsePorLink(s.db, s.token, s.sofi.id, enviar)).toEqual({ ok: true, id: s.id, nuevo: true, tarde: false })
  expect(await vista(s.db, s.id, s.sofi)).toMatchObject({ miEstado: 'juega', soyOrganizador: false, sorteado: false })
  expect((await vista(s.db, s.id, s.euge)).gente.map((g) => [g.persona.nombre, g.estado])).toEqual([['Euge', 'juega'], ['Sofi', 'juega']])
  expect((await misAmigosInvisibles(s.db, s.sofi.id)).map((j) => [j.nombre, j.miEstado, j.organizador])).toEqual([['Oficina', 'juega', 'Euge']])
  // no quedan amigos: ni con el que organiza ni entre los que se suman
  await unirsePorLink(s.db, s.token, s.rodri.id, enviar)
  for (const u of [s.euge, s.sofi, s.rodri]) expect([...await misAmigos(s.db, u.id)]).toEqual([])
  // antes del sorteo no se le avisa a nadie (con 30 de la oficina serían 30 avisos)
  expect(enviados).toEqual([])

  // el que ya estaba, y el que organiza: no cambia nada
  expect(await unirsePorLink(s.db, s.token, s.sofi.id, enviar)).toEqual({ ok: true, id: s.id, nuevo: false, tarde: false })
  expect(await unirsePorLink(s.db, s.token, s.euge.id, enviar)).toEqual({ ok: true, id: s.id, nuevo: false, tarde: false })
  expect((await vista(s.db, s.id, s.euge)).gente).toHaveLength(3)
  expect((await juegoPorInvitacion(s.db, s.token, s.sofi.id))!.yo).toBe('adentro')
  expect((await juegoPorInvitacion(s.db, s.token, s.juan.id))!).toMatchObject({ yo: null, juegan: 3 })

  // un link que no es de ningún juego
  expect(await unirsePorLink(s.db, 'no-es-de-nadie', s.juan.id, enviar)).toEqual({ ok: false, reason: 'no_existe' })
  expect(await unirsePorLink(s.db, 'con espacio\u0000', s.juan.id, enviar)).toEqual({ ok: false, reason: 'no_existe' })
  expect(await juegoPorInvitacion(s.db, 'no-es-de-nadie')).toBeNull()

  // al que el que organiza eligió a mano (un amigo suyo) y no había contestado: con el link queda jugando
  await pedirAmistad(s.db, s.euge.id, s.ana.id)
  await pedirAmistad(s.db, s.ana.id, s.euge.id)
  expect(await invitarAlJuego(s.db, s.id, s.euge.id, [s.ana.id], enviar)).toBe(1)
  expect((await vista(s.db, s.id, s.ana)).miEstado).toBe('invitado')
  expect(await unirsePorLink(s.db, s.token, s.ana.id, enviar)).toMatchObject({ ok: true, nuevo: true })
  expect((await vista(s.db, s.id, s.ana)).miEstado).toBe('juega')

  // un juego de antes de que existiera el link: se arma la primera vez que el que organiza lo pide, y queda
  await s.db.update(amigosInvisibles).set({ inviteToken: null }).where(eq(amigosInvisibles.id, s.id))
  expect(await juegoPorInvitacion(s.db, s.token)).toBeNull()
  const nuevo = await linkDelJuego(s.db, s.id, s.euge.id)
  expect(nuevo).toMatch(/^[A-Za-z0-9_-]{16,}$/)
  expect(await linkDelJuego(s.db, s.id, s.euge.id)).toBe(nuevo)
})

test('el link deja de sumar: si cambió, con las altas cerradas, con el tope, pasada la fecha y al que sacaron', async () => {
  const s = await setup()
  const { enviar } = pushFalso()
  // cambiar el link: solo el que organiza; el de antes no sirve más y los que ya estaban siguen
  await unirsePorLink(s.db, s.token, s.sofi.id, enviar)
  expect(await cambiarLinkDelJuego(s.db, s.id, s.sofi.id)).toBeNull()
  const nuevo = (await cambiarLinkDelJuego(s.db, s.id, s.euge.id))!
  expect(nuevo).not.toBe(s.token)
  expect(await unirsePorLink(s.db, s.token, s.rodri.id, enviar)).toEqual({ ok: false, reason: 'no_existe' })
  expect(await juegoPorInvitacion(s.db, s.token)).toBeNull()
  expect((await vista(s.db, s.id, s.sofi)).miEstado).toBe('juega')
  expect(await unirsePorLink(s.db, nuevo, s.rodri.id, enviar)).toMatchObject({ ok: true, nuevo: true })

  // cerrar las altas: el link no suma a nadie hasta que las abra
  expect(await cerrarAltas(s.db, s.id, s.sofi.id, true)).toBe(false)
  expect(await cerrarAltas(s.db, s.id, s.euge.id, true)).toBe(true)
  expect(await unirsePorLink(s.db, nuevo, s.juan.id, enviar)).toEqual({ ok: false, reason: 'cerrado' })
  expect((await juegoPorInvitacion(s.db, nuevo))!.estado).toBe('cerrado')
  expect((await vista(s.db, s.id, s.euge)).altasCerradas).toBe(true)
  // el que ya estaba y había dicho que no, antes del sorteo cambia de idea como siempre
  expect(await responderJuego(s.db, s.id, s.rodri.id, false)).toBe(true)
  expect(await responderJuego(s.db, s.id, s.rodri.id, true)).toBe(true)
  expect(await cerrarAltas(s.db, s.id, s.euge.id, false)).toBe(true)
  expect(await unirsePorLink(s.db, nuevo, s.juan.id, enviar)).toMatchObject({ ok: true, nuevo: true })

  // sacar a alguien: solo el que organiza, y a él no lo saca nadie. El sacado no ve el juego ni vuelve con el link
  expect(await sacarDelJuego(s.db, s.id, s.sofi.id, s.juan.id)).toBe(false)
  expect(await sacarDelJuego(s.db, s.id, s.euge.id, s.euge.id)).toBe(false)
  expect(await sacarDelJuego(s.db, s.id, s.euge.id, s.ana.id)).toBe(false) // Ana no está
  expect(await cambiarExcluidos(s.db, s.id, s.euge.id, s.juan.id, s.sofi.id, true)).toBe(true)
  expect(await sacarDelJuego(s.db, s.id, s.euge.id, s.juan.id)).toBe(true)
  expect(await amigoInvisibleParaViewer(s.db, s.id, s.juan.id)).toBeNull()
  expect(await misAmigosInvisibles(s.db, s.juan.id)).toEqual([])
  expect(await unirsePorLink(s.db, nuevo, s.juan.id, enviar)).toEqual({ ok: false, reason: 'sacado' })
  expect(await responderJuego(s.db, s.id, s.juan.id, true)).toBe(false)
  expect((await juegoPorInvitacion(s.db, nuevo, s.juan.id))!).toMatchObject({ yo: 'sacado', juegan: 3 })
  const org = await vista(s.db, s.id, s.euge)
  expect(org.gente.map((g) => g.persona.nombre)).toEqual(['Euge', 'Sofi', 'Rodri'])
  expect(org.sacados.map((p) => p.nombre)).toEqual(['Juan'])
  expect(org.excluidos).toEqual([]) // con él se va lo de "que no se toquen"
  expect((await vista(s.db, s.id, s.sofi)).sacados).toEqual([]) // eso lo ve el que organiza
  // "Dejar que vuelva": solo el que organiza; ahí sí entra de nuevo con el link
  expect(await dejarVolverAlJuego(s.db, s.id, s.sofi.id, s.juan.id)).toBe(false)
  expect(await dejarVolverAlJuego(s.db, s.id, s.euge.id, s.juan.id)).toBe(true)
  expect(await unirsePorLink(s.db, nuevo, s.juan.id, enviar)).toMatchObject({ ok: true, nuevo: true })

  // el tope: con MAX_JUGADORES entre los que juegan y los invitados, no entra nadie más
  const cuantos = MAX_JUGADORES - 4
  const relleno = await s.db.insert(users).values(Array.from({ length: cuantos }, (_, i) => ({ googleId: `g-r${i}`, nombre: `Relleno ${i}`, email: `r${i}@test.com` }))).returning({ id: users.id })
  await s.db.insert(amigoInvisibleGente).values(relleno.map((u, i) => ({ amigoInvisibleId: s.id, userId: u.id, estado: i % 2 ? 'juega' as const : 'invitado' as const })))
  expect(await unirsePorLink(s.db, nuevo, s.ana.id, enviar)).toEqual({ ok: false, reason: 'lleno' })
  expect((await juegoPorInvitacion(s.db, nuevo))!.estado).toBe('lleno')
  expect((await vista(s.db, s.id, s.euge)).lleno).toBe(true)
  // el invitado ya tenía su lugar: entra igual
  expect(await unirsePorLink(s.db, nuevo, relleno[0].id, enviar)).toMatchObject({ ok: true, nuevo: true })
  // si uno se baja, queda un lugar
  expect(await responderJuego(s.db, s.id, s.sofi.id, false)).toBe(true)
  expect(await unirsePorLink(s.db, nuevo, s.ana.id, enviar)).toMatchObject({ ok: true, nuevo: true })

  // pasada la fecha de los regalos, el link no suma a nadie
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.now() + 32 * 86400_000))
  try {
    expect(await unirsePorLink(s.db, nuevo, s.caro.id, enviar)).toEqual({ ok: false, reason: 'pasado' })
    expect((await juegoPorInvitacion(s.db, nuevo))!.estado).toBe('pasado')
  } finally {
    vi.useRealTimers()
  }
})

test('una baja después del sorteo se arregla sola: al que le regalaba le toca otro, a nadie más le cambia nada, y nadie se entera de quién era', async () => {
  const s = await setup()
  // Euge → Sofi → Rodri → Juan → Ana → Euge
  await sorteado(s, [s.euge, s.sofi, s.rodri, s.juan, s.ana])
  expect(await marcarYaLoTengo(s.db, s.id, s.rodri.id, true)).toBe(true)
  const antes = await vista(s.db, s.id, s.euge)
  expect(antes).toMatchObject({ bajas: [], faltaSortearDeNuevo: false, puedeSortearDeNuevo: false })
  // sin que nadie se haya bajado ni sumado, no se sortea de nuevo (si no, el que organiza repetiría hasta que le toque quien quiere)
  expect(await sortear(s.db, s.id, s.euge.id, pushFalso().enviar)).toEqual({ ok: false, reason: 'no_permitido' })

  // se baja Juan: Rodri (que le regalaba) pasa a regalarle a Ana (a quien le regalaba Juan)
  const { enviados, enviar } = pushFalso()
  expect(await responderJuego(s.db, s.id, s.juan.id, false, enviar)).toBe(true)
  expect([...await cadena(s.db, s.id)].sort()).toEqual([
    [s.euge.id, s.sofi.id], [s.sofi.id, s.rodri.id], [s.rodri.id, s.ana.id], [s.ana.id, s.euge.id],
  ].sort())
  // se le avisa a Rodri (le cambió) y al que organiza (se bajó Juan). A nadie más
  expect(titulos(enviados)).toEqual([
    [s.rodri.id, '🔄 Cambió a quién le regalás en "Oficina"'], [s.euge.id, '👋 Juan se bajó de "Oficina"'],
  ].sort())
  expect(enviados.find((e) => e.para === s.euge.id)!.aviso.body).toBe('El sorteo sigue como está para los demás: no hace falta sortear de nuevo.')
  // el aviso de Rodri no dice quién se bajó, ni en el texto ni con la foto de quién lo manda
  const deRodri = (await bandeja(s.db, { userId: s.rodri.id })).entradas.find((e) => e.emoji === '🔄')!
  expect(deRodri).toMatchObject({ titulo: 'Cambió a quién le regalás en "Oficina"', de: null })
  expect(`${deRodri.titulo} ${deRodri.cuerpo}`).not.toContain('Juan')
  expect((await s.db.select().from(avisos).where(eq(avisos.id, deRodri.id)))[0].deUserId).toBeNull()

  // Rodri ve a quién le regala ahora (ya había tocado "Ver"); lo de "Ya tengo el regalo" era para Juan y se va
  expect(await vista(s.db, s.id, s.rodri)).toMatchObject({ meToca: { persona: { nombre: 'Ana' } }, esperoSorteo: null, yaLoTengo: false })
  // los demás, igual que antes
  expect((await vista(s.db, s.id, s.sofi)).meToca!.persona.nombre).toBe('Rodri')
  expect((await vista(s.db, s.id, s.ana)).meToca!.persona.nombre).toBe('Euge')
  // Juan ya no juega: no le toca nadie, y no lo tiene entre sus juegos
  expect(await vista(s.db, s.id, s.juan)).toMatchObject({ miEstado: 'no_juega', meToca: null, esperoSorteo: null })
  expect(await misAmigosInvisibles(s.db, s.juan.id)).toEqual([])
  expect(await verAQuienLeRegalo(s.db, s.id, s.juan.id)).toBe(false)

  // el que organiza sabe que se bajó Juan y que no hace falta sortear; no sabe a quién le cambió: lo que ve de Rodri es
  // lo mismo que veía antes (si le sacáramos el "ya vio", se daría cuenta de que era el que le regalaba a Juan)
  const org = await vista(s.db, s.id, s.euge)
  expect(org).toMatchObject({ bajas: [{ nombre: 'Juan' }], faltaSortearDeNuevo: false, puedeSortearDeNuevo: true })
  const deCadaUno = (v: typeof org) => v.gente.filter((g) => g.persona.id !== s.juan.id)
  expect(deCadaUno(org)).toEqual(deCadaUno(antes))
  expect(JSON.stringify(org)).not.toContain('regala')
  expect((await misAmigosInvisibles(s.db, s.euge.id))[0]).toMatchObject({ sorteado: true, faltaSortearDeNuevo: false })
  // los demás no ven quién se bajó ni si hay que sortear
  expect(await vista(s.db, s.id, s.sofi)).toMatchObject({ bajas: [], faltaSortearDeNuevo: false, puedeSortearDeNuevo: false })
})

test('si el hueco no se puede arreglar (no se tocan), al que le regalaba no se le muestra a nadie y el que organiza sortea de nuevo', async () => {
  const s = await setup()
  // Euge → Sofi → Rodri → Ana → Euge, y Juan mirando de afuera (se baja primero, para poder tocar los que no se tocan)
  await sorteado(s, [s.euge, s.sofi, s.rodri, s.juan, s.ana])
  await responderJuego(s.db, s.id, s.juan.id, false, pushFalso().enviar)
  // ahora que hubo un cambio, el que organiza puede decir quiénes no se tocan para el sorteo que viene
  expect(await cambiarExcluidos(s.db, s.id, s.sofi.id, s.sofi.id, s.ana.id, true)).toBe(false) // solo el que organiza
  expect(await cambiarExcluidos(s.db, s.id, s.euge.id, s.sofi.id, s.ana.id, true)).toBe(true)
  const antes = await vista(s.db, s.id, s.euge)

  // se baja Rodri: Sofi le regalaba, y Rodri a Ana; pero Sofi y Ana no se tocan
  const { enviados, enviar } = pushFalso()
  expect(await responderJuego(s.db, s.id, s.rodri.id, false, enviar)).toBe(true)
  expect([...await cadena(s.db, s.id)].sort()).toEqual([[s.euge.id, s.sofi.id], [s.sofi.id, null], [s.ana.id, s.euge.id]].sort())
  expect(titulos(enviados)).toEqual([[s.sofi.id, '⏳ "Oficina": hay que sortear de nuevo'], [s.euge.id, '👋 Rodri se bajó de "Oficina"']].sort())
  expect(enviados.find((e) => e.para === s.euge.id)!.aviso.body).toBe('Hay que sortear de nuevo: entrá y tocá "Volver a sortear".')

  // a Sofi no se le muestra un "te tocó" que ya no vale, ni en el juego ni en Regalos ni en Inicio
  expect(await vista(s.db, s.id, s.sofi)).toMatchObject({ meToca: null, esperoSorteo: 'hueco', sorteado: true })
  expect(await verAQuienLeRegalo(s.db, s.id, s.sofi.id)).toBe(false)
  expect(await preguntar(s.db, s.id, s.sofi.id, '¿Qué talle usás?', enviar)).toBe(false)
  const [deSofi] = await misAmigosInvisibles(s.db, s.sofi.id)
  expect(deSofi).toMatchObject({ sorteado: false, faltaSortearDeNuevo: true, meToca: null })
  expect(estadoDeJuegos([deSofi])).toBe('Amigo invisible: falta sortear')
  // a los demás no les cambió nada
  expect((await vista(s.db, s.id, s.ana)).meToca!.persona.nombre).toBe('Euge')
  expect((await misAmigosInvisibles(s.db, s.ana.id))[0]).toMatchObject({ sorteado: true, faltaSortearDeNuevo: false })

  // el que organiza ve que hay que sortear de nuevo y quiénes se bajaron, no quién quedó sin nadie: de Sofi ve lo de antes
  const org = await vista(s.db, s.id, s.euge)
  expect(org).toMatchObject({ faltaSortearDeNuevo: true, puedeSortearDeNuevo: true })
  expect(org.bajas.map((p) => p.nombre).sort()).toEqual(['Juan', 'Rodri'])
  expect(org.gente.find((g) => g.persona.id === s.sofi.id)).toEqual(antes.gente.find((g) => g.persona.id === s.sofi.id))
  expect(JSON.stringify(org)).not.toContain('regala')
  expect((await misAmigosInvisibles(s.db, s.euge.id))[0]).toMatchObject({ sorteado: true, faltaSortearDeNuevo: true })

  // sortear de nuevo: solo el que organiza. Con tres y dos que no se tocan no hay forma, y no se toca nada
  expect(await sortear(s.db, s.id, s.sofi.id, enviar)).toEqual({ ok: false, reason: 'no_permitido' })
  expect(await sortear(s.db, s.id, s.euge.id, enviar)).toEqual({ ok: false, reason: 'imposible' })
  expect((await cadena(s.db, s.id)).get(s.euge.id)).toBe(s.sofi.id)
  expect(await cambiarExcluidos(s.db, s.id, s.euge.id, s.sofi.id, s.ana.id, false)).toBe(true)
  const otra = pushFalso()
  expect(await sortear(s.db, s.id, s.euge.id, otra.enviar)).toEqual({ ok: true })
  // les llega a todos los que juegan, y solo a ellos
  expect(titulos(otra.enviados)).toEqual([s.euge, s.sofi, s.ana].map((u) => [u.id, '🔄 Se sorteó de nuevo "Oficina"']).sort())
  expect(otra.enviados[0].aviso.body).toBe('Puede haber cambiado a quién le regalás: entrá a ver (solo lo sabés vos).')
  // el sorteo nuevo vale entre los tres; cada uno tiene que mirar de nuevo
  const nueva = await cadena(s.db, s.id)
  expect([...nueva.keys()].sort()).toEqual([s.euge.id, s.sofi.id, s.ana.id].sort())
  expect([...nueva.values()].sort()).toEqual([s.euge.id, s.sofi.id, s.ana.id].sort())
  for (const u of [s.euge, s.sofi, s.ana]) {
    expect(await vista(s.db, s.id, u)).toMatchObject({ meToca: null, vi: false, esperoSorteo: null, yaLoTengo: false })
    expect((await misAmigosInvisibles(s.db, u.id))[0]).toMatchObject({ sorteado: true, vi: false, faltaSortearDeNuevo: false })
    expect(await verAQuienLeRegalo(s.db, s.id, u.id)).toBe(true)
    expect((await vista(s.db, s.id, u)).meToca!.persona.id).toBe(nueva.get(u.id))
  }
  // y queda como recién sorteado: sin bajas pendientes, no se sortea otra vez
  expect(await vista(s.db, s.id, s.euge)).toMatchObject({ bajas: [], faltaSortearDeNuevo: false, puedeSortearDeNuevo: false })
  expect(await sortear(s.db, s.id, s.euge.id, enviar)).toEqual({ ok: false, reason: 'no_permitido' })
  expect(await cambiarExcluidos(s.db, s.id, s.euge.id, s.sofi.id, s.ana.id, true)).toBe(false)
})

test('tampoco se arregla solo si se regalaban entre ellos; y sacar a alguien deja el mismo hueco que el que se baja', async () => {
  const s = await setup()
  // Euge ↔ Sofi, y Rodri → Juan → Ana → Rodri
  await sorteado(s, [s.euge, s.sofi, s.rodri, s.juan, s.ana])
  await ponerRonda(s.db, s.id, [s.euge, s.sofi])
  await ponerRonda(s.db, s.id, [s.rodri, s.juan, s.ana])
  // el que organiza saca a Sofi: Euge le regalaba y ella a Euge; no se va a regalar a sí mismo
  const { enviados, enviar } = pushFalso()
  expect(await sacarDelJuego(s.db, s.id, s.euge.id, s.sofi.id, enviar)).toBe(true)
  expect((await cadena(s.db, s.id)).get(s.euge.id)).toBeNull()
  // lo sacó él: no se avisa a sí mismo que se bajó; sí que se quedó sin a quién regalarle
  expect(titulos(enviados)).toEqual([[s.euge.id, '⏳ "Oficina": hay que sortear de nuevo']])
  expect(await vista(s.db, s.id, s.euge)).toMatchObject({ esperoSorteo: 'hueco', meToca: null, faltaSortearDeNuevo: true, bajas: [{ nombre: 'Sofi' }], sacados: [{ nombre: 'Sofi' }] })
  expect(await amigoInvisibleParaViewer(s.db, s.id, s.sofi.id)).toBeNull()
  // la otra ronda sigue igual
  expect((await vista(s.db, s.id, s.rodri)).meToca!.persona.nombre).toBe('Juan')

  // sacar a uno de la otra ronda: Ana le regalaba a Rodri y Rodri a Juan → Ana le regala a Juan, y a ella sí se le avisa
  const otra = pushFalso()
  expect(await sacarDelJuego(s.db, s.id, s.euge.id, s.rodri.id, otra.enviar)).toBe(true)
  expect(titulos(otra.enviados)).toEqual([[s.ana.id, '🔄 Cambió a quién le regalás en "Oficina"']])
  expect((await vista(s.db, s.id, s.ana)).meToca!.persona.nombre).toBe('Juan')

  // quedan Euge (sin nadie), y Juan y Ana, que se regalan entre ellos. Si se baja Ana, Juan también se queda sin nadie; y
  // con dos no alcanza para sortear de nuevo
  expect(await responderJuego(s.db, s.id, s.ana.id, false, pushFalso().enviar)).toBe(true)
  expect([...await cadena(s.db, s.id)].sort()).toEqual([[s.euge.id, null], [s.juan.id, null]].sort())
  expect(await vista(s.db, s.id, s.juan)).toMatchObject({ esperoSorteo: 'hueco', meToca: null })
  expect(await sortear(s.db, s.id, s.euge.id, pushFalso().enviar)).toEqual({ ok: false, reason: 'pocos' })
  // el que se bajó puede volver (las altas siguen abiertas): espera el sorteo que viene, y con tres ya se puede
  expect((await vista(s.db, s.id, s.ana)).puedoSumarme).toBe(true)
  expect(await responderJuego(s.db, s.id, s.ana.id, true, pushFalso().enviar)).toBe(true)
  expect(await sortear(s.db, s.id, s.euge.id, pushFalso().enviar)).toEqual({ ok: true })
  expect([...(await cadena(s.db, s.id)).values()].sort()).toEqual([s.euge.id, s.juan.id, s.ana.id].sort())
})

test('el que se suma con el sorteo ya hecho espera al próximo: a los demás no les cambia nada y al que organiza le llega el aviso', async () => {
  const s = await setup()
  // Euge → Sofi → Rodri → Juan → Euge
  await sorteado(s, [s.euge, s.sofi, s.rodri, s.juan])
  await preguntar(s.db, s.id, s.euge.id, '¿Qué talle usás?', pushFalso().enviar)
  expect((await vista(s.db, s.id, s.sofi)).preguntasParaMi).toHaveLength(1)
  expect((await misAmigosInvisibles(s.db, s.sofi.id))[0].preguntasSinContestar).toBe(1)
  const antes = [...await cadena(s.db, s.id)].sort()

  const { enviados, enviar } = pushFalso()
  expect((await juegoPorInvitacion(s.db, s.token))!).toMatchObject({ sorteado: true, estado: 'abierto' })
  expect(await unirsePorLink(s.db, s.token, s.caro.id, enviar)).toEqual({ ok: true, id: s.id, nuevo: true, tarde: true })
  expect(titulos(enviados)).toEqual([[s.euge.id, '🙋 Caro se sumó a "Oficina"']])
  expect(enviados[0].aviso).toMatchObject({ body: 'Ya se había sorteado: sorteá de nuevo para que entre.', url: `/invisible/${s.id}#sortear` })
  // Caro juega, pero no le toca nadie (ni ella a nadie) hasta el sorteo que viene
  expect(await vista(s.db, s.id, s.caro)).toMatchObject({ miEstado: 'juega', sorteado: true, meToca: null, esperoSorteo: 'nuevo', puedoRevelar: false })
  expect(await verAQuienLeRegalo(s.db, s.id, s.caro.id)).toBe(false)
  const [deCaro] = await misAmigosInvisibles(s.db, s.caro.id)
  expect(deCaro).toMatchObject({ sorteado: false, faltaSortearDeNuevo: true, meToca: null })
  expect(estadoDeJuegos([deCaro])).toBe('Amigo invisible: falta sortear')
  // a los demás no les cambió nada
  expect([...await cadena(s.db, s.id)].filter(([u]) => u !== s.caro.id).sort()).toEqual(antes)
  expect((await vista(s.db, s.id, s.sofi)).meToca!.persona.nombre).toBe('Rodri')
  // todos ven que Caro entra en el próximo; el que organiza, que tiene que sortear de nuevo
  expect((await vista(s.db, s.id, s.sofi)).gente.find((g) => g.persona.nombre === 'Caro')).toMatchObject({ estado: 'juega', espera: true, vio: false })
  expect(await vista(s.db, s.id, s.euge)).toMatchObject({ faltaSortearDeNuevo: true, puedeSortearDeNuevo: true, bajas: [] })

  // si Caro se arrepiente antes del sorteo, no pasó nada: no es una baja y no hay por qué sortear de nuevo
  const baja = pushFalso()
  expect(await responderJuego(s.db, s.id, s.caro.id, false, baja.enviar)).toBe(true)
  expect(baja.enviados).toEqual([])
  expect(await vista(s.db, s.id, s.euge)).toMatchObject({ faltaSortearDeNuevo: false, puedeSortearDeNuevo: false, bajas: [] })
  expect(await sortear(s.db, s.id, s.euge.id, enviar)).toEqual({ ok: false, reason: 'no_permitido' })
  // con las altas cerradas no vuelve a sumarse; abiertas, sí ("Me sumo"), y otra vez le llega al que organiza
  await cerrarAltas(s.db, s.id, s.euge.id, true)
  expect((await vista(s.db, s.id, s.caro)).puedoSumarme).toBe(false)
  expect(await responderJuego(s.db, s.id, s.caro.id, true, enviar)).toBe(false)
  expect(await unirsePorLink(s.db, s.token, s.ana.id, enviar)).toEqual({ ok: false, reason: 'cerrado' })
  await cerrarAltas(s.db, s.id, s.euge.id, false)
  expect((await vista(s.db, s.id, s.caro)).puedoSumarme).toBe(true)
  const alta = pushFalso()
  expect(await responderJuego(s.db, s.id, s.caro.id, true, alta.enviar)).toBe(true)
  expect(titulos(alta.enviados)).toEqual([[s.euge.id, '🙋 Caro se sumó a "Oficina"']])

  // Caro es la pareja de Juan: que no se toquen, para el sorteo que viene
  expect(await cambiarExcluidos(s.db, s.id, s.euge.id, s.caro.id, s.juan.id, true)).toBe(true)
  let conAna = false
  for (let i = 0; i < 8; i++) {
    // para repetir hace falta un cambio, que es lo que deja sortear otra vez: Ana se suma (tarde) o se baja
    if (i > 0) {
      conAna = !conAna
      if (conAna) await unirsePorLink(s.db, s.token, s.ana.id, pushFalso().enviar)
      else await responderJuego(s.db, s.id, s.ana.id, false, pushFalso().enviar)
    }
    const otra = pushFalso()
    expect(await sortear(s.db, s.id, s.euge.id, otra.enviar)).toEqual({ ok: true })
    expect(otra.enviados.map((e) => e.para).sort()).toEqual([s.euge, s.sofi, s.rodri, s.juan, s.caro, ...(conAna ? [s.ana] : [])].map((u) => u.id).sort())
    const nueva = await cadena(s.db, s.id)
    expect([...nueva.values()].sort()).toEqual([...nueva.keys()].sort())
    for (const [de, para] of nueva) expect(de).not.toBe(para)
    expect(nueva.get(s.caro.id)).not.toBe(s.juan.id)
    expect(nueva.get(s.juan.id)).not.toBe(s.caro.id)
    expect(await vista(s.db, s.id, s.caro)).toMatchObject({ esperoSorteo: null, vi: false })
    expect((await vista(s.db, s.id, s.euge)).gente.every((g) => !g.espera && !g.vio)).toBe(true)
  }

  // las preguntas son las del par de ahora: si a Euge ya no le toca Sofi, la que le hizo no aparece con el nombre del nuevo,
  // y a Sofi no le queda una pregunta de alguien que ya no es su amigo invisible
  // (Euge → Rodri → Sofi → Juan → Caro → Ana → Euge: a Sofi ahora le regala Rodri)
  await ponerRonda(s.db, s.id, [s.euge, s.rodri, s.sofi, s.juan, s.caro, s.ana])
  await verAQuienLeRegalo(s.db, s.id, s.euge.id)
  expect((await vista(s.db, s.id, s.euge)).preguntasMias).toEqual([])
  expect((await vista(s.db, s.id, s.sofi)).preguntasParaMi).toEqual([])
  expect((await misAmigosInvisibles(s.db, s.sofi.id))[0].preguntasSinContestar).toBe(0)
  // si el sorteo los vuelve a juntar, siguen donde estaban
  await ponerRonda(s.db, s.id, [s.euge, s.sofi, s.rodri, s.juan, s.caro, s.ana])
  expect((await vista(s.db, s.id, s.euge)).preguntasMias).toEqual([{ id: expect.any(String), texto: '¿Qué talle usás?', respuesta: null }])
  expect((await misAmigosInvisibles(s.db, s.sofi.id))[0].preguntasSinContestar).toBe(1)
})

test('si al bajarse uno quedan dos, no se arregla solo: se sabrían quién le regala a quién, y esperan a que haya tres', async () => {
  const s = await setup()
  // Euge → Sofi → Rodri → Euge
  await sorteado(s, [s.euge, s.sofi, s.rodri])
  // se baja Rodri: Sofi le regalaba, y podría pasar a regalarle a Euge, pero quedarían dos regalándose entre ellos
  expect(await responderJuego(s.db, s.id, s.rodri.id, false, pushFalso().enviar)).toBe(true)
  expect([...await cadena(s.db, s.id)].sort()).toEqual([[s.euge.id, s.sofi.id], [s.sofi.id, null]].sort())
  expect(await vista(s.db, s.id, s.sofi)).toMatchObject({ esperoSorteo: 'hueco', meToca: null })
  expect(await vista(s.db, s.id, s.euge)).toMatchObject({ faltaSortearDeNuevo: true, bajas: [{ nombre: 'Rodri' }] })
  expect(await sortear(s.db, s.id, s.euge.id, pushFalso().enviar)).toEqual({ ok: false, reason: 'pocos' })
  // se suma Juan por el link y ya son tres
  expect(await unirsePorLink(s.db, s.token, s.juan.id, pushFalso().enviar)).toMatchObject({ ok: true, tarde: true })
  expect(await sortear(s.db, s.id, s.euge.id, pushFalso().enviar)).toEqual({ ok: true })
})

test('pasada la fecha de los regalos ya no se baja nadie ni se sortea de nuevo', async () => {
  const s = await setup()
  await sorteado(s, [s.euge, s.sofi, s.rodri, s.juan])
  await responderJuego(s.db, s.id, s.juan.id, false, pushFalso().enviar)
  expect((await vista(s.db, s.id, s.euge)).puedeSortearDeNuevo).toBe(true)
  const antes = [...await cadena(s.db, s.id)].sort()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.now() + 32 * 86400_000))
  try {
    expect(await responderJuego(s.db, s.id, s.sofi.id, false, pushFalso().enviar)).toBe(false)
    expect(await sacarDelJuego(s.db, s.id, s.euge.id, s.sofi.id, pushFalso().enviar)).toBe(false)
    expect(await sortear(s.db, s.id, s.euge.id, pushFalso().enviar)).toEqual({ ok: false, reason: 'no_permitido' })
    expect(await responderJuego(s.db, s.id, s.juan.id, true, pushFalso().enviar)).toBe(false)
    expect((await vista(s.db, s.id, s.euge)).puedeSortearDeNuevo).toBe(false)
    expect([...await cadena(s.db, s.id)].sort()).toEqual(antes)
  } finally {
    vi.useRealTimers()
  }
})
