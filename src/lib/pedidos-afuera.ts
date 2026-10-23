import { and, count, eq, gt, lte, sql } from 'drizzle-orm'
import { pedidosAfuera, users } from '@/db/schema'
import type { Db } from '@/db/types'

// Lo que un usuario nos hace pedir afuera (leer la página del link de un producto, traer su foto): el tope por usuario.
// Cada uno puede ser 4 MB y 6 s de un servidor nuestro, así que hay un máximo por día y otro por rato, contando lecturas
// y fotos juntas.

/** Una tarde de diciembre cargando 30 deseos son unos 60. */
export const PEDIDOS_AFUERA_POR_DIA = 120
/** En 10 minutos: pegar un link tras otro entra; un script que pide sin parar, no. */
export const PEDIDOS_AFUERA_POR_RATO = 20

const haceUnDia = sql`now() - interval '24 hours'`
const haceUnRato = sql`now() - interval '10 minutes'`

/** Cuántos pidió en las últimas 24 horas y en los últimos 10 minutos (por el índice de usuario y fecha). */
export function contarPedidosAfuera(db: Db, userId: string) {
  return db.select({
    dia: count(),
    rato: sql<number>`count(*) filter (where ${pedidosAfuera.createdAt} > ${haceUnRato})`.mapWith(Number),
  }).from(pedidosAfuera).where(and(eq(pedidosAfuera.userId, userId), gt(pedidosAfuera.createdAt, haceUnDia)))
}

/**
 * Anota un pedido de afuera si todavía tiene lugar (PEDIDOS_AFUERA_POR_DIA y PEDIDOS_AFUERA_POR_RATO); false si no. Lo
 * rechazado no se anota, así que insistir no hace crecer la tabla, y de paso se borran sus pedidos de más de un día. Se
 * confirma antes de salir a la red: nunca queda una transacción abierta mientras se baja la página.
 */
export async function anotarPedidoAfuera(db: Db, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // el mismo lock que guardarFotoDeseo: dos pedidos a la vez no pasan juntos el tope
    await t.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('no key update')
    const [{ dia, rato }] = await contarPedidosAfuera(t, userId)
    await t.delete(pedidosAfuera).where(and(eq(pedidosAfuera.userId, userId), lte(pedidosAfuera.createdAt, haceUnDia)))
    if (dia >= PEDIDOS_AFUERA_POR_DIA || rato >= PEDIDOS_AFUERA_POR_RATO) return false
    await t.insert(pedidosAfuera).values({ userId })
    return true
  })
}
