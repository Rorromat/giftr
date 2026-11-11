import { eq, inArray, sql } from 'drizzle-orm'
import { items, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { duenosDeLista } from '@/lib/groups'
import { bloquesDeGustos, PASOS_GUSTOS, seccionesDeGustos, type BloqueGustos, type Gustos, type PasoGustos, type SeccionGustos } from '@/lib/gustos'

// La bienvenida es una sola pantalla (su cumple, o "Ahora no") y de ahí va a anotar su primer deseo y a compartir la lista,
// que es para lo que vino. Antes eran ocho pasos de gustos, el pedido de avisos y un resumen: diez pantallas antes del
// primer deseo. Los gustos se cuentan después, desde la tarjeta de Mi lista (ver gustosPorContar) o desde Perfil.

/** La primera vez que entra (o si nunca pasó por la bienvenida) le mostramos la pantalla de bienvenida. */
export async function necesitaBienvenida(db: Db, userId: string): Promise<boolean> {
  const [u] = await db.select({ at: users.bienvenidaAt }).from(users).where(eq(users.id, userId))
  return !!u && !u.at
}

export async function misGustos(db: Db, userId: string): Promise<Gustos | null> {
  const [u] = await db.select({ gustos: users.gustos }).from(users).where(eq(users.id, userId))
  return u?.gustos ?? null
}

/**
 * Guarda los gustos (ya sanitizados) y da la bienvenida por hecha, si no lo estaba. La fecha de la bienvenida no se pisa:
 * de ella depende cuándo se le pregunta por los avisos (ver preguntarAvisos), y editar un talle no es entrar de nuevo.
 */
export async function guardarGustos(db: Db, userId: string, gustos: Gustos) {
  await db.update(users).set({ gustos, bienvenidaAt: sql`coalesce(${users.bienvenidaAt}, now())` }).where(eq(users.id, userId))
}

/** La bienvenida ya pasó (con su cumple o con "Ahora no"): no se la volvemos a mostrar. Los gustos quedan como estaban. */
export async function saltearBienvenida(db: Db, userId: string) {
  await db.update(users).set({ bienvenidaAt: sql`coalesce(${users.bienvenidaAt}, now())` }).where(eq(users.id, userId))
}

/**
 * Si ya anotó algún deseo en su lista (aunque después lo haya archivado o eliminado). Sin ninguno, de la bienvenida va a
 * anotar el primero y Agregar lo invita; con alguno (lo compartió a GiftR desde una tienda antes de pasar por Inicio), no.
 */
export async function yaAnotoUnDeseo(db: Db, userId: string): Promise<boolean> {
  const [fila] = await db.select({ id: items.id }).from(items).innerJoin(lists, eq(items.listId, lists.id))
    .where(eq(lists.ownerId, userId)).limit(1)
  return !!fila
}

/**
 * Cuántos bloques de Tus gustos contó y cuál le falta: para la tarjeta "Contá tus gustos · 2 de 7" de Mi lista, que lleva
 * al primero sin cargar. Con `despuesDe`, el que sigue a ese paso: guardado uno, va al próximo que falta sin volver al que
 * acaba de dejar vacío (no le interesa el fútbol y no eligió nada: no se lo preguntamos de nuevo). Null: no falta ninguno
 * (o ninguno más adelante).
 */
export function gustosPorContar(g: Gustos | null, despuesDe?: PasoGustos): { cargados: number; total: number; siguiente: BloqueGustos['paso'] | null } {
  const bloques = bloquesDeGustos(g)
  const desde = despuesDe ? PASOS_GUSTOS.indexOf(despuesDe) : -1
  const siguiente = bloques.find((b) => !b.cargado && PASOS_GUSTOS.indexOf(b.paso) > desde)?.paso ?? null
  return { cargados: bloques.filter((b) => b.cargado).length, total: bloques.length, siguiente }
}

export type GustosDeDueno = { id: string; nombre: string; secciones: SeccionGustos[] }

/** Para quien regala: los gustos de los dueños de la lista que los cargaron (en un grupo, de cada uno). */
export async function gustosDeLista(db: Db, listId: string): Promise<GustosDeDueno[]> {
  const [list] = await db.select({ id: lists.id, ownerId: lists.ownerId }).from(lists).where(eq(lists.id, listId))
  if (!list) return []
  const duenos = await duenosDeLista(db, list)
  if (!duenos.length) return []
  const filas = await db.select({ id: users.id, gustos: users.gustos }).from(users).where(inArray(users.id, duenos.map((d) => d.id)))
  return duenos
    .map((d) => ({ id: d.id, nombre: d.nombre, secciones: seccionesDeGustos(filas.find((f) => f.id === d.id)?.gustos ?? null) }))
    .filter((d) => d.secciones.length)
}
