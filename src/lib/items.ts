import { and, eq, inArray } from 'drizzle-orm'
import { claims, items, lists, notifications } from '@/db/schema'
import type { Db } from '@/db/types'
import { pickItemFields, type OwnerItemView } from '@/lib/serialize'
import { esDuenoSql, esUuid } from '@/lib/groups'

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

/** Agrega a la lista personal del usuario o, con listId, a un grupo del que es dueño. */
export async function createItem(db: Db, userId: string, data: NewItemData, listId?: string): Promise<OwnerItemView | null> {
  try {
    if (listId !== undefined && !esUuid(listId)) return null
    const [list] = await db.select().from(lists)
      .where(listId ? and(eq(lists.id, listId), esDuenoSql(db, userId)) : eq(lists.ownerId, userId))
    if (!list) return null
    const [item] = await db.insert(items).values({ ...data, listId: list.id }).returning()
    return pickItemFields(item)
  } catch (e: any) {
    // Check for PostgreSQL UUID validation error (code 22P02: invalid input syntax for type uuid)
    // Try multiple possible locations for the error code
    if (
      e?.code === '22P02' ||
      e?.cause?.code === '22P02' ||
      e?.originalError?.code === '22P02'
    ) return null

    // Also check error message
    const msg = (e?.message || e?.toString?.() || String(e)).toLowerCase()
    if (msg.includes('invalid input syntax') && msg.includes('uuid')) return null

    throw e
  }
}

async function itemDelDueno(db: Db, itemId: string, userId: string) {
  if (!esUuid(itemId)) return false
  const [row] = await db.select({ id: items.id })
    .from(items).innerJoin(lists, eq(items.listId, lists.id))
    .where(and(eq(items.id, itemId), esDuenoSql(db, userId)))
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

/** Lo que se puede cambiar de un deseo; null borra un campo opcional (las notas, el precio, la foto…). */
export const CAMPOS_OPCIONALES = ['notas', 'fotoUrl', 'precio', 'rangoPrecio', 'categoria', 'linkTienda'] as const
type Opcional = (typeof CAMPOS_OPCIONALES)[number]
export type CambiosDeseo = Partial<Omit<NewItemData, Opcional>> & { [K in Opcional]?: string | null }

export async function updateItem(db: Db, itemId: string, userId: string, data: CambiosDeseo): Promise<boolean> {
  if (!(await itemDelDueno(db, itemId, userId))) return false
  const [antes] = await db.select().from(items).where(eq(items.id, itemId))
  // Solo lo que cambió: guardar sin tocar nada no les manda un aviso a los que lo reservaron.
  const cambios = Object.fromEntries(
    Object.entries(data).filter(([k, v]) => v !== undefined && antes[k as keyof typeof antes] !== v),
  ) as CambiosDeseo
  if (!Object.keys(cambios).length) return true
  await db.update(items).set(cambios).where(eq(items.id, itemId))
  await notifyActiveClaimers(db, itemId, 'item_editado')
  return true
}

/** Un deseo activo para editarlo, solo si es del usuario (o de un grupo suyo), con su grupo para volver. */
export async function deseoParaEditar(db: Db, itemId: string, userId: string) {
  if (!esUuid(itemId)) return null
  const [row] = await db.select({ item: items, lista: { id: lists.id, tipo: lists.tipo, nombre: lists.nombre } })
    .from(items).innerJoin(lists, eq(items.listId, lists.id))
    .where(and(eq(items.id, itemId), esDuenoSql(db, userId)))
  if (!row || row.item.estadoDueno !== 'activo') return null
  return {
    deseo: pickItemFields(row.item),
    grupo: row.lista.tipo === 'grupo' ? { id: row.lista.id, nombre: row.lista.nombre ?? 'Grupo' } : null,
  }
}

export async function archiveItem(db: Db, itemId: string, userId: string, estado: 'lo_tengo' | 'no_lo_quiero'): Promise<boolean> {
  if (!(await itemDelDueno(db, itemId, userId))) return false
  await db.update(items).set({ estadoDueno: estado }).where(eq(items.id, itemId))
  await notifyActiveClaimers(db, itemId, 'item_baja')
  return true
}
