import { and, eq, gte, inArray, or, sql } from 'drizzle-orm'
import { claims, groupGiftMembers, groupGifts, items, lists, notifications } from '@/db/schema'
import type { Db } from '@/db/types'
import { esRepetible, pickItemFields, type OwnerItemView } from '@/lib/serialize'
import { esDuenoSql, esUuid } from '@/lib/groups'
import { expireStaleClaims, loQueYaTiene, noEsDeRegaloGrupal, ocupaSql } from '@/lib/claims'
import { dejarAviso, type TipoAviso } from '@/lib/notifications'
import { desdeElUltimoEvento } from '@/lib/events'
import { recienHecho } from '@/lib/repetido'
import { acotarCantidad, CANTIDAD_MAXIMA, LARGO, recortar } from '@/lib/limites'

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

/**
 * Lo escrito, con su largo máximo (ver recortar) y la cantidad entre 1 y 99 (o topeCantidad): así un pedido armado a mano
 * no desborda la columna ni rompe las tarjetas de todos. Un link no se corta (cortado no anda): si se pasa del largo, no va
 * (al editar, queda el que había).
 */
export function acotarDeseo<T extends CambiosDeseo>(data: T, topeCantidad = CANTIDAD_MAXIMA): T {
  const r: CambiosDeseo = { ...data }
  if (typeof r.titulo === 'string') r.titulo = recortar(r.titulo, LARGO.titulo) || undefined
  for (const k of ['notas', 'precio', 'rangoPrecio', 'categoria'] as const) {
    const v = r[k]
    if (typeof v === 'string') r[k] = recortar(v, LARGO[k]) || null
  }
  for (const k of ['linkTienda', 'fotoUrl'] as const) {
    const v = r[k]
    if (typeof v === 'string' && v.length > LARGO.link) r[k] = undefined
  }
  if (r.cantidad !== undefined) r.cantidad = acotarCantidad(r.cantidad, topeCantidad)
  return r as T
}

/** Agrega a la lista personal del usuario o, con listId, a un grupo del que es dueño. */
export async function createItem(db: Db, userId: string, deseo: NewItemData, listId?: string): Promise<OwnerItemView | null> {
  // un id que no es UUID no es de nadie (y la base lo rechazaría con un error)
  if (!esUuid(userId) || (listId !== undefined && !esUuid(listId))) return null
  const data = acotarDeseo(deseo)
  if (!data.titulo) return null
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    const [list] = await t.select().from(lists)
      .where(listId ? and(eq(lists.id, listId), esDuenoSql(t, userId)) : eq(lists.ownerId, userId))
      .for('update')
    if (!list) return null
    // Un doble toque en "Agregar" no lo duplica (dos deseos iguales son dos lugares para reservar el mismo regalo). Es
    // un doble toque solo si vino todo igual: con un link pegado en el título queda de título el sitio, y dos productos de
    // la misma tienda cargados seguidos son dos deseos; volver a cargarlo enseguida con otra cantidad, también. Y solo uno
    // activo: archivarlo y volver a cargarlo enseguida es otro deseo (si no, devolvía el archivado y no quedaba ninguno).
    const nuevo = soloIdeasSeRepiten(data)
    const [repetido] = await t.select().from(items)
      .where(and(
        eq(items.listId, list.id), eq(items.estadoDueno, 'activo'), eq(items.titulo, nuevo.titulo), eq(items.tipo, nuevo.tipo),
        recienHecho(items.createdAt),
        // sin venir, lo que pone la columna
        eq(items.cantidad, nuevo.cantidad ?? 1), eq(items.prioridad, nuevo.prioridad ?? 'gustaria'), eq(items.repetible, nuevo.repetible ?? false),
        ...CAMPOS_OPCIONALES.map((k) => sql`${items[k]} is not distinct from ${nuevo[k] ?? null}`),
      ))
    if (repetido) return pickItemFields(repetido)
    const [item] = await t.insert(items).values({ ...nuevo, listId: list.id }).returning()
    return pickItemFields(item)
  })
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

/**
 * Los que regalan este deseo para el evento que viene: lo reservaron o lo compraron, o están en un regalo grupal abierto o
 * comprado (no solo el encargado). Lo comprado para un evento anterior ya se regaló: no le importa lo que cambie ahora, como
 * en restoreItem y desmarcarComprado (ver desdeElUltimoEvento). Lo comprado se anota en la reserva, también la de un regalo.
 */
