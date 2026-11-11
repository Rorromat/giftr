import type { items } from '@/db/schema'
import { leerPrecio, type Moneda } from '@/lib/pesos'

type ItemRow = typeof items.$inferSelect

/** Los tipos de deseo: "Quiero ESTO", una idea (sirve algo parecido) o un aporte en plata (ver esAporte). */
export type TipoDeseo = ItemRow['tipo']

// Vista dueño: SOLO estos campos, elegidos uno a uno (allowlist).
// Nunca agregar acá nada derivado de claims/comments/notifications.
export type OwnerItemView = {
  id: string
  tipo: TipoDeseo
  titulo: string
  notas: string | null
  fotoUrl: string | null
  precio: string | null
  rangoPrecio: string | null
  /**
   * El precio en número (el piso; el techo solo si es un rango) y su moneda, leídos del texto, y cuándo se cargó o cambió.
   * Null si no tiene precio o no se pudo leer. Sale del deseo, no de quién lo reservó: no rompe la regla de arriba.
   */
  precioMin: number | null
  precioMax: number | null
  precioMoneda: Moneda | null
  precioAt: Date | null
  categoria: string | null
  prioridad: 'mucho' | 'gustaria' | 'suelta'
  cantidad: number
  repetible: boolean
  estadoDueno: 'activo' | 'lo_tengo' | 'no_lo_quiero' | 'me_lo_regalaron'
  linkTienda: string | null
  videoUrl: string | null
  /**
   * Solo en un aporte en plata: a qué alias o CVU transferir y cuánto quiere juntar (pesos; null: sin meta). Los cargó el
   * dueño para que los vea cualquiera con el link: son del deseo, no de quién aportó, y no rompen la regla de arriba.
   */
  aporteAlias: string | null
  aporteMeta: number | null
}

export type ClaimView = {
  id: string
  estado: 'reservado' | 'comprado'
  /** Null: al que mira no le toca saber quién (un invitado sin cuenta en una lista que lo muestra solo con cuenta). */
  claimerNombre: string | null
  esMia: boolean
  /** Solo en la reserva propia sin comprar: hasta cuándo dura. */
  vence: Date | null
  /** Solo en la compra suelta propia de este evento: "Me equivoqué, todavía no lo compré" (ver desmarcarComprado). */
  deshacer: boolean
  notaQueCompre: string | null
  /** Solo en el aporte propio a un deseo de aporte en plata: cuánto anotó (pesos; null si no lo dijo). El de otro, nunca. */
  monto: number | null
  /**
   * Si esta reserva es de un regalo grupal: cuántos y quiénes están (el encargado primero; sin nombres para quien no le
   * toca verlos) y si el que mira es parte. meSacaron: lo sacó el encargado del regalo, que sigue abierto, y no se puede
   * sumar (ver sacarDeRegalo).
   */
  grupal: { giftId: string; cuantos: number; personas: string[]; soyParte: boolean; meSacaron: boolean } | null
}

export type GiverItemView = OwnerItemView & {
  disponible: boolean
  /** Null en una idea que se puede repetir: no tiene cupo. */
  quedan: number | null
  /**
   * Las reservas del deseo. En un aporte en plata, los aportes ("Ya aporté"): todos comprados, y a quien no le toca ver
   * nombres (ver sinNombresPara) le llega solo el suyo, ni siquiera cuántos hay.
   */
  claims: ClaimView[]
  /**
   * Solo en un aporte con meta, y solo para quien regala con su cuenta: más o menos cuánto va juntado, de lo que
   * anotaron los que aportaron (ver juntadoAprox). Null: no se le muestra progreso. Al dueño no le llega por ningún lado.
   */
  juntado: number | null
}

/**
 * Un aporte en plata ("Luna de miel", "Cochecito"): no es un objeto que alguien reserva y compra, sino plata que cada uno
 * transfiere al alias del deseo. Nunca queda ocupado, no vence, no se divide en un regalo grupal ni cuenta para el tope
 * de reservas (ver aportar, en claims.ts).
 */
export const esAporte = (i: { tipo: TipoDeseo }) => i.tipo === 'aporte'

/**
 * "Se puede repetir" es solo de las ideas: un "Quiero ESTO" con la marca (de antes de que se forzara) tiene cupo. Un
 * aporte en plata se repite siempre: pueden aportar todos, y lo del evento pasado no le quita a nadie aportar para este.
 */
export const esRepetible = (i: { tipo: TipoDeseo; repetible: boolean }) => esAporte(i) || (i.tipo === 'idea' && i.repetible)

/**
 * Si a un deseo le queda lugar, con las reservas que lo ocupan (ver ocupaSql), como en reserveItem: una idea que se
 * puede repetir no tiene cupo; el resto, hasta su cantidad. Lo usan la lista del regalador y las fotos de Eventos.
 */
export function cupoDe(i: { tipo: TipoDeseo; repetible: boolean; cantidad: number }, ocupados: number) {
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
  // Un deseo de antes de que se guardara el número, con un precio que el relleno de la migración no entendía ("45k",
  // "15 lucas"): se lee acá, así también entra en "Hasta $X" sin esperar a que el dueño lo edite.
  const leido = i.precioMin === null ? leerPrecio(i.precio ?? i.rangoPrecio) : null
  return {
    id: i.id, tipo: i.tipo, titulo: i.titulo, notas: i.notas, fotoUrl: i.fotoUrl,
    precio: i.precio, rangoPrecio: i.rangoPrecio, categoria: i.categoria,
    precioMin: i.precioMin ?? leido?.min ?? null, precioMax: leido ? leido.max : i.precioMax,
    precioMoneda: i.precioMoneda ?? leido?.moneda ?? null, precioAt: i.precioAt,
    prioridad: i.prioridad, cantidad: i.cantidad, repetible: esRepetible(i),
    estadoDueno: i.estadoDueno, linkTienda: i.linkTienda, videoUrl: i.videoUrl,
    // solo en un aporte: un deseo de otro tipo no los lleva aunque la fila los tenga
    aporteAlias: esAporte(i) ? i.aporteAlias : null, aporteMeta: esAporte(i) ? i.aporteMeta : null,
  }
}

/**
 * Lo juntado de un aporte, redondeado para abajo a dos cifras ($123.456 → $120.000): es lo que anotaron los que quisieron
 * decir cuánto, así que ya es aproximado, y con el número exacto se podría sacar cuánto puso el último.
 */
export function juntadoAprox(total: number): number {
  if (total < 100) return Math.max(0, Math.floor(total))
  const paso = 10 ** (Math.floor(Math.log10(total)) - 1)
  return Math.floor(total / paso) * paso
}
