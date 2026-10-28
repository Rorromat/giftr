import { and, asc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import { claims, comments, groupGiftMembers, groupGifts, groupGiftSacados, guestIdentities, items, listFollows, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { expireStaleClaims, miReservaVencida, ocupaSql } from '@/lib/claims'
import { desdeElUltimoEvento } from '@/lib/events'
import { cupoDe, esRepetible, pickItemFields, type ClaimView, type GiverItemView, type OwnerItemView } from '@/lib/serialize'
import { duenosDeLista, esDuenoSql, esToken, esUuid, juntarNombres, relacionDeLista, type Dueno } from '@/lib/groups'
import { regalosDeItem, type RegaloView } from '@/lib/regalos'
import { asegurarListaPropia, newShareToken } from '@/lib/users'
import { volverASeguirAmigos } from '@/lib/amigos'
import { accesoALista, type MotivoAnonimo } from '@/lib/acceso'

type ListaDueno = { listId: string; tipo: 'personal' | 'grupo' }
// Para el regalador: ownerNombre junta a todos los dueños ("Delfina y Martín"); grupoNombre solo en grupos.
// perfiles: para la foto y el link al perfil de cada dueño (sin nada de reservas). De un grupo, también su foto y qué es
// para sus dueños ("Hijo de Rodri y Euge").
type ListaRegalador = {
  listId: string; ownerNombre: string; duenos: string[]; perfiles: Dueno[]; grupoNombre: string | null
  grupoFoto: string | null; relacion: string | null
}

// anonimo: no sabemos si el que mira es el dueño sin su sesión (ver Acceso en src/lib/acceso.ts), así que ve los deseos
// como los ve el dueño: sin nada de la capa oculta. motivo: qué le falta para verla.
export type ListView =
  | ({ role: 'owner'; shareToken: string; items: OwnerItemView[] } & ListaDueno)
  | ({ role: 'giver'; shareToken: string; items: GiverItemView[] } & ListaRegalador)
  | ({ role: 'anonimo'; motivo: MotivoAnonimo; shareToken: string; items: OwnerItemView[] } & ListaRegalador)

export type CommentView = { id: string; autorNombre: string; texto: string; createdAt: Date }

/** Las reservas de unos deseos de una lista, como las ve quien regala. */
export async function loadClaimViews(db: Db, listId: string, deseos: (typeof items.$inferSelect)[], viewer: Viewer) {
  if (!deseos.length) return new Map<string, ClaimView[]>()
  // Lo de este evento: en una idea que se puede repetir (o en un deseo que volvió a la lista), lo comprado para uno
  // anterior ya no se cuenta (ver ocupaSql), y una compra se deshace solo si es de este (ver desmarcarComprado).
  const desde = await desdeElUltimoEvento(db, listId)
  const repetibles = deseos.filter(esRepetible).map((i) => i.id)
  const rows = await db.select({
    id: claims.id, itemId: claims.itemId, estado: claims.estado,
    notaQueCompre: claims.notaQueCompre, expiresAt: claims.expiresAt, updatedAt: claims.updatedAt,
    claimerUserId: claims.claimerUserId, claimerGuestId: claims.claimerGuestId,
    userNombre: users.nombre, guestNombre: guestIdentities.nombre,
  }).from(claims)
    .leftJoin(users, eq(claims.claimerUserId, users.id))
    .leftJoin(guestIdentities, eq(claims.claimerGuestId, guestIdentities.id))
    .where(and(
      inArray(claims.itemId, deseos.map((i) => i.id)), ocupaSql(null),
      repetibles.length ? or(notInArray(claims.itemId, repetibles), ocupaSql(desde)) : undefined,
    ))

  // Regalos grupales de esas reservas, con su gente (el encargado primero).
  const grupales = rows.length
    ? await db.select({ claimId: groupGifts.claimId, giftId: groupGifts.id, encargado: groupGifts.organizerUserId, userId: users.id, nombre: users.nombre })
      .from(groupGifts)
      .innerJoin(groupGiftMembers, eq(groupGiftMembers.giftId, groupGifts.id))
      .innerJoin(users, eq(groupGiftMembers.userId, users.id))
      .where(inArray(groupGifts.claimId, rows.map((r) => r.id)))
      .orderBy(asc(groupGiftMembers.createdAt))
    : []
  // De cuáles lo sacó el encargado: la tarjeta no lo invita a sumarse (como el detalle, ver regalosDeItem)
  const sacados = viewer.userId && grupales.length
    ? await db.select({ giftId: groupGiftSacados.giftId }).from(groupGiftSacados)
      .where(and(eq(groupGiftSacados.userId, viewer.userId), inArray(groupGiftSacados.giftId, [...new Set(grupales.map((g) => g.giftId))])))
    : []

  const map = new Map<string, ClaimView[]>()
  for (const r of rows) {
    const gente = grupales.filter((g) => g.claimId === r.id)
      .sort((a, b) => Number(b.userId === b.encargado) - Number(a.userId === a.encargado))
    const esMia = (!!viewer.userId && r.claimerUserId === viewer.userId) ||
                  (!!viewer.guestId && r.claimerGuestId === viewer.guestId)
    const view: ClaimView = {
      id: r.id,
      estado: r.estado as 'reservado' | 'comprado',
      claimerNombre: r.userNombre ?? r.guestNombre ?? 'Alguien',
      esMia,
      // cuándo vence una reserva es cosa de quien la hizo
      vence: esMia && r.estado === 'reservado' ? r.expiresAt : null,
      deshacer: esMia && r.estado === 'comprado' && !gente.length && r.updatedAt >= desde,
      notaQueCompre: r.notaQueCompre,
      grupal: gente.length
        ? {
          giftId: gente[0].giftId, personas: gente.map((g) => g.nombre), soyParte: !!viewer.userId && gente.some((g) => g.userId === viewer.userId),
          // también ya comprado: no se vuelve a sumar solo (como en regalosDeItem)
          meSacaron: sacados.some((s) => s.giftId === gente[0].giftId),
        }
        : null,
    }
    map.set(r.itemId, [...(map.get(r.itemId) ?? []), view])
  }
  return map
}

export function toGiverView(row: ReturnType<typeof pickItemFields>, itemClaims: ClaimView[]): GiverItemView {
  return { ...row, claims: itemClaims, ...cupoDe(row, itemClaims.length) }
}

function paraRegalador(list: typeof lists.$inferSelect, duenos: Dueno[]): ListaRegalador {
  const nombres = duenos.map((d) => d.nombre)
  const grupo = list.tipo === 'grupo'
  return {
    listId: list.id, ownerNombre: juntarNombres(nombres), duenos: nombres, perfiles: duenos, grupoNombre: grupo ? list.nombre ?? 'Grupo' : null,
    grupoFoto: grupo ? list.fotoUrl : null, relacion: grupo ? relacionDeLista(duenos) : null,
  }
}

export async function getListForViewer(db: Db, shareToken: string, viewer: Viewer): Promise<ListView | null> {
  if (!esToken(shareToken)) return null
  const [list] = await db.select().from(lists).where(eq(lists.shareToken, shareToken))
  // una sorpresa se abre solo por sorpresas.ts (con sesión, y nunca para quien la recibe)
  if (!list || list.tipo === 'sorpresa') return null

  const [duenos, allItems, acceso] = await Promise.all([
    duenosDeLista(db, list),
    db.select().from(items).where(eq(items.listId, list.id)).orderBy(asc(items.createdAt)),
    accesoALista(db, list.id, viewer),
  ])

  // Cualquier dueño (también un co-dueño del grupo) ve la vista sin reservas, sin los que eliminó (ver borrarDeseo).
  if (acceso === 'dueno') {
    return { role: 'owner', listId: list.id, tipo: list.tipo, shareToken, items: allItems.filter((i) => !i.borradoAt).map(pickItemFields) }
  }

  const activos = allItems.filter((i) => i.estadoDueno === 'activo')
  if (acceso !== 'regalador') {
    return { role: 'anonimo', motivo: acceso, shareToken, ...paraRegalador(list, duenos), items: activos.map(pickItemFields) }
  }

  await expireStaleClaims(db)
  const claimMap = await loadClaimViews(db, list.id, activos, viewer)
  return {
    role: 'giver', shareToken, ...paraRegalador(list, duenos),
    items: activos.map((i) => toGiverView(pickItemFields(i), claimMap.get(i.id) ?? [])),
  }
}

/**
 * Un link para regalar nuevo (de la lista personal o de un grupo, cualquiera de sus dueños): el anterior deja de andar.
 * También se olvida quién la seguía: Tu gente y Eventos arman el link con el token de ahora, así que si no, les pasarían
 * el nuevo a todos los que tenían el viejo. Los amigos del dueño no: la ven por ser amigos, no por el link. Por lo mismo se anota cuándo (share_token_at): Cuentas y la unión de un
 * invitado no le pasan el nuevo a quien solo tenía algo de antes. Lo reservado queda como está. Devuelve el token nuevo, o null.
 */
export async function cambiarLinkParaRegalar(db: Db, listId: string, userId: string): Promise<string | null> {
  if (!esUuid(listId)) return null
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // la hora de la base, la misma con la que se anotan las reservas (ver unirInvitadoACuenta)
    const [list] = await t.update(lists).set({ shareToken: newShareToken(), shareTokenAt: sql`now()` })
      .where(and(eq(lists.id, listId), esDuenoSql(t, userId)))
      .returning({ shareToken: lists.shareToken, ownerId: lists.ownerId })
    if (!list) return null
    await t.delete(listFollows).where(eq(listFollows.listId, listId))
    // los amigos la siguen viendo: no la tenían por el link
    if (list.ownerId) await volverASeguirAmigos(t, list.ownerId, listId)
    return list.shareToken
  })
}