async function genteDelDeseo(db: Db, itemId: string, listId: string) {
  const desde = await desdeElUltimoEvento(db, listId)
  const reservas = await db.select({ userId: claims.claimerUserId, guestId: claims.claimerGuestId }).from(claims)
    .where(and(eq(claims.itemId, itemId), ocupaSql(desde)))
  const miembros = await db.select({ userId: groupGiftMembers.userId }).from(groupGiftMembers)
    .innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id))
    .innerJoin(claims, eq(groupGifts.claimId, claims.id))
    .where(and(eq(groupGifts.itemId, itemId), or(
      eq(groupGifts.estado, 'abierto'), and(eq(groupGifts.estado, 'comprado'), gte(claims.updatedAt, desde)),
    )))
  return [...reservas, ...miembros.map((m) => ({ userId: m.userId, guestId: null }))]
}

/** Lo que se puede cambiar de un deseo; null borra un campo opcional (las notas, el precio, la foto…). */
export const CAMPOS_OPCIONALES = ['notas', 'fotoUrl', 'precio', 'rangoPrecio', 'categoria', 'linkTienda'] as const
type Opcional = (typeof CAMPOS_OPCIONALES)[number]
export type CambiosDeseo = Partial<Omit<NewItemData, Opcional>> & { [K in Opcional]?: string | null }

/** Lo que le importa a quien regala (qué comprar). La prioridad y la categoría no le cambian el regalo: no le avisan. */
const AVISAN: (keyof CambiosDeseo)[] = ['titulo', 'notas', 'fotoUrl', 'linkTienda', 'precio', 'rangoPrecio', 'cantidad', 'tipo', 'repetible']

export async function updateItem(db: Db, itemId: string, userId: string, deseo: CambiosDeseo): Promise<boolean> {
  if (!(await itemDelDueno(db, itemId, userId))) return false
  const [antes] = await db.select().from(items).where(eq(items.id, itemId))
  // Uno archivado no se edita (una pantalla vieja, la prioridad desde Mi lista): avisaría de algo que ya no está.
  if (antes.estadoDueno !== 'activo') return false
  // Solo lo que cambió: guardar sin tocar nada no les manda un aviso a los que lo reservaron. Y solo eso se acota: un
  // deseo de antes de los topes (un título largo pegado de una tienda) no se corta en silencio, ni les avisa a todos que
  // cambió, porque el dueño tocó las notas.
  const distinto = (d: CambiosDeseo) => Object.fromEntries(
    Object.entries(d).filter(([k, v]) => v !== undefined && antes[k as keyof typeof antes] !== v),
  ) as CambiosDeseo
  // Uno de antes del tope se puede bajar sin que quede en 99: el formulario deja hasta lo que tenía (ver DeseoForm).
  const cambios = distinto(soloIdeasSeRepiten(acotarDeseo(distinto(deseo), Math.max(CANTIDAD_MAXIMA, antes.cantidad)), antes.tipo))
  if (!Object.keys(cambios).length) return true
  await db.update(items).set(cambios).where(eq(items.id, itemId))
  // Bajar la cantidad por debajo de lo reservado también llega así (sin nada distinto para el dueño, que no lo sabe).
  // La marca de repetible, solo si cambia de verdad: un "Quiero ESTO" de antes que la tenía no se repetía igual.
  const despues = { ...antes, ...cambios }
  const avisar = AVISAN.some((k) => k in cambios && (k !== 'repetible' || esRepetible(despues) !== esRepetible(antes)))
  if (avisar) await dejarAviso(db, itemId, 'item_editado', await genteDelDeseo(db, itemId, antes.listId))
  return true
}

/**
 * Un deseo activo para verlo o editarlo, solo si es del usuario (o de un grupo suyo), con su grupo para volver y el link
 * de su lista (para mandarlo por WhatsApp).
 */
