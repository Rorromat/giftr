import { expect, test } from 'vitest'
import { createECDH, randomBytes } from 'node:crypto'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { createTestDb, seguir } from './helpers'
import type { Db } from '@/db/types'
import {
  amigoInvisibleGente, amigosInvisibles, avisos, claims, fotosDeseo, groupGiftMembers, groupGifts, guestIdentities, items, listMembers, lists, notifications, users,
} from '@/db/schema'
import { borrarCuenta, CUENTA_ELIMINADA, exportarMisDatos, loQueCambiaAlBorrar } from '@/lib/cuenta'
import { upsertUserFromGoogle, existeUsuario, guardarAliasPago } from '@/lib/users'
import { asegurarUsuario, buscarPorUsuario, misAmigos, pedirAmistad, pedirAmistadPorMail, solicitudesRecibidas, sugerenciasDeAmigos } from '@/lib/amigos'
import { archiveItem, borrarDeseo, createItem } from '@/lib/items'
import { markBought, reserveItem } from '@/lib/claims'
import { addComment } from '@/lib/comments'
import { comprarRegalo, iniciarRegaloGrupal, misCuentas, sumarseARegalo } from '@/lib/regalos'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { crearAmigoInvisible, misAmigosInvisibles, preguntar, responderJuego, sortear, unirsePorLink, verAQuienLeRegalo } from '@/lib/amigo-invisible'
import { guardarSuscripcion, mandarCodazo, type Aviso, type Enviar } from '@/lib/codazos'
import { guardarCumple } from '@/lib/events'
import { guardarGustos } from '@/lib/bienvenida'
import { sanitizarGustos } from '@/lib/gustos'
import { guardarFoto, perfilPublico } from '@/lib/perfil'
import { guardarFotoDeseo } from '@/lib/fotos-deseo'
import { miGente } from '@/lib/gente'
import { novedadesDeAmigos } from '@/lib/novedades'
import { getListForViewer, loadClaimViews } from '@/lib/lists'
import { bandeja } from '@/lib/bandeja'
import { crearSorpresa } from '@/lib/sorpresas'
import { anotarInvitado, createGuest, unirInvitadoACuenta } from '@/lib/guest'

// Exportar los datos y borrar la cuenta (src/lib/cuenta.ts). El que se va (o se baja sus datos) es siempre Zacarías.

const ZACA = { nombre: 'Zacarías Quintero', mail: 'zaca@test.com' }

async function usuario(db: Db, nombre: string, email = `${nombre.toLowerCase().replace(/\W+/g, '.')}@test.com`) {
  const u = await upsertUserFromGoogle(db, { googleId: `g-${email}`, email, nombre })
  await asegurarUsuario(db, u.id)
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, u.id))
  return { ...u, listId: lista.id, token: lista.shareToken }
}
const zaca = (db: Db) => usuario(db, ZACA.nombre, ZACA.mail)
const amigos = async (db: Db, a: string, b: string) => { await pedirAmistad(db, a, b); await pedirAmistad(db, b, a) }
const deseo = async (db: Db, userId: string, titulo: string, mas: Partial<Parameters<typeof createItem>[2]> = {}, listId?: string) =>
  (await createItem(db, userId, { tipo: 'exacto', titulo, ...mas }, listId))!.id
