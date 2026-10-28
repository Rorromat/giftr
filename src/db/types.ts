import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type * as schema from './schema'

// Tipo común para Neon (prod) y PGlite (tests); las transacciones de drizzle también lo satisfacen.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>
