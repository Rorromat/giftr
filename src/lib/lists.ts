import { and, asc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import { claims, comments, groupGiftMembers, groupGifts, groupGiftSacados, guestIdentities, items, listFollows, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Viewer } from '@/lib/types'
import { expireStaleClaims, miReservaVencida, ocupaSql } from '@/lib/claims'
import { desdeElUltimoEvento } from '@/lib/events'
import { cupoDe, esAporte, esRepetible, juntadoAprox, pickItemFields, type ClaimView, type GiverItemView, type OwnerItemView } from '@/lib/serialize'
import { ocasionDeLista, type Ocasion } from '@/lib/ocasiones'
import { duenosDeLista, esDuenoSql, esToken, esUuid, juntarNombres, relacionDeLista, type Dueno } from '@/lib/groups'
import { regalosDeItem, type RegaloView } from '@/lib/regalos'
import { asegurarListaPropia, newShareToken } from '@/lib/users'
import { volverASeguirAmigos } from '@/lib/amigos'
import { accesoALista, sinNombresPara, type MotivoAnonimo } from '@/lib/acceso'

type ListaDueno = { listId: string; tipo: 'personal' | 'grupo' }
// Para el regalador: ownerNombre junta a todos los dueños ("Delfina y Martín"); grupoNombre solo en grupos.
// perfiles: para la foto y el link al perfil de cada dueño (sin nada de reservas). De un grupo, también su foto y qué es
// para sus dueños ("Hijo de Rodri y Euge").
// ocasion: de una lista en común, para qué es (ver ocasiones.ts): le pone el color a su tapa.
type ListaRegalador = {
  listId: string; ownerNombre: string; duenos: string[]; perfiles: Dueno[]; grupoNombre: string | null
  grupoFoto: string | null; relacion: string | null; ocasion: Ocasion | null
}

// anonimo: no sabemos si el que mira es el dueño sin su sesión (ver Acceso en src/lib/acceso.ts), así que ve los deseos
// como los ve el dueño: sin nada de la capa oculta. motivo: qué le falta para verla.
// sinNombres: ve qué está ocupado pero no por quién (un invitado sin cuenta, ver sinNombresPara): lo que no le toca ver no
// viene en la vista.
export type ListView =
  | ({ role: 'owner'; shareToken: string; items: OwnerItemView[] } & ListaDueno)
  | ({ role: 'giver'; sinNombres: boolean; shareToken: string; items: GiverItemView[] } & ListaRegalador)
  | ({ role: 'anonimo'; motivo: MotivoAnonimo; shareToken: string; items: OwnerItemView[] } & ListaRegalador)

export type CommentView = { id: string; autorNombre: string; texto: string; createdAt: Date }

/**
 * Las reservas de unos deseos de una lista, como las ve quien regala. sinNombres: qué está ocupado y nada más (ver
 * sinNombresPara): de las reservas de otros no van el nombre, lo que anotó que compró ni quiénes están en un regalo grupal
 * (sí cuántos); de la suya, todo. De un aporte en plata no hay nada que coordinar (no se duplica): sin nombres, de los
 * aportes de otros no va nada, ni cuántos son; a la dueña que se anotó como "Tía" en una ventana privada no le llega ni eso.
 */
export async function loadClaimViews(db: Db, listId: string, deseos: (typeof items.$inferSelect)[], viewer: Viewer, sinNombres = false) {
  if (!deseos.length) return new Map<string, ClaimView[]>()
  // Lo de este evento: en una idea que se puede repetir (o en un deseo que volvió a la lista), lo comprado para uno
  // anterior ya no se cuenta (ver ocupaSql), y una compra se deshace solo si es de este (ver desmarcarComprado).
  const desde = await desdeElUltimoEvento(db, listId)
  const repetibles = deseos.filter(esRepetible).map((i) => i.id)
  const rows = await db.select({
    id: claims.id, itemId: claims.itemId, estado: claims.estado,
    notaQueCompre: claims.notaQueCompre, expiresAt: claims.expiresAt, updatedAt: claims.updatedAt, aporteMonto: claims.aporteMonto,
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

  const aportes = new Set(deseos.filter(esAporte).map((i) => i.id))
  const map = new Map<string, ClaimView[]>()
  for (const r of rows) {
    const gente = grupales.filter((g) => g.claimId === r.id)
      .sort((a, b) => Number(b.userId === b.encargado) - Number(a.userId === a.encargado))
    const esMia = (!!viewer.userId && r.claimerUserId === viewer.userId) ||
                  (!!viewer.guestId && r.claimerGuestId === viewer.guestId)
    if (aportes.has(r.itemId) && sinNombres && !esMia) continue
    const view: ClaimView = {
      id: r.id,
      estado: r.estado as 'reservado' | 'comprado',
      claimerNombre: sinNombres && !esMia ? null : r.userNombre ?? r.guestNombre ?? 'Alguien',
      esMia,
      // cuándo vence una reserva es cosa de quien la hizo
      vence: esMia && r.estado === 'reservado' ? r.expiresAt : null,
      deshacer: esMia && r.estado === 'comprado' && !gente.length && r.updatedAt >= desde,
      // texto libre de quien lo compró ("lo compramos con Sofi"), como el hilo
      notaQueCompre: sinNombres && !esMia ? null : r.notaQueCompre,
      // cuánto aportó cada uno es cosa suya: el de otro no viaja nunca
      monto: esMia && aportes.has(r.itemId) ? r.aporteMonto : null,
      grupal: gente.length
        ? {
          giftId: gente[0].giftId, cuantos: gente.length, personas: sinNombres ? [] : gente.map((g) => g.nombre),
          soyParte: !!viewer.userId && gente.some((g) => g.userId === viewer.userId),
          // también ya comprado: no se vuelve a sumar solo (como en regalosDeItem)
          meSacaron: sacados.some((s) => s.giftId === gente[0].giftId),
        }
        : null,
    }
    map.set(r.itemId, [...(map.get(r.itemId) ?? []), view])
  }
  return map
}

export function toGiverView(row: ReturnType<typeof pickItemFields>, itemClaims: ClaimView[], juntado: number | null = null): GiverItemView {
  return { ...row, claims: itemClaims, juntado, ...cupoDe(row, itemClaims.length) }
}

/**
 * Cuánto va juntado, más o menos, de los aportes en plata con meta (por deseo): la suma de lo que anotaron los que
 * aportaron para este evento, redondeada (ver juntadoAprox). Solo para quien regala con su cuenta y ve los nombres: a un
 * invitado sin cuenta no (puede ser la dueña con otro nombre, ver sinNombresPara, y tampoco con la protección apagada:
 * esto es plata), y a un dueño no le llega por ningún camino: ni su vista, ni la vista previa del link, ni un aviso salen
 * de acá. Sin meta no hay progreso que mostrar: no se calcula.
 */
export async function juntadoDeAportes(db: Db, listId: string, deseos: (typeof items.$inferSelect)[], viewer: Viewer, sinNombres: boolean) {
  const conMeta = deseos.filter((i) => esAporte(i) && i.aporteMeta).map((i) => i.id)
  if (!viewer.userId || sinNombres || !conMeta.length) return new Map<string, number>()
  const desde = await desdeElUltimoEvento(db, listId)
  const filas = await db.select({ itemId: claims.itemId, total: sql<number>`coalesce(sum(${claims.aporteMonto}), 0)::int` }).from(claims)
    .where(and(inArray(claims.itemId, conMeta), ocupaSql(desde))).groupBy(claims.itemId)
  // el que todavía no tiene aportes va en cero (se le puede mostrar, y no hay nada): no es lo mismo que no mostrárselo
  return new Map([...conMeta.map((id) => [id, 0] as const), ...filas.map((f) => [f.itemId, juntadoAprox(Number(f.total))] as const)])
}

function paraRegalador(list: typeof lists.$inferSelect, duenos: Dueno[]): ListaRegalador {
  const nombres = duenos.map((d) => d.nombre)
  const grupo = list.tipo === 'grupo'
  return {
    listId: list.id, ownerNombre: juntarNombres(nombres), duenos: nombres, perfiles: duenos, grupoNombre: grupo ? list.nombre ?? 'Lista en común' : null,
    grupoFoto: grupo ? list.fotoUrl : null, relacion: grupo ? relacionDeLista(duenos) : null, ocasion: ocasionDeLista(list),
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
  const sinNombres = sinNombresPara(list, viewer)
  const [claimMap, juntado] = await Promise.all([
    loadClaimViews(db, list.id, activos, viewer, sinNombres), juntadoDeAportes(db, list.id, activos, viewer, sinNombres),
  ])
  return {
    role: 'giver', sinNombres, shareToken, ...paraRegalador(list, duenos),
    items: activos.map((i) => toGiverView(pickItemFields(i), claimMap.get(i.id) ?? [], juntado.get(i.id) ?? null)),
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

/**
 * "Solo con cuenta se ve quién reservó", de la lista personal o de una en común (cualquiera de sus dueños): prendida,
 * quien entra sin cuenta ve qué está ocupado pero no por quién (ver sinNombresPara). Devuelve si se guardó.
 */
export async function guardarNombresSoloConCuenta(db: Db, listId: string, userId: string, prendida: boolean): Promise<boolean> {
  if (!esUuid(listId)) return false
  const cambiadas = await db.update(lists).set({ nombresSoloConCuenta: prendida })
    .where(and(eq(lists.id, listId), esDuenoSql(db, userId))).returning({ id: lists.id })
  return cambiadas.length > 0
}

/** Si la lista muestra quién reservó solo a los que entran con cuenta (para el ajuste, en Mi lista y en la lista en común). */
export async function nombresSoloConCuenta(db: Db, listId: string): Promise<boolean> {
  const [lista] = await db.select({ prendida: lists.nombresSoloConCuenta }).from(lists).where(eq(lists.id, listId))
  return lista?.prendida ?? false
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
    /** sinNombres: ve qué está ocupado pero no por quién (ver sinNombresPara): sin el hilo ni los regalos grupales. */
    role: 'giver'; sinNombres: boolean; item: GiverItemView; comments: CommentView[]; regalos: RegaloView[]
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
  const sinNombres = sinNombresPara(row.list, viewer)
  const [claimMap, regalos, vencida, juntado] = await Promise.all([
    loadClaimViews(db, row.list.id, [row.item], viewer, sinNombres),
    sinNombres ? [] : regalosDeItem(db, itemId, viewer), miReservaVencida(db, itemId, viewer),
    juntadoDeAportes(db, row.list.id, [row.item], viewer, sinNombres),
  ])
  const itemClaims = claimMap.get(itemId) ?? []
  return {
    role: 'giver', sinNombres, ...paraRegalador(row.list, duenos),
    item: toGiverView(pickItemFields(row.item), itemClaims, juntado.get(itemId) ?? null),
    regalos,
    miVencida: itemClaims.some((c) => c.esMia) || regalos.some((r) => r.soyParte) ? null : vencida,
    comments: sinNombres ? [] : await comentariosDe(db, itemId),
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
