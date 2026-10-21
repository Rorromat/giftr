import { and, eq, gte, inArray } from 'drizzle-orm'
import { claims, groupGiftMembers, groupGifts, items, lists, notifications } from '@/db/schema'
import type { Db } from '@/db/types'
import { esRepetible, pickItemFields, type OwnerItemView } from '@/lib/serialize'
import { esDuenoSql, esUuid } from '@/lib/groups'
import { noEsDeRegaloGrupal } from '@/lib/claims'
import { dejarAviso, type TipoAviso } from '@/lib/notifications'
import { desdeElUltimoEvento } from '@/lib/events'

export type NewItemData = {
  tipo: 'exacto' | 'idea'
  titulo: string
  notas?: string
  fotoUrl?: string
  precio?: string
  rangoPrecio?: string
  categoria?: string
  prioridad?: 'mucho' | 'gustaria' | 'suelta'
  cantidad?: number
  repetible?: boolean
  linkTienda?: string
}

/** Agrega a la lista personal del usuario o, con listId, a un grupo del que es dueño. */
export async function createItem(db: Db, userId: string, data: NewItemData, listId?: string): Promise<OwnerItemView | null> {
  // un id que no es UUID no es de nadie (y la base lo rechazaría con un error)
  if (!esUuid(userId) || (listId !== undefined && !esUuid(listId))) return null
  const [list] = await db.select().from(lists)
    .where(listId ? and(eq(lists.id, listId), esDuenoSql(db, userId)) : eq(lists.ownerId, userId))
  if (!list) return null
  const [item] = await db.insert(items).values({ ...soloIdeasSeRepiten(data), listId: list.id }).returning()
  return pickItemFields(item)
}

async function itemDelDueno(db: Db, itemId: string, userId: string) {
  if (!esUuid(itemId)) return false
  const [row] = await db.select({ id: items.id })
    .from(items).innerJoin(lists, eq(items.listId, lists.id))
    .where(and(eq(items.id, itemId), esDuenoSql(db, userId)))
  return !!row
}

/** "Se puede repetir" es de las ideas: en un "Quiero ESTO" no vale (si no, cualquiera lo reserva sin tope). */
function soloIdeasSeRepiten<T extends { tipo?: 'exacto' | 'idea'; repetible?: boolean }>(data: T, tipoAntes?: 'exacto' | 'idea'): T {
  return (data.tipo ?? tipoAntes) === 'exacto' ? { ...data, repetible: false } : data
}

/** Los que regalan este deseo: lo reservaron o compraron, o están en un regalo grupal vigente (no solo el encargado). */
async function genteDelDeseo(db: Db, itemId: string) {
  const reservas = await db.select({ userId: claims.claimerUserId, guestId: claims.claimerGuestId }).from(claims)
    .where(and(eq(claims.itemId, itemId), inArray(claims.estado, ['reservado', 'comprado'])))
  const miembros = await db.select({ userId: groupGiftMembers.userId }).from(groupGiftMembers)
    .innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id))
    .where(and(eq(groupGifts.itemId, itemId), inArray(groupGifts.estado, ['abierto', 'comprado'])))
  return [...reservas, ...miembros.map((m) => ({ userId: m.userId, guestId: null }))]
}

/** Lo que se puede cambiar de un deseo; null borra un campo opcional (las notas, el precio, la foto…). */
export const CAMPOS_OPCIONALES = ['notas', 'fotoUrl', 'precio', 'rangoPrecio', 'categoria', 'linkTienda'] as const
type Opcional = (typeof CAMPOS_OPCIONALES)[number]
export type CambiosDeseo = Partial<Omit<NewItemData, Opcional>> & { [K in Opcional]?: string | null }

/** Lo que le importa a quien regala (qué comprar). La prioridad y la categoría no le cambian el regalo: no le avisan. */
const AVISAN: (keyof CambiosDeseo)[] = ['titulo', 'notas', 'fotoUrl', 'linkTienda', 'precio', 'rangoPrecio', 'cantidad', 'tipo', 'repetible']

