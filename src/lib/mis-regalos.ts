import { and, desc, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { claims, groupGiftMembers, groupGifts, items, listFollows, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { expireStaleClaims } from '@/lib/claims'
import { desdeElUltimoEvento } from '@/lib/events'
import { noEsNiFueDuenoSql } from '@/lib/groups'
import { duenoOParaSql } from '@/lib/regalos'
import type { Moneda } from '@/lib/pesos'

// Mis regalos: todo lo que reservé (suelto) y los regalos grupales en los que estoy, de las listas de los demás, para
// tenerlo a mano en un solo lugar. Lo de listas propias (o de un grupo del que fui dueño) no: sería contarme la sorpresa.
// Lo comprado se separa en lo que es para el evento que viene y el historial (lo de un cumple o una fecha que ya pasó,
// con la misma regla que el resto de la app: ver desdeElUltimoEvento).

/** Cuántos comprados se traen como mucho (el historial no tiene fecha de corte). */
const COMPRADOS_MAX = 300
const DIA = 86_400_000

export type MiRegalo = {
  /** el claim (suelto) o el regalo grupal */
  id: string
  tipo: 'suelto' | 'grupal'
  estado: 'reservado' | 'comprado'
  titulo: string
  foto: string | null
  /** el nombre del dueño, o el del grupo (en una sorpresa, el de quien la recibe) */
  para: string
  /** un regalo que no está en su lista (ver sorpresas.ts) */
  sorpresa: boolean
  /** al deseo (o a la lista, si el deseo ya no está); null si cambiaron el link y no lo tiene */
  href: string | null
  /** reservado suelto: en cuántos días vence */
  venceEnDias: number | null
  /** grupal */
  personas: number | null
  encargado: string | null
  soyEncargado: boolean
  /** grupal comprado: mi parte, en su moneda */
  miParte: number | null
  moneda: Moneda
  /** cuándo se compró (o se reservó, o se armó el grupal) */
  fecha: Date
  listId: string
}

const duenos = alias(users, 'duenos')
const encargados = alias(users, 'encargados')

/** Lo de la lista para el link y el "para": el link nuevo solo si no cambió desde que lo reservé o si la sigo. */
const columnasLista = (db: Db, userId: string, desde: ReturnType<typeof sql<Date>>) => ({
  listId: lists.id, tipo: lists.tipo, listaNombre: lists.nombre, duenoNombre: duenos.nombre, shareToken: lists.shareToken,
  itemId: items.id, titulo: items.titulo, foto: items.fotoUrl, activo: sql<boolean>`${items.estadoDueno} = 'activo'`,
  conLink: sql<boolean>`${or(isNull(lists.shareTokenAt), sql`${desde} > ${lists.shareTokenAt}`,
    inArray(lists.id, db.select({ id: listFollows.listId }).from(listFollows).where(eq(listFollows.userId, userId))))}`,
})

type Fila = {
  tipo: 'personal' | 'grupo' | 'sorpresa'; listaNombre: string | null; duenoNombre: string | null; shareToken: string; itemId: string
  activo: boolean; conLink: boolean
}
// en una sorpresa, duenoNombre es el de quien la recibe; si no usa GiftR, su nombre está en el de la lista
const para = (r: Fila) => (r.tipo === 'grupo' ? r.listaNombre ?? 'Grupo' : r.duenoNombre ?? r.listaNombre ?? 'Alguien')
const href = (r: Fila) => (!r.conLink ? null : r.tipo === 'sorpresa' ? `/sorpresa/${r.shareToken}`
  : r.activo ? `/l/${r.shareToken}/item/${r.itemId}` : `/l/${r.shareToken}`)

export type MisRegalos = {
  porComprar: MiRegalo[]
  /** comprados para el evento que viene */
  comprados: MiRegalo[]
  /** comprados para un evento que ya pasó */
  historial: MiRegalo[]
}

/** Lo mío de las listas de los demás, lo más nuevo primero. soloPorComprar: lo reservado y los grupales abiertos (Inicio). */
async function deLasListasDeOtros(db: Db, userId: string, ahora: Date, soloPorComprar: boolean) {
  await expireStaleClaims(db)
  const deGrupales = db.select({ id: groupGifts.claimId }).from(groupGifts)

  const [sueltos, grupales] = await Promise.all([
    db.select({
      id: claims.id, estado: claims.estado, expiresAt: claims.expiresAt, fecha: claims.updatedAt,
      ...columnasLista(db, userId, sql<Date>`${claims.createdAt}`),
    }).from(claims)
      .innerJoin(items, eq(claims.itemId, items.id))
      .innerJoin(lists, eq(items.listId, lists.id))
      .leftJoin(duenos, eq(duenoOParaSql, duenos.id))
      .where(and(
        eq(claims.claimerUserId, userId),
        // la reserva de un regalo grupal (la del encargado) va con el grupal
        notInArray(claims.id, deGrupales),
        or(and(eq(claims.estado, 'reservado'), eq(items.estadoDueno, 'activo')), soloPorComprar ? undefined : eq(claims.estado, 'comprado')),
        noEsNiFueDuenoSql(db, userId),
      ))
      .orderBy(desc(claims.updatedAt)).limit(COMPRADOS_MAX),
    db.select({
      id: groupGifts.id, estado: groupGifts.estado, compradoAt: groupGifts.compradoAt, creado: groupGifts.createdAt,
      encargadoId: groupGifts.organizerUserId, encargado: encargados.nombre, miParte: groupGiftMembers.monto, moneda: groupGifts.moneda,
      personas: sql<number>`(select count(*)::int from ${groupGiftMembers} m where m.gift_id = ${groupGifts.id})`,
      ...columnasLista(db, userId, sql<Date>`${groupGifts.createdAt}`),
    }).from(groupGiftMembers)
      .innerJoin(groupGifts, eq(groupGiftMembers.giftId, groupGifts.id))
      .innerJoin(encargados, eq(groupGifts.organizerUserId, encargados.id))
      .innerJoin(items, eq(groupGifts.itemId, items.id))
      .innerJoin(lists, eq(items.listId, lists.id))
      .leftJoin(duenos, eq(duenoOParaSql, duenos.id))
      .where(and(
        eq(groupGiftMembers.userId, userId),
        soloPorComprar ? eq(groupGifts.estado, 'abierto') : ne(groupGifts.estado, 'cancelado'),
        noEsNiFueDuenoSql(db, userId),
      ))
      .orderBy(desc(groupGifts.createdAt)).limit(COMPRADOS_MAX),
  ])

  const todos: MiRegalo[] = [
    ...sueltos.map((r): MiRegalo => ({
      id: r.id, tipo: 'suelto', estado: r.estado === 'comprado' ? 'comprado' : 'reservado', titulo: r.titulo, foto: r.foto,
      para: para(r), href: href(r), sorpresa: r.tipo === 'sorpresa',
      venceEnDias: r.estado === 'reservado' && r.expiresAt ? Math.max(0, Math.ceil((r.expiresAt.getTime() - ahora.getTime()) / DIA)) : null,
      personas: null, encargado: null, soyEncargado: false, miParte: null, moneda: 'ARS', fecha: r.fecha, listId: r.listId,
    })),
    ...grupales.map((r): MiRegalo => ({
      id: r.id, tipo: 'grupal', estado: r.estado === 'comprado' ? 'comprado' : 'reservado', titulo: r.titulo, foto: r.foto,
      para: para(r), href: href(r), sorpresa: r.tipo === 'sorpresa', venceEnDias: null, personas: r.personas, encargado: r.encargado,
      soyEncargado: r.encargadoId === userId, miParte: r.estado === 'comprado' ? r.miParte : null, moneda: r.moneda, fecha: r.compradoAt ?? r.creado,
      listId: r.listId,
    })),
  ]
  return todos.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
}

export async function misRegalos(db: Db, userId: string, ahora = new Date()): Promise<MisRegalos> {
  const todos = await deLasListasDeOtros(db, userId, ahora, false)
  // desde cuándo lo comprado es para el evento que viene, lista por lista
  const listas = [...new Set(todos.map((r) => r.listId))]
  const desde = new Map(await Promise.all(listas.map(async (id) => [id, await desdeElUltimoEvento(db, id, ahora)] as const)))
  const yaPaso = (r: MiRegalo) => r.estado === 'comprado' && r.fecha < desde.get(r.listId)!
  return {
    porComprar: todos.filter((r) => r.estado === 'reservado'),
    comprados: todos.filter((r) => r.estado === 'comprado' && !yaPaso(r)),
    historial: todos.filter(yaPaso),
  }
}

/** Lo que falta comprar (lo de "Por comprar" en Mis regalos), sin lo comprado: para el resumen de Inicio. */
export async function porComprar(db: Db, userId: string, ahora = new Date()): Promise<MiRegalo[]> {
  return deLasListasDeOtros(db, userId, ahora, true)
}
