import { and, eq, inArray } from 'drizzle-orm'
import { claims, items, lists, notifications } from '@/db/schema'
import type { Db } from '@/db/types'
import { pickItemFields, type OwnerItemView } from '@/lib/serialize'

export type NewItemData = {
  tipo: 'exacto' | 'idea'
  titulo: string
  notas?: string
  fotoUrl?: string
  precio?: string
  rangoPrecio?: string
  categoria?: string
  prioridad?: 'mucho' | 'gustaria' | 'suelta'
  cantidad?: number
  repetible?: boolean
  linkTienda?: string
}

export async function createItem(db: Db, userId: string, data: NewItemData): Promise<OwnerItemView | null> {
  try {
    const [list] = await db.select().from(lists).where(eq(lists.ownerId, userId))
    if (!list) return null
    const [item] = await db.insert(items).values({ ...data, listId: list.id }).returning()
    return pickItemFields(item)
  } catch {
    return null
  }
}

async function itemDelDueno(db: Db, itemId: string, userId: string) {
  const [row] = await db.select({ id: items.id })
    .from(items).innerJoin(lists, eq(items.listId, lists.id))
    .where(and(eq(items.id, itemId), eq(lists.ownerId, userId)))
  return !!row
}

async function notifyActiveClaimers(db: Db, itemId: string, tipo: 'item_baja' | 'item_editado') {
  const activos = await db.select().from(claims)
    .where(and(eq(claims.itemId, itemId), inArray(claims.estado, ['reservado', 'comprado'])))
  if (activos.length) {
    await db.insert(notifications).values(activos.map((c) => ({
      userId: c.claimerUserId, guestId: c.claimerGuestId, tipo, itemId,
    })))
  }
}

export async function updateItem(db: Db, itemId: string, userId: string, data: Partial<NewItemData>): Promise<boolean> {
  if (!(await itemDelDueno(db, itemId, userId))) return false
  await db.update(items).set(data).where(eq(items.id, itemId))
  await notifyActiveClaimers(db, itemId, 'item_editado')
  return true
}

export async function archiveItem(db: Db, itemId: string, userId: string, estado: 'lo_tengo' | 'no_lo_quiero'): Promise<boolean> {
  if (!(await itemDelDueno(db, itemId, userId))) return false
  await db.update(items).set({ estadoDueno: estado }).where(eq(items.id, itemId))
  await notifyActiveClaimers(db, itemId, 'item_baja')
  return true
}