export async function updateItem(db: Db, itemId: string, userId: string, data: CambiosDeseo): Promise<boolean> {
  if (!(await itemDelDueno(db, itemId, userId))) return false
  const [antes] = await db.select().from(items).where(eq(items.id, itemId))
  // Uno archivado no se edita (una pantalla vieja, la prioridad desde Mi lista): avisaría de algo que ya no está.
  if (antes.estadoDueno !== 'activo') return false
  // Solo lo que cambió: guardar sin tocar nada no les manda un aviso a los que lo reservaron.
  const cambios = Object.fromEntries(
    Object.entries(soloIdeasSeRepiten(data, antes.tipo)).filter(([k, v]) => v !== undefined && antes[k as keyof typeof antes] !== v),
  ) as CambiosDeseo
  if (!Object.keys(cambios).length) return true
  await db.update(items).set(cambios).where(eq(items.id, itemId))
  // Bajar la cantidad por debajo de lo reservado también llega así (sin nada distinto para el dueño, que no lo sabe).
  // La marca de repetible, solo si cambia de verdad: un "Quiero ESTO" de antes que la tenía no se repetía igual.
  const despues = { ...antes, ...cambios }
  const avisar = AVISAN.some((k) => k in cambios && (k !== 'repetible' || esRepetible(despues) !== esRepetible(antes)))
  if (avisar) await dejarAviso(db, itemId, 'item_editado', await genteDelDeseo(db, itemId))
  return true
}

/** Un deseo activo para editarlo, solo si es del usuario (o de un grupo suyo), con su grupo para volver. */
export async function deseoParaEditar(db: Db, itemId: string, userId: string) {
  if (!esUuid(itemId)) return null
  const [row] = await db.select({ item: items, lista: { id: lists.id, tipo: lists.tipo, nombre: lists.nombre } })
    .from(items).innerJoin(lists, eq(items.listId, lists.id))
    .where(and(eq(items.id, itemId), esDuenoSql(db, userId)))
  if (!row || row.item.estadoDueno !== 'activo') return null
  return {
    deseo: pickItemFields(row.item),
    grupo: row.lista.tipo === 'grupo' ? { id: row.lista.id, nombre: row.lista.nombre ?? 'Grupo' } : null,
  }
}

/**
 * "Ya lo tengo" / "Ya no lo quiero": sale de la lista. Solo si estaba activo: un doble toque o una pantalla vieja no
 * vuelve a avisar ni cambia el motivo. Devuelve si lo archivó ahora. En la misma transacción, lo de los que regalan, así
 * nada les queda trabado sobre un deseo que ya no pueden abrir:
 * - Las reservas sin comprar se liberan y a cada uno se le avisa que elija otro.
 * - Los regalos grupales abiertos se cancelan (se libera su reserva) y se les avisa a todos los que estaban.
 * - Lo comprado queda como está. Con "Ya lo tengo" no se avisa (seguramente ya se lo dieron); con "Ya no lo quiero",
 *   sí, para que lo cambie si puede.
 * Al dueño no le llega nada y su respuesta es la misma haya o no reservas.
 */
