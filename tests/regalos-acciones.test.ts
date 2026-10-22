import { expect, test, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import type { Db } from '@/db/types'
import { groupGiftMembers, groupGifts, lists } from '@/db/schema'
import { upsertUserFromGoogle } from '@/lib/users'
import { archiveItem, createItem } from '@/lib/items'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { getUnreadNotifications } from '@/lib/notifications'
import { comprarRegalo, iniciarRegaloGrupal, marcarPagado, misCuentas, regalosDeItem, sacarDeRegalo, sumarseARegalo } from '@/lib/regalos'

// Las acciones del regalo grupal tal cual, con la base en PGlite y la sesión de Next simulada.
const h = vi.hoisted(() => ({ db: undefined as unknown as Db, session: null as { userId: string } | null }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
}))

import {
  buyGroupGiftAction, fixGroupGiftAction, joinGroupGiftAction, letBackGroupGiftMemberAction, markPaidAction, postponeGroupGiftReminderAction,
  removeGroupGiftMemberAction, settleUpAction,
} from '@/app/actions'
import { SacarDelRegalo } from '@/components/RegaloGrupal'

/** Mamá pide una bici; Rodri arma el regalo y se suman Sofi y Caro. Rodri tiene la sesión. */
async function preparar() {
  h.db = await createTestDb()
  const db = h.db
  const usuario = (nombre: string) => upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre}@test.com`, nombre })
  const [mama, rodri, sofi, caro] = [await usuario('Mamá'), await usuario('Rodri'), await usuario('Sofi'), await usuario('Caro')]
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, mama.id))
  const bici = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Bici', precio: '$90.000' }))!
  const g = await iniciarRegaloGrupal(db, bici.id, rodri.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, sofi.id)
  await sumarseARegalo(db, g.giftId, caro.id)
  h.session = { userId: rodri.id }
  return { db, mama, rodri, sofi, caro, lista, bici, giftId: g.giftId }
}

/** Lo que manda CompraGrupalForm: los campos, y con quiénes vio la división. */
function compra(campos: Record<string, string>, miembros: string[]) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  for (const id of miembros) fd.append('miembro', id)
  return fd
}

test('"A mano" con la parte de alguien vacía: vale 0, como dice la pantalla, y la compra sale', async () => {
  const { db, rodri, sofi, caro, lista, bici, giftId } = await preparar()
  const fd = compra({
    giftId, token: lista.shareToken, itemId: bici.id, modo: 'manual', total: '90.000',
    [`parte:${rodri.id}`]: '45.000', [`parte:${sofi.id}`]: '45.000', [`parte:${caro.id}`]: '',
  }, [rodri.id, sofi.id, caro.id])
  expect(await buyGroupGiftAction(null, fd)).toBeNull()
  const [regalo] = await regalosDeItem(db, bici.id, { userId: rodri.id })
  expect(regalo.miembros.map((m) => [m.nombre, m.monto, m.pagado])).toEqual([['Rodri', 45000, true], ['Sofi', 45000, false], ['Caro', 0, true]])
  expect(await misCuentas(db, caro.id)).toMatchObject({ debes: 0, personas: [] })
})

test('si no cierra, el formulario dice qué: cuánto falta o sobra, o que cambió la gente', async () => {
  const { db, rodri, sofi, caro, giftId } = await preparar()
  const todos = [rodri.id, sofi.id, caro.id]
  const aMano = (rodriPone: string) => compra({
    giftId, modo: 'manual', total: '90.000', [`parte:${rodri.id}`]: rodriPone, [`parte:${sofi.id}`]: '30.000', [`parte:${caro.id}`]: '30.000',
  }, todos)
  expect(await buyGroupGiftAction(null, aMano('20.000'))).toEqual({ error: 'Las partes suman $80.000: faltan $10.000 para llegar a $90.000.' })
  expect(await buyGroupGiftAction(null, aMano('35.000'))).toEqual({ error: 'Las partes suman $95.000: te pasaste $5.000 de $90.000.' })
  expect((await buyGroupGiftAction(null, aMano('treinta')))?.error).toMatch(/^Revisá los montos/)
  // en partes iguales, si se sumó alguien que Rodri no vio
  const tia = await upsertUserFromGoogle(db, { googleId: 'g-tia', email: 'tia@test.com', nombre: 'Tía' })
  await sumarseARegalo(db, giftId, tia.id)
  expect(await buyGroupGiftAction(null, compra({ giftId, modo: 'iguales', total: '90.000' }, todos)))
    .toEqual({ error: 'Se sumó o se bajó alguien, revisá la división.' })
  const [g] = await db.select().from(groupGifts).where(eq(groupGifts.id, giftId))
  expect(g.estado).toBe('abierto')
  expect(await buyGroupGiftAction(null, compra({ giftId, modo: 'iguales', total: '90.000' }, [...todos, tia.id]))).toBeNull()
  expect((await misCuentas(db, tia.id)).debes).toBe(22500)
})

test('corregir la compra desde el formulario, y sacar a alguien: siempre como el de la sesión', async () => {
  const { db, rodri, sofi, caro, giftId } = await preparar()
  // Sofi no puede sacar a Caro aunque lo mande en el formulario
  h.session = { userId: sofi.id }
  await removeGroupGiftMemberAction(compra({ giftId, miembroId: caro.id }, []))
  expect(await db.select().from(groupGiftMembers).where(eq(groupGiftMembers.giftId, giftId))).toHaveLength(3)
  h.session = { userId: rodri.id }
  await removeGroupGiftMemberAction(compra({ giftId, miembroId: caro.id }, []))
  expect((await db.select().from(groupGiftMembers).where(eq(groupGiftMembers.giftId, giftId))).map((m) => m.userId)).toEqual([rodri.id, sofi.id])
  expect(await getUnreadNotifications(db, { userId: caro.id })).toEqual([expect.objectContaining({ tipo: 'regalo_sacado' })])

  expect(await comprarRegalo(db, giftId, rodri.id, { total: 900000, miembros: [rodri.id, sofi.id] })).toEqual({ ok: true })
  expect((await misCuentas(db, sofi.id)).debes).toBe(450000)
  // un cero de más: lo corrige (desde Cuentas, sin token: vuelve ahí con cómo salió)
  await expect(fixGroupGiftAction(null, compra({ giftId, modo: 'iguales', total: '90.000', nota: 'la roja' }, [rodri.id, sofi.id])))
    .rejects.toMatchObject({ url: '/cuentas?correccion=ok' })
  expect((await misCuentas(db, sofi.id)).debes).toBe(45000)
  // Sofi no corrige lo que compró Rodri
  h.session = { userId: sofi.id }
  expect((await fixGroupGiftAction(null, compra({ giftId, modo: 'iguales', total: '10' }, [rodri.id, sofi.id])))?.error).toBeTruthy()
  expect((await misCuentas(db, sofi.id)).debes).toBe(45000)
})

// Rodri abre "Corregir la compra" y, mientras escribe, Sofi toca "Ya le pagué": al guardar, el formulario se va (ya no se
// puede corregir), así que el porqué va en la página.
test('si alguien pagó mientras corregía, la página dice que no se corrigió', async () => {
  const { db, rodri, sofi, caro, lista, bici, giftId } = await preparar()
  const todos = [rodri.id, sofi.id, caro.id]
  await comprarRegalo(db, giftId, rodri.id, { total: 900000, miembros: todos })
  await marcarPagado(db, giftId, sofi.id, sofi.id)
  await expect(fixGroupGiftAction(null, compra({ giftId, token: lista.shareToken, itemId: bici.id, modo: 'iguales', total: '90.000' }, todos)))
    .rejects.toMatchObject({ url: `/l/${lista.shareToken}/item/${bici.id}?correccion=ya_pagaron` })
  expect((await misCuentas(db, caro.id)).debes).toBe(300000)
  // lo que sigue con el formulario a la vista, en el formulario
  await marcarPagado(db, giftId, sofi.id, rodri.id, false)
  expect(await fixGroupGiftAction(null, compra({ giftId, modo: 'manual', total: '90.000', [`parte:${rodri.id}`]: '10', [`parte:${sofi.id}`]: '', [`parte:${caro.id}`]: '' }, todos)))
    .toEqual({ error: 'Las partes suman $10: faltan $89.990 para llegar a $90.000.' })
})

test('"Ya le pagué" y "Saldar todo" mandan lo que se veía: si cambió, no marcan nada', async () => {
  const { db, rodri, sofi, caro, giftId } = await preparar()
  await comprarRegalo(db, giftId, rodri.id, { total: 90000, miembros: [rodri.id, sofi.id, caro.id] })
  h.session = { userId: sofi.id }
  const pago = (monto: string) => compra({ giftId, deudorId: sofi.id, pagado: '1', monto }, [])
  await markPaidAction(pago('20000'))
  expect((await misCuentas(db, sofi.id)).debes).toBe(30000)
  // uno armado a mano, que no entra en la columna (integer): no marca nada, y no es un error de la consulta
  await markPaidAction(pago('999999999999'))
  expect(await marcarPagado(db, giftId, sofi.id, sofi.id, true, 3_000_000_000)).toBe(false)
  expect(await marcarPagado(db, giftId, sofi.id, sofi.id, true, 1.5)).toBe(false)
  expect((await misCuentas(db, sofi.id)).debes).toBe(30000)
  await markPaidAction(pago('30000'))
  expect((await misCuentas(db, sofi.id)).debes).toBe(0)
  // el encargado, "Me pagó todo" con Caro
  h.session = { userId: rodri.id }
  await settleUpAction(compra({ otroId: caro.id, neto: '45000' }, []))
  expect((await misCuentas(db, caro.id)).debes).toBe(30000)
  await settleUpAction(compra({ otroId: caro.id, neto: '30000' }, []))
  expect((await misCuentas(db, caro.id)).debes).toBe(0)
})

test('dejar volver a uno que sacó y posponer el recordatorio: solo el encargado de la sesión', async () => {
  const { db, rodri, sofi, caro, giftId } = await preparar()
  await sacarDeRegalo(db, giftId, caro.id, rodri.id)
  h.session = { userId: caro.id }
  await joinGroupGiftAction(compra({ giftId }, []))
  expect(await db.select().from(groupGiftMembers).where(eq(groupGiftMembers.giftId, giftId))).toHaveLength(2)
  // Caro (ni Sofi) no se deja volver sola
  await letBackGroupGiftMemberAction(compra({ giftId, miembroId: caro.id }, []))
  h.session = { userId: sofi.id }
  await letBackGroupGiftMemberAction(compra({ giftId, miembroId: caro.id }, []))
  await postponeGroupGiftReminderAction(compra({ giftId }, []))
  expect((await db.select().from(groupGifts).where(eq(groupGifts.id, giftId)))[0].recordatorioAt).toBeNull()
  h.session = { userId: rodri.id }
  await letBackGroupGiftMemberAction(compra({ giftId, miembroId: caro.id }, []))
  await postponeGroupGiftReminderAction(compra({ giftId }, []))
  expect((await db.select().from(groupGifts).where(eq(groupGifts.id, giftId)))[0].recordatorioAt).not.toBeNull()
  h.session = { userId: caro.id }
  await joinGroupGiftAction(compra({ giftId }, []))
  expect(await db.select().from(groupGiftMembers).where(eq(groupGiftMembers.giftId, giftId))).toHaveLength(3)
})

test('corregir la parte del que después se sumó al grupo: el formulario dice de quién y cuánto dejarle', async () => {
  h.db = await createTestDb()
  const db = h.db
  const usuario = (nombre: string) => upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre}@test.com`, nombre })
  const [delfina, rodri, sofi, tia] = [await usuario('Delfina'), await usuario('Rodri'), await usuario('Sofi'), await usuario('Tía')]
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  const tele = (await createItem(db, delfina.id, { tipo: 'exacto', titulo: 'Tele' }, grupoId))!
  const g = await iniciarRegaloGrupal(db, tele.id, rodri.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, sofi.id)
  await sumarseARegalo(db, g.giftId, tia.id)
  const todos = [rodri.id, sofi.id, tia.id]
  await comprarRegalo(db, g.giftId, rodri.id, { total: 90000, miembros: todos, partes: { [rodri.id]: 30000, [sofi.id]: 30000, [tia.id]: 30000 } })
  await unirseAGrupo(db, grupo.inviteToken!, tia.id)
  h.session = { userId: rodri.id }
  // la parte de la Tía, en 0 y sumada a la de Rodri
  expect(await fixGroupGiftAction(null, compra({
    giftId: g.giftId, modo: 'manual', total: '90.000', [`parte:${rodri.id}`]: '60.000', [`parte:${sofi.id}`]: '30.000', [`parte:${tia.id}`]: '',
  }, todos))).toEqual({
    error: 'Tía se sumó al grupo después de la compra y ya no ve este regalo: su parte no se puede cambiar. Corregilo "A mano" dejándole $30.000.',
  })
  await expect(fixGroupGiftAction(null, compra({
    giftId: g.giftId, modo: 'manual', total: '90.000', [`parte:${rodri.id}`]: '45.000', [`parte:${sofi.id}`]: '15.000', [`parte:${tia.id}`]: '30.000',
  }, todos))).rejects.toMatchObject({ url: '/cuentas?correccion=ok' })
  expect((await misCuentas(db, sofi.id)).debes).toBe(15000)
})

test('sacar a alguien desde Cuentas con el deseo fuera de la lista: no le promete al encargado que lo puede dejar volver', async () => {
  const { db, mama, rodri, bici, giftId } = await preparar()
  expect(await archiveItem(db, bici.id, mama.id, 'lo_tengo')).toBe(true)
  const [r] = (await misCuentas(db, rodri.id)).enCurso
  expect(r).toMatchObject({ sigueEnLaLista: false, sacados: [] })
  const html = renderToStaticMarkup(createElement(SacarDelRegalo, { giftId, otros: r.dividirCon!.filter((m) => !m.esYo), sacados: r.sacados }))
  expect(html).toContain('no se puede volver a sumar por su cuenta')
  expect(html).not.toContain('salvo que lo dejes')
})
