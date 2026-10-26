import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { claims, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { borrarDeseo, createItem, deseoParaEditar, restoreItem } from '@/lib/items'
import { reserveItem } from '@/lib/claims'
import { getItemForViewer, getListForViewer, getOwnList } from '@/lib/lists'
import { getUnreadNotifications } from '@/lib/notifications'
import { iniciarRegaloGrupal, misCuentas, sumarseARegalo } from '@/lib/regalos'

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}

async function setup() {
  const db = await createTestDb()
  const [mama, rodri, sofi, ana] = [await usuario(db, 'Mamá'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi'), await usuario(db, 'Ana')]
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, mama.id))
  const bici = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Bici', precio: '$90.000' }))!
  const perfume = (await createItem(db, mama.id, { tipo: 'exacto', titulo: 'Perfume' }))!
  return { db, mama, rodri, sofi, ana, lista, bici, perfume }
}

const idsDelDueno = async (db: Db, userId: string) => (await getOwnList(db, userId))!.items.map((i) => i.titulo)

test('eliminar: para la dueña desaparece (también de los archivados) y no vuelve; para los que regalan, como "Ya no lo quiero"', async () => {
  const { db, mama, rodri, ana, lista, bici, perfume } = await setup()
  expect(await reserveItem(db, bici.id, { userId: rodri.id })).toMatchObject({ ok: true })

  expect(await borrarDeseo(db, bici.id, rodri.id)).toBe(false) // solo la dueña
  expect(await borrarDeseo(db, bici.id, mama.id)).toBe(true)
  expect(await borrarDeseo(db, bici.id, mama.id)).toBe(false) // una vez

  // la dueña: ni en la lista ni en los archivados, no se abre, no se edita y no se vuelve a poner
  expect(await idsDelDueno(db, mama.id)).toEqual(['Perfume'])
  const suya = await getListForViewer(db, lista.shareToken, { userId: mama.id })
  expect(suya?.role === 'owner' && suya.items.map((i) => i.titulo)).toEqual(['Perfume'])
  expect(await getItemForViewer(db, lista.shareToken, bici.id, { userId: mama.id })).toBeNull()
  expect(await deseoParaEditar(db, bici.id, mama.id)).toBeNull()
  expect(await restoreItem(db, bici.id, mama.id)).toBe(false)
  expect(await getUnreadNotifications(db, { userId: mama.id })).toEqual([])

  // Rodri, que lo había reservado: se le libera y le llega el aviso, como con "Ya no lo quiero"
  const [claim] = await db.select().from(claims).where(eq(claims.itemId, bici.id))
  expect(claim.estado).toBe('liberado')
  expect(await getUnreadNotifications(db, { userId: rodri.id })).toEqual([expect.objectContaining({ tipo: 'item_baja', itemTitulo: 'Bici' })])
  const deAna = await getListForViewer(db, lista.shareToken, { userId: ana.id })
  expect(deAna?.role === 'giver' && deAna.items.map((i) => i.titulo)).toEqual(['Perfume'])

  // la regla de la sorpresa: eliminar uno que nadie reservó le da a la dueña lo mismo
  expect(await borrarDeseo(db, perfume.id, mama.id)).toBe(true)
  expect(await idsDelDueno(db, mama.id)).toEqual([])
})

test('eliminar uno con un regalo grupal abierto lo cancela y les avisa a todos (lo de Cuentas no queda trabado)', async () => {
  const { db, mama, rodri, sofi, bici } = await setup()
  const r = await iniciarRegaloGrupal(db, bici.id, rodri.id)
  if (!r.ok) throw new Error(r.reason)
  expect(await sumarseARegalo(db, r.giftId, sofi.id)).toBe(true)
  expect(await borrarDeseo(db, bici.id, mama.id)).toBe(true)
  for (const u of [rodri, sofi]) {
    expect((await misCuentas(db, u.id)).enCurso).toEqual([])
    expect(await getUnreadNotifications(db, { userId: u.id })).toEqual([expect.objectContaining({ tipo: 'regalo_baja', itemTitulo: 'Bici' })])
  }
})
