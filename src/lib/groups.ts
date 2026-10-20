import { randomBytes } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, ne, notInArray, or } from 'drizzle-orm'
import { items, listMembers, lists, users } from '@/db/schema'
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

/** Condición SQL: el usuario es dueño de la lista (personal) o co-dueño (grupo). */
export function esDuenoSql(db: Db, userId: string) {
  return or(
    eq(lists.ownerId, userId),
    inArray(lists.id, db.select({ id: listMembers.listId }).from(listMembers).where(eq(listMembers.userId, userId))),
  )!
}

/** Lo contrario de esDuenoSql, sin el NULL de owner_id vacío en los grupos (NOT NULL descartaría la fila). */
export function noEsDuenoSql(db: Db, userId: string) {
  return and(
    or(isNull(lists.ownerId), ne(lists.ownerId, userId)),
    notInArray(lists.id, db.select({ id: listMembers.listId }).from(listMembers).where(eq(listMembers.userId, userId))),
  )!
}

/** Dueños de una lista en orden: el de la lista personal, o los miembros del grupo por antigüedad. */
export async function duenosDeLista(db: Db, list: { id: string; ownerId: string | null }): Promise<Dueno[]> {
  const campos = { id: users.id, nombre: users.nombre, fotoAt: users.fotoAt, avatarUrl: users.avatarUrl }
  const filas = list.ownerId
    ? await db.select(campos).from(users).where(eq(users.id, list.ownerId))
    : await db.select(campos).from(listMembers).innerJoin(users, eq(listMembers.userId, users.id))
      .where(eq(listMembers.listId, list.id)).orderBy(asc(listMembers.createdAt))
  return filas.map((u) => ({ id: u.id, nombre: u.nombre, foto: urlFoto(u) }))
}

export async function esDuenoDeLista(db: Db, listId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: lists.id }).from(lists)
    .where(and(eq(lists.id, listId), esDuenoSql(db, userId)))
  return !!row
}

export async function crearGrupo(db: Db, userId: string, p: { nombre: string; descripcion?: string }): Promise<string> {
  return db.transaction(async (tx) => {
    const [list] = await tx.insert(lists).values({
      tipo: 'grupo', nombre: p.nombre, descripcion: p.descripcion ?? null,
      shareToken: newShareToken(), inviteToken: newInviteToken(),
    }).returning({ id: lists.id })
    await tx.insert(listMembers).values({ listId: list.id, userId })
    return list.id
  })
}

/** Solo id y nombre de los grupos del usuario (para elegir lista al agregar un deseo y arriba de Mi lista). */
export async function nombresDeMisGrupos(db: Db, userId: string) {
  const rows = await db.select({ id: lists.id, nombre: lists.nombre })
    .from(lists).innerJoin(listMembers, eq(listMembers.listId, lists.id))
    .where(and(eq(listMembers.userId, userId), eq(lists.tipo, 'grupo')))
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

/** Suma al usuario como co-dueño. Devuelve el id del grupo, o null si la invitación no existe. */
export async function unirseAGrupo(db: Db, inviteToken: string, userId: string): Promise<string | null> {
  const [list] = await db.select({ id: lists.id }).from(lists)
    .where(and(eq(lists.inviteToken, inviteToken), eq(lists.tipo, 'grupo')))
  if (!list) return null
  await db.insert(listMembers).values({ listId: list.id, userId }).onConflictDoNothing()
  return list.id
}

/** Sale del grupo. No deja al grupo sin dueños: el último no puede salir. */
export async function salirDeGrupo(db: Db, listId: string, userId: string): Promise<boolean> {
  if (!esUuid(listId)) return false
  return db.transaction(async (tx) => {
    const miembros = await tx.select({ userId: listMembers.userId }).from(listMembers)
      .where(eq(listMembers.listId, listId)).for('update')
    if (miembros.length < 2 || !miembros.some((m) => m.userId === userId)) return false
    await tx.delete(listMembers).where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)))
    return true
  })
}