export async function deseoParaEditar(db: Db, itemId: string, userId: string) {
  if (!esUuid(itemId)) return null
  const [row] = await db.select({ item: items, lista: { id: lists.id, tipo: lists.tipo, nombre: lists.nombre, shareToken: lists.shareToken } })
    .from(items).innerJoin(lists, eq(items.listId, lists.id))
    .where(and(eq(items.id, itemId), esDuenoSql(db, userId)))
  if (!row || row.item.estadoDueno !== 'activo') return null
  return {
    deseo: pickItemFields(row.item),
    grupo: row.lista.tipo === 'grupo' ? { id: row.lista.id, nombre: row.lista.nombre ?? 'Grupo' } : null,
    shareToken: row.lista.shareToken,
  }
}

/**
 * "Ya lo tengo" / "Ya no lo quiero": sale de la lista. Solo si estaba activo: un doble toque o una pantalla vieja no
 * vuelve a avisar ni cambia el motivo. Devuelve si lo archivó ahora. En la misma transacción, lo de los que regalan, así
 * nada les queda trabado sobre un deseo que ya no pueden abrir:
 * - Las reservas sin comprar se liberan y a cada uno se le avisa que elija otro.
 * - Los regalos grupales abiertos: con "Ya lo tengo" siguen abiertos (quizás se lo dieron y el encargado todavía no
 *   dividió lo que salió) y se les avisa a todos que lo terminen en Cuentas, dividiendo o cancelando. Con "Ya no lo
 *   quiero" se cancelan (se libera su reserva) y se les avisa a todos los que estaban.
 * - Lo comprado queda como está. Con "Ya lo tengo" no se avisa (seguramente ya se lo dieron); con "Ya no lo quiero",
 *   sí, para que lo cambie si puede (solo lo de este evento: lo de antes ya se regaló).
 * - Los avisos sin leer que decían que se podía hacer algo con el deseo (volvió, fue editado, reservalo) ya no valen. Con
 *   "Ya no lo quiero", tampoco el de que ahora organiza un regalo grupal: se canceló (con "Ya lo tengo" sigue, en Cuentas).
 * Al dueño no le llega nada y su respuesta es la misma haya o no reservas.
 */
export async function archiveItem(db: Db, itemId: string, userId: string, estado: 'lo_tengo' | 'no_lo_quiero'): Promise<boolean> {
  if (!(await itemDelDueno(db, itemId, userId))) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // el update bloquea el deseo, como reserveItem: una reserva que llega a la vez espera y lo encuentra archivado
    const [archivado] = await t.update(items).set({ estadoDueno: estado })
      .where(and(eq(items.id, itemId), eq(items.estadoDueno, 'activo')))
      .returning({ id: items.id, listId: items.listId })
    if (!archivado) return false
    const ahora = new Date()

    await t.update(notifications).set({ leida: true }).where(and(
      eq(notifications.itemId, itemId), eq(notifications.leida, false),
      inArray(notifications.tipo, estado === 'no_lo_quiero' ? [...YA_NO_VALEN_AL_SACARLO, 'regalo_encargo'] : YA_NO_VALEN_AL_SACARLO),
    ))

    const liberadas = await t.update(claims).set({ estado: 'liberado', updatedAt: ahora })
      .where(and(eq(claims.itemId, itemId), eq(claims.estado, 'reservado'), noEsDeRegaloGrupal()))
      .returning({ userId: claims.claimerUserId, guestId: claims.claimerGuestId })
    await dejarAviso(t, itemId, 'item_baja', liberadas)

    const abiertos = await t.select({ id: groupGifts.id, claimId: groupGifts.claimId }).from(groupGifts)
      .where(and(eq(groupGifts.itemId, itemId), eq(groupGifts.estado, 'abierto')))
    if (abiertos.length) {
      if (estado === 'no_lo_quiero') {
        await t.update(groupGifts).set({ estado: 'cancelado' }).where(inArray(groupGifts.id, abiertos.map((g) => g.id)))
        await t.update(claims).set({ estado: 'liberado', updatedAt: ahora }).where(inArray(claims.id, abiertos.map((g) => g.claimId)))
      }
      const estaban = await t.select({ userId: groupGiftMembers.userId }).from(groupGiftMembers)
        .where(inArray(groupGiftMembers.giftId, abiertos.map((g) => g.id)))
      await dejarAviso(t, itemId, estado === 'no_lo_quiero' ? 'regalo_baja' : 'regalo_lo_tiene',
        estaban.map((m) => ({ userId: m.userId, guestId: null })))
    }

    if (estado === 'no_lo_quiero') await dejarAviso(t, itemId, 'item_baja_comprado', await genteDelDeseo(t, itemId, archivado.listId))
    return true
  })
}

