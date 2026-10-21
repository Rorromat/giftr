import { createHmac, timingSafeEqual } from 'node:crypto'
import { esUuid } from '@/lib/groups'

// La cookie del invitado es su única credencial. Lleva el id firmado (`<id>.<firma>`), así que conocer el id
// de alguien (por ejemplo, porque se filtró en una página) no alcanza para hacerse pasar por él.

export const GUEST_COOKIE = 'giftr_guest'

export const OPCIONES_COOKIE_INVITADO = {
  httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 31536000, path: '/',
} as const

// Solo para tests y desarrollo local: en producción la firma usa AUTH_SECRET (el mismo de las sesiones).
const SECRETO_DE_DESARROLLO = 'giftr-solo-para-desarrollo'

function secreto(): string {
  const s = process.env.AUTH_SECRET
  if (s) return s
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta AUTH_SECRET: sin esa variable no se pueden firmar las cookies de los invitados.')
  }
  return SECRETO_DE_DESARROLLO
}

const firma = (guestId: string) => createHmac('sha256', secreto()).update(`giftr_guest:${guestId}`).digest('base64url')

export function firmarInvitado(guestId: string): string {
  return `${guestId}.${firma(guestId)}`
}

/** El id del invitado si la cookie está bien firmada. Si no (una vieja sin firma, una tocada a mano, basura): null. */
export function leerInvitado(valor: string | undefined): string | null {
  const punto = valor?.indexOf('.') ?? -1
  if (!valor || punto < 0) return null
  const id = valor.slice(0, punto)
  if (!esUuid(id)) return null
  const esperada = Buffer.from(firma(id))
  const recibida = Buffer.from(valor.slice(punto + 1))
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada) ? id : null
}
