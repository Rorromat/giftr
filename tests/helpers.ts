import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '@/db/schema'
import { users, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { seguirLista } from '@/lib/events'

export async function createTestDb(): Promise<Db> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db as unknown as Db
}

/**
 * La misma base, anotando cada consulta (también las de adentro de una transacción). PGlite corre las transacciones de a
 * una, así que dos pedidos a la vez no se pisan nunca acá aunque falte un lock: para fijar que el lock está, se mira el SQL.
 */
export function conConsultas(db: Db): { db: Db; consultas: string[] } {
  const consultas: string[] = []
  const espia = drizzle((db as unknown as { $client: PGlite }).$client, { schema, logger: { logQuery: (q) => { consultas.push(q) } } })
  return { db: espia as unknown as Db, consultas }
}

export async function seedOwnerAndGiver(db: Db) {
  const [owner] = await db.insert(users).values({ googleId: 'g-owner', nombre: 'Euge', email: 'euge@test.com' }).returning()
  const [giver] = await db.insert(users).values({ googleId: 'g-giver', nombre: 'Rodri', email: 'rodri@test.com' }).returning()
  const [list] = await db.insert(lists).values({ ownerId: owner.id, shareToken: 'tok-euge' }).returning()
  return { owner, giver, list }
}

/** Abrir con sesión una página de la lista con su link de ahora: la sigue (ver seguirLista). */
export async function seguir(db: Db, userId: string, listId: string) {
  const [list] = await db.select({ shareToken: lists.shareToken }).from(lists).where(eq(lists.id, listId))
  await seguirLista(db, userId, listId, list.shareToken)
}
