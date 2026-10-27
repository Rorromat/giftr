import { expect, test, vi } from 'vitest'
import { createECDH, randomBytes } from 'node:crypto'
import { createTestDb } from './helpers'
import { eq } from 'drizzle-orm'
import { avisos } from '@/db/schema'
import { bandeja } from '@/lib/bandeja'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { pedirAmistad } from '@/lib/amigos'
import { guardarSuscripcion, type Aviso, type Enviar } from '@/lib/codazos'
import {
  amigoInvisibleParaViewer, asignar, borrarAmigoInvisible, cambiarExcluidos, crearAmigoInvisible, editarAmigoInvisible, invitarAlJuego,
  estadoDeJuegos, marcarYaLoTengo, misAmigosInvisibles, preguntar, tambienTeToco, responderJuego, responderPregunta, revelarQuienMeRegalo, sortear, verAQuienLeRegalo,
} from '@/lib/amigo-invisible'
import { diaEn, especialesQueVienen, fechasQueVienen, proximaEspecial } from '@/lib/fechas-especiales'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const enDias = (n: number) => iso(new Date(Date.now() + n * 86400_000))

test('las fechas especiales de Argentina: fijas y los terceros domingos', () => {
  expect(iso(diaEn('navidad', 2026))).toBe('2026-12-25')
  expect(iso(diaEn('amigo', 2026))).toBe('2026-07-20')
  // tercer domingo: junio 2026 (21), agosto 2026 (16), octubre 2026 (18)
  expect(iso(diaEn('padre', 2026))).toBe('2026-06-21')
  expect(iso(diaEn('ninos', 2026))).toBe('2026-08-16')
  expect(iso(diaEn('madre', 2026))).toBe('2026-10-18')
  expect(iso(diaEn('madre', 2027))).toBe('2027-10-17')
  for (const f of ['padre', 'madre', 'ninos'] as const) expect(diaEn(f, 2030).getUTCDay()).toBe(0)
  // la próxima: hoy cuenta; si ya pasó, la del año que viene
  expect(iso(proximaEspecial('navidad', new Date(Date.UTC(2026, 11, 25))))).toBe('2026-12-25')
  expect(iso(proximaEspecial('navidad', new Date(Date.UTC(2026, 11, 26))))).toBe('2027-12-25')
})

test('aparecen en Lo que viene un tiempo antes: Navidad 30 días, las demás 3 semanas', () => {
  const nombres = (d: Date) => fechasQueVienen(d).map((f) => [f.id, f.dias])
  expect(nombres(new Date(Date.UTC(2026, 10, 24)))).toEqual([]) // 31 días antes de Navidad
  expect(nombres(new Date(Date.UTC(2026, 10, 25)))).toEqual([['navidad', 30]])
  expect(nombres(new Date(Date.UTC(2026, 9, 1)))).toEqual([['madre', 17]])
  expect(nombres(new Date(Date.UTC(2026, 6, 20)))).toEqual([['amigo', 0]])
  expect(nombres(new Date(Date.UTC(2026, 6, 21)))).toEqual([]) // el del amigo ya pasó; el del niño está a 26 días
})