/** La lista personal (si le faltaba, se crea). Null solo si el usuario no existe. */
export async function getOwnList(db: Db, userId: string) {
  const list = await asegurarListaPropia(db, userId)
  if (!list) return null
  // sin los que eliminó (ver borrarDeseo)
  const rows = await db.select().from(items).where(and(eq(items.listId, list.id), isNull(items.borradoAt))).orderBy(asc(items.createdAt))
  return { id: list.id, shareToken: list.shareToken, items: rows.map(pickItemFields) }
}

export type ItemDetail =
  | ({ role: 'owner'; item: OwnerItemView } & ListaDueno)
  | ({
    role: 'giver'; item: GiverItemView; comments: CommentView[]; regalos: RegaloView[]
    /** Su reserva de este deseo venció hace poco y no tiene otra: para marcarlo comprado o reservarlo de nuevo. */
    miVencida: { claimId: string; vencio: Date } | null
  } & ListaRegalador)
  | ({ role: 'anonimo'; motivo: MotivoAnonimo; item: OwnerItemView } & ListaRegalador)

export async function getItemForViewer(db: Db, shareToken: string, itemId: string, viewer: Viewer): Promise<ItemDetail | null> {
  // un link cortado (/l/tok/item/3f2a1c) no es de ningún deseo: 404, no un error de la base
  if (!esUuid(itemId) || !esToken(shareToken)) return null
  const [row] = await db.select({ item: items, list: lists })
    .from(items)
    .innerJoin(lists, eq(items.listId, lists.id))
    .where(and(eq(items.id, itemId), eq(lists.shareToken, shareToken)))
  if (!row || row.list.tipo === 'sorpresa') return null

  const [duenos, acceso] = await Promise.all([duenosDeLista(db, row.list), accesoALista(db, row.list.id, viewer)])
  if (acceso === 'dueno') {
    if (row.item.borradoAt) return null
    return { role: 'owner', listId: row.list.id, tipo: row.list.tipo, item: pickItemFields(row.item) }
  }

  if (row.item.estadoDueno !== 'activo') return null
  if (acceso !== 'regalador') return { role: 'anonimo', motivo: acceso, ...paraRegalador(row.list, duenos), item: pickItemFields(row.item) }

  await expireStaleClaims(db, itemId)
  const [claimMap, regalos, vencida] = await Promise.all([
    loadClaimViews(db, row.list.id, [row.item], viewer), regalosDeItem(db, itemId, viewer), miReservaVencida(db, itemId, viewer),
  ])
  const itemClaims = claimMap.get(itemId) ?? []
  return {
    role: 'giver', ...paraRegalador(row.list, duenos),
    item: toGiverView(pickItemFields(row.item), itemClaims),
    regalos,
    miVencida: itemClaims.some((c) => c.esMia) || regalos.some((r) => r.soyParte) ? null : vencida,
    comments: await comentariosDe(db, itemId),
  }
}

/** El hilo de un deseo (lo que no ve el dueño): solo para quien ve la capa oculta. */
export async function comentariosDe(db: Db, itemId: string): Promise<CommentView[]> {
  const filas = await db.select({
    id: comments.id, texto: comments.texto, createdAt: comments.createdAt,
    userNombre: users.nombre, guestNombre: guestIdentities.nombre,
  }).from(comments)
    .leftJoin(users, eq(comments.authorUserId, users.id))
    .leftJoin(guestIdentities, eq(comments.authorGuestId, guestIdentities.id))
    .where(eq(comments.itemId, itemId))
    .orderBy(comments.createdAt)
  return filas.map((c) => ({ id: c.id, texto: c.texto, createdAt: c.createdAt, autorNombre: c.userNombre ?? c.guestNombre ?? 'Alguien' }))
}
