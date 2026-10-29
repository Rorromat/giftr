import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { claims, codazos, listMembers, lists, notifications } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo, grupoParaDueno, sacarDelGrupo, unirseAGrupo } from '@/lib/groups'
import { createItem } from '@/lib/items'
import { reserveItem } from '@/lib/claims'
import { getListForViewer } from '@/lib/lists'
import { getUnreadNotifications, textoDeAviso } from '@/lib/notifications'
import { iniciarRegaloGrupal, misCuentas, regalosDeItem, sumarseARegalo } from '@/lib/regalos'

// Lo que quedó en la base de antes de los arreglos de grupos: la migración 0011 lo destraba.
// createTestDb ya la corrió sobre una base vacía; acá se arma el estado viejo a mano y se la vuelve a correr.
async function destrabar(db: Db) {
  const archivo = readFileSync('drizzle/0011_destrabar_co_duenos.sql', 'utf8')
  for (const sentencia of archivo.split('--> statement-breakpoint')) await db.execute(sql.raw(sentencia))
}

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}

test('la migración destraba lo que dejó un regalador que se unió como co-dueño antes del arreglo', async () => {
  const db = await createTestDb()
  const [delfina, martin, sofi, ana, rodri] = [
    await usuario(db, 'Delfina'), await usuario(db, 'Martín'), await usuario(db, 'Sofi'), await usuario(db, 'Ana'), await usuario(db, 'Rodri'),
  ]
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Nuestra casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  // quién llegó antes se compara por la fecha de alta, y dos sentencias seguidas pueden caer en el mismo milisegundo de
  // now(): las altas que importan van con fecha
  const despues = (ms: number) => new Date(grupo.createdAt.getTime() + ms)
  const deseo = async (titulo: string, cantidad = 1) => (await createItem(db, delfina.id, { tipo: 'exacto', titulo, cantidad }, grupoId))!
  const [copas, heladera, tostadora, vela, plantas] = [
    await deseo('Copas'), await deseo('Heladera'), await deseo('Tostadora', 2), await deseo('Vela'), await deseo('Plantas'),
  ]

  // Martín, todavía regalador: reservó las copas, arma la heladera (Sofi se sumó) y la tostadora (Ana se sumó y además
  // reservó una suelta), y se sumó a la vela de Ana
  expect(await reserveItem(db, copas.id, { userId: martin.id })).toMatchObject({ ok: true })
  const [deHeladera, deTostadora, deVela] = [
    await iniciarRegaloGrupal(db, heladera.id, martin.id), await iniciarRegaloGrupal(db, tostadora.id, martin.id),
    await iniciarRegaloGrupal(db, vela.id, ana.id),
  ]
  if (!deHeladera.ok || !deTostadora.ok || !deVela.ok) throw new Error('esperaba poder armar los regalos')
  await sumarseARegalo(db, deHeladera.giftId, sofi.id)
  expect(await reserveItem(db, tostadora.id, { userId: ana.id })).toMatchObject({ ok: true })
  await sumarseARegalo(db, deTostadora.giftId, ana.id)
  await sumarseARegalo(db, deVela.giftId, martin.id)
  // ...y se unió como se unía antes: solo la fila de dueño
  await db.insert(listMembers).values({ listId: grupoId, userId: martin.id, createdAt: despues(1) })
  // Rodri armaba la lista con ellos y salió cuando salir borraba la fila (le había llegado un codazo de este grupo);
  // después reservó las plantas como cualquier regalador
  await db.insert(codazos).values({ listId: grupoId, paraUserId: rodri.id, deNombre: 'Tía Marta', createdAt: despues(2) })
  expect(await reserveItem(db, plantas.id, { userId: rodri.id })).toMatchObject({ ok: true })
  // y el tío se sumó después de que Rodri salió
  const tio = await usuario(db, 'Tío')
  await db.insert(listMembers).values({ listId: grupoId, userId: tio.id, createdAt: despues(3) })

  // trabado: la heladera no la puede comprar nadie y Martín ya no la ve
  expect(await reserveItem(db, heladera.id, { userId: ana.id })).toEqual({ ok: false, reason: 'sin_stock' })
  expect((await regalosDeItem(db, heladera.id, { userId: sofi.id }))[0]).toMatchObject({ estado: 'abierto', encargado: { nombre: 'Martín' } })
  expect((await misCuentas(db, martin.id)).enCurso).toEqual([])

  await destrabar(db)

  // las copas quedan libres
  expect(await reserveItem(db, copas.id, { userId: ana.id })).toMatchObject({ ok: true })
  // la heladera pasa a Sofi, con la reserva a su nombre. Sin aviso: la migración corre en el build, mientras todavía sirve
  // el código de antes, que no conoce ese tipo de aviso y se caería
  const [regalo] = await regalosDeItem(db, heladera.id, { userId: sofi.id })
  expect(regalo).toMatchObject({ estado: 'abierto', soyEncargado: true, encargado: { nombre: 'Sofi' } })
  expect(regalo.miembros.map((m) => m.nombre)).toEqual(['Sofi'])
  const [reserva] = await db.select().from(claims).where(eq(claims.itemId, heladera.id))
  expect(reserva).toMatchObject({ claimerUserId: sofi.id, estado: 'reservado' })
  expect(await getUnreadNotifications(db, { userId: sofi.id })).toEqual([])
  expect((await misCuentas(db, sofi.id)).enCurso).toEqual([expect.objectContaining({ itemTitulo: 'Heladera', soyEncargado: true })])
  // la tostadora no tenía a quién pasar (Ana ya tiene su propia reserva): se cancela y se libera
  expect(await regalosDeItem(db, tostadora.id, { userId: ana.id })).toEqual([])
  expect(await db.select().from(notifications)).toEqual([])
  // su reserva suelta sigue, y la otra tostadora queda libre
  expect(await db.select({ estado: claims.estado }).from(claims).where(and(eq(claims.itemId, tostadora.id), eq(claims.claimerUserId, ana.id))))
    .toEqual([{ estado: 'reservado' }])
  expect(await reserveItem(db, tostadora.id, { userId: sofi.id })).toMatchObject({ ok: true })
  // de la vela de Ana se baja
  expect((await regalosDeItem(db, vela.id, { userId: ana.id }))[0].miembros.map((m) => m.nombre)).toEqual(['Ana'])
  expect(await misCuentas(db, martin.id)).toEqual({ debes: 0, teDeben: 0, personas: [], rondas: [], porVos: [], enCurso: [], saldadas: [] })
  // Rodri queda como ex co-dueño: sin capa oculta y sin reservar, y lo que reservó se libera
  expect(await getListForViewer(db, grupo.shareToken, { userId: rodri.id })).toMatchObject({ role: 'anonimo', motivo: 'ex_dueno' })
  expect(await reserveItem(db, plantas.id, { userId: rodri.id })).toEqual({ ok: false, reason: 'propio' })
  expect(await db.select({ estado: claims.estado }).from(claims).where(eq(claims.itemId, plantas.id))).toEqual([{ estado: 'liberado' }])
  expect(await getListForViewer(db, grupo.shareToken, { userId: ana.id })).toMatchObject({ duenos: ['Delfina', 'Martín', 'Tío'] })

  // volver a correrla no cambia nada
  const [miembros, reservas] = [await db.select().from(listMembers), await db.select().from(claims)]
  await destrabar(db)
  expect(await db.select().from(listMembers)).toEqual(miembros)
  expect(await db.select().from(claims)).toEqual(reservas)
  expect((await regalosDeItem(db, heladera.id, { userId: sofi.id }))[0]).toMatchObject({ estado: 'abierto', soyEncargado: true })

  // Rodri queda con la fecha de su primer codazo (para entonces ya era dueño): no parece recién llegado, pero tampoco le
  // gana a los que ya estaban. Cuando vuelve con la invitación, el tío, que se sumó después, no lo puede sacar (y Rodri a
  // él sí); a Martín, que ya era dueño cuando le llegó el codazo, no lo saca, y Martín y Delfina a él sí. Con la fecha
  // del grupo empataba con Delfina, que lo armó, y sacaba a todos los demás
  expect(await unirseAGrupo(db, grupo.inviteToken!, rodri.id)).toBe(grupoId)
  const sacables = async (de: { id: string }) => (await grupoParaDueno(db, grupoId, de.id))!.sacables.map((m) => m.nombre)
  expect(await sacables(tio)).toEqual([])
  expect(await sacarDelGrupo(db, grupoId, tio.id, rodri.id)).toBe(false)
  expect(await sacables(rodri)).toEqual(['Tío'])
  expect(await sacables(martin)).toEqual(['Rodri', 'Tío'])
  expect(await sacables(delfina)).toEqual(['Martín', 'Rodri', 'Tío'])
  expect(await sacarDelGrupo(db, grupoId, rodri.id, martin.id)).toBe(false)
  expect(await sacarDelGrupo(db, grupoId, martin.id, rodri.id)).toBe(true)
})

