import { randomBytes } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { tipoDeAlias, validarAliasPago, type AliasValidado } from '@/lib/alias-pago'

export function newShareToken(): string {
  return randomBytes(8).toString('base64url')
}

// El invitado que usaba este navegador se une a la cuenta si, ya adentro, dice que es él (por la cookie, en
// PreguntaInvitado), no por email: el email que escribía un invitado nadie lo verificaba.
// La cuenta es la de google_id; el email se pone al día si cambió en Google. Un email que ya tenía otra cuenta no la
// traba ni la une a esa (ver users.email). El nombre también, salvo que haya elegido uno en Perfil (ver cambiarNombre).
export async function upsertUserFromGoogle(
  db: Db,
  p: { googleId: string; email: string; nombre: string; avatarUrl?: string | null },
) {
  const [user] = await db.insert(users)
    .values({ googleId: p.googleId, email: p.email, nombre: p.nombre, avatarUrl: p.avatarUrl ?? null })
    .onConflictDoUpdate({
      target: users.googleId,
      set: {
        email: p.email, avatarUrl: p.avatarUrl ?? null,
        nombre: sql`case when ${users.nombreElegidoAt} is null then excluded.nombre else ${users.nombre} end`,
      },
    })
    .returning()
  // las listas nuevas nacen mostrando quién reservó solo a los que entran con cuenta (ver sinNombresPara)
  await db.insert(lists)
    .values({ ownerId: user.id, shareToken: newShareToken(), nombresSoloConCuenta: true })
    .onConflictDoNothing({ target: lists.ownerId })
  return user
}

/**
 * La lista personal del usuario. Si le falta (un usuario de antes o un alta que se cortó a la mitad), se la crea:
 * así nadie queda rebotando entre / y /mi-lista. Null solo si el usuario no existe (una sesión de una base vieja).
 */
export async function asegurarListaPropia(db: Db, userId: string) {
  const buscar = () => db.select({ id: lists.id, shareToken: lists.shareToken }).from(lists).where(eq(lists.ownerId, userId))
  const [lista] = await buscar()
  if (lista) return lista
  if (!await existeUsuario(db, userId)) return null
  await db.insert(lists).values({ ownerId: userId, shareToken: newShareToken(), nombresSoloConCuenta: true })
    .onConflictDoNothing({ target: lists.ownerId })
  const [creada] = await buscar()
  return creada ?? null
}

/**
 * Si el usuario existe: una sesión puede ser de una base vieja (la restauraron o cambiaron de branch en Neon) o de una
 * cuenta que se borró desde otro dispositivo (ver borrarCuenta). La fila "Cuenta eliminada" no es de nadie: no cuenta.
 */
export async function existeUsuario(db: Db, userId: string): Promise<boolean> {
  const [user] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), isNull(users.eliminadaAt)))
  return !!user
}

/** La foto subida (versionada para poder cachearla para siempre), si no la de Google, si no nada (iniciales). */
export function urlFoto(u: { id: string; fotoAt: Date | null; avatarUrl: string | null }): string | null {
  return u.fotoAt ? `/foto/${u.id}?v=${u.fotoAt.getTime()}` : u.avatarUrl
}

// ---------- Alias o CVU: adónde transferirle su parte de un regalo grupal ----------
// No es parte del perfil (ni del público ni de lo que ve su gente): lo ve solo quien le debe plata, en Cuentas y en el
// aviso de la compra (ver misCuentas y avisarCompra en regalos.ts). Por eso tiene sus propias consultas y no sale en yo().

// Cómo se valida y cómo se le dice vive en alias-pago.ts, sin la base: lo usan también los campos del navegador (el
// deseo de aporte en plata lleva su propio alias, ver items.ts).
export { tipoDeAlias, validarAliasPago, type AliasValidado }

/** "Tu alias o CVU" en Perfil: lo guarda como queda en validarAliasPago, o lo borra si lo dejó vacío. */
export async function guardarAliasPago(db: Db, userId: string, escrito: unknown): Promise<AliasValidado> {
  const v = validarAliasPago(escrito)
  if (v.ok) await db.update(users).set({ aliasPago: v.alias }).where(eq(users.id, userId))
  return v
}

/** El alias propio, para Perfil y para invitarlo a cargarlo en Cuentas. El de otro nunca sale por acá: ver misCuentas. */
export async function miAliasPago(db: Db, userId: string): Promise<string | null> {
  const [u] = await db.select({ alias: users.aliasPago }).from(users).where(eq(users.id, userId))
  return u?.alias ?? null
}
