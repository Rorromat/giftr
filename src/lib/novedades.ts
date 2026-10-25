import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { items, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { misAmigos } from '@/lib/amigos'
import { expireStaleClaims } from '@/lib/claims'
import { esToken, esUuid, noEsNiFueDuenoSql } from '@/lib/groups'
import { createItem } from '@/lib/items'
import { loadClaimViews, toGiverView } from '@/lib/lists'
import { pickItemFields, type GiverItemView } from '@/lib/serialize'
import { urlFoto } from '@/lib/users'

// Lo nuevo de tus amigos: los últimos deseos que cargaron tus amigos en su lista, del más nuevo al más viejo, para ir
// viéndolos como en Instagram (el carrusel de Inicio y /novedades). Se ven como en su lista compartida: con lo que les
// queda libre y lo que reservaste vos, nunca quién reservó qué si no sos vos (es lo mismo que ve cualquiera que regala).
// Y "Me lo robo": sumar a tu lista un deseo de otro, porque querés lo mismo.

export type Novedad = {
  item: GiverItemView
  creado: Date
  dueno: { id: string; nombre: string; foto: string | null }
  /** el link de su lista, para reservar y ver el deseo */
  token: string
}

/** Cuántos trae el carrusel de Inicio y lo primero del feed: los mismos, así el que tocaste en el carrusel ya está en el feed. */
export const PRIMEROS = 12

/** Por dónde seguir: la fecha y el id del último que se vio ("2026-10-25T18:00:00.000Z_<uuid>"). */
const cursor = (n: { creado: Date; item: { id: string } }) => `${n.creado.toISOString()}_${n.item.id}`
function leerCursor(c: string | undefined): { fecha: Date; id: string } | null {
  const [f, id] = (c ?? '').split('_')
  const fecha = new Date(f)
  return !Number.isNaN(fecha.getTime()) && id && esUuid(id) ? { fecha, id } : null
}

/** La fecha de carga en milisegundos, como la del cursor (la base guarda microsegundos): si no, en el corte se perdían. */
const enMs = sql<Date>`date_trunc('milliseconds', ${items.createdAt})`

/** Una página de lo nuevo de tus amigos (limite deseos) y el cursor de la siguiente, o null si no hay más. */
export async function novedadesDeAmigos(db: Db, userId: string, { despues, limite = 10 }: { despues?: string; limite?: number } = {}):
  Promise<{ novedades: Novedad[]; siguiente: string | null }> {
  const amigos = [...await misAmigos(db, userId)]
  if (!amigos.length) return { novedades: [], siguiente: null }
  const desde = leerCursor(despues)
  const filas = await db.select({ item: items, token: lists.shareToken, duenoId: users.id, nombre: users.nombre, fotoAt: users.fotoAt, avatarUrl: users.avatarUrl })
    .from(items)
    .innerJoin(lists, eq(items.listId, lists.id))
    .innerJoin(users, eq(lists.ownerId, users.id))
    .where(and(
      inArray(lists.ownerId, amigos), eq(lists.tipo, 'personal'), eq(items.estadoDueno, 'activo'),
      desde ? or(lt(enMs, desde.fecha), and(eq(enMs, desde.fecha), lt(items.id, desde.id))) : undefined,
    ))
    .orderBy(desc(enMs), desc(items.id))
    .limit(limite + 1)
  const pagina = filas.slice(0, limite)
  if (!pagina.length) return { novedades: [], siguiente: null }

  await expireStaleClaims(db)
  const viewer = { userId }
  const porLista = new Map<string, typeof pagina>()
  for (const f of pagina) porLista.set(f.item.listId, [...(porLista.get(f.item.listId) ?? []), f])
  const reservas = new Map<string, Awaited<ReturnType<typeof loadClaimViews>>>()
  await Promise.all([...porLista].map(async ([listId, deLista]) => {
    reservas.set(listId, await loadClaimViews(db, listId, deLista.map((f) => f.item), viewer))
  }))

  const novedades = pagina.map((f): Novedad => ({
    item: toGiverView(pickItemFields(f.item), reservas.get(f.item.listId)?.get(f.item.id) ?? []),
    creado: f.item.createdAt,
    dueno: { id: f.duenoId, nombre: f.nombre, foto: urlFoto({ id: f.duenoId, fotoAt: f.fotoAt, avatarUrl: f.avatarUrl }) },
    token: f.token,
  }))
  return { novedades, siguiente: filas.length > limite ? cursor(novedades.at(-1)!) : null }
}

/** "hace 5 min", "hace 3 h", "ayer", "hace 4 días", "el 12/10". */
export function hace(fecha: Date, ahora = new Date()): string {
  const min = Math.floor((ahora.getTime() - fecha.getTime()) / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ayer'
  if (d < 7) return `hace ${d} días`
  return `el ${fecha.getUTCDate()}/${fecha.getUTCMonth() + 1}`
}

export type Robo = { ok: true; itemId: string; yaLoTenias: boolean } | { ok: false; reason: 'no_existe' | 'propio' }

/**
 * "Me lo robo": copia a tu lista un deseo de la lista de otro (con su link): el nombre, la foto, el precio y el link de
 * la tienda. Lo que el otro escribió para los suyos (las notas) no, ni sus reservas: es un deseo nuevo, tuyo. Si ya lo
 * tenías (mismo nombre y foto en tu lista), es ese. Al otro no le llega nada.
 */
export async function robarDeseo(db: Db, userId: string, token: string, itemId: string): Promise<Robo> {
  if (!esToken(token) || !esUuid(itemId)) return { ok: false, reason: 'no_existe' }
  const [row] = await db.select({ item: items }).from(items)
    .innerJoin(lists, eq(items.listId, lists.id))
    .where(and(eq(items.id, itemId), eq(lists.shareToken, token), eq(items.estadoDueno, 'activo')))
  if (!row) return { ok: false, reason: 'no_existe' }
  // de una lista tuya (o de un grupo tuyo), no
  const [ajena] = await db.select({ id: lists.id }).from(lists).where(and(eq(lists.id, row.item.listId), noEsNiFueDuenoSql(db, userId)))
  if (!ajena) return { ok: false, reason: 'propio' }
  const it = row.item
  const [mia] = await db.select({ id: lists.id }).from(lists).where(eq(lists.ownerId, userId))
  if (mia) {
    const [ya] = await db.select({ id: items.id }).from(items).where(and(
      eq(items.listId, mia.id), eq(items.estadoDueno, 'activo'), eq(items.titulo, it.titulo),
      it.fotoUrl ? eq(items.fotoUrl, it.fotoUrl) : isNull(items.fotoUrl),
    ))
    if (ya) return { ok: true, itemId: ya.id, yaLoTenias: true }
  }
  const nuevo = await createItem(db, userId, {
    tipo: it.tipo, titulo: it.titulo, fotoUrl: it.fotoUrl ?? undefined, precio: it.precio ?? undefined,
    rangoPrecio: it.rangoPrecio ?? undefined, categoria: it.categoria ?? undefined, linkTienda: it.linkTienda ?? undefined,
  })
  return nuevo ? { ok: true, itemId: nuevo.id, yaLoTenias: false } : { ok: false, reason: 'no_existe' }
}
