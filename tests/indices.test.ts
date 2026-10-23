import { expect, test } from 'vitest'
import { and, asc, desc, eq, gt, lt, lte, sql } from 'drizzle-orm'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb } from './helpers'
import { claims, codazos, comments, groupGifts, items, listFollows, notifications, pedidosAfuera } from '@/db/schema'
import type { Db } from '@/db/types'
import { noEsDeRegaloGrupal } from '@/lib/claims'
import { contarPedidosAfuera } from '@/lib/pedidos-afuera'

// Las consultas de todas las pantallas filtran por estas columnas: sin índice, cada una recorría la tabla entera.

const UNO = '00000000-0000-4000-8000-000000000001'

/** El plan de una consulta, con los recorridos secuenciales apagados: si hay un índice que le sirve, lo usa. */
async function plan(db: Db, q: { toSQL(): { sql: string; params: unknown[] } }) {
  const client = (db as unknown as { $client: PGlite }).$client
  await client.query('set enable_seqscan = off')
  const { sql: texto, params } = q.toSQL()
  const r = await client.query<{ 'QUERY PLAN': string }>(`explain ${texto}`, params)
  return r.rows.map((f) => f['QUERY PLAN']).join('\n')
}

test('los índices de las consultas frecuentes están', async () => {
  const db = await createTestDb()
  const r = await db.execute(sql`select indexname from pg_indexes where schemaname = 'public'`)
  const nombres = (r as unknown as { rows: { indexname: string }[] }).rows.map((f) => f.indexname)
  expect(nombres).toEqual(expect.arrayContaining([
    'items_list_id_created_at_idx', 'claims_item_id_estado_idx', 'claims_claimer_user_id_idx', 'claims_claimer_guest_id_idx',
    'claims_vencen_idx', 'comments_item_id_created_at_idx', 'notifications_user_id_idx', 'notifications_guest_id_idx',
    'notifications_item_id_idx', 'group_gifts_item_id_idx', 'group_gifts_organizer_user_id_idx', 'group_gift_members_user_id_idx',
    'list_follows_list_id_idx', 'codazos_list_id_created_at_idx', 'pedidos_afuera_user_id_created_at_idx',
  ]))
})

test('cada consulta frecuente usa su índice', async () => {
  const db = await createTestDb()
  const casos: [string, { toSQL(): { sql: string; params: unknown[] } }][] = [
    ['items_list_id_created_at_idx', db.select().from(items).where(eq(items.listId, UNO)).orderBy(asc(items.createdAt))],
    ['claims_item_id_estado_idx', db.select().from(claims).where(and(eq(claims.itemId, UNO), eq(claims.estado, 'reservado')))],
    ['claims_claimer_user_id_idx', db.select().from(claims).where(eq(claims.claimerUserId, UNO))],
    ['claims_claimer_guest_id_idx', db.select().from(claims).where(eq(claims.claimerGuestId, UNO))],
    ['claims_vencen_idx', db.update(claims).set({ estado: 'expirado' })
      .where(and(eq(claims.estado, 'reservado'), lt(claims.expiresAt, new Date())))],
    ['comments_item_id_created_at_idx', db.select().from(comments).where(eq(comments.itemId, UNO)).orderBy(asc(comments.createdAt))],
    ['notifications_user_id_idx', db.select().from(notifications).where(and(eq(notifications.userId, UNO), eq(notifications.leida, false)))],
    ['notifications_guest_id_idx', db.select().from(notifications).where(eq(notifications.guestId, UNO))],
    ['notifications_item_id_idx', db.select().from(notifications).where(eq(notifications.itemId, UNO))],
    ['group_gifts_item_id_idx', db.select().from(groupGifts).where(eq(groupGifts.itemId, UNO))],
    ['group_gifts_organizer_user_id_idx', db.select().from(groupGifts).where(eq(groupGifts.organizerUserId, UNO))],
    ['list_follows_list_id_idx', db.delete(listFollows).where(eq(listFollows.listId, UNO))],
    ['codazos_list_id_created_at_idx', db.select().from(codazos)
      .where(and(eq(codazos.listId, UNO), gt(codazos.createdAt, new Date()))).orderBy(desc(codazos.createdAt))],
    // "no es de un regalo grupal" va por el único de group_gifts.claim_id, no recorre todos los regalos
    ['group_gifts_claim_id_unique', db.select().from(claims).where(and(eq(claims.itemId, UNO), noEsDeRegaloGrupal()))],
    // el tope de pedidos de afuera: el conteo de cada lectura de un link, y la limpieza de los de más de un día
    ['pedidos_afuera_user_id_created_at_idx', contarPedidosAfuera(db, UNO)],
    ['pedidos_afuera_user_id_created_at_idx', db.delete(pedidosAfuera)
      .where(and(eq(pedidosAfuera.userId, UNO), lte(pedidosAfuera.createdAt, sql`now() - interval '24 hours'`)))],
  ]
  for (const [indice, q] of casos) expect(await plan(db, q), indice).toContain(indice)
})
