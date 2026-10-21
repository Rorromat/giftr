import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm'
import { claims, codazos, comments, guestIdentities, items, lists, notifications, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { NOMBRE_INVITADO_MAXIMO, type Viewer } from '@/lib/types'
import { esDuenoSql } from '@/lib/groups'
import { leerInvitado } from '@/lib/cookie-invitado'

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
 * Quién es un visitante sin sesión según su cookie: solo si está bien firmada y el invitado existe
 * (una base restaurada) y no se unió a una cuenta. Si no, es alguien sin identificar.
 */
export async function viewerDeCookie(db: Db, valor: string | undefined): Promise<Viewer> {
  const guestId = leerInvitado(valor)
  if (!guestId) return {}
  const [g] = await db.select({ id: guestIdentities.id }).from(guestIdentities)
    .where(and(eq(guestIdentities.id, guestId), isNull(guestIdentities.promotedToUserId)))
  return g ? { guestId: g.id } : {}
}

/** Cómo se llama el que mira (para el codazo y para "¿No sos X?"). */
export async function nombreDeViewer(db: Db, viewer: Viewer): Promise<string | null> {
  const [fila] = viewer.userId
    ? await db.select({ nombre: users.nombre }).from(users).where(eq(users.id, viewer.userId))
    : viewer.guestId ? await db.select({ nombre: guestIdentities.nombre }).from(guestIdentities).where(eq(guestIdentities.id, viewer.guestId)) : []
  return fila?.nombre ?? null
}

/**
 * Entró con Google en un navegador donde era invitado (la cookie firmada prueba que es la misma persona):
 * sus reservas, comentarios, avisos y codazos pasan a la cuenta, todo junto o nada.
 * Lo que hizo sobre listas de las que la cuenta es dueña o co-dueña queda a nombre del invitado, sin tocar:
 * en un dispositivo compartido nadie puede terminar con reservas de sus propios deseos ni enterarse por un aviso.
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
    const propias = t.select({ id: lists.id }).from(lists).where(esDuenoSql(t, userId))
    const deseosPropios = t.select({ id: items.id }).from(items).where(inArray(items.listId, propias))
    await t.update(claims).set({ claimerUserId: userId, claimerGuestId: null })
      .where(and(eq(claims.claimerGuestId, guestId), notInArray(claims.itemId, deseosPropios)))
    await t.update(comments).set({ authorUserId: userId, authorGuestId: null })
      .where(and(eq(comments.authorGuestId, guestId), notInArray(comments.itemId, deseosPropios)))
    await t.update(notifications).set({ userId, guestId: null })
      .where(and(eq(notifications.guestId, guestId), notInArray(notifications.itemId, deseosPropios)))
    await t.update(codazos).set({ deUserId: userId, deGuestId: null })
      .where(and(eq(codazos.deGuestId, guestId), notInArray(codazos.listId, propias)))
    return true
  })
}