test('un aviso de un tipo que esta versión no conoce no se muestra (si se vuelve atrás un deploy, no se cae la página)', () => {
  expect(textoDeAviso('regalo_encargo', 'Heladera')).toContain('"Heladera"')
  expect(textoDeAviso('item_baja', 'Copas')).toContain('"Copas"')
  expect(textoDeAviso('uno_que_todavia_no_existe', 'Copas')).toBeNull()
  expect(textoDeAviso('__proto__', 'Copas')).toBeNull()
  expect(textoDeAviso('toString', 'Copas')).toBeNull()
})

test('la migración 0020 toma como fecha de unión de los que ya estaban la de su alta (no la de la migración)', async () => {
  const db = await createTestDb()
  const [delfina, martin] = [await usuario(db, 'Delfina'), await usuario(db, 'Martín')]
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Nuestra casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  expect(await unirseAGrupo(db, grupo.inviteToken!, martin.id)).toBe(grupoId)
  // como quedan al agregar la columna: con la hora de la migración, no la de su alta
  const hace = (dias: number) => new Date(Date.now() - dias * 86400_000)
  await db.update(listMembers).set({ createdAt: hace(30) }).where(eq(listMembers.userId, delfina.id))
  await db.update(listMembers).set({ createdAt: hace(20) }).where(eq(listMembers.userId, martin.id))
  await db.update(listMembers).set({ unidoAt: sql`now()` })

  const archivo = readFileSync('drizzle/0020_co_duenos_unido_at.sql', 'utf8')
  // la segunda sentencia (la primera agrega la columna, que createTestDb ya agregó)
  await db.execute(sql.raw(archivo.split('--> statement-breakpoint')[1]))
  const filas = await db.select().from(listMembers).where(eq(listMembers.listId, grupoId))
  expect(filas.map((f) => f.unidoAt.getTime() - f.createdAt.getTime())).toEqual([0, 0])
})
