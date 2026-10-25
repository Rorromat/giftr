import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { createItem } from '@/lib/items'
import { markBought, releaseClaim, reserveItem } from '@/lib/claims'
import { cambiarLinkParaRegalar } from '@/lib/lists'
import { cancelarRegalo, comprarRegalo, iniciarRegaloGrupal, sumarseARegalo } from '@/lib/regalos'
import { misRegalos } from '@/lib/mis-regalos'
import { guardarCumple } from '@/lib/events'

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}

/** Mamá tiene una bici, un perfume, un libro y una taza. Rodri y Sofi le regalan. */
async function setup() {
  const db = await createTestDb()
  const [mama, rodri, sofi] = [await usuario(db, 'Mamá'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi')]
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, mama.id))
  const nuevo = async (titulo: string) => (await createItem(db, mama.id, { tipo: 'exacto', titulo, fotoUrl: `https://x.test/${titulo}.jpg` }))!
  const [bici, perfume, libro, taza] = [await nuevo('Bici'), await nuevo('Perfume'), await nuevo('Libro'), await nuevo('Taza')]
  return { db, mama, rodri, sofi, lista, bici, perfume, libro, taza }
}

test('lo que reservé, lo que compré y los regalos grupales en los que estoy, de cualquier lista', async () => {
  const { db, mama, rodri, sofi, lista, bici, perfume, libro, taza } = await setup()
  const r1 = await reserveItem(db, perfume.id, { userId: rodri.id })
  const r2 = await reserveItem(db, libro.id, { userId: rodri.id })
  if (!r1.ok || !r2.ok) throw new Error('no reservó')
  await markBought(db, r2.claimId, { userId: rodri.id })
  const g = await iniciarRegaloGrupal(db, bici.id, sofi.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, rodri.id)
  // lo que reservó y liberó no está
  const r3 = await reserveItem(db, taza.id, { userId: rodri.id })
  if (r3.ok) await releaseClaim(db, r3.claimId, { userId: rodri.id })

  const { porComprar, comprados } = await misRegalos(db, rodri.id)
  expect(porComprar.map((r) => [r.titulo, r.tipo])).toEqual([['Bici', 'grupal'], ['Perfume', 'suelto']])
  const perf = porComprar.find((r) => r.titulo === 'Perfume')!
  expect(perf).toMatchObject({ para: 'Mamá', href: `/l/${lista.shareToken}/item/${perfume.id}`, foto: 'https://x.test/Perfume.jpg' })
  expect(perf.venceEnDias).toBeGreaterThan(0)
  expect(porComprar.find((r) => r.titulo === 'Bici')).toMatchObject({ personas: 2, encargado: 'Sofi', soyEncargado: false, venceEnDias: null })
  expect(comprados.map((r) => r.titulo)).toEqual(['Libro'])

  // a Sofi (la encargada) le aparece el grupal una sola vez, no también como reserva suelta
  const deSofi = await misRegalos(db, sofi.id)
  expect(deSofi.porComprar.map((r) => [r.titulo, r.soyEncargado])).toEqual([['Bici', true]])

  // la dueña no ve nada de su propia lista (la Sorpresa)
  expect(await misRegalos(db, mama.id)).toEqual({ porComprar: [], comprados: [], historial: [] })
})

test('un grupal comprado pasa a comprados con mi parte; uno cancelado no está', async () => {
  const { db, rodri, sofi, bici, perfume } = await setup()
  const g = await iniciarRegaloGrupal(db, bici.id, sofi.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, rodri.id)
  expect((await comprarRegalo(db, g.giftId, sofi.id, { total: 90000 })).ok).toBe(true)
  const g2 = await iniciarRegaloGrupal(db, perfume.id, sofi.id)
  if (!g2.ok) throw new Error(g2.reason)
  await sumarseARegalo(db, g2.giftId, rodri.id)
  await cancelarRegalo(db, g2.giftId, sofi.id)
  const { porComprar, comprados } = await misRegalos(db, rodri.id)
  expect(porComprar).toEqual([])
  expect(comprados).toEqual([expect.objectContaining({ titulo: 'Bici', tipo: 'grupal', miParte: 45000 })])
})

test('si cambiaron el link después de que reservé y no la sigo, sin link', async () => {
  const { db, mama, rodri, lista, perfume } = await setup()
  await reserveItem(db, perfume.id, { userId: rodri.id })
  await cambiarLinkParaRegalar(db, lista.id, mama.id)
  const { porComprar } = await misRegalos(db, rodri.id)
  expect(porComprar[0]).toMatchObject({ titulo: 'Perfume', href: null })
})

test('lo comprado para un cumple que ya pasó va al historial; lo de para el que viene, no', async () => {
  const { db, mama, rodri, sofi, perfume, libro, bici } = await setup()
  // el cumple de Mamá es mañana
  const manana = new Date(Date.now() + 86_400_000)
  await guardarCumple(db, mama.id, manana.getUTCDate(), manana.getUTCMonth() + 1)
  const r = await reserveItem(db, libro.id, { userId: rodri.id })
  if (!r.ok) throw new Error('no reservó')
  await markBought(db, r.claimId, { userId: rodri.id })
  const g = await iniciarRegaloGrupal(db, bici.id, sofi.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, rodri.id)
  await comprarRegalo(db, g.giftId, sofi.id, { total: 80000 })
  await reserveItem(db, perfume.id, { userId: rodri.id })

  // hoy: todo es para el cumple de mañana
  const hoy = await misRegalos(db, rodri.id)
  expect(hoy.comprados.map((x) => x.titulo).sort()).toEqual(['Bici', 'Libro'])
  expect(hoy.historial).toEqual([])
  // tres días después del cumple: lo comprado ya se regaló (historial); lo reservado sigue por comprar
  const despues = await misRegalos(db, rodri.id, new Date(Date.now() + 3 * 86_400_000))
  expect(despues.historial.map((x) => x.titulo).sort()).toEqual(['Bici', 'Libro'])
  expect(despues.comprados).toEqual([])
  expect(despues.porComprar.map((x) => x.titulo)).toEqual(['Perfume'])
})