export async function archiveItem(db: Db, itemId: string, userId: string, estado: 'lo_tengo' | 'no_lo_quiero'): Promise<boolean> {
  if (!(await itemDelDueno(db, itemId, userId))) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // el update bloquea el deseo, como reserveItem: una reserva que llega a la vez espera y lo encuentra archivado
    const [archivado] = await t.update(items).set({ estadoDueno: estado })
      .where(and(eq(items.id, itemId), eq(items.estadoDueno, 'activo')))
      .returning({ id: items.id })
    if (!archivado) return false
    const ahora = new Date()

    const liberadas = await t.update(claims).set({ estado: 'liberado', updatedAt: ahora })
      .where(and(eq(claims.itemId, itemId), eq(claims.estado, 'reservado'), noEsDeRegaloGrupal()))
      .returning({ userId: claims.claimerUserId, guestId: claims.claimerGuestId })
    await dejarAviso(t, itemId, 'item_baja', liberadas)

    const cancelados = await t.update(groupGifts).set({ estado: 'cancelado' })
      .where(and(eq(groupGifts.itemId, itemId), eq(groupGifts.estado, 'abierto')))
      .returning({ id: groupGifts.id, claimId: groupGifts.claimId })
    if (cancelados.length) {
      await t.update(claims).set({ estado: 'liberado', updatedAt: ahora }).where(inArray(claims.id, cancelados.map((g) => g.claimId)))
      const estaban = await t.select({ userId: groupGiftMembers.userId }).from(groupGiftMembers)
        .where(inArray(groupGiftMembers.giftId, cancelados.map((g) => g.id)))
      await dejarAviso(t, itemId, 'regalo_baja', estaban.map((m) => ({ userId: m.userId, guestId: null })))
    }

    if (estado === 'no_lo_quiero') await dejarAviso(t, itemId, 'item_baja_comprado', await genteDelDeseo(t, itemId))
    return true
  })
}

/**
 * "Volver a mi lista": un deseo archivado vuelve a estar activo, con lo que ya tenía (lo comprado sigue a su nombre). Lo
 * que se les dijo a los que regalan al sacarlo ya no vale (y el cartel ahora lleva al deseo diciendo que salió):
 * - Al que se le liberó la reserva o se le canceló el regalo grupal y todavía no lo vio, el aviso pasa a decir eso.
 * - Al que lo compró para este evento y se le dijo que lo cambiara ("Ya no lo quiero"), que volvió y sigue a su nombre:
 *   si ya lo cambió, que lo diga, así otro lo puede regalar. Con "Ya lo tengo" no se le había dicho nada.
 * Al dueño no le llega nada y su respuesta es la misma haya o no reservas.
 */
export async function restoreItem(db: Db, itemId: string, userId: string): Promise<boolean> {
  if (!(await itemDelDueno(db, itemId, userId))) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // lock del deseo, como archiveItem: un doble toque lo vuelve a poner (y avisa) una sola vez
    const [antes] = await t.select({ estado: items.estadoDueno, listId: items.listId }).from(items).where(eq(items.id, itemId)).for('update')
    if (!antes || antes.estado === 'activo') return false
    await t.update(items).set({ estadoDueno: 'activo' }).where(eq(items.id, itemId))

    const sinLeer = (tipo: TipoAviso) => and(eq(notifications.itemId, itemId), eq(notifications.tipo, tipo), eq(notifications.leida, false))
    const ahora = new Date()
    await t.update(notifications).set({ tipo: 'item_vuelve', createdAt: ahora }).where(sinLeer('item_baja'))
    await t.update(notifications).set({ tipo: 'regalo_cancelado', createdAt: ahora }).where(sinLeer('regalo_baja'))
    await t.update(notifications).set({ leida: true }).where(sinLeer('item_baja_comprado'))

    if (antes.estado === 'no_lo_quiero') {
      const compras = await t.select({ userId: claims.claimerUserId, guestId: claims.claimerGuestId, giftId: groupGifts.id }).from(claims)
        .leftJoin(groupGifts, eq(groupGifts.claimId, claims.id))
        .where(and(eq(claims.itemId, itemId), eq(claims.estado, 'comprado'), gte(claims.updatedAt, await desdeElUltimoEvento(t, antes.listId))))
      await dejarAviso(t, itemId, 'compra_vuelve', compras.filter((c) => !c.giftId))
      const regalos = compras.flatMap((c) => (c.giftId ? [c.giftId] : []))
      if (regalos.length) {
        const pusieron = await t.select({ userId: groupGiftMembers.userId }).from(groupGiftMembers).where(inArray(groupGiftMembers.giftId, regalos))
        await dejarAviso(t, itemId, 'regalo_vuelve', pusieron.map((m) => ({ userId: m.userId, guestId: null })))
      }
    }
    return true
  })
}
