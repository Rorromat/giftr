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

const hmac = (mensaje: string) => createHmac('sha256', secreto()).update(mensaje).digest('base64url')
const firma = (guestId: string) => hmac(`giftr_guest:${guestId}`)

const igualesSinFiltrarTiempo = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function firmarInvitado(guestId: string): string {
  return `${guestId}.${firma(guestId)}`
}

/** El id del invitado si la cookie está bien firmada. Si no (una vieja sin firma, una tocada a mano, basura): null. */
export function leerInvitado(valor: string | undefined): string | null {
  const punto = valor?.indexOf('.') ?? -1
  if (!valor || punto < 0) return null
  const id = valor.slice(0, punto)
  if (!esUuid(id)) return null
  return igualesSinFiltrarTiempo(valor.slice(punto + 1), firma(id)) ? id : null
}

// "No soy yo": la cuenta que entró en este navegador dijo que no es el invitado que estaba anotado.
// No se le vuelve a preguntar, y la cookie del invitado sigue ahí para cuando vuelva a usarlo esa persona.
export const NO_SOY_COOKIE = 'giftr_no_soy'

export const marcaNoSoy = (guestId: string, userId: string) => hmac(`giftr_no_soy:${guestId}:${userId}`)

export function dijoQueNoEs(valor: string | undefined, guestId: string, userId: string): boolean {
  return !!valor && igualesSinFiltrarTiempo(valor, marcaNoSoy(guestId, userId))
}

// Las cuentas de Google que tuvieron sesión en este navegador. Un invitado no ve la capa oculta de las listas de esas
// cuentas: después de "Cerrar sesión" en la tablet de la familia (o si se le venció la sesión), el dueño queda con la
// cookie de otro invitado, o con la suya de cuando se anotó con su nombre, y abrir su link le contaría todo.
// Se anota al entrar con Google, al contestar "¿Sos vos?" y al cerrar sesión.
export const CUENTAS_COOKIE = 'giftr_cuentas'

// las más recientes; con una familia entera usando la misma tablet sobra
const CUENTAS_MAXIMO = 20

const firmaCuentas = (ids: string) => hmac(`giftr_cuentas:${ids}`)

/** Las cuentas anotadas, si la cookie está bien firmada (`<id>~<id>….<firma>`). Si no: ninguna. */
export function leerCuentas(valor: string | undefined): string[] {
  const punto = valor?.lastIndexOf('.') ?? -1
  if (!valor || punto < 0) return []
  const ids = valor.slice(0, punto)
  if (!igualesSinFiltrarTiempo(valor.slice(punto + 1), firmaCuentas(ids))) return []
  return ids.split('~').filter(esUuid)
}

export function sumarCuenta(valor: string | undefined, userId: string): string {
  const ids = [...leerCuentas(valor).filter((id) => id !== userId), userId].slice(-CUENTAS_MAXIMO).join('~')
  return `${ids}.${firmaCuentas(ids)}`
}

type Frasco = {
  get(nombre: string): { value: string } | undefined
  set(nombre: string, valor: string, opciones: typeof OPCIONES_COOKIE_INVITADO): unknown
}

/** Anota en las cookies de este navegador que esta cuenta tuvo sesión acá (en una server action o un route handler). */
export function anotarCuenta(jar: Frasco, userId: string) {
  jar.set(CUENTAS_COOKIE, sumarCuenta(jar.get(CUENTAS_COOKIE)?.value, userId), OPCIONES_COOKIE_INVITADO)
}
