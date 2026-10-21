import { and, asc, eq, inArray } from 'drizzle-orm'
import { claims, comments, groupGiftMembers, groupGifts, guestIdentities, items, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { expireStaleClaims } from '@/lib/claims'
import { pickItemFields, type ClaimView, type GiverItemView, type OwnerItemView } from '@/lib/serialize'
import { duenosDeLista, juntarNombres, type Dueno } from '@/lib/groups'
import { regalosDeItem, type RegaloView } from '@/lib/regalos'
import { asegurarListaPropia } from '@/lib/users'
import { accesoALista, type MotivoAnonimo } from '@/lib/acceso'

type ListaDueno = { listId: string; tipo: 'personal' | 'grupo' }
// Para el regalador: ownerNombre junta a todos los dueños ("Delfina y Martín"); grupoNombre solo en grupos.
// perfiles: para la foto y el link al perfil de cada dueño (sin nada de reservas).
type ListaRegalador = { listId: string; ownerNombre: string; duenos: string[]; perfiles: Dueno[]; grupoNombre: string | null }

// anonimo: no sabemos si el que mira es el dueño sin su sesión (ver Acceso en src/lib/acceso.ts), así que ve los deseos
// como los ve el dueño: sin nada de la capa oculta. motivo: qué le falta para verla.
export type ListView =
  | ({ role: 'owner'; shareToken: string; items: OwnerItemView[] } & ListaDueno)
  | ({ role: 'giver'; shareToken: string; items: GiverItemView[] } & ListaRegalador)
  | ({ role: 'anonimo'; motivo: MotivoAnonimo; shareToken: string; items: OwnerItemView[] } & ListaRegalador)

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

  // Regalos grupales de esas reservas, con su gente (el encargado primero).
  const grupales = rows.length
    ? await db.select({ claimId: groupGifts.claimId, giftId: groupGifts.id, encargado: groupGifts.organizerUserId, userId: users.id, nombre: users.nombre })
      .from(groupGifts)
      .innerJoin(groupGiftMembers, eq(groupGiftMembers.giftId, groupGifts.id))
      .innerJoin(users, eq(groupGiftMembers.userId, users.id))
      .where(inArray(groupGifts.claimId, rows.map((r) => r.id)))
      .orderBy(asc(groupGiftMembers.createdAt))
    : []

  const map = new Map<string, ClaimView[]>()
  for (const r of rows) {
    const gente = grupales.filter((g) => g.claimId === r.id)
      .sort((a, b) => Number(b.userId === b.encargado) - Number(a.userId === a.encargado))
    const view: ClaimView = {
      id: r.id,
      estado: r.estado as 'reservado' | 'comprado',
      claimerNombre: r.userNombre ?? r.guestNombre ?? 'Alguien',
      esMia: (!!viewer.userId && r.claimerUserId === viewer.userId) ||
             (!!viewer.guestId && r.claimerGuestId === viewer.guestId),
      notaQueCompre: r.notaQueCompre,
      grupal: gente.length
        ? { giftId: gente[0].giftId, personas: gente.map((g) => g.nombre), soyParte: !!viewer.userId && gente.some((g) => g.userId === viewer.userId) }
        : null,
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

function paraRegalador(list: typeof lists.$inferSelect, duenos: Dueno[]): ListaRegalador {
  const nombres = duenos.map((d) => d.nombre)
  return { listId: list.id, ownerNombre: juntarNombres(nombres), duenos: nombres, perfiles: duenos, grupoNombre: list.tipo === 'grupo' ? list.nombre ?? 'Grupo' : null }
}

export async function getListForViewer(db: Db, shareToken: string, viewer: Viewer): Promise<ListView | null> {
  const [list] = await db.select().from(lists).where(eq(lists.shareToken, shareToken))
  if (!list) return null

  const [duenos, allItems, acceso] = await Promise.all([
    duenosDeLista(db, list),
    db.select().from(items).where(eq(items.listId, list.id)).orderBy(asc(items.createdAt)),
    accesoALista(db, list.id, viewer),
  ])

  // Cualquier dueño (también un co-dueño del grupo) ve la vista sin reservas.
  if (acceso === 'dueno') {
    return { role: 'owner', listId: list.id, tipo: list.tipo, shareToken, items: allItems.map(pickItemFields) }
  }

  const activos = allItems.filter((i) => i.estadoDueno === 'activo')
  if (acceso !== 'regalador') {
    return { role: 'anonimo', motivo: acceso, shareToken, ...paraRegalador(list, duenos), items: activos.map(pickItemFields) }
  }

  await expireStaleClaims(db)
  const claimMap = await loadClaimViews(db, activos.map((i) => i.id), viewer)
  return {
    role: 'giver', shareToken, ...paraRegalador(list, duenos),
    items: activos.map((i) => toGiverView(pickItemFields(i), claimMap.get(i.id) ?? [])),
  }
}

/** La lista personal (si le faltaba, se crea). Null solo si el usuario no existe. */
export async function getOwnList(db: Db, userId: string) {
  const list = await asegurarListaPropia(db, userId)
  if (!list) return null
  const rows = await db.select().from(items).where(eq(items.listId, list.id)).orderBy(asc(items.createdAt))
  return { shareToken: list.shareToken, items: rows.map(pickItemFields) }
}

export type ItemDetail =
  | ({ role: 'owner'; item: OwnerItemView } & ListaDueno)
  | ({ role: 'giver'; item: GiverItemView; comments: CommentView[]; regalos: RegaloView[] } & ListaRegalador)
  | ({ role: 'anonimo'; motivo: MotivoAnonimo; item: OwnerItemView } & ListaRegalador)

export async function getItemForViewer(db: Db, shareToken: string, itemId: string, viewer: Viewer): Promise<ItemDetail | null> {
  const [row] = await db.select({ item: items, list: lists })
    .from(items)
    .innerJoin(lists, eq(items.listId, lists.id))
    .where(and(eq(items.id, itemId), eq(lists.shareToken, shareToken)))
  if (!row) return null

  const [duenos, acceso] = await Promise.all([duenosDeLista(db, row.list), accesoALista(db, row.list.id, viewer)])
  if (acceso === 'dueno') {
    return { role: 'owner', listId: row.list.id, tipo: row.list.tipo, item: pickItemFields(row.item) }
  }

  if (row.item.estadoDueno !== 'activo') return null
  if (acceso !== 'regalador') return { role: 'anonimo', motivo: acceso, ...paraRegalador(row.list, duenos), item: pickItemFields(row.item) }

  await expireStaleClaims(db, itemId)
  const [claimMap, regalos] = await Promise.all([loadClaimViews(db, [itemId], viewer), regalosDeItem(db, itemId, viewer)])
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
    regalos,
    comments: commentRows.map((c) => ({
      id: c.id, texto: c.texto, createdAt: c.createdAt,
      autorNombre: c.userNombre ?? c.guestNombre ?? 'Alguien',
    })),
  }
}
