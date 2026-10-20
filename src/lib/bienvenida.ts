import { eq, inArray } from 'drizzle-orm'
import { lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { duenosDeLista } from '@/lib/groups'
import { seccionesDeGustos, type Gustos, type SeccionGustos } from '@/lib/gustos'

/** La primera vez que entra (o si nunca pasó por la bienvenida) le mostramos los pasos. */
export async function necesitaBienvenida(db: Db, userId: string): Promise<boolean> {
  const [u] = await db.select({ at: users.bienvenidaAt }).from(users).where(eq(users.id, userId))
  return !!u && !u.at
}

export async function misGustos(db: Db, userId: string): Promise<Gustos | null> {
  const [u] = await db.select({ gustos: users.gustos }).from(users).where(eq(users.id, userId))
  return u?.gustos ?? null
}

/** Guarda los gustos (ya sanitizados) y da la bienvenida por hecha. */
export async function guardarGustos(db: Db, userId: string, gustos: Gustos) {
  await db.update(users).set({ gustos, bienvenidaAt: new Date() }).where(eq(users.id, userId))
}

/** "Más tarde": no se la volvemos a mostrar sola; los gustos quedan como estaban. */
export async function saltearBienvenida(db: Db, userId: string) {
  await db.update(users).set({ bienvenidaAt: new Date() }).where(eq(users.id, userId))
}

export type GustosDeDueno = { nombre: string; secciones: SeccionGustos[] }

/** Para quien regala: los gustos de los dueños de la lista que los cargaron (en un grupo, de cada uno). */
export async function gustosDeLista(db: Db, listId: string): Promise<GustosDeDueno[]> {
  const [list] = await db.select({ id: lists.id, ownerId: lists.ownerId }).from(lists).where(eq(lists.id, listId))
  if (!list) return []
  const duenos = await duenosDeLista(db, list)
  if (!duenos.length) return []
  const filas = await db.select({ id: users.id, gustos: users.gustos }).from(users).where(inArray(users.id, duenos.map((d) => d.id)))
  return duenos
    .map((d) => ({ nombre: d.nombre, secciones: seccionesDeGustos(filas.find((f) => f.id === d.id)?.gustos ?? null) }))
    .filter((d) => d.secciones.length)
}
