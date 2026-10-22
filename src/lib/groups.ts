import { randomBytes } from 'node:crypto'
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, ne, notInArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { claims, groupGiftMembers, groupGifts, items, listMembers, lists, notifications, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { newShareToken, urlFoto } from '@/lib/users'
import { pickItemFields } from '@/lib/serialize'
import { recienHecho } from '@/lib/repetido'
import { noEsDeRegaloGrupal } from '@/lib/claims'

// Un grupo es una lista en común ("Nuestra casa"): varios dueños, una sola lista para los que regalan.
// La regla de la sorpresa vale para todos los dueños por igual.

export type Dueno = { id: string; nombre: string; foto: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const esUuid = (s: string) => UUID.test(s)

// Los links para regalar y las invitaciones son base64url (newShareToken, newInviteToken). Lo que no lo es (/l/%00, un
// formulario armado a mano) no es de ninguna lista: se busca igual, la base rechazaba algunos (un \u0000) con un error y
// se veía la pantalla de error en vez del 404.
const TOKEN = /^[A-Za-z0-9_-]{1,64}$/
export const esToken = (s: string) => TOKEN.test(s)

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
// - esOFueDuenoSql: también el que salió del grupo (o lo sacaron). Para la sorpresa: cargó esos deseos, así que sigue sin
//   ver quién regala qué, sin reservar, comentar ni sumarse a un regalo grupal. Si no, salir, mirar y volver con la
//   invitación la arruinaría. No hay vuelta atrás a regalador: nadie sabe si la lista también era suya.

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
    // Un doble toque en "Crear grupo" no arma dos: el mismo grupo recién creado es ese (lock del usuario, por dos a la vez).
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update')
    const [repetido] = await tx.select({ id: lists.id }).from(lists).innerJoin(listMembers, eq(listMembers.listId, lists.id))
      .where(and(eq(listMembers.userId, userId), eq(lists.tipo, 'grupo'), eq(lists.nombre, p.nombre), recienHecho(lists.createdAt)))
    if (repetido) return repetido.id
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
  const otros = alias(listMembers, 'otros')
  const [duenos, rows, despues] = await Promise.all([
    duenosDeLista(db, list),
    db.select().from(items).where(eq(items.listId, list.id)).orderBy(asc(items.createdAt)),
    // los que siguen en el grupo y se sumaron después que él: a esos los puede sacar (ver sacarDelGrupo)
    db.select({ id: users.id, nombre: users.nombre }).from(listMembers)
      .innerJoin(otros, and(eq(otros.listId, listMembers.listId), gt(otros.createdAt, listMembers.createdAt), isNull(otros.salioAt)))
      .innerJoin(users, eq(otros.userId, users.id))
      .where(and(eq(listMembers.listId, list.id), eq(listMembers.userId, userId)))
      .orderBy(asc(otros.createdAt)),
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
    sacables: despues,
    items: rows.map(pickItemFields),
  }
}

/** Lo que ve alguien que abre una invitación: nombre del grupo y quiénes lo arman. */
export async function grupoPorInvitacion(db: Db, inviteToken: string) {
  if (!esToken(inviteToken)) return null
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
 *   reserva a su nombre, y se le avisa); si no queda nadie, se cancela, el deseo se libera y se les avisa a los que estaban.
 * - Lo ya comprado queda como está: son compras y deudas de verdad.
 * Lo que haya hecho como invitado (otro navegador, sin su sesión) no se puede saber: por eso los invitados de esta lista
 * vuelven a contestar "¿Es tu lista?" (ver accesoALista), y lo que reservó así vence solo.
 * Lo que quedó trabado de antes de esto lo destrabó la migración 0011_destrabar_co_duenos (la misma lógica, en SQL).
 */
export async function unirseAGrupo(db: Db, inviteToken: string, userId: string): Promise<string | null> {
  if (!esToken(inviteToken)) return null
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [list] = await t.select({ id: lists.id }).from(lists)
      .where(and(eq(lists.inviteToken, inviteToken), eq(lists.tipo, 'grupo')))
    if (!list) return null
    const [antes] = await t.select({ salioAt: listMembers.salioAt }).from(listMembers)
      .where(and(eq(listMembers.listId, list.id), eq(listMembers.userId, userId)))
    if (antes && !antes.salioAt) return list.id
    // unido_at, también al volver (con la hora de la base, la de listas_de_invitado): lo que un invitado haya dicho antes
    // de esta lista ya no vale, puede ser este mismo desde otro navegador (ver accesoALista)
    await t.insert(listMembers).values({ listId: list.id, userId })
      .onConflictDoUpdate({ target: [listMembers.listId, listMembers.userId], set: { salioAt: null, unidoAt: sql`now()` } })
    // Lock de los deseos, el mismo que toman reserveItem, iniciarRegaloGrupal y sumarseARegalo: si llega una reserva o un
    // regalo a la vez, o espera y después ve que ya es dueño, o se confirma antes y lo de abajo lo encuentra.
    // Siempre en el mismo orden, así dos que se unen a la vez no se traban entre ellos.
    await t.select({ id: items.id }).from(items).where(eq(items.listId, list.id)).orderBy(asc(items.id)).for('update')
    await soltarLoQueRegalaba(t, list.id, userId)
    return list.id
  })
}

