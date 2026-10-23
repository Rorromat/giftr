import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '@/db/schema'
import { users, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Pedir, Respuesta } from '@/lib/bajar-foto'
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

export const MB = 1024 * 1024

type RespuestaDeMentira = {
  status?: number
  headers?: Record<string, string>
  /** cuántos trozos de 1 MB (en cero) manda; sin cuerpo ni trozos, no termina nunca */
  trozos?: number
  /** o este cuerpo, de una vez (o en pedazos del largo que diga trozoBytes) */
  cuerpo?: string | Buffer
  trozoBytes?: number
  demora?: number
}

/**
 * Un servidor de mentira para lo que se baja de afuera (ver bajarDeAfuera): contesta lo que le digan por URL y cuenta
 * los bytes que entregó. Respeta la señal, como el de verdad. Una URL que no conoce es un error (que se vea en el test).
 */
export function servidor(respuestas: Record<string, RespuestaDeMentira>) {
  const pedidos: { url: string; signal: AbortSignal }[] = []
  let entregados = 0
  const pedir: Pedir = async (url, signal) => {
    pedidos.push({ url, signal })
    const r = respuestas[url]
    if (!r) throw new Error(`no esperaba ${url}`)
    if (r.demora) {
      await new Promise<void>((ok, mal) => {
        const t = setTimeout(ok, r.demora)
        signal.addEventListener('abort', () => { clearTimeout(t); mal(signal.reason) })
      })
    }
    async function* cuerpo() {
      if (r!.cuerpo !== undefined) {
        const todo = Buffer.from(r!.cuerpo)
        const paso = r!.trozoBytes ?? (todo.length || 1)
        for (let i = 0; i < todo.length; i += paso) {
          if (signal.aborted) throw signal.reason
          const trozo = todo.subarray(i, i + paso)
          entregados += trozo.length
          yield trozo
        }
        return
      }
      for (let n = 0; n < (r!.trozos ?? Infinity); n++) {
        if (signal.aborted) throw signal.reason
        await new Promise((ok) => setTimeout(ok, 0))
        entregados += MB
        yield new Uint8Array(MB)
      }
    }
    const headers = Object.fromEntries(Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
    return { status: r.status ?? 200, header: (k) => headers[k.toLowerCase()] ?? null, cuerpo: cuerpo() } satisfies Respuesta
  }
  return { pedir, pedidos, urls: () => pedidos.map((p) => p.url), entregados: () => entregados }
}
