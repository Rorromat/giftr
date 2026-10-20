import { and, asc, eq, inArray } from 'drizzle-orm'
import { claims, comments, guestIdentities, items, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { expireStaleClaims } from '@/lib/claims'
import { pickItemFields, type ClaimView, type GiverItemView, type OwnerItemView } from '@/lib/serialize'
import { duenosDeLista, juntarNombres } from '@/lib/groups'

type ListaDueno = { listId: string; tipo: 'personal' | 'grupo' }
// Para el regalador: ownerNombre junta a todos los dueños ("Delfina y Martín"); grupoNombre solo en grupos.
type ListaRegalador = { ownerNombre: string; duenos: string[]; grupoNombre: string | null }

export type ListView =
  | ({ role: 'owner'; shareToken: string; items: OwnerItemView[] } & ListaDueno)
  | ({ role: 'giver'; shareToken: string; items: GiverItemView[] } & ListaRegalador)

export type CommentView = { id: string; autorNombre: string; texto: string; createdAt: Date }

async function loadClaimViews(db: Db, itemIds: string[], viewer: Viewer) {
  if (!itemIds.length) return new Map<string, ClaimView[]>()
  const rows = await db.select({
    id: claims.id, itemId: claims.itemId, estado: claims.estado,
    notaQueCompre: claims.notaQueCompre,
    claimerUserId: claims.claimerUserId, claimerGuestId: claims.claimerGuestId,
    userNombre: users.nombre, guestNombre: guestIdentities.nombre,
  }).from(claims)
    .leftJoin(users, eq(claims.claimerUserId, users.id))
    .leftJoin(guestIdentities, eq(claims.claimerGuestId, guestIdentities.id))
    .where(and(inArray(claims.itemId, itemIds), inArray(claims.estado, ['reservado', 'comprado'])))

  const map = new Map<string, ClaimView[]>()
  for (const r of rows) {
    const view: ClaimView = {
      id: r.id,
      estado: r.estado as 'reservado' | 'comprado',
      claimerNombre: r.userNombre ?? r.guestNombre ?? 'Alguien',
      esMia: (!!viewer.userId && r.claimerUserId === viewer.userId) ||
             (!!viewer.guestId && r.claimerGuestId === viewer.guestId),
      notaQueCompre: r.notaQueCompre,
    }
    map.set(r.itemId, [...(map.get(r.itemId) ?? []), view])
  }
  return map
}

function toGiverView(row: ReturnType<typeof pickItemFields>, itemClaims: ClaimView[]): GiverItemView {
  const ocupados = itemClaims.length
  const quedan = Math.max(0, row.cantidad - ocupados)
  return { ...row, claims: itemClaims, quedan, disponible: row.repetible || quedan > 0 }
}

function paraRegalador(list: typeof lists.$inferSelect, duenos: { nombre: string }[]): ListaRegalador {
  const nombres = duenos.map((d) => d.nombre)
  return { ownerNombre: juntarNombres(nombres), duenos: nombres, grupoNombre: list.tipo === 'grupo' ? list.nombre ?? 'Grupo' : null }
}

export async function getListForViewer(db: Db, shareToken: string, viewer: Viewer): Promise<ListView | null> {
  const [list] = await db.select().from(lists).where(eq(lists.shareToken, shareToken))
  if (!list) return null

  const [duenos, allItems] = await Promise.all([
    duenosDeLista(db, list),
    db.select().from(items).where(eq(items.listId, list.id)).orderBy(asc(items.createdAt)),
  ])

  // Cualquier dueño (también un co-dueño del grupo) ve la vista sin reservas.
  if (viewer.userId && duenos.some((d) => d.id === viewer.userId)) {
    return { role: 'owner', listId: list.id, tipo: list.tipo, shareToken, items: allItems.map(pickItemFields) }
  }

  await expireStaleClaims(db)
  const activos = allItems.filter((i) => i.estadoDueno === 'activo')
  const claimMap = await loadClaimViews(db, activos.map((i) => i.id), viewer)
  return {
    role: 'giver', shareToken, ...paraRegalador(list, duenos),
    items: activos.map((i) => toGiverView(pickItemFields(i), claimMap.get(i.id) ?? [])),
  }
}

export async function getOwnList(db: Db, userId: string) {
  const [list] = await db.select().from(lists).where(eq(lists.ownerId, userId))
  if (!list) return null
  const rows = await db.select().from(items).where(eq(items.listId, list.id)).orderBy(asc(items.createdAt))
  return { shareToken: list.shareToken, items: rows.map(pickItemFields) }
}

export type ItemDetail =
  | ({ role: 'owner'; item: OwnerItemView } & ListaDueno)
  | ({ role: 'giver'; item: GiverItemView; comments: CommentView[] } & ListaRegalador)

export async function getItemForViewer(db: Db, shareToken: string, itemId: string, viewer: Viewer): Promise<ItemDetail | null> {
  const [row] = await db.select({ item: items, list: lists })
    .from(items)
    .innerJoin(lists, eq(items.listId, lists.id))
    .where(and(eq(items.id, itemId), eq(lists.shareToken, shareToken)))
  if (!row) return null

  const duenos = await duenosDeLista(db, row.list)
  if (viewer.userId && duenos.some((d) => d.id === viewer.userId)) {
    return { role: 'owner', listId: row.list.id, tipo: row.list.tipo, item: pickItemFields(row.item) }
  }

  if (row.item.estadoDueno !== 'activo') return null

  await expireStaleClaims(db, itemId)
  const claimMap = await loadClaimViews(db, [itemId], viewer)
  const commentRows = await db.select({
    id: comments.id, texto: comments.texto, createdAt: comments.createdAt,
    userNombre: users.nombre, guestNombre: guestIdentities.nombre,
  }).from(comments)
    .leftJoin(users, eq(comments.authorUserId, users.id))
    .leftJoin(guestIdentities, eq(comments.authorGuestId, guestIdentities.id))
    .where(eq(comments.itemId, itemId))
    .orderBy(comments.createdAt)

  return {
    role: 'giver', ...paraRegalador(row.list, duenos),
    item: toGiverView(pickItemFields(row.item), claimMap.get(itemId) ?? []),
    comments: commentRows.map((c) => ({
      id: c.id, texto: c.texto, createdAt: c.createdAt,
      autorNombre: c.userNombre ?? c.guestNombre ?? 'Alguien',
    })),
  }
}