async function soltarLoQueRegalaba(t: Db, listId: string, userId: string) {
  const ahora = new Date()
  // subconsultas, no los ids de arriba: también entra un deseo que se cargó y reservó en este mismo instante
  const deseos = t.select({ id: items.id }).from(items).where(eq(items.listId, listId))
  const duenos = t.select({ id: listMembers.userId }).from(listMembers).where(eq(listMembers.listId, listId))
  await t.update(claims).set({ estado: 'liberado', updatedAt: ahora })
    .where(and(eq(claims.claimerUserId, userId), eq(claims.estado, 'reservado'), inArray(claims.itemId, deseos),
      noEsDeRegaloGrupal()))

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
        notInArray(groupGiftMembers.userId, duenos),
        notInArray(groupGiftMembers.userId, t.select({ id: claims.claimerUserId }).from(claims).where(and(
          eq(claims.itemId, g.itemId), inArray(claims.estado, ['reservado', 'comprado']), isNotNull(claims.claimerUserId)))),
      ))
      .orderBy(asc(groupGiftMembers.createdAt)).limit(1)
      .for('update')
    if (siguiente) {
      await t.update(groupGifts).set({ organizerUserId: siguiente.userId }).where(eq(groupGifts.id, g.id))
      await t.update(claims).set({ claimerUserId: siguiente.userId, updatedAt: ahora }).where(eq(claims.id, g.claimId))
      // si no se entera, el regalo queda quieto hasta que entre a Cuentas
      await t.insert(notifications).values({ userId: siguiente.userId, tipo: 'regalo_encargo', itemId: g.itemId })
    } else {
      await t.update(groupGifts).set({ estado: 'cancelado' }).where(eq(groupGifts.id, g.id))
      await t.update(claims).set({ estado: 'liberado', updatedAt: ahora }).where(eq(claims.id, g.claimId))
      // Los que quedan (los que tienen su propia reserva de este deseo) se enteran: si no, el regalo les desaparece de
      // "En curso" sin explicación. No se dice por qué: es cosa de quien se unió.
      const quedan = await t.select({ userId: groupGiftMembers.userId }).from(groupGiftMembers)
        .where(and(eq(groupGiftMembers.giftId, g.id), notInArray(groupGiftMembers.userId, duenos)))
      if (quedan.length) {
        await t.insert(notifications).values(quedan.map((q) => ({ userId: q.userId, tipo: 'regalo_cancelado' as const, itemId: g.itemId })))
      }
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

/**
 * "Se sumó por error" (o con una invitación que circuló de más): un dueño saca a alguien que se sumó después que él.
 * Queda como uno que salió (salio_at): deja de editar y sigue sin ver la capa oculta, porque no hay forma de saber si
 * cargó deseos o si la lista también es suya. Devolverlo a regalador sería otro camino para mirar lo reservado.
 * La invitación cambia en el mismo paso, así no vuelve a sumarse con la de antes. Solo a los que llegaron después: el
 * que entró con una invitación que circuló de más no puede sacar a los que armaron la lista.
 */
export async function sacarDelGrupo(db: Db, listId: string, actorId: string, userId: string): Promise<boolean> {
  if (!esUuid(listId) || !esUuid(userId) || actorId === userId) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const otro = alias(listMembers, 'otro')
    // bloquea las dos filas: si a la vez el otro sale o vuelve con la invitación, uno espera al otro
    const [fila] = await t.select({ id: otro.userId }).from(listMembers)
      .innerJoin(otro, and(eq(otro.listId, listMembers.listId), eq(otro.userId, userId), gt(otro.createdAt, listMembers.createdAt),
        isNull(otro.salioAt)))
      .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, actorId), isNull(listMembers.salioAt)))
      .for('update')
    if (!fila) return false
    await t.update(listMembers).set({ salioAt: new Date() })
      .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)))
    await t.update(lists).set({ inviteToken: newInviteToken() }).where(eq(lists.id, listId))
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
