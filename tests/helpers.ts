import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '@/db/schema'
import { users, lists } from '@/db/schema'
import type { Db } from '@/db/types'

export async function createTestDb(): Promise<Db> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return db as unknown as Db
}

export async function seedOwnerAndGiver(db: Db) {
  const [owner] = await db.insert(users).values({ googleId: 'g-owner', nombre: 'Euge', email: 'euge@test.com' }).returning()
  const [giver] = await db.insert(users).values({ googleId: 'g-giver', nombre: 'Rodri', email: 'rodri@test.com' }).returning()
  const [list] = await db.insert(lists).values({ ownerId: owner.id, shareToken: 'tok-euge' }).returning()
  return { owner, giver, list }
}