test('Lo que viene: las fechas cercanas, las lejanas con un amigo invisible tuyo, y los amigos invisibles sueltos', () => {
  const juego = (id: string, dias: number, fechaEspecial: 'navidad' | 'amigo' | null) => ({
    id, nombre: id, fecha: '', fechaEspecial, presupuesto: null, dias, miEstado: 'juega' as const, sorteado: false, vi: false, revelado: false,
    organizador: 'Euge', soyOrganizador: false, invitados: 3, contestaron: 3, meToca: null, yaLoTengo: false, preguntasSinContestar: 0,
  })
  const hoy = new Date(Date.UTC(2026, 9, 26)) // Navidad, a 60 días
  const t = especialesQueVienen(hoy, [juego('nav', 59, 'navidad'), juego('oficina', 10, null), juego('viejo', -3, null)])
  expect(t.map((x) => (x.tipo === 'fecha' ? [x.fecha.id, x.dias, x.juegos.map((j) => j.id)] : ['juego', x.dias, [x.juego.id]]))).toEqual([
    ['juego', 10, ['oficina']],
    ['navidad', 60, ['nav']],
  ])
  expect(especialesQueVienen(hoy, [])).toEqual([])
  // lo que dice la tarjeta: lo más urgente, sin nombres
  const e = (miEstado: 'invitado' | 'juega', sorteado: boolean, vi: boolean) => ({ miEstado, sorteado, vi })
  expect(estadoDeJuegos([])).toBeNull()
  expect(estadoDeJuegos([e('invitado', false, false)])).toBe('Te invitaron a un amigo invisible')
  expect(estadoDeJuegos([e('juega', true, false)])).toBe('Ya se sorteó: mirá a quién le regalás')
  // de varios (en la tarjeta de una fecha): cuántos son y cuántos te esperan (te invitaron, o ya se sorteó y no lo viste)
  expect(estadoDeJuegos([e('juega', true, true), e('invitado', false, false)])).toBe('2 amigos invisibles · 1 te espera')
  expect(estadoDeJuegos([e('juega', true, false), e('invitado', false, false), e('juega', false, false)])).toBe('3 amigos invisibles · 2 te esperan')
  expect(estadoDeJuegos([e('juega', true, true), e('juega', false, false)])).toBe('2 amigos invisibles')
  expect(estadoDeJuegos([e('juega', false, false)])).toBe('Amigo invisible: falta sortear')
  expect(estadoDeJuegos([e('juega', true, true)])).toBe('Amigo invisible: ya sabés a quién')
})

test('si te toca la misma persona en dos juegos que vienen, se avisa en los dos', () => {
  const sofi = { id: 's', nombre: 'Sofi', usuario: null, foto: null }
  const rodri = { id: 'r', nombre: 'Rodri', usuario: null, foto: null }
  const j = (id: string, dias: number, meToca: typeof sofi | null) => ({ id, nombre: id, dias, meToca })
  const m = tambienTeToco([j('Familia', 30, sofi), j('Oficina', 20, sofi), j('Club', 10, rodri), j('Viejo', -2, sofi), j('Sin ver', 5, null)])
  expect([...m]).toEqual([['Familia', ['Oficina']], ['Oficina', ['Familia']]])
})

