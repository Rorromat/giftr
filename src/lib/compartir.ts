import { and, asc, eq } from 'drizzle-orm'
import { items, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { duenosDeLista, esToken, esUuid, juntarNombres } from '@/lib/groups'
import { esUrlPublica } from '@/lib/links'

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
}

export type ListaCompartida = {
  para: string
  grupoNombre: string | null
  fotos: string[]
  cantidad: number
}

const PESO = { mucho: 0, gustaria: 1, suelta: 2 } as const

async function listaPorToken(db: Db, token: string) {
  if (!esToken(token)) return null
  const [list] = await db.select().from(lists).where(eq(lists.shareToken, token))
  if (!list) return null
  const duenos = await duenosDeLista(db, list)
  return { list, para: juntarNombres(duenos.map((d) => d.nombre)), grupoNombre: list.tipo === 'grupo' ? list.nombre ?? 'Grupo' : null }
}

/** El deseo tal como se ve al compartirlo. Null si no existe, no es de esa lista o ya no está activo. */
export async function itemParaCompartir(db: Db, token: string, itemId: string): Promise<ItemCompartido | null> {
  if (!esUuid(itemId)) return null
  const l = await listaPorToken(db, token)
  if (!l) return null
  const [i] = await db.select({
    titulo: items.titulo, fotoUrl: items.fotoUrl, precio: items.precio, rangoPrecio: items.rangoPrecio,
    prioridad: items.prioridad, estado: items.estadoDueno,
  }).from(items).where(and(eq(items.id, itemId), eq(items.listId, l.list.id)))
  if (!i || i.estado !== 'activo') return null
  return { titulo: i.titulo, fotoUrl: i.fotoUrl, precio: i.precio ?? i.rangoPrecio, prioridad: i.prioridad, para: l.para, grupoNombre: l.grupoNombre }
}

/** La lista tal como se ve al compartirla: de quién es y hasta 3 fotos de lo que más quiere. */
export async function listaParaCompartir(db: Db, token: string): Promise<ListaCompartida | null> {
  const l = await listaPorToken(db, token)
  if (!l) return null
  const activos = await db.select({ fotoUrl: items.fotoUrl, prioridad: items.prioridad }).from(items)
    .where(and(eq(items.listId, l.list.id), eq(items.estadoDueno, 'activo'))).orderBy(asc(items.createdAt))
  const fotos = activos.filter((i) => i.fotoUrl).sort((a, b) => PESO[a.prioridad] - PESO[b.prioridad]).slice(0, 3).map((i) => i.fotoUrl!)
  return { para: l.para, grupoNombre: l.grupoNombre, fotos, cantidad: activos.length }
}

const primerNombre = (para: string) => (para.includes(' y ') ? para : para.split(' ')[0])

/** Texto para WhatsApp de quien regala: el link arma la vista previa con la foto. */
export function textoRegalador(i: Pick<ItemCompartido, 'titulo' | 'precio' | 'para'>, url: string) {
  return `Mirá este regalo para ${primerNombre(i.para)}: ${i.titulo}${i.precio ? ` (${i.precio})` : ''} 🎁\n${url}`
}

/** Texto para WhatsApp del dueño que comparte uno de sus deseos. */
export function textoDueno(i: { titulo: string }, url: string) {
  return `Esto es algo que me encantaría: ${i.titulo} 🎁\n${url}`
}

// esUrlPublica vive en links.ts, sin dependencias: la usa también producto-del-link.ts, que no tiene por qué traer la base
export { esUrlPublica }

/** El nombre de antes, para la foto de la vista previa. */
export const esFotoPublica = esUrlPublica
