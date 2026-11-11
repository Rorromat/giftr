import { and, asc, eq } from 'drizzle-orm'
import { items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { duenosDeLista, esToken, esUuid, juntarNombres } from '@/lib/groups'
import { esUrlPublica } from '@/lib/links'
import { ocasionDeLista, type Ocasion } from '@/lib/ocasiones'

// Lo que se muestra al compartir un link (vista previa de WhatsApp, imagen Open Graph).
// Es lo mismo que ve cualquiera con el link, y NUNCA incluye reservas, compras ni comentarios:
// la vista previa también le puede llegar al dueño.

export type ItemCompartido = {
  titulo: string
  fotoUrl: string | null
  precio: string | null
  prioridad: 'mucho' | 'gustaria' | 'suelta'
  /** "Euge Mateus", "Delfina y Martín" */
  para: string
  grupoNombre: string | null
  /** Es un aporte en plata: no se reserva, se aporta. Nunca cuánto se juntó ni quién aportó. */
  aporte: boolean
}

export type ListaCompartida = {
  para: string
  grupoNombre: string | null
  /** De una lista en común, para qué es (ver ocasiones.ts). */
  ocasion: Ocasion | null
  fotos: string[]
  cantidad: number
  /** Tiene algún aporte en plata (para decirlo en la vista previa); nada de lo que se aportó. */
  conAportes: boolean
}

const PESO = { mucho: 0, gustaria: 1, suelta: 2 } as const

async function listaPorToken(db: Db, token: string) {
  if (!esToken(token)) return null
  const [list] = await db.select().from(lists).where(eq(lists.shareToken, token))
  // la vista previa de una sorpresa no dice qué es: el link puede terminar en un chat donde está el que la recibe
  if (!list || list.tipo === 'sorpresa') return null
  const duenos = await duenosDeLista(db, list)
  return { list, para: juntarNombres(duenos.map((d) => d.nombre)), grupoNombre: list.tipo === 'grupo' ? list.nombre ?? 'Lista en común' : null }
}

/** El deseo tal como se ve al compartirlo. Null si no existe, no es de esa lista o ya no está activo. */
export async function itemParaCompartir(db: Db, token: string, itemId: string): Promise<ItemCompartido | null> {
  if (!esUuid(itemId)) return null
  const l = await listaPorToken(db, token)
  if (!l) return null
  const [i] = await db.select({
    titulo: items.titulo, fotoUrl: items.fotoUrl, precio: items.precio, rangoPrecio: items.rangoPrecio,
    prioridad: items.prioridad, estado: items.estadoDueno, tipo: items.tipo,
  }).from(items).where(and(eq(items.id, itemId), eq(items.listId, l.list.id)))
  if (!i || i.estado !== 'activo') return null
  return {
    titulo: i.titulo, fotoUrl: i.fotoUrl, precio: i.precio ?? i.rangoPrecio, prioridad: i.prioridad, para: l.para, grupoNombre: l.grupoNombre,
    aporte: i.tipo === 'aporte',
  }
}

/** La lista tal como se ve al compartirla: de quién es y hasta 3 fotos de lo que más quiere. */
export async function listaParaCompartir(db: Db, token: string): Promise<ListaCompartida | null> {
  const l = await listaPorToken(db, token)
  if (!l) return null
  const activos = await db.select({ fotoUrl: items.fotoUrl, prioridad: items.prioridad, tipo: items.tipo }).from(items)
    .where(and(eq(items.listId, l.list.id), eq(items.estadoDueno, 'activo'))).orderBy(asc(items.createdAt))
  const fotos = activos.filter((i) => i.fotoUrl).sort((a, b) => PESO[a.prioridad] - PESO[b.prioridad]).slice(0, 3).map((i) => i.fotoUrl!)
  return {
    para: l.para, grupoNombre: l.grupoNombre, ocasion: ocasionDeLista(l.list), fotos, cantidad: activos.length,
    conAportes: activos.some((i) => i.tipo === 'aporte'),
  }
}

const primerNombre = (para: string) => (para.includes(' y ') ? para : para.split(' ')[0])

/** Texto para WhatsApp de quien regala: el link arma la vista previa con la foto. De un aporte en plata, que se puede aportar. */
export function textoRegalador(i: Pick<ItemCompartido, 'titulo' | 'precio' | 'para'> & { aporte?: boolean }, url: string) {
  if (i.aporte) return `Para ${primerNombre(i.para)} se puede aportar para "${i.titulo}" 🎁\n${url}`
  return `Mirá este regalo para ${primerNombre(i.para)}: ${i.titulo}${i.precio ? ` (${i.precio})` : ''} 🎁\n${url}`
}

/** Texto para WhatsApp del dueño que comparte uno de sus deseos. De un aporte en plata, que se puede aportar. */
export function textoDueno(i: { titulo: string; tipo?: string }, url: string) {
  if (i.tipo === 'aporte') return `Si querés aportar para "${i.titulo}", es por acá 🎁\n${url}`
  return `Esto es algo que me encantaría: ${i.titulo} 🎁\n${url}`
}

/**
 * Texto para WhatsApp del dueño que manda su lista entera (Mi lista y "¡Anotado!"). Dice qué hay que hacer y la regla de la
 * sorpresa en una línea: con solo "Armé mi lista" y el link, el que lo recibía no sabía que podía reservar, ni que el
 * dueño no se entera.
 */
export function textoMiLista(url: string) {
  return `Armé mi lista de deseos en GiftR 🎁 Elegí algo y reservalo: yo no me entero de quién regala qué.\n${url}`
}

/**
 * Texto para WhatsApp de los que arman una lista en común, para los que regalan ("Mandar a quienes regalan"), según para
 * qué es (ver ocasiones.ts). Como el de Mi lista: qué hay que hacer y, en una línea, que ellos no se enteran de quién
 * regala qué. En un casamiento o un baby shower dice además que se puede aportar: es lo que más se elige, y sin decirlo el
 * que recibe el link busca "el regalo" y no lo ve.
 */
export function textoListaEnComun(l: { nombre: string; ocasion: Ocasion }, url: string) {
  const sorpresa = 'no vemos quién regala qué'
  const texto = {
    cumple: `Armamos la lista de ${tituloSinCumple(l.nombre)} para su cumple 🎂 Elegí algo y reservalo, así no se repite: nosotros ${sorpresa}.`,
    casamiento: `¡Nos casamos! 💍 Armamos nuestra lista en GiftR: "${l.nombre}". Elegí un regalo y reservalo, o aportá para lo que más queremos: nosotros ${sorpresa}.`,
    baby_shower: `¡Se viene el bebé! 🍼 Armamos la lista "${l.nombre}" en GiftR. Elegí algo y reservalo, o aportá para lo más grande: nosotros ${sorpresa}.`,
    casa_nueva: `¡Casa nueva! 🏠 Armamos la lista "${l.nombre}" en GiftR. Elegí algo y reservalo, así no se repite: nosotros ${sorpresa}.`,
    otra: `Armamos la lista "${l.nombre}" en GiftR 🎁 Elegí algo y reservalo: nosotros ${sorpresa}.`,
  }[l.ocasion]
  return `${texto}\n${url}`
}

/** "Juancito" de "Cumple de Juancito" o "Lista de Juancito": el texto ya dice que es su cumple. */
const tituloSinCumple = (nombre: string) => nombre.replace(/^(?:cumple|lista)\s+de\s+/i, '')

/** Texto para WhatsApp de la invitación a armarla (el link que deja editar): va solo a quien la arma con vos. */
export function textoInvitarAArmar(l: { nombre: string }, url: string) {
  return `Armemos juntos la lista "${l.nombre}" en GiftR: ${url}`
}

// esUrlPublica vive en links.ts, sin dependencias: la usa también producto-del-link.ts, que no tiene por qué traer la base
export { esUrlPublica }

/** El nombre de antes, para la foto de la vista previa. */
export const esFotoPublica = esUrlPublica