test('el sorteo: nadie se regala a sí mismo, cada uno recibe de uno solo, y los que no se tocan no se tocan', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']
  for (let i = 0; i < 200; i++) {
    const m = asignar(ids, [['a', 'b'], ['c', 'd']])!
    expect([...m.keys()].sort()).toEqual(ids)
    expect([...m.values()].sort()).toEqual(ids)
    for (const [de, para] of m) {
      expect(de).not.toBe(para)
      expect([de, para].sort().join()).not.toMatch(/^(a,b|c,d)$/)
    }
  }
  // con 3, siempre un círculo; sin forma posible, null
  expect(asignar(['a', 'b'], [['a', 'b']])).toBeNull()
  expect(asignar(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']])).toBeNull()
})

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}
const amigos = async (db: Db, a: string, b: string) => { await pedirAmistad(db, a, b); await pedirAmistad(db, b, a) }
const ecdh = createECDH('prime256v1')
const CLAVES = { p256dh: ecdh.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') }
function pushFalso() {
  const enviados: { para: string; aviso: Aviso }[] = []
  const enviar: Enviar = async (s, aviso) => { enviados.push({ para: s.endpoint.split('/').at(-1)!, aviso }); return 201 }
  return { enviados, enviar }
}

/** Euge arma el de Navidad con Sofi, Rodri y Juan (sus amigos). Ana no es amiga de Euge. */
async function setup() {
  const db = await createTestDb()
  const [euge, sofi, rodri, juan, ana] = await Promise.all(['Euge', 'Sofi', 'Rodri', 'Juan', 'Ana'].map((n) => usuario(db, n)))
  for (const o of [sofi, rodri, juan]) await amigos(db, euge.id, o.id)
  for (const u of [euge, sofi, rodri, juan]) await guardarSuscripcion(db, u.id, { endpoint: `https://fcm.googleapis.com/fcm/send/${u.id}`, keys: CLAVES })
  const { enviados, enviar } = pushFalso()
  const r = await crearAmigoInvisible(db, euge.id, {
    nombre: 'Navidad con los chicos', descripcion: 'Algo hecho a mano', presupuesto: 25000, fecha: enDias(30), fechaEspecial: 'navidad',
  }, [sofi.id, rodri.id, juan.id, ana.id, euge.id], enviar)
  if (!r.ok) throw new Error('no se armó')
  return { db, euge, sofi, rodri, juan, ana, id: r.id, enviados, enviar }
}

test('armarlo: invita solo a sus amigos, les llega el aviso, y cada uno contesta', async () => {
  const s = await setup()
  expect(s.enviados.map((e) => e.para).sort()).toEqual([s.sofi.id, s.rodri.id, s.juan.id].sort())
  expect(s.enviados[0].aviso).toEqual({ title: '🎅 Euge te invita a un amigo invisible', body: '"Navidad con los chicos". ¿Jugás?', url: `/invisible/${s.id}` })
  expect(await amigoInvisibleParaViewer(s.db, s.id, s.ana.id)).toBeNull()

  const v = await amigoInvisibleParaViewer(s.db, s.id, s.sofi.id)
  expect(v).toMatchObject({
    nombre: 'Navidad con los chicos', descripcion: 'Algo hecho a mano', presupuesto: 25000, fechaEspecial: 'navidad', dias: 30,
    soyOrganizador: false, miEstado: 'invitado', sorteado: false, organizador: { nombre: 'Euge' },
  })
  expect(v!.gente.map((g) => [g.persona.nombre, g.estado])).toEqual([['Euge', 'juega'], ['Sofi', 'invitado'], ['Rodri', 'invitado'], ['Juan', 'invitado']])
  expect((await misAmigosInvisibles(s.db, s.sofi.id)).map((j) => [j.nombre, j.miEstado])).toEqual([['Navidad con los chicos', 'invitado']])

  expect(await responderJuego(s.db, s.id, s.sofi.id, true)).toBe(true)
  expect(await responderJuego(s.db, s.id, s.juan.id, false)).toBe(true)
  expect(await responderJuego(s.db, s.id, s.euge.id, false)).toBe(false) // el que organiza juega siempre
  expect(await responderJuego(s.db, s.id, s.ana.id, true)).toBe(false)
  expect(await misAmigosInvisibles(s.db, s.juan.id)).toEqual([])
  // el que no organiza no invita ni edita
  expect(await invitarAlJuego(s.db, s.id, s.sofi.id, [s.ana.id])).toBe(0)
  expect(await editarAmigoInvisible(s.db, s.id, s.sofi.id, { nombre: 'X', fecha: enDias(10) })).toBe(false)
  expect(await editarAmigoInvisible(s.db, s.id, s.euge.id, { nombre: 'Navidad 🎄', descripcion: 'Todo de la Selección', presupuesto: 30000, fecha: enDias(31) })).toBe(true)
  expect(await amigoInvisibleParaViewer(s.db, s.id, s.sofi.id)).toMatchObject({ nombre: 'Navidad 🎄', descripcion: 'Todo de la Selección', presupuesto: 30000, dias: 31 })
  // una fecha que ya pasó, o sin nombre, no
  expect(await crearAmigoInvisible(s.db, s.euge.id, { nombre: 'Viejo', fecha: '2020-01-01' }, [])).toEqual({ ok: false, reason: 'datos' })
  expect(await crearAmigoInvisible(s.db, s.euge.id, { nombre: '  ', fecha: enDias(5) }, [])).toEqual({ ok: false, reason: 'datos' })
})

test('EL TEST DE ORO del amigo invisible: a quién le regala cada uno lo sabe solo él', async () => {
  const s = await setup()
  for (const u of [s.sofi, s.rodri, s.juan]) await responderJuego(s.db, s.id, u.id, true)
  expect(await sortear(s.db, s.id, s.sofi.id, s.enviar)).toEqual({ ok: false, reason: 'no_permitido' })
  const { enviados, enviar } = pushFalso()
  expect(await sortear(s.db, s.id, s.euge.id, enviar)).toEqual({ ok: true })
  expect(enviados.map((e) => e.para).sort()).toEqual([s.euge.id, s.sofi.id, s.rodri.id, s.juan.id].sort())
  expect(enviados[0].aviso.title).toBe('🎁 Ya se sorteó "Navidad con los chicos"')
  expect(await sortear(s.db, s.id, s.euge.id, enviar)).toEqual({ ok: false, reason: 'no_permitido' }) // una sola vez

  const todos = [s.euge, s.sofi, s.rodri, s.juan]
  // antes de tocar "Ver", nadie sabe nada; el que organiza tampoco
  for (const u of todos) {
    const v = (await amigoInvisibleParaViewer(s.db, s.id, u.id))!
    expect(v.sorteado).toBe(true)
    expect(v.meToca).toBeNull()
  }
  // en Regalos: cuántos contestaron, y a quién le toca recién después de "Ver"; "Ya tengo el regalo", recién ahí
  const [deSofi] = await misAmigosInvisibles(s.db, s.sofi.id)
  expect(deSofi).toMatchObject({ sorteado: true, vi: false, meToca: null, invitados: 4, contestaron: 4, presupuesto: 25000, soyOrganizador: false, yaLoTengo: false })
  expect(await marcarYaLoTengo(s.db, s.id, s.sofi.id, true)).toBe(false)
  const aQuien = new Map<string, string>()
  for (const u of todos) {
    expect(await verAQuienLeRegalo(s.db, s.id, u.id)).toBe(true)
    const v = (await amigoInvisibleParaViewer(s.db, s.id, u.id))!
    expect(v.meToca).not.toBeNull()
    expect(v.meToca!.persona.id).not.toBe(u.id)
    expect(v.meToca!.token).toBeTruthy() // el link de su lista
    aQuien.set(u.id, v.meToca!.persona.id)
    // lo que ve cada uno no dice a quién le regalan los demás
    expect(JSON.stringify(v)).not.toContain('regalaA')
    expect(v.meRegalo).toBeNull()
  }
  expect(new Set(aQuien.values()).size).toBe(4)
  const [despues] = await misAmigosInvisibles(s.db, s.sofi.id)
  expect(despues.meToca?.id).toBe(aQuien.get(s.sofi.id))
  expect(await marcarYaLoTengo(s.db, s.id, s.sofi.id, true)).toBe(true)
  expect((await misAmigosInvisibles(s.db, s.sofi.id))[0].yaLoTengo).toBe(true)
  expect((await amigoInvisibleParaViewer(s.db, s.id, s.sofi.id))!.yaLoTengo).toBe(true)
  expect((await amigoInvisibleParaViewer(s.db, s.id, s.rodri.id))!.yaLoTengo).toBe(false) // es de cada uno
  expect(await marcarYaLoTengo(s.db, s.id, s.sofi.id, false)).toBe(true)
  expect((await misAmigosInvisibles(s.db, s.sofi.id))[0].yaLoTengo).toBe(false)
  // el que organiza ve quiénes ya vieron, nunca a quién
  const org = (await amigoInvisibleParaViewer(s.db, s.id, s.euge.id))!
  expect(org.gente.every((g) => g.vio)).toBe(true)
  expect(JSON.stringify(org.gente)).not.toContain('regala')
  // después del sorteo ya no se suma nadie, ni se baja, ni se cambia quién no se toca
  expect(await responderJuego(s.db, s.id, s.sofi.id, false)).toBe(false)
  expect(await invitarAlJuego(s.db, s.id, s.euge.id, [s.juan.id])).toBe(0)
  expect(await cambiarExcluidos(s.db, s.id, s.euge.id, s.sofi.id, s.rodri.id, true)).toBe(false)
})

test('preguntas anónimas: le llega de "tu amigo invisible" y la respuesta vuelve a quien preguntó', async () => {
  const s = await setup()
  for (const u of [s.sofi, s.rodri, s.juan]) await responderJuego(s.db, s.id, u.id, true)
  await sortear(s.db, s.id, s.euge.id, s.enviar)
  // sin haber visto a quién le regala, no pregunta
  expect(await preguntar(s.db, s.id, s.euge.id, '¿Qué talle usás?', s.enviar)).toBe(false)
  await verAQuienLeRegalo(s.db, s.id, s.euge.id)
  const para = (await amigoInvisibleParaViewer(s.db, s.id, s.euge.id))!.meToca!.persona
  const { enviados, enviar } = pushFalso()
  expect(await preguntar(s.db, s.id, s.euge.id, '¿Qué talle usás?', enviar)).toBe(true)
  expect(enviados).toEqual([{ para: para.id, aviso: expect.objectContaining({ title: '🤫 Tu amigo invisible te hizo una pregunta' }) }])
  // en su bandeja tampoco dice de quién es
  const enBandeja = (await bandeja(s.db, { userId: para.id })).entradas.find((e) => e.emoji === '🤫')!
  expect(enBandeja).toMatchObject({ titulo: 'Tu amigo invisible te hizo una pregunta', cuerpo: 'En "Navidad con los chicos": ¿Qué talle usás?', de: null })
  expect((await s.db.select().from(avisos).where(eq(avisos.id, enBandeja.id)))[0].deUserId).toBeNull()
  // el que la recibe la ve sin saber de quién es
  const suya = (await amigoInvisibleParaViewer(s.db, s.id, para.id))!
  expect(suya.preguntasParaMi).toEqual([{ id: expect.any(String), texto: '¿Qué talle usás?', respuesta: null }])
  expect(JSON.stringify(suya.preguntasParaMi)).not.toContain(s.euge.id)
  // solo él contesta
  const pid = suya.preguntasParaMi[0].id
  expect((await misAmigosInvisibles(s.db, para.id))[0].preguntasSinContestar).toBe(1)
  expect(await responderPregunta(s.db, pid, s.euge.id, 'M', enviar)).toBeNull()
  expect(await responderPregunta(s.db, pid, para.id, 'Talle M', enviar)).toBe(s.id)
  expect(enviados.at(-1)).toEqual({ para: s.euge.id, aviso: expect.objectContaining({ title: '💬 Te contestaron' }) })
  expect((await misAmigosInvisibles(s.db, para.id))[0].preguntasSinContestar).toBe(0)
  expect((await amigoInvisibleParaViewer(s.db, s.id, s.euge.id))!.preguntasMias).toEqual([{ id: pid, texto: '¿Qué talle usás?', respuesta: 'Talle M' }])
})

test('quién te regaló: solo después de la fecha y solo si lo pedís', async () => {
  const s = await setup()
  for (const u of [s.sofi, s.rodri, s.juan]) await responderJuego(s.db, s.id, u.id, true)
  await sortear(s.db, s.id, s.euge.id, s.enviar)
  expect(await revelarQuienMeRegalo(s.db, s.id, s.sofi.id)).toBe(false) // todavía no es la fecha
  expect((await amigoInvisibleParaViewer(s.db, s.id, s.sofi.id))!.puedoRevelar).toBe(false)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.now() + 32 * 86400_000))
  try {
    const antes = (await amigoInvisibleParaViewer(s.db, s.id, s.sofi.id))!
    expect(antes.puedoRevelar).toBe(true)
    expect(antes.meRegalo).toBeNull() // pasó la fecha, pero no lo pidió
    // ya pasó: no está entre los que vienen, sí entre los de hace unos días
    expect(await misAmigosInvisibles(s.db, s.sofi.id)).toEqual([])
    expect((await misAmigosInvisibles(s.db, s.sofi.id, undefined, 15)).map((j) => [j.nombre, j.revelado])).toEqual([['Navidad con los chicos', false]])
    expect(await revelarQuienMeRegalo(s.db, s.id, s.sofi.id)).toBe(true)
    expect((await misAmigosInvisibles(s.db, s.sofi.id, undefined, 15))[0].revelado).toBe(true)
    const despues = (await amigoInvisibleParaViewer(s.db, s.id, s.sofi.id))!
    expect(despues.meRegalo).not.toBeNull()
    expect(despues.meRegalo!.id).not.toBe(s.sofi.id)
    // a los demás no se les revela nada
    expect((await amigoInvisibleParaViewer(s.db, s.id, s.rodri.id))!.meRegalo).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

test('que no se toquen, pocos para sortear, el que no contestó queda afuera, y borrarlo', async () => {
  const s = await setup()
  await responderJuego(s.db, s.id, s.sofi.id, true)
  // dos no alcanzan (Rodri y Juan no contestaron)
  expect(await sortear(s.db, s.id, s.euge.id, s.enviar)).toEqual({ ok: false, reason: 'pocos' })
  await responderJuego(s.db, s.id, s.rodri.id, true)
  // con tres hay solo dos círculos y cualquier par que no se toca está en los dos
  expect(await cambiarExcluidos(s.db, s.id, s.euge.id, s.sofi.id, s.rodri.id, true)).toBe(true)
  expect(await sortear(s.db, s.id, s.euge.id, s.enviar)).toEqual({ ok: false, reason: 'imposible' })
  await responderJuego(s.db, s.id, s.juan.id, true)
  // Caro se suma tarde y no contesta
  const caro = await usuario(s.db, 'Caro')
  await amigos(s.db, s.euge.id, caro.id)
  expect(await invitarAlJuego(s.db, s.id, s.euge.id, [caro.id, s.sofi.id])).toBe(1) // Sofi ya estaba
  expect(await cambiarExcluidos(s.db, s.id, s.euge.id, s.euge.id, s.sofi.id, true)).toBe(true)
  expect(await cambiarExcluidos(s.db, s.id, s.euge.id, s.euge.id, s.ana.id, true)).toBe(false) // Ana no está
  expect(await cambiarExcluidos(s.db, s.id, s.sofi.id, s.euge.id, s.juan.id, true)).toBe(false) // solo el que organiza
  expect((await amigoInvisibleParaViewer(s.db, s.id, s.euge.id))!.excluidos.map(([a, b]) => [a.nombre, b.nombre].sort().join('-')).sort())
    .toEqual(['Euge-Sofi', 'Rodri-Sofi'])
  expect((await amigoInvisibleParaViewer(s.db, s.id, s.sofi.id))!.excluidos).toEqual([]) // eso lo ve el que organiza
  // Sofi no se toca con Euge ni con Rodri: Sofi y Juan se regalan entre ellos, y Euge y Rodri también
  expect(await sortear(s.db, s.id, s.euge.id, s.enviar)).toEqual({ ok: true })
  expect((await amigoInvisibleParaViewer(s.db, s.id, caro.id))!.miEstado).toBe('no_juega')
  expect(await verAQuienLeRegalo(s.db, s.id, caro.id)).toBe(false)
  for (const u of [s.euge, s.sofi, s.rodri, s.juan]) await verAQuienLeRegalo(s.db, s.id, u.id)
  const toca = async (u: { id: string }) => (await amigoInvisibleParaViewer(s.db, s.id, u.id))!.meToca!.persona.id
  expect(await toca(s.sofi)).toBe(s.juan.id)
  expect(await toca(s.juan)).toBe(s.sofi.id)
  expect(await toca(s.euge)).toBe(s.rodri.id)

  expect(await borrarAmigoInvisible(s.db, s.id, s.sofi.id)).toBe(false)
  expect(await borrarAmigoInvisible(s.db, s.id, s.euge.id)).toBe(true)
  expect(await amigoInvisibleParaViewer(s.db, s.id, s.euge.id)).toBeNull()
})
