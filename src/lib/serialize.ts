import type { items } from '@/db/schema'

type ItemRow = typeof items.$inferSelect

// Vista dueño: SOLO estos campos, elegidos uno a uno (allowlist).
// Nunca agregar acá nada derivado de claims/comments/notifications.
export type OwnerItemView = {
  id: string
  tipo: 'exacto' | 'idea'
  titulo: string
  notas: string | null
  fotoUrl: string | null
  precio: string | null
  rangoPrecio: string | null
  categoria: string | null
  prioridad: 'mucho' | 'gustaria' | 'suelta'
  cantidad: number
  repetible: boolean
  estadoDueno: 'activo' | 'lo_tengo' | 'no_lo_quiero'
  linkTienda: string | null
}

export type ClaimView = {
  id: string
  estado: 'reservado' | 'comprado'
  claimerNombre: string
  esMia: boolean
  /** Solo en la reserva propia sin comprar: hasta cuándo dura. */
  vence: Date | null
  /** Solo en la compra suelta propia de este evento: "Me equivoqué, todavía no lo compré" (ver desmarcarComprado). */
  deshacer: boolean
  notaQueCompre: string | null
  /** Si esta reserva es de un regalo grupal: quiénes están (el encargado primero) y si el que mira es parte. */
  grupal: { giftId: string; personas: string[]; soyParte: boolean } | null
}

export type GiverItemView = OwnerItemView & {
  disponible: boolean
  /** Null en una idea que se puede repetir: no tiene cupo. */
  quedan: number | null
  claims: ClaimView[]
}

/** "Se puede repetir" es solo de las ideas: un "Quiero ESTO" con la marca (de antes de que se forzara) tiene cupo. */
export const esRepetible = (i: { tipo: 'exacto' | 'idea'; repetible: boolean }) => i.tipo === 'idea' && i.repetible

/**
 * Si a un deseo le queda lugar, con las reservas que lo ocupan (ver ocupaSql), como en reserveItem: una idea que se
 * puede repetir no tiene cupo; el resto, hasta su cantidad. Lo usan la lista del regalador y las fotos de Eventos.
 */
export function cupoDe(i: { tipo: 'exacto' | 'idea'; repetible: boolean; cantidad: number }, ocupados: number) {
  if (esRepetible(i)) return { quedan: null, disponible: true }
  const quedan = Math.max(0, i.cantidad - ocupados)
  return { quedan, disponible: quedan > 0 }
}

/**
 * Qué decirle del cupo a quien ve la coordinación de un deseo (la lista y el detalle lo dicen con sus palabras). Si el
 * dueño bajó la cantidad por debajo de lo reservado, cuántas reservas hay, para que se acomoden entre ellos (en vez de
 * "quedan 0 de 2"); si pide más de uno, cuántos quedan. Null si no hay nada que decir: pide uno, o es una idea que se
 * puede repetir (no tiene cupo).
 */
export function avisoDeCupo(i: { cantidad: number; quedan: number | null }, reservas: number):
  { deMas: true; reservas: number } | { deMas: false; quedan: number } | null {
  if (i.quedan === null) return null
  if (reservas > i.cantidad) return { deMas: true, reservas }
  return i.cantidad > 1 ? { deMas: false, quedan: i.quedan } : null
}

export function pickItemFields(i: ItemRow): OwnerItemView {
  return {
    id: i.id, tipo: i.tipo, titulo: i.titulo, notas: i.notas, fotoUrl: i.fotoUrl,
    precio: i.precio, rangoPrecio: i.rangoPrecio, categoria: i.categoria,
    prioridad: i.prioridad, cantidad: i.cantidad, repetible: esRepetible(i),
    estadoDueno: i.estadoDueno, linkTienda: i.linkTienda,
  }
}
