import { createHmac, timingSafeEqual } from 'node:crypto'
import { esUuid } from '@/lib/groups'

// La cookie del invitado es su única credencial. Lleva el id firmado (`<id>.<firma>`), así que conocer el id
// de alguien (por ejemplo, porque se filtró en una página) no alcanza para hacerse pasar por él.
// No se llama como la de antes (giftr_guest, con el id sin firmar): si se vuelve atrás el deploy, el código viejo la
// tomaría como el id y cada consulta sobre columnas uuid daría error. Con otro nombre, ese código ve un visitante sin
// cookie. La vieja ya no se lee: sin firma no vale.
export const GUEST_COOKIE = 'giftr_invitado'

export const OPCIONES_COOKIE_INVITADO = {
  httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 31536000, path: '/',
} as const

// Solo para tests y desarrollo local: en producción la firma usa el secreto de las sesiones.
const SECRETO_DE_DESARROLLO = 'giftr-solo-para-desarrollo'

/**
 * El secreto de la app (el de las sesiones). Firma las cookies de acá y la del pedido para conectar MercadoLibre, y de él
 * sale (con otra etiqueta) la clave que cifra los tokens de MercadoLibre (ver cifrado.ts).
 */
export function secretoDeLaApp(): string {
  // el mismo que usa Auth.js, que también acepta el nombre viejo: si no, con solo NEXTAUTH_SECRET se entra pero
  // anotarse, reservar como invitado o cerrar sesión darían error
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (s) return s
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta AUTH_SECRET: sin esa variable no se pueden firmar las cookies de los invitados.')
  }
  return SECRETO_DE_DESARROLLO
}

export const hmac = (mensaje: string) => createHmac('sha256', secretoDeLaApp()).update(mensaje).digest('base64url')
const firma = (guestId: string) => hmac(`giftr_guest:${guestId}`)

export const igualesSinFiltrarTiempo = (a: string, b: string) => {
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
// Lleva una marca por cuenta (`<marca>~<marca>…`): en la tablet de la familia, que Rodri diga que no, no le vuelve a
// preguntar a Euge. Cada marca ya es una firma de (invitado, cuenta), así que la lista no necesita otra.
export const NO_SOY_COOKIE = 'giftr_no_soy'

// las más recientes; con una familia entera usando la misma tablet sobra
const NO_SOY_MAXIMO = 20

const marcaNoSoy = (guestId: string, userId: string) => hmac(`giftr_no_soy:${guestId}:${userId}`)

/** Las marcas de antes más la de esta cuenta (la de una sola marca, de antes de que fueran varias, sigue valiendo). */
export function sumarNoSoy(valor: string | undefined, guestId: string, userId: string): string {
  const marca = marcaNoSoy(guestId, userId)
  return [...(valor?.split('~') ?? []).filter((m) => m && m !== marca), marca].slice(-NO_SOY_MAXIMO).join('~')
}

export function dijoQueNoEs(valor: string | undefined, guestId: string, userId: string): boolean {
  const marca = marcaNoSoy(guestId, userId)
  return !!valor && valor.split('~').some((m) => igualesSinFiltrarTiempo(m, marca))
}

// Las cuentas de Google que tuvieron sesión en este navegador. Un invitado no ve la capa oculta de las listas de esas
// cuentas: después de "Cerrar sesión" en la tablet de la familia (o si se le venció la sesión), el dueño queda con la
// cookie de otro invitado, o con la suya de cuando se anotó con su nombre, y abrir su link le contaría todo.
// Se anota al entrar con Google, al contestar "¿Sos vos?", al cerrar sesión y al abrir la app con una sesión que todavía no
// la anotó (las de antes de que existiera). Se vuelve a escribir al anotar un invitado: así nunca vence antes que la cookie
// de un invitado más nuevo (si no, al año del último login la dueña volvería a ver lo que reservó la abuela).
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

/** Si esta cuenta ya está anotada en este navegador (para no escribir la cookie en cada pantalla). */
export function cuentaAnotada(jar: Pick<Frasco, 'get'>, userId: string): boolean {
  return leerCuentas(jar.get(CUENTAS_COOKIE)?.value).includes(userId)
}

/** Vuelve a escribir las cuentas anotadas, iguales, con el vencimiento contado desde ahora (al anotar un invitado). */
export function renovarCuentas(jar: Frasco) {
  const valor = jar.get(CUENTAS_COOKIE)?.value
  if (valor && leerCuentas(valor).length) jar.set(CUENTAS_COOKIE, valor, OPCIONES_COOKIE_INVITADO)
}
