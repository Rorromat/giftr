import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { claims, codazos, listMembers, lists, notifications } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo } from '@/lib/groups'
import { createItem } from '@/lib/items'
import { reserveItem } from '@/lib/claims'
import { getListForViewer } from '@/lib/lists'
import { getUnreadNotifications } from '@/lib/notifications'
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
  await db.insert(listMembers).values({ listId: grupoId, userId: martin.id })
  // Rodri armaba la lista con ellos y salió cuando salir borraba la fila (le había llegado un codazo de este grupo);
  // después reservó las plantas como cualquier regalador
  await db.insert(codazos).values({ listId: grupoId, paraUserId: rodri.id, deNombre: 'Tía Marta' })
  expect(await reserveItem(db, plantas.id, { userId: rodri.id })).toMatchObject({ ok: true })

  // trabado: la heladera no la puede comprar nadie y Martín ya no la ve
  expect(await reserveItem(db, heladera.id, { userId: ana.id })).toEqual({ ok: false, reason: 'sin_stock' })
  expect((await regalosDeItem(db, heladera.id, { userId: sofi.id }))[0]).toMatchObject({ estado: 'abierto', encargado: { nombre: 'Martín' } })
  expect((await misCuentas(db, martin.id)).enCurso).toEqual([])

  await destrabar(db)

  // las copas quedan libres
  expect(await reserveItem(db, copas.id, { userId: ana.id })).toMatchObject({ ok: true })
  // la heladera pasa a Sofi, con la reserva a su nombre, y se le avisa
  const [regalo] = await regalosDeItem(db, heladera.id, { userId: sofi.id })
  expect(regalo).toMatchObject({ estado: 'abierto', soyEncargado: true, encargado: { nombre: 'Sofi' } })
  expect(regalo.miembros.map((m) => m.nombre)).toEqual(['Sofi'])
  const [reserva] = await db.select().from(claims).where(eq(claims.itemId, heladera.id))
  expect(reserva).toMatchObject({ claimerUserId: sofi.id, estado: 'reservado' })
  expect(await getUnreadNotifications(db, { userId: sofi.id })).toEqual([expect.objectContaining({ tipo: 'regalo_encargo', itemTitulo: 'Heladera' })])
  // la tostadora no tenía a quién pasar (Ana ya tiene su propia reserva): se cancela, se libera y Ana se entera
  expect(await regalosDeItem(db, tostadora.id, { userId: ana.id })).toEqual([])
  expect(await getUnreadNotifications(db, { userId: ana.id })).toEqual([expect.objectContaining({ tipo: 'regalo_cancelado', itemTitulo: 'Tostadora' })])
  // su reserva suelta sigue, y la otra tostadora queda libre
  expect(await db.select({ estado: claims.estado }).from(claims).where(and(eq(claims.itemId, tostadora.id), eq(claims.claimerUserId, ana.id))))
    .toEqual([{ estado: 'reservado' }])
  expect(await reserveItem(db, tostadora.id, { userId: sofi.id })).toMatchObject({ ok: true })
  // de la vela de Ana se baja
  expect((await regalosDeItem(db, vela.id, { userId: ana.id }))[0].miembros.map((m) => m.nombre)).toEqual(['Ana'])
  expect(await misCuentas(db, martin.id)).toEqual({ debes: 0, teDeben: 0, personas: [], enCurso: [], saldadas: [] })
  // Rodri queda como ex co-dueño: sin capa oculta y sin reservar, y lo que reservó se libera
  expect(await getListForViewer(db, grupo.shareToken, { userId: rodri.id })).toMatchObject({ role: 'anonimo', motivo: 'ex_dueno' })
  expect(await reserveItem(db, plantas.id, { userId: rodri.id })).toEqual({ ok: false, reason: 'propio' })
  expect(await db.select({ estado: claims.estado }).from(claims).where(eq(claims.itemId, plantas.id))).toEqual([{ estado: 'liberado' }])
  expect(await getListForViewer(db, grupo.shareToken, { userId: ana.id })).toMatchObject({ duenos: ['Delfina', 'Martín'] })

  // volver a correrla no cambia nada
  const avisos = await db.select().from(notifications)
  await destrabar(db)
  expect(await db.select().from(notifications)).toEqual(avisos)
  expect((await regalosDeItem(db, heladera.id, { userId: sofi.id }))[0]).toMatchObject({ estado: 'abierto', soyEncargado: true })
})
