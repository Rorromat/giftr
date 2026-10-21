import { and, asc, eq, gt, inArray, isNull, notInArray, or } from 'drizzle-orm'
import { claims, codazos, comments, guestIdentities, items, listFollows, lists, notifications, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { NOMBRE_INVITADO_MAXIMO, type Viewer } from '@/lib/types'
import { esOFueDuenoSql } from '@/lib/groups'
import { desdeQueOcupa, loQueYaTiene } from '@/lib/claims'
import { dijoQueNoEs, leerCuentas, leerInvitado } from '@/lib/cookie-invitado'

export type NombreValidado = { ok: true; nombre: string } | { ok: false; motivo: 'vacio' | 'largo'; error: string }

/** El nombre de un invitado: recortado, sin espacios de más, no vacío y de hasta 60 caracteres. */
export function validarNombre(valor: unknown): NombreValidado {
  const nombre = typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : ''
  if (!nombre) return { ok: false, motivo: 'vacio', error: 'Poné tu nombre así los demás saben quién sos.' }
  // por caracteres de verdad: un emoji cuenta como uno
  if ([...nombre].length > NOMBRE_INVITADO_MAXIMO) {
    return { ok: false, motivo: 'largo', error: `Tu nombre puede tener hasta ${NOMBRE_INVITADO_MAXIMO} letras.` }
  }
  return { ok: true, nombre }
}

/** Anota un invitado. El nombre tiene que venir validado (validarNombre). */
export async function createGuest(db: Db, nombre: string) {
  const v = validarNombre(nombre)
  if (!v.ok) throw new Error(`Nombre de invitado inválido: ${v.motivo}`)
  const [g] = await db.insert(guestIdentities).values({ nombre: v.nombre }).returning({ id: guestIdentities.id })
  return g
}

/**
 * Quién es un visitante sin sesión según sus cookies: el invitado, solo si su cookie está bien firmada y el invitado
 * existe (una base restaurada) y no se unió a una cuenta; si no, es alguien sin identificar. Con eso van las cuentas que
 * tuvieron sesión en este navegador: en sus listas no ve la capa oculta (ver accesoALista).
 */
export async function viewerDeCookie(db: Db, valor: string | undefined, valorCuentas?: string): Promise<Viewer> {
  const g = await invitadoDeCookie(db, valor)
  return viewerSinSesion(g?.id, valorCuentas)
}

/** El que mira sin sesión, con el invitado ya verificado (si hay) y las cuentas de la cookie. */
export function viewerSinSesion(guestId: string | undefined, valorCuentas: string | undefined): Viewer {
  const cuentas = leerCuentas(valorCuentas)
  return { ...(guestId && { guestId }), ...(cuentas.length && { cuentas }) }
}

async function invitadoDeCookie(db: Db, valor: string | undefined) {
  const guestId = leerInvitado(valor)
  if (!guestId) return null
  const [g] = await db.select({ id: guestIdentities.id, nombre: guestIdentities.nombre }).from(guestIdentities)
    .where(and(eq(guestIdentities.id, guestId), isNull(guestIdentities.promotedToUserId)))
  return g ?? null
}

/**
 * Con sesión, el invitado que quedó anotado en este navegador y todavía no se unió a ninguna cuenta: a esa cuenta
 * se le pregunta si es ella (null si no hay o si ya dijo que no). En un dispositivo compartido puede ser otra persona,
 * así que nunca se une solo. No mira qué reservó: la pregunta es la misma para todos (al dueño no le cuenta nada).
 */
export async function invitadoParaUnir(db: Db, userId: string, cookieInvitado: string | undefined, cookieNoSoy: string | undefined) {
  const g = await invitadoDeCookie(db, cookieInvitado)
  return g && !dijoQueNoEs(cookieNoSoy, g.id, userId) ? { nombre: g.nombre } : null
}

/** El nombre del invitado anotado en este navegador que todavía no se unió a ninguna cuenta, aunque ya hayan dicho que no. */
export async function nombreDelInvitado(db: Db, cookieInvitado: string | undefined): Promise<string | null> {
  return (await invitadoDeCookie(db, cookieInvitado))?.nombre ?? null
}

/** Cómo se llama el que mira (para el codazo y para "¿No sos X?"). */
export async function nombreDeViewer(db: Db, viewer: Viewer): Promise<string | null> {
  const [fila] = viewer.userId
    ? await db.select({ nombre: users.nombre }).from(users).where(eq(users.id, viewer.userId))
    : viewer.guestId ? await db.select({ nombre: guestIdentities.nombre }).from(guestIdentities).where(eq(guestIdentities.id, viewer.guestId)) : []
  return fila?.nombre ?? null
}

/**
 * Entró con Google en un navegador donde era invitado y confirmó que es esa persona ("Sí, soy yo"):
 * sus reservas, comentarios, avisos y codazos pasan a la cuenta, todo junto o nada, y las listas donde reservaba
 * pasan a ser de su gente (como si las hubiera abierto con sesión), salvo las que cambiaron el link después.
 * Lo que hizo sobre listas de las que la cuenta es (o fue) dueña o co-dueña queda a nombre del invitado: nadie puede terminar
 * con reservas de sus propios deseos ni enterarse por un aviso. Lo que reservó ahí sin comprar se libera: unido y sin
 * cookie, nadie más lo podría liberar ni marcar comprado, y les trabaría el deseo a los que regalan de verdad
 * (al dueño no le cambia nada de lo que ve).
 * Una reserva por persona y por deseo, como al reservar: si la cuenta ya tiene algo de ese deseo, la reservada del
 * invitado se libera y la comprada queda a nombre del invitado (fue una compra de verdad y tiene que seguir contando).
 * Devuelve false si el invitado no existe o ya se había unido a una cuenta.
 */
export async function unirInvitadoACuenta(db: Db, guestId: string, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // marcarlo primero también lo bloquea: dos entradas a la vez no lo unen dos veces
    const [g] = await t.update(guestIdentities).set({ promotedToUserId: userId })
      .where(and(eq(guestIdentities.id, guestId), isNull(guestIdentities.promotedToUserId)))
      .returning({ id: guestIdentities.id })
    if (!g) return false
    const propias = t.select({ id: lists.id }).from(lists).where(esOFueDuenoSql(t, userId))
    const deseosPropios = t.select({ id: items.id }).from(items).where(inArray(items.listId, propias))
    const delInvitado = and(eq(claims.claimerGuestId, guestId), notInArray(claims.itemId, deseosPropios))

    await t.update(claims).set({ estado: 'liberado', updatedAt: new Date() })
      .where(and(eq(claims.claimerGuestId, guestId), eq(claims.estado, 'reservado'), inArray(claims.itemId, deseosPropios)))

    // si después cambiaron el link para regalar, lo reservado antes no le pasa el nuevo: puede ser justo a quien se lo sacaron.
    // Esas listas, FOR SHARE antes de leer cuándo lo cambiaron (como en seguirLista): un cambio en curso termina antes y
    // esto ve la hora nueva, o espera a que esto termine y su DELETE también se lleva lo que se anota acá.
    const listasDelInvitado = t.select({ id: items.listId }).from(claims).innerJoin(items, eq(claims.itemId, items.id)).where(delInvitado)
    await t.select({ id: lists.id }).from(lists).where(inArray(lists.id, listasDelInvitado)).for('share')
    const dondeReservaba = await t.selectDistinct({ listId: items.listId }).from(claims)
      .innerJoin(items, eq(claims.itemId, items.id)).innerJoin(lists, eq(items.listId, lists.id))
      .where(and(delInvitado, or(isNull(lists.shareTokenAt), gt(claims.createdAt, lists.shareTokenAt))))
    if (dondeReservaba.length) {
      await t.insert(listFollows).values(dondeReservaba.map((l) => ({ userId, listId: l.listId }))).onConflictDoNothing()
    }

    // Lo que la cuenta ya tiene, con la misma regla que reservar (loQueYaTiene): también estar sumada a un regalo grupal, y
    // en una idea que se puede repetir solo lo de este evento (las medias del cumple pasado no le sacan las de este).
    // Una por una, lo comprado primero: si por un doble toque de antes el invitado tenía dos del mismo deseo, la primera
    // pasa y para la otra la cuenta ya lo tiene.
    const activas = await t.select({
      id: claims.id, estado: claims.estado, updatedAt: claims.updatedAt,
      deseo: { id: items.id, listId: items.listId, tipo: items.tipo, repetible: items.repetible },
    }).from(claims).innerJoin(items, eq(claims.itemId, items.id))
      .where(and(delInvitado, inArray(claims.estado, ['reservado', 'comprado'])))
      .orderBy(asc(claims.estado), asc(claims.createdAt))
    const pasar = (id: string) => t.update(claims).set({ claimerUserId: userId, claimerGuestId: null }).where(eq(claims.id, id))
    for (const c of activas) {
      if (!(await loQueYaTiene(t, c.deseo, { userId }))) await pasar(c.id)
      else if (c.estado === 'reservado') await t.update(claims).set({ estado: 'liberado', updatedAt: new Date() }).where(eq(claims.id, c.id))
      else {
        // una compra de un evento anterior ya no ocupa: es historial, y pasa
        const desde = await desdeQueOcupa(t, c.deseo)
        if (desde && c.updatedAt < desde) await pasar(c.id)
      }
    }
    await t.update(claims).set({ claimerUserId: userId, claimerGuestId: null })
      .where(and(delInvitado, notInArray(claims.estado, ['reservado', 'comprado'])))

    await t.update(comments).set({ authorUserId: userId, authorGuestId: null })
      .where(and(eq(comments.authorGuestId, guestId), notInArray(comments.itemId, deseosPropios)))
    await t.update(notifications).set({ userId, guestId: null })
      .where(and(eq(notifications.guestId, guestId), notInArray(notifications.itemId, deseosPropios)))
    await t.update(codazos).set({ deUserId: userId, deGuestId: null })
      .where(and(eq(codazos.deGuestId, guestId), notInArray(codazos.listId, propias)))
    return true
  })
}