const reservar = async (db: Db, itemId: string, userId: string) => {
  const r = await reserveItem(db, itemId, { userId })
  if (!r.ok) throw new Error(`no se reservó: ${r.reason}`)
  return r.claimId
}
const ecdh = createECDH('prime256v1')
const CLAVES = { p256dh: ecdh.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') }
function pushFalso() {
  const enviados: { para: string; aviso: Aviso }[] = []
  const enviar: Enviar = async (s, aviso) => { enviados.push({ para: s.endpoint.split('/').at(-1)!, aviso }); return 201 }
  return { enviados, enviar }
}
const enUnMes = () => new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
/** Un regalo grupal ya comprado: organiza el primero, se suman los demás, sale `total`. */
async function regaloComprado(db: Db, itemId: string, total: number, organiza: string, ...otros: string[]) {
  const r = await iniciarRegaloGrupal(db, itemId, organiza)
  if (!r.ok) throw new Error(`no se armó: ${r.reason}`)
  for (const o of otros) expect(await sumarseARegalo(db, r.giftId, o)).toBe(true)
  expect(await comprarRegalo(db, r.giftId, organiza, { total })).toEqual({ ok: true })
  return r.giftId
}

/** Lo que devuelve una consulta suelta (PGlite las devuelve en rows). */
const consulta = async <T>(db: Db, q: Parameters<Db['execute']>[0]) => (await db.execute(q) as unknown as { rows: T[] }).rows

/** Cada fila de cada tabla, como texto: para buscar algo en toda la base. */
async function todasLasFilas(db: Db): Promise<{ tabla: string; fila: string }[]> {
  const tablas = await consulta<{ table_name: string }>(db, sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`)
  const filas: { tabla: string; fila: string }[] = []
  for (const { table_name: tabla } of tablas) {
    for (const f of await consulta<{ fila: string }>(db, sql.raw(`select row_to_json(t)::text as fila from "${tabla}" t`))) filas.push({ tabla, fila: f.fila })
  }
  return filas
}
const dondeAparece = async (db: Db, texto: string) => (await todasLasFilas(db)).filter((f) => f.fila.toLowerCase().includes(texto.toLowerCase())).map((f) => f.tabla)
const eliminadas = (db: Db) => db.select().from(users).where(isNotNull(users.eliminadaAt))

// ---------------------------------------------------------------- exportar

test('exportar: trae su perfil, sus listas con los deseos archivados y eliminados, su gente, lo que regala y sus avisos', async () => {
  const db = await createTestDb()
  const z = await zaca(db)
  const [ana, bruno] = await Promise.all([usuario(db, 'Ana'), usuario(db, 'Bruno')])
  await guardarCumple(db, z.id, 12, 10)
  await guardarGustos(db, z.id, sanitizarGustos({ club: 'Boca', talles: { remera: 'M' } }))
  await guardarAliasPago(db, z.id, 'zaca.mp')
  await deseo(db, z.id, 'Termo', { notas: 'el verde', precio: '$ 90.000' })
  await archiveItem(db, await deseo(db, z.id, 'Mate'), z.id, 'lo_tengo')
  await borrarDeseo(db, await deseo(db, z.id, 'Bombilla'), z.id)
  const casa = await crearGrupo(db, z.id, { nombre: 'Casa nueva' })
  await deseo(db, z.id, 'Sillón', {}, casa)
  await amigos(db, z.id, ana.id)
  await pedirAmistad(db, z.id, bruno.id)
  // lo que regala: una reserva, una compra con su nota, un comentario y un regalo grupal comprado que organiza
  await reservar(db, await deseo(db, ana.id, 'Auriculares'), z.id)
  const libro = await deseo(db, ana.id, 'Libro')
  await markBought(db, await reservar(db, libro, z.id), { userId: z.id }, 'el de tapa dura')
  await addComment(db, libro, { userId: z.id }, 'lo llevo yo al asado')
  await regaloComprado(db, await deseo(db, ana.id, 'Bici'), 9000, z.id, bruno.id)

  const d = (await exportarMisDatos(db, z.id))!
  expect(d.perfil).toMatchObject({ nombre: ZACA.nombre, mail: ZACA.mail, usuario: 'zacarias', cumple: { dia: 12, mes: 10 }, aliasParaTransferirte: 'zaca.mp' })
  expect(d.perfil.gustos).toMatchObject({ club: 'Boca', talles: { remera: 'M' } })
  expect(d.tuLista!.deseos.map((x) => [x.titulo, x.estado])).toEqual([['Termo', 'activo'], ['Mate', 'lo_tengo'], ['Bombilla', 'eliminado']])
  expect(d.tuLista!.deseos[0]).toMatchObject({ notas: 'el verde', precio: '$ 90.000' })
  expect(d.listasEnComun).toMatchObject([{ nombre: 'Casa nueva', laArman: [ZACA.nombre], deseos: [{ titulo: 'Sillón' }] }])
  expect(d.tuGente.amigos.map((a) => a.nombre)).toEqual(['Ana'])
  expect(d.tuGente.solicitudesQueMandaste.map((s) => s.a)).toEqual(['@bruno'])
  expect(d.tuGente.listasQueSeguis.map((s) => s.de)).toEqual(['Ana'])
  expect(d.loQueRegalas.reservasYCompras.map((c) => [c.deseo, c.para, c.estado, c.nota]).sort()).toEqual([
    ['Auriculares', 'Ana', 'reservado', null], ['Libro', 'Ana', 'comprado', 'el de tapa dura'],
  ])
  expect(d.loQueRegalas.comentarios).toMatchObject([{ deseo: 'Libro', para: 'Ana', texto: 'lo llevo yo al asado' }])
  expect(d.loQueRegalas.regalosGrupales).toMatchObject([{
    deseo: 'Bici', para: 'Ana', estado: 'comprado', loOrganizas: true, total: 9000, tuParte: 4500,
    teDeben: [{ quien: 'Bruno', parte: 4500, yaPuso: 0, saldado: false }],
  }])
  // la solicitud que aceptó Ana le dejó un aviso
  expect(d.avisos.bandeja.some((a) => a.titulo.includes('Ana'))).toBe(true)
  // de otro no se exporta nada
  expect(await exportarMisDatos(db, randomBytes(16).toString('hex'))).toBeNull()
})

test('exportar y la sorpresa: sale igual, letra por letra, reserven lo que reserven en sus listas', async () => {
  const db = await createTestDb()
  const z = await zaca(db)
  const [ana, bruno, carla] = await Promise.all([usuario(db, 'Ana'), usuario(db, 'Bruno'), usuario(db, 'Carla')])
  const [termo, mate, medias] = [await deseo(db, z.id, 'Termo'), await deseo(db, z.id, 'Mate'), await deseo(db, z.id, 'Medias')]
  const casa = await crearGrupo(db, z.id, { nombre: 'Casa nueva' })
  const sillon = await deseo(db, z.id, 'Sillón', {}, casa)
  const ahora = new Date()
  const antes = JSON.stringify(await exportarMisDatos(db, z.id, ahora))

  // ninguno es su amigo ni sigue una lista suya: sus nombres no tienen por dónde aparecer
  await reservar(db, termo, ana.id)
  await markBought(db, await reservar(db, mate, bruno.id), { userId: bruno.id }, 'el de calabaza, lo compré en la feria')
  await addComment(db, mate, { userId: bruno.id }, 'ojo que ya tiene uno de madera')
  await regaloComprado(db, medias, 6000, carla.id, ana.id)
  await reservar(db, sillon, carla.id)
  // y una sorpresa armada para él, que nunca ve
  const s = await crearSorpresa(db, ana.id, { para: { token: z.token }, deseo: { tipo: 'exacto', titulo: 'Tocadiscos' }, invitar: [] })
  expect(s.ok).toBe(true)
  // un aviso sobre un deseo suyo, si quedara uno a su nombre, tampoco sale (ver avisosDeDeseos)
  await db.insert(notifications).values({ userId: z.id, tipo: 'item_editado', itemId: termo })

  const despues = JSON.stringify(await exportarMisDatos(db, z.id, ahora))
  expect(despues).toBe(antes)
  for (const secreto of ['Ana', 'Bruno', 'Carla', 'calabaza', 'madera', 'Tocadiscos', 'comprado', 'reservado', '6000', '3000']) expect(despues).not.toContain(secreto)
})

test('exportar el amigo invisible: a quién le regala, sí; quién le regala a él, no', async () => {
  const db = await createTestDb()
  const z = await zaca(db)
  const [ana, bruno] = await Promise.all([usuario(db, 'Ana'), usuario(db, 'Bruno')])
  const r = await crearAmigoInvisible(db, ana.id, { nombre: 'Oficina', fecha: enUnMes() }, [])
  if (!r.ok) throw new Error('no se armó el juego')
  const [{ token }] = await db.select({ token: amigosInvisibles.inviteToken }).from(amigosInvisibles).where(eq(amigosInvisibles.id, r.id))
  for (const u of [z, bruno]) expect((await unirsePorLink(db, token!, u.id)).ok).toBe(true)
  expect(await sortear(db, r.id, ana.id)).toEqual({ ok: true })
  const filas = await db.select().from(amigoInvisibleGente).where(eq(amigoInvisibleGente.amigoInvisibleId, r.id))
  const nombre = (id: string) => [z, ana, bruno].find((u) => u.id === id)!.nombre
  const leRegala = nombre(filas.find((f) => f.userId === z.id)!.regalaA!)
  const quienLeRegala = nombre(filas.find((f) => f.regalaA === z.id)!.userId)
  // con tres es un círculo: el que le regala no es a quien él le regala
  expect(quienLeRegala).not.toBe(leRegala)
  expect(await verAQuienLeRegalo(db, r.id, z.id)).toBe(true)
  expect(await preguntar(db, r.id, z.id, '¿qué talle usás?')).toBe(true)

  const d = (await exportarMisDatos(db, z.id))!
  expect(d.amigosInvisibles).toMatchObject([{ nombre: 'Oficina', loOrganizas: false, jugas: 'si', sorteado: true, leRegalasA: leRegala, preguntasQueHiciste: [{ pregunta: '¿qué talle usás?' }] }])
  expect(JSON.stringify(d)).not.toContain(quienLeRegala)
})

// ---------------------------------------------------------------- borrar

test('borrar una cuenta que no compartía nada: no queda ni la fila, y su gente deja de verla', async () => {
  const db = await createTestDb()
  const z = await zaca(db)
  const [ana, bruno] = await Promise.all([usuario(db, 'Ana'), usuario(db, 'Bruno')])
  await guardarCumple(db, z.id, 12, 10)
  await guardarGustos(db, z.id, sanitizarGustos({ club: 'Boca', nota: 'alergia al maní' }))
  await guardarAliasPago(db, z.id, 'zaca.quintero.mp')
  await guardarFoto(db, z.id, Buffer.from('foto de perfil'))
  const foto = (await guardarFotoDeseo(db, z.id, Buffer.from('foto del termo')))!
  await deseo(db, z.id, 'Termo Stanley', { notas: 'el verde', fotoUrl: foto })
  await archiveItem(db, await deseo(db, z.id, 'Mate imperial'), z.id, 'lo_tengo')
  await guardarSuscripcion(db, z.id, { endpoint: 'https://fcm.googleapis.com/fcm/send/zaca', keys: CLAVES })
  await amigos(db, z.id, ana.id)
  await amigos(db, ana.id, bruno.id)
  await pedirAmistad(db, z.id, bruno.id)
  await seguir(db, bruno.id, z.listId)
  await mandarCodazo(db, ana.token, { userId: z.id }, ZACA.nombre)
  // la tía se anotó sin cuenta en su lista y le reservó algo: es de la tía, no de él
  const tia = (await anotarInvitado(db, 'Tía Marta', z.listId))!
  expect((await reserveItem(db, await deseo(db, z.id, 'Bombilla de alpaca'), { guestId: tia.id })).ok).toBe(true)
  expect((await sugerenciasDeAmigos(db, bruno.id)).map((s) => s.p.nombre)).toEqual([])
  expect(await solicitudesRecibidas(db, bruno.id)).toHaveLength(1)
  expect((await novedadesDeAmigos(db, ana.id)).novedades).toHaveLength(2)

  expect(await borrarCuenta(db, z.id)).toBe(true)

  expect(await db.select().from(users).where(eq(users.id, z.id))).toEqual([])
  // no compartía nada con nadie: ni siquiera queda una "Cuenta eliminada"
  expect(await eliminadas(db)).toEqual([])
  expect(await existeUsuario(db, z.id)).toBe(false)
  expect([...await misAmigos(db, ana.id)]).toEqual([bruno.id])
  expect((await miGente(db, ana.id)).map((c) => c.nombre)).toEqual(['Bruno'])
  expect(await miGente(db, bruno.id).then((g) => g.map((c) => c.nombre))).toEqual(['Ana'])
  expect(await solicitudesRecibidas(db, bruno.id)).toEqual([])
  expect((await novedadesDeAmigos(db, ana.id)).novedades).toEqual([])
  expect(await buscarPorUsuario(db, 'zacarias')).toBeNull()
  expect(await perfilPublico(db, z.token)).toBeNull()
  expect(await getListForViewer(db, z.token, { userId: ana.id })).toBeNull()
  // ni su id, ni su mail, ni su nombre, ni nada de lo que cargó, en ninguna tabla
  for (const algo of [z.id, ZACA.mail, 'Zacar', 'Quintero', 'Termo Stanley', 'Mate imperial', 'el verde', 'maní', 'zaca.quintero.mp', z.token, foto.slice(-36)]) {
    expect(await dondeAparece(db, algo), algo).toEqual([])
  }
  // la tía sigue anotada (en otra lista puede tener algo), ya sin esa reserva ni esa lista
  expect(await db.select().from(guestIdentities)).toMatchObject([{ nombre: 'Tía Marta', anotadoEn: null }])
  expect(await db.select().from(claims)).toEqual([])
  // dos veces no rompe nada
  expect(await borrarCuenta(db, z.id)).toBe(false)
})

test('borrar: lo que reservó en listas de otros se libera; lo que ya compró sigue comprado, sin su nombre', async () => {
  const db = await createTestDb()
  const z = await zaca(db)
  const [ana, bruno] = await Promise.all([usuario(db, 'Ana'), usuario(db, 'Bruno')])
  const [auris, libro] = [await deseo(db, ana.id, 'Auriculares'), await deseo(db, ana.id, 'Libro')]
  await reservar(db, auris, z.id)
  await markBought(db, await reservar(db, libro, z.id), { userId: z.id }, 'lo compré yo, Zacarías')
  await addComment(db, libro, { userId: z.id }, 'lo llevo al asado')
  expect(await reserveItem(db, auris, { userId: bruno.id })).toMatchObject({ ok: false, reason: 'sin_stock' })

  expect(await borrarCuenta(db, z.id)).toBe(true)

  // los auriculares vuelven a estar para cualquiera; el libro no se duplica
  expect(await reserveItem(db, auris, { userId: bruno.id })).toMatchObject({ ok: true })
  expect(await reserveItem(db, libro, { userId: bruno.id })).toMatchObject({ ok: false, reason: 'sin_stock' })
  const [fila] = await db.select().from(items).where(eq(items.id, libro))
  const vistas = await loadClaimViews(db, ana.listId, [fila], { userId: bruno.id })
  expect(vistas.get(libro)).toMatchObject([{ estado: 'comprado', claimerNombre: CUENTA_ELIMINADA, notaQueCompre: null }])
  const fantasmas = await eliminadas(db)
  expect(fantasmas).toMatchObject([{ nombre: CUENTA_ELIMINADA, email: '', avatarUrl: null, usuario: null, gustos: null, aliasPago: null }])
  expect(fantasmas[0].googleId).toMatch(/^eliminada:/)
  for (const algo of [z.id, ZACA.mail, 'Zacar', 'asado']) expect(await dondeAparece(db, algo), algo).toEqual([])
})

test('borrar con regalos grupales: el abierto que organiza se cancela con aviso, del que estaba se baja, y las cuentas de los comprados quedan', async () => {
  const db = await createTestDb()
  const z = await zaca(db)
  const [ana, bruno, carla] = await Promise.all([usuario(db, 'Ana'), usuario(db, 'Bruno'), usuario(db, 'Carla')])
  const [bici, casco, luz, inflador] = [await deseo(db, ana.id, 'Bici'), await deseo(db, ana.id, 'Casco'), await deseo(db, ana.id, 'Luz'), await deseo(db, ana.id, 'Inflador')]
  // la bici la organiza él y todavía no la compró; al casco se sumó; la luz la compró él y Bruno le debe; el inflador lo
  // compró Carla y él le debe
  const abierto = await iniciarRegaloGrupal(db, bici, z.id)
  if (!abierto.ok) throw new Error('no')
  await sumarseARegalo(db, abierto.giftId, bruno.id)
  const deCarla = await iniciarRegaloGrupal(db, casco, carla.id)
  if (!deCarla.ok) throw new Error('no')
  await sumarseARegalo(db, deCarla.giftId, z.id)
  const deLaLuz = await regaloComprado(db, luz, 9000, z.id, bruno.id)
  const delInflador = await regaloComprado(db, inflador, 4000, carla.id, z.id)
  expect(await loQueCambiaAlBorrar(db, z.id)).toMatchObject({ regalosAbiertos: 1, enCuentas: true })

  expect(await borrarCuenta(db, z.id)).toBe(true)

  // la bici vuelve a estar libre y Bruno se entera de que se canceló
  expect(await db.select().from(groupGifts).where(eq(groupGifts.id, abierto.giftId))).toEqual([])
  expect((await bandeja(db, { userId: bruno.id })).entradas.map((e) => e.titulo).join(' | ')).toContain('Se canceló el regalo grupal de "Bici"')
  expect(await reserveItem(db, bici, { userId: bruno.id })).toMatchObject({ ok: true })
  // el casco sigue siendo de Carla, sola
  expect((await db.select().from(groupGiftMembers).where(eq(groupGiftMembers.giftId, deCarla.giftId))).map((m) => m.userId)).toEqual([carla.id])
  // las cuentas no se tocan: Bruno le sigue debiendo su parte de la luz a "Cuenta eliminada", y a Carla le siguen debiendo la del inflador
  const [fantasma] = await eliminadas(db)
  expect(await db.select({ estado: groupGifts.estado, org: groupGifts.organizerUserId }).from(groupGifts).where(eq(groupGifts.id, deLaLuz)))
    .toEqual([{ estado: 'comprado', org: fantasma.id }])
  const deBruno = await misCuentas(db, bruno.id)
  expect(deBruno.debes).toBe(4500)
  expect(deBruno.personas.map((p) => p.nombre)).toEqual([CUENTA_ELIMINADA])
  const deCarlaCuentas = await misCuentas(db, carla.id)
  expect(deCarlaCuentas.teDeben).toBe(2000)
  expect(deCarlaCuentas.personas.map((p) => p.nombre)).toEqual([CUENTA_ELIMINADA])
  expect((await db.select().from(groupGiftMembers).where(eq(groupGiftMembers.giftId, delInflador))).map((m) => m.monto).sort()).toEqual([2000, 2000])
  // a la fila que queda no se le puede mandar una solicitud ni entra nadie
  expect(await pedirAmistad(db, bruno.id, fantasma.id)).toEqual({ ok: false, reason: 'no_existe' })
  expect(await existeUsuario(db, fantasma.id)).toBe(false)
  for (const algo of [z.id, ZACA.mail, 'Zacar']) expect(await dondeAparece(db, algo), algo).toEqual([])
})

test('borrar con cosas reservadas en su lista: los que regalaban se enteran, y las cuentas de lo que le compraron entre varios siguen', async () => {
  const db = await createTestDb()
  const z = await zaca(db)
  const [ana, bruno, carla] = await Promise.all([usuario(db, 'Ana'), usuario(db, 'Bruno'), usuario(db, 'Carla')])
  const termo = await deseo(db, z.id, 'Termo', { notas: 'el verde, de un litro', linkTienda: 'https://tienda.test/termo' })
  const mate = await deseo(db, z.id, 'Mate')
  await regaloComprado(db, termo, 9000, ana.id, bruno.id)
  await addComment(db, termo, { userId: bruno.id }, 'te transfiero el viernes')
  await reservar(db, mate, carla.id)

  expect(await borrarCuenta(db, z.id)).toBe(true)

  // Bruno le sigue debiendo a Ana su parte del termo: es entre ellos
  const deBruno = await misCuentas(db, bruno.id)
  expect(deBruno.debes).toBe(4500)
  expect(deBruno.personas.map((p) => p.nombre)).toEqual(['Ana'])
  expect(JSON.stringify(deBruno)).toContain(CUENTA_ELIMINADA)
  // del termo queda solo el nombre, en una lista que no se abre con el link de antes; el mate se fue con su reserva
  const quedan = await db.select().from(items)
  expect(quedan.map((i) => i.titulo)).toEqual(['Termo'])
  expect(quedan[0]).toMatchObject({ notas: null, linkTienda: null, fotoUrl: null, estadoDueno: 'no_lo_quiero' })
  expect(await getListForViewer(db, z.token, { userId: bruno.id })).toBeNull()
  expect(await db.select().from(claims).where(eq(claims.itemId, mate))).toEqual([])
  // el aviso que le había llegado a Bruno al comprarlo Ana sigue en su campanita, sin el nombre del que se fue
  const deLaCompra = (await bandeja(db, { userId: bruno.id })).entradas.find((e) => e.titulo.includes('compró "Termo"'))
  expect(deLaCompra?.cuerpo).toContain(`Tu parte del regalo para ${CUENTA_ELIMINADA}: `)
  // a los que tenían algo ahí (Ana, que lo compró, y Carla, que tenía el mate reservado) les queda una línea, sin nombres
  for (const u of [ana, carla]) {
    const [aviso] = (await bandeja(db, { userId: u.id })).entradas.filter((e) => e.titulo.includes('ya no está'))
    expect(aviso).toMatchObject({ titulo: 'Una lista donde ibas a regalar ya no está', de: null })
  }
  for (const algo of [z.id, ZACA.mail, 'Zacar', 'el verde', 'tienda.test']) expect(await dondeAparece(db, algo), algo).toEqual([])
})

test('borrar con amigos invisibles: sin sortear se cancela con aviso; ya sorteado, el que organizaba queda como está; del que jugaba se baja', async () => {
  const db = await createTestDb()
  const { enviados, enviar } = pushFalso()
  const z = await zaca(db)
  const otros = await Promise.all(['Ana', 'Bruno', 'Carla', 'Dani'].map((n) => usuario(db, n)))
  const [ana, bruno, carla] = otros
  for (const u of otros) await guardarSuscripcion(db, u.id, { endpoint: `https://fcm.googleapis.com/fcm/send/${u.id}`, keys: CLAVES })
  const juego = async (organiza: string, nombre: string, juegan: string[]) => {
    const r = await crearAmigoInvisible(db, organiza, { nombre, fecha: enUnMes() }, [])
    if (!r.ok) throw new Error('no se armó')
    const [{ token }] = await db.select({ token: amigosInvisibles.inviteToken }).from(amigosInvisibles).where(eq(amigosInvisibles.id, r.id))
    for (const u of juegan) expect((await unirsePorLink(db, token!, u)).ok).toBe(true)
    return r.id
  }
  const sinSortear = await juego(z.id, 'Navidad', [ana.id, bruno.id])
  const sorteado = await juego(z.id, 'Reyes', [ana.id, bruno.id])
  // con el envío de mentira: el de verdad saldría a la red y borraría las suscripciones que no existen
  expect(await sortear(db, sorteado, z.id, enviar)).toEqual({ ok: true })
  const deAna = await juego(ana.id, 'Oficina', otros.slice(1).map((u) => u.id).concat(z.id))
  expect(await sortear(db, deAna, ana.id, enviar)).toEqual({ ok: true })
  const antes = await db.select().from(amigoInvisibleGente).where(eq(amigoInvisibleGente.amigoInvisibleId, sorteado))
  const leRegalabaEnOficina = (await db.select().from(amigoInvisibleGente).where(and(eq(amigoInvisibleGente.amigoInvisibleId, deAna), eq(amigoInvisibleGente.regalaA, z.id))))[0].userId
  expect(await loQueCambiaAlBorrar(db, z.id)).toMatchObject({ juegosSinSortear: ['Navidad'], juegosSorteadosQueOrganiza: ['Reyes'], juegaEnOtros: true })
  enviados.length = 0

  expect(await borrarCuenta(db, z.id, enviar)).toBe(true)

  // "Navidad" no llegó a sortearse: se va, y a los que estaban les llega (al celular y a la campanita), sin su nombre
  expect(await db.select().from(amigosInvisibles).where(eq(amigosInvisibles.id, sinSortear))).toEqual([])
  const cancelado = enviados.filter((e) => e.aviso.title.includes('Se canceló el amigo invisible "Navidad"'))
  expect(cancelado.map((e) => e.para).sort()).toEqual([ana.id, bruno.id].sort())
  expect((await bandeja(db, { userId: ana.id })).entradas.map((e) => e.titulo)).toContain('Se canceló el amigo invisible "Navidad"')
  // "Reyes" ya estaba sorteado: nadie pierde a quién le tocó; donde estaba él dice "Cuenta eliminada"
  const [fantasma] = await eliminadas(db)
  const despues = await db.select().from(amigoInvisibleGente).where(eq(amigoInvisibleGente.amigoInvisibleId, sorteado))
  const sinEl = (id: string | null) => (id === z.id ? fantasma.id : id)
  expect(despues.map((f) => [f.userId, f.regalaA]).sort()).toEqual(antes.map((f) => [sinEl(f.userId), sinEl(f.regalaA)]).sort())
  expect((await db.select().from(amigosInvisibles).where(eq(amigosInvisibles.id, sorteado)))[0]).toMatchObject({ organizadorId: fantasma.id, inviteToken: null })
  expect((await misAmigosInvisibles(db, bruno.id)).map((j) => j.nombre).sort()).toEqual(['Oficina', 'Reyes'])
  // de "Oficina" se bajó como cualquiera: al que le regalaba le toca otra persona (o espera el nuevo sorteo), y él ya no está
  const oficina = await db.select().from(amigoInvisibleGente).where(eq(amigoInvisibleGente.amigoInvisibleId, deAna))
  expect(oficina.map((f) => f.userId)).not.toContain(fantasma.id)
  expect(oficina.find((f) => f.userId === leRegalabaEnOficina)!.regalaA).not.toBe(fantasma.id)
  expect(enviados.some((e) => e.para === leRegalabaEnOficina && /Cambió a quién le regalás|hay que sortear de nuevo/.test(e.aviso.title))).toBe(true)
  expect(await responderJuego(db, deAna, carla.id, false, enviar)).toBe(true)
  for (const algo of [z.id, ZACA.mail, 'Zacar']) expect(await dondeAparece(db, algo), algo).toEqual([])
})

test('borrar con listas en común: la que arma solo se borra; de la que arma con otros sale, y la lista sigue', async () => {
  const db = await createTestDb()
  const z = await zaca(db)
  const [ana, bruno] = await Promise.all([usuario(db, 'Ana'), usuario(db, 'Bruno')])
  const sola = await crearGrupo(db, z.id, { nombre: 'Juancito Quintero', esCumple: true, eventoFecha: '2000-03-04' })
  await deseo(db, z.id, 'Pelota', {}, sola)
  const compartida = await crearGrupo(db, z.id, { nombre: 'Casa nueva', parentesco: 'Mi casa' })
  const [{ inviteToken, shareToken }] = await db.select().from(lists).where(eq(lists.id, compartida))
  expect(await unirseAGrupo(db, inviteToken!, ana.id)).toBe(compartida)
  const foto = (await guardarFotoDeseo(db, z.id, Buffer.from('el sillón')))!
  const sillon = await deseo(db, z.id, 'Sillón', { fotoUrl: foto }, compartida)
  await reservar(db, sillon, bruno.id)
  // Bruno le armó una sorpresa a Juancito con otra persona
  const [{ token: tokenSola }] = await db.select({ token: lists.shareToken }).from(lists).where(eq(lists.id, sola))
  const sorpresa = await crearSorpresa(db, bruno.id, { para: { token: tokenSola }, deseo: { tipo: 'exacto', titulo: 'Triciclo' }, invitar: [] })
  if (!sorpresa.ok) throw new Error('no')
  // y otra lista que arma solo, donde Ana y Bruno ya compraron algo entre los dos
  const mascotas = await crearGrupo(db, z.id, { nombre: 'Mora, la perra de Zacarías', descripcion: 'para su cumple' })
  await regaloComprado(db, await deseo(db, z.id, 'Cucha', { notas: 'la grande' }, mascotas), 6000, ana.id, bruno.id)
  expect(await loQueCambiaAlBorrar(db, z.id)).toMatchObject({ listasSolo: ['Juancito Quintero', 'Mora, la perra de Zacarías'], listasConOtros: ['Casa nueva'] })

  expect(await borrarCuenta(db, z.id)).toBe(true)

  expect(await db.select().from(lists).where(eq(lists.id, sola))).toEqual([])
  // la casa sigue para Ana, con el sillón, su foto (ahora a nombre de Ana) y la reserva de Bruno
  expect((await db.select().from(listMembers).where(eq(listMembers.listId, compartida))).map((m) => m.userId)).toEqual([ana.id])
  const vista = await getListForViewer(db, shareToken, { userId: bruno.id })
  expect(vista?.role === 'giver' && vista.items.map((i) => [i.titulo, i.fotoUrl, i.claims.length])).toEqual([['Sillón', foto, 1]])
  expect((await db.select().from(fotosDeseo)).map((f) => f.userId)).toEqual([ana.id])
  // la sorpresa de Bruno sigue siendo suya, ya sin la lista (ni su nombre)
  const [queda] = await db.select().from(lists).where(eq(lists.shareToken, sorpresa.token))
  expect(queda).toMatchObject({ tipo: 'sorpresa', paraListId: null, nombre: 'Una lista eliminada', creadaPor: bruno.id })
  // de la de la perra queda lo justo para que Bruno y Ana arreglen sus cuentas: el nombre del deseo, en una lista sin
  // nombre, sin dueños y que no se abre
  expect((await db.select().from(lists).where(eq(lists.id, mascotas)))[0]).toMatchObject({ nombre: 'Una lista eliminada', descripcion: null, inviteToken: null })
  expect(await db.select().from(listMembers).where(eq(listMembers.listId, mascotas))).toEqual([])
  expect((await db.select().from(items).where(eq(items.listId, mascotas))).map((i) => [i.titulo, i.notas])).toEqual([['Cucha', null]])
  const deBruno = await misCuentas(db, bruno.id)
  expect(deBruno.debes).toBe(3000)
  expect(JSON.stringify(deBruno)).toContain('Una lista eliminada')
  // nada de esto necesitó una "Cuenta eliminada": no hay nada a su nombre
  expect(await eliminadas(db)).toEqual([])
  for (const algo of [z.id, ZACA.mail, 'Zacar', 'Quintero', 'Pelota', 'Mi casa', 'Mora', 'la grande']) expect(await dondeAparece(db, algo), algo).toEqual([])
})

test('borrar con sorpresas y con lo que hizo como invitado: lo que era solo suyo se va, lo que es de otros queda sin su nombre', async () => {
  const db = await createTestDb()
  const z = await zaca(db)
  const [ana, bruno] = await Promise.all([usuario(db, 'Ana'), usuario(db, 'Bruno')])
  await amigos(db, z.id, ana.id)
  await amigos(db, z.id, bruno.id)
  await amigos(db, ana.id, bruno.id)
  // una sorpresa que armó él solo para la abuela, y otra que Ana y Bruno ya le compraron a él
  const suya = await crearSorpresa(db, z.id, { para: { nombre: 'Abuela Marta' }, deseo: { tipo: 'exacto', titulo: 'Mantita' }, invitar: [] })
  const paraEl = await crearSorpresa(db, ana.id, { para: { amigo: z.id }, deseo: { tipo: 'exacto', titulo: 'Tocadiscos' }, invitar: [] })
  if (!suya.ok || !paraEl.ok) throw new Error('no se armaron')
  const [regalo] = await db.select({ id: groupGifts.id }).from(groupGifts).innerJoin(items, eq(items.id, groupGifts.itemId))
    .innerJoin(lists, eq(lists.id, items.listId)).where(eq(lists.shareToken, paraEl.token))
  expect(await sumarseARegalo(db, regalo.id, bruno.id)).toBe(true)
  expect(await comprarRegalo(db, regalo.id, ana.id, { total: 8000 })).toEqual({ ok: true })
  // antes de tener cuenta había comprado algo como invitado, y después dijo "Sí, soy yo"
  const invitado = await createGuest(db, 'Zaca el del trabajo')
  const libro = await deseo(db, ana.id, 'Libro', { cantidad: 2 })
  const r = await reserveItem(db, libro, { guestId: invitado.id })
  if (!r.ok) throw new Error('no')
  await markBought(db, r.claimId, { guestId: invitado.id }, 'firmado: Zaca')
  // con su cuenta ya tiene reservado el otro: la compra del invitado queda a nombre del invitado (ver unirInvitadoACuenta)
  await reservar(db, libro, z.id)
  expect(await unirInvitadoACuenta(db, invitado.id, z.id)).toBe(true)
  expect((await db.select().from(claims).where(eq(claims.id, r.claimId)))[0]).toMatchObject({ claimerGuestId: invitado.id, estado: 'comprado' })

  expect(await borrarCuenta(db, z.id)).toBe(true)

  expect(await db.select().from(lists).where(eq(lists.shareToken, suya.token))).toEqual([])
  const [fantasma] = await eliminadas(db)
  expect((await db.select().from(lists).where(eq(lists.shareToken, paraEl.token)))[0]).toMatchObject({ paraUserId: fantasma.id, creadaPor: ana.id })
  expect((await misCuentas(db, bruno.id)).debes).toBe(4000)
  // de los dos libros, el que había reservado se libera y el que compró sigue comprado, por nadie con nombre
  expect((await db.select().from(claims).where(eq(claims.itemId, libro))).map((c) => [c.estado, c.notaQueCompre])).toEqual([['comprado', null]])
  expect(await db.select().from(guestIdentities)).toMatchObject([{ nombre: CUENTA_ELIMINADA, promotedToUserId: fantasma.id }])
  for (const algo of [z.id, ZACA.mail, 'Zaca', 'Abuela Marta', 'Mantita']) expect(await dondeAparece(db, algo), algo).toEqual([])
})

test('después de borrar, entrar de nuevo con Google es una cuenta nueva y vacía', async () => {
  const db = await createTestDb()
  const z = await zaca(db)
  const ana = await usuario(db, 'Ana')
  await deseo(db, z.id, 'Termo')
  await amigos(db, z.id, ana.id)
  await markBought(db, await reservar(db, await deseo(db, ana.id, 'Libro'), z.id), { userId: z.id })
  expect(await borrarCuenta(db, z.id)).toBe(true)

  const otra = await zaca(db)
  expect(otra.id).not.toBe(z.id)
  expect(otra.eliminadaAt).toBeNull()
  const d = (await exportarMisDatos(db, otra.id))!
  expect(d.tuLista!.deseos).toEqual([])
  expect(d.tuGente.amigos).toEqual([])
  expect(d.loQueRegalas.reservasYCompras).toEqual([])
  // la compra de antes quedó a nombre de "Cuenta eliminada", que no es la cuenta nueva ni se encuentra por su mail
  const [fantasma] = await eliminadas(db)
  expect(fantasma.id).not.toBe(otra.id)
  expect(await pedirAmistadPorMail(db, ana.id, ZACA.mail)).toEqual({ ok: true, estado: 'enviada' })
  expect((await solicitudesRecibidas(db, otra.id)).map((s) => s.de.nombre)).toEqual(['Ana'])
  expect(await solicitudesRecibidas(db, fantasma.id)).toEqual([])
  expect(await db.select().from(avisos).where(eq(avisos.userId, fantasma.id))).toEqual([])
})

test('borrar conoce todas las columnas que apuntan a una cuenta: si aparece una nueva, hay que decidir qué hace con ella', async () => {
  const db = await createTestDb()
  const fks = await consulta<{ tabla: string; columna: string }>(db, sql`
    select cl.relname as tabla, a.attname as columna
    from pg_constraint c join pg_class cl on cl.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'users'::regclass`)
  // Cada una está resuelta en borrarCuenta (src/lib/cuenta.ts). Una que no esté ahí hace fallar el DELETE final para quien
  // tenga filas en esa tabla (no se le borra nada): al sumar una acá, sumá también qué pasa con ella al borrar la cuenta.
  expect(fks.map((f) => `${f.tabla}.${f.columna}`).sort()).toEqual([
    'amigo_invisible_excluidos.a', 'amigo_invisible_excluidos.b', 'amigo_invisible_gente.regala_a', 'amigo_invisible_gente.user_id',
    'amigo_invisible_preguntas.de_user_id', 'amigo_invisible_preguntas.para_user_id', 'amigos_invisibles.organizador_id',
    'amistades.de_user_id', 'amistades.para_user_id', 'avisos.de_user_id', 'avisos.user_id', 'claims.claimer_user_id',
    'codazos.de_user_id', 'codazos.para_user_id', 'comments.author_user_id', 'fotos_deseo.user_id', 'fotos_perfil.user_id',
    'group_gift_members.user_id', 'group_gift_sacados.user_id', 'group_gifts.organizer_user_id', 'guest_identities.promoted_to_user_id',
    'invitaciones_regalo.de_user_id', 'invitaciones_regalo.para_user_id', 'list_follows.user_id', 'list_members.user_id',
    'lists.creada_por', 'lists.owner_id', 'lists.para_user_id', 'notifications.user_id', 'pedidos_afuera.user_id', 'push_subs.user_id',
    'recordatorios_enviados.user_id',
  ])
})
