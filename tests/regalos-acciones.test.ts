import { expect, test, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import type { Db } from '@/db/types'
import { groupGiftMembers, groupGifts, lists } from '@/db/schema'
import { upsertUserFromGoogle } from '@/lib/users'
import { createItem } from '@/lib/items'
import { getUnreadNotifications } from '@/lib/notifications'
import { comprarRegalo, iniciarRegaloGrupal, misCuentas, regalosDeItem, sumarseARegalo } from '@/lib/regalos'

// Las acciones del regalo grupal tal cual, con la base en PGlite y la sesión de Next simulada.
const h = vi.hoisted(() => ({ db: undefined as unknown as Db, session: null as { userId: string } | null }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session, signIn: vi.fn(), signOut: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
}))

import { buyGroupGiftAction, fixGroupGiftAction, removeGroupGiftMemberAction } from '@/app/actions'

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
  // un cero de más: lo corrige
  expect(await fixGroupGiftAction(null, compra({ giftId, modo: 'iguales', total: '90.000', nota: 'la roja' }, [rodri.id, sofi.id]))).toBeNull()
  expect((await misCuentas(db, sofi.id)).debes).toBe(45000)
  // Sofi no corrige lo que compró Rodri
  h.session = { userId: sofi.id }
  expect((await fixGroupGiftAction(null, compra({ giftId, modo: 'iguales', total: '10' }, [rodri.id, sofi.id])))?.error).toBeTruthy()
  expect((await misCuentas(db, sofi.id)).debes).toBe(45000)
})
