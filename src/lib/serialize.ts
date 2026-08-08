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
  notaQueCompre: string | null
}

export type GiverItemView = OwnerItemView & {
  disponible: boolean
  quedan: number
  claims: ClaimView[]
}

export function pickItemFields(i: ItemRow): OwnerItemView {
  return {
    id: i.id, tipo: i.tipo, titulo: i.titulo, notas: i.notas, fotoUrl: i.fotoUrl,
    precio: i.precio, rangoPrecio: i.rangoPrecio, categoria: i.categoria,
    prioridad: i.prioridad, cantidad: i.cantidad, repetible: i.repetible,
    estadoDueno: i.estadoDueno, linkTienda: i.linkTienda,
  }
}