/** Avisos que dicen que con el deseo se puede hacer algo (reservarlo, revisarlo, deshacer la compra): sacándolo, no. */
const YA_NO_VALEN_AL_SACARLO: TipoAviso[] = ['item_vuelve', 'compra_vuelve', 'regalo_vuelve', 'item_editado', 'regalo_cancelado']

/**
 * "Volver a mi lista": un deseo archivado vuelve a estar activo, con lo que ya tenía para este evento (lo comprado sigue a
 * su nombre, un regalo grupal que quedó abierto sigue abierto). Lo comprado para un evento anterior ya se regaló: deja de
 * ocuparlo (ocupa_desde, ver ocupaSql), y el que lo vuelve a pedir porque se le gastó o se le rompió no lo tiene comprado y
 * sin lugar para siempre. La compra queda igual (el historial no cambia), y depende solo de fechas, no de las reservas.
 * Lo marcado comprado después del evento (una reserva vencida que se marcó tarde) cuenta como de este: sigue ocupando.
 * Lo que se les dijo a los que regalan al sacarlo ya no vale (y el cartel ahora lleva al deseo diciendo que salió):
 * - Al que se le liberó la reserva o se le canceló el regalo grupal y todavía no lo vio, el aviso pasa a decir eso. Si
 *   todavía tiene algo del deseo (una reserva que el archivar de antes no liberaba), no: el aviso de la baja se va.
 * - Al que lo compró para este evento y se le dijo que lo cambiara ("Ya no lo quiero"), que volvió y sigue a su nombre:
 *   si ya lo cambió, que lo diga, así otro lo puede regalar. Con "Ya lo tengo" no se le había dicho nada.
 * Al dueño no le llega nada y su respuesta es la misma haya o no reservas.
 */
export async function restoreItem(db: Db, itemId: string, userId: string): Promise<boolean> {
  if (!(await itemDelDueno(db, itemId, userId))) return false
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // lock del deseo, como archiveItem: un doble toque lo vuelve a poner (y avisa) una sola vez
    const [antes] = await t.select().from(items).where(eq(items.id, itemId)).for('update')
    if (!antes || antes.estadoDueno === 'activo') return false
    // El corte solo avanza: si borraron o cambiaron la fecha de la lista, desdeElUltimoEvento puede dar uno anterior, y lo
    // que ya se había liberado volvería a ocupar el deseo.
    const corte = await desdeElUltimoEvento(t, antes.listId)
    const desde = antes.ocupaDesde && antes.ocupaDesde > corte ? antes.ocupaDesde : corte
    await t.update(items).set({ estadoDueno: 'activo', ocupaDesde: desde }).where(eq(items.id, itemId))

    // Los de la baja se borran y se dejan los nuevos con dejarAviso: si ya tenía uno igual sin leer (volvió una vez y lo
    // volvieron a sacar), sube ese en vez de sumar otro.
    const sinLeer = (tipo: TipoAviso) => and(eq(notifications.itemId, itemId), eq(notifications.tipo, tipo), eq(notifications.leida, false))
    const para = { userId: notifications.userId, guestId: notifications.guestId }
    const bajas = await t.delete(notifications).where(sinLeer('item_baja')).returning(para)
    await expireStaleClaims(t, itemId)
    const sinNada: typeof bajas = []
    for (const d of bajas) if (!(await loQueYaTiene(t, antes, d.userId ? { userId: d.userId } : { guestId: d.guestId! }))) sinNada.push(d)
    await dejarAviso(t, itemId, 'item_vuelve', sinNada)
    await dejarAviso(t, itemId, 'regalo_cancelado', await t.delete(notifications).where(sinLeer('regalo_baja')).returning(para))
    await t.update(notifications).set({ leida: true }).where(or(sinLeer('item_baja_comprado'), sinLeer('regalo_lo_tiene')))

    if (antes.estadoDueno === 'no_lo_quiero') {
      const compras = await t.select({ userId: claims.claimerUserId, guestId: claims.claimerGuestId, giftId: groupGifts.id }).from(claims)
        .leftJoin(groupGifts, eq(groupGifts.claimId, claims.id))
        .where(and(eq(claims.itemId, itemId), eq(claims.estado, 'comprado'), gte(claims.updatedAt, desde)))
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
