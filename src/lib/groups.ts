import { randomBytes } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, notInArray, or } from 'drizzle-orm'
import { claims, groupGiftMembers, groupGifts, items, listMembers, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { newShareToken, urlFoto } from '@/lib/users'
import { pickItemFields } from '@/lib/serialize'

// Un grupo es una lista en común ("Nuestra casa"): varios dueños, una sola lista para los que regalan.
// La regla de la sorpresa vale para todos los dueños por igual.

export type Dueno = { id: string; nombre: string; foto: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const esUuid = (s: string) => UUID.test(s)

// El invite_token da permisos de dueño, así que es más largo que el link para regalar.
export function newInviteToken(): string {
  return randomBytes(16).toString('base64url')
}

/** "Delfina", "Delfina y Martín", "Ana, Delfina y Martín" */
export function juntarNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`
}

// Ser dueño de una lista son dos preguntas distintas:
// - esDuenoSql: dueño hoy (el de la lista personal o un co-dueño activo del grupo). Para editar, ver el grupo y figurar
//   como dueño ante los que regalan.
// - esOFueDuenoSql: también el que salió del grupo. Para la sorpresa: cargó esos deseos, así que sigue sin ver quién regala
//   qué, sin reservar, comentar ni sumarse a un regalo grupal. Si no, salir, mirar y volver con la invitación la arruinaría.

const gruposDe = (db: Db, userId: string, soloActivos: boolean) => db.select({ id: listMembers.listId }).from(listMembers)
  .where(soloActivos ? and(eq(listMembers.userId, userId), isNull(listMembers.salioAt)) : eq(listMembers.userId, userId))

/** Condición SQL: el usuario es dueño de la lista (personal) o co-dueño activo (grupo). */
export function esDuenoSql(db: Db, userId: string) {
  return or(eq(lists.ownerId, userId), inArray(lists.id, gruposDe(db, userId, true)))!
}

/** Condición SQL: es dueño o co-dueño, o lo fue y salió del grupo (para todo lo de la capa oculta). */
export function esOFueDuenoSql(db: Db, userId: string) {
  return or(eq(lists.ownerId, userId), inArray(lists.id, gruposDe(db, userId, false)))!
}

/** Lo contrario de esOFueDuenoSql, sin el NULL de owner_id vacío en los grupos (NOT NULL descartaría la fila). */
export function noEsNiFueDuenoSql(db: Db, userId: string) {
  return and(or(isNull(lists.ownerId), ne(lists.ownerId, userId)), notInArray(lists.id, gruposDe(db, userId, false)))!
}

/** Dueños de una lista en orden: el de la lista personal, o los co-dueños activos del grupo por antigüedad. */
export async function duenosDeLista(db: Db, list: { id: string; ownerId: string | null }): Promise<Dueno[]> {
  const campos = { id: users.id, nombre: users.nombre, fotoAt: users.fotoAt, avatarUrl: users.avatarUrl }
  const filas = list.ownerId
    ? await db.select(campos).from(users).where(eq(users.id, list.ownerId))
    : await db.select(campos).from(listMembers).innerJoin(users, eq(listMembers.userId, users.id))
      .where(and(eq(listMembers.listId, list.id), isNull(listMembers.salioAt))).orderBy(asc(listMembers.createdAt))
  return filas.map((u) => ({ id: u.id, nombre: u.nombre, foto: urlFoto(u) }))
}

/** 'dueno' si hoy es dueño o co-dueño, 'ex' si salió del grupo, null si la lista no es ni fue suya. */
export async function relacionConLista(db: Db, listId: string, userId: string): Promise<'dueno' | 'ex' | null> {
  const [row] = await db.select({ ownerId: lists.ownerId, miembro: listMembers.userId, salioAt: listMembers.salioAt })
    .from(lists).leftJoin(listMembers, and(eq(listMembers.listId, lists.id), eq(listMembers.userId, userId)))
    .where(eq(lists.id, listId))
  if (!row) return null
  if (row.ownerId === userId || (row.miembro && !row.salioAt)) return 'dueno'
  return row.miembro ? 'ex' : null
}

export async function esOFueDuenoDeLista(db: Db, listId: string, userId: string): Promise<boolean> {
  return (await relacionConLista(db, listId, userId)) !== null
}

// La fecha de un grupo: tiene que existir (nada de 30 de febrero, que Postgres rechaza) y tener un año razonable.
export const ANIO_MINIMO = 1900
export const ANIO_MAXIMO = 2100

/** 'YYYY-MM-DD' que existe de verdad, entre 1900 y 2100. */
export function fechaDeGrupoValida(fecha: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  if (!m) return false
  const [y, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const f = new Date(Date.UTC(y, mes - 1, dia))
  return y >= ANIO_MINIMO && y <= ANIO_MAXIMO && f.getUTCFullYear() === y && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia
}

/** Crea el grupo con el usuario de dueño. La fecha va en el mismo alta (una que no existe no se guarda). */
export async function crearGrupo(
  db: Db, userId: string,
  p: { nombre: string; descripcion?: string; eventoFecha?: string | null; eventoAnual?: boolean },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [list] = await tx.insert(lists).values({
      tipo: 'grupo', nombre: p.nombre, descripcion: p.descripcion ?? null,
      shareToken: newShareToken(), inviteToken: newInviteToken(),
      eventoFecha: p.eventoFecha && fechaDeGrupoValida(p.eventoFecha) ? p.eventoFecha : null,
      eventoAnual: p.eventoAnual ?? true,
    }).returning({ id: lists.id })
    await tx.insert(listMembers).values({ listId: list.id, userId })
    return list.id
  })
}

/** Solo id y nombre de los grupos del usuario (para elegir lista al agregar un deseo y arriba de Mi lista). */
export async function nombresDeMisGrupos(db: Db, userId: string) {
  const rows = await db.select({ id: lists.id, nombre: lists.nombre })
    .from(lists).innerJoin(listMembers, eq(listMembers.listId, lists.id))
    .where(and(eq(listMembers.userId, userId), isNull(listMembers.salioAt), eq(lists.tipo, 'grupo')))
    .orderBy(desc(lists.createdAt))
  return rows.map((r) => ({ id: r.id, nombre: r.nombre ?? 'Grupo' }))
}

/** El grupo visto por uno de sus dueños (nunca incluye reservas ni comentarios). Null si no es dueño. */
export async function grupoParaDueno(db: Db, listId: string, userId: string) {
  if (!esUuid(listId)) return null
  const [list] = await db.select().from(lists)
    .where(and(eq(lists.id, listId), eq(lists.tipo, 'grupo'), esDuenoSql(db, userId)))
  if (!list) return null
  const [duenos, rows] = await Promise.all([
    duenosDeLista(db, list),
    db.select().from(items).where(eq(items.listId, list.id)).orderBy(asc(items.createdAt)),
  ])
  return {
    id: list.id,
    nombre: list.nombre ?? 'Grupo',
    descripcion: list.descripcion,
    eventoFecha: list.eventoFecha,
    eventoAnual: list.eventoAnual,
    shareToken: list.shareToken,
    inviteToken: list.inviteToken!,
    duenos,
    items: rows.map(pickItemFields),
  }
}

/** Lo que ve alguien que abre una invitación: nombre del grupo y quiénes lo arman. */
export async function grupoPorInvitacion(db: Db, inviteToken: string) {
  const [list] = await db.select().from(lists)
    .where(and(eq(lists.inviteToken, inviteToken), eq(lists.tipo, 'grupo')))
  if (!list) return null
  return { id: list.id, nombre: list.nombre ?? 'Grupo', descripcion: list.descripcion, duenos: await duenosDeLista(db, list) }
}

/**
 * Suma al usuario como co-dueño, o vuelve a activar al que había salido. Devuelve el id del grupo, o null si la
 * invitación no existe.
 * Lo que tenía como regalador en esta lista se resuelve en la misma transacción: desde ahora es dueño y no lo ve más
 * (el deseo lo manda al grupo, Cuentas lo esconde), así que si quedara les trabaría el deseo a los que regalan.
 * - Sus reservas sin comprar se liberan.
 * - De los regalos grupales abiertos se baja. Si organizaba uno, pasa al que se sumó primero de los que quedan (con la
 *   reserva a su nombre); si no queda nadie, se cancela y el deseo se libera.
 * - Lo ya comprado queda como está: son compras y deudas de verdad.
 */
export async function unirseAGrupo(db: Db, inviteToken: string, userId: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [list] = await t.select({ id: lists.id }).from(lists)
      .where(and(eq(lists.inviteToken, inviteToken), eq(lists.tipo, 'grupo')))
    if (!list) return null
    const [antes] = await t.select({ salioAt: listMembers.salioAt }).from(listMembers)
      .where(and(eq(listMembers.listId, list.id), eq(listMembers.userId, userId)))
    if (antes && !antes.salioAt) return list.id
    await t.insert(listMembers).values({ listId: list.id, userId })
      .onConflictDoUpdate({ target: [listMembers.listId, listMembers.userId], set: { salioAt: null } })
    // Lock de los deseos, como reserveItem: una reserva que llega a la vez espera y después ve que ya es dueño
    // (siempre en el mismo orden, así dos que se unen a la vez no se traban entre ellos).
    const deseos = (await t.select({ id: items.id }).from(items).where(eq(items.listId, list.id))
      .orderBy(asc(items.id)).for('update')).map((d) => d.id)
    if (deseos.length) await soltarLoQueRegalaba(t, list.id, deseos, userId)
    return list.id
  })
}

async function soltarLoQueRegalaba(t: Db, listId: string, deseos: string[], userId: string) {
  const ahora = new Date()
  await t.update(claims).set({ estado: 'liberado', updatedAt: ahora })
    .where(and(eq(claims.claimerUserId, userId), eq(claims.estado, 'reservado'), inArray(claims.itemId, deseos),
      notInArray(claims.id, t.select({ id: groupGifts.claimId }).from(groupGifts))))

  const regalos = await t.select({ id: groupGifts.id, itemId: groupGifts.itemId, claimId: groupGifts.claimId, encargado: groupGifts.organizerUserId })
    .from(groupGifts)
    .where(and(inArray(groupGifts.itemId, deseos), eq(groupGifts.estado, 'abierto'), or(
      eq(groupGifts.organizerUserId, userId),
      inArray(groupGifts.id, t.select({ id: groupGiftMembers.giftId }).from(groupGiftMembers).where(eq(groupGiftMembers.userId, userId))),
    )))
    .for('update')
  for (const g of regalos) {
    await t.delete(groupGiftMembers).where(and(eq(groupGiftMembers.giftId, g.id), eq(groupGiftMembers.userId, userId)))
    if (g.encargado !== userId) continue
    // El que se sumó primero, salvo otro que es (o fue) dueño de esta lista, que tampoco lo vería, y uno que ya tiene su
    // propia reserva o compra de este deseo (una persona, una reserva por deseo).
    const [siguiente] = await t.select({ userId: groupGiftMembers.userId }).from(groupGiftMembers)
      .where(and(
        eq(groupGiftMembers.giftId, g.id),
        notInArray(groupGiftMembers.userId, t.select({ id: listMembers.userId }).from(listMembers).where(eq(listMembers.listId, listId))),
        notInArray(groupGiftMembers.userId, t.select({ id: claims.claimerUserId }).from(claims).where(and(
          eq(claims.itemId, g.itemId), inArray(claims.estado, ['reservado', 'comprado']), isNotNull(claims.claimerUserId)))),
      ))
      .orderBy(asc(groupGiftMembers.createdAt)).limit(1)
    if (siguiente) {
      await t.update(groupGifts).set({ organizerUserId: siguiente.userId }).where(eq(groupGifts.id, g.id))
      await t.update(claims).set({ claimerUserId: siguiente.userId, updatedAt: ahora }).where(eq(claims.id, g.claimId))
    } else {
      await t.update(groupGifts).set({ estado: 'cancelado' }).where(eq(groupGifts.id, g.id))
      await t.update(claims).set({ estado: 'liberado', updatedAt: ahora }).where(eq(claims.id, g.claimId))
    }
  }
}

/**
 * Sale del grupo: deja de editar y de figurar como dueño, pero la fila queda (salio_at) y sigue sin ver la capa oculta
 * de esta lista (ver esOFueDuenoSql). No deja al grupo sin dueños: el último no puede salir.
 */
export async function salirDeGrupo(db: Db, listId: string, userId: string): Promise<boolean> {
  if (!esUuid(listId)) return false
  return db.transaction(async (tx) => {
    const miembros = await tx.select({ userId: listMembers.userId }).from(listMembers)
      .where(and(eq(listMembers.listId, listId), isNull(listMembers.salioAt))).for('update')
    if (miembros.length < 2 || !miembros.some((m) => m.userId === userId)) return false
    await tx.update(listMembers).set({ salioAt: new Date() })
      .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)))
    return true
  })
}

/** Un link de invitación nuevo: el anterior deja de servir. Solo un dueño del grupo. Devuelve el token nuevo, o null. */
export async function nuevaInvitacion(db: Db, listId: string, userId: string): Promise<string | null> {
  if (!esUuid(listId)) return null
  const [list] = await db.update(lists).set({ inviteToken: newInviteToken() })
    .where(and(eq(lists.id, listId), eq(lists.tipo, 'grupo'), esDuenoSql(db, userId)))
    .returning({ inviteToken: lists.inviteToken })
  return list?.inviteToken ?? null
}
