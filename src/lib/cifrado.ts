import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { secretoDeLaApp } from '@/lib/cookie-invitado'

// Cifrar lo que se guarda en la base y no puede quedar a la vista (los tokens de la cuenta de MercadoLibre): AES-256-GCM,
// con una clave que sale del secreto de la app por HKDF con una etiqueta propia. No es la clave que firma las cookies: si
// una se filtrara, no da la otra. Cada valor lleva para qué es (uso): uno no se descifra en el lugar de otro.

const ETIQUETA = 'giftr:cifrado-en-la-base:v1'
const VERSION = 'v1'

const clave = () => Buffer.from(hkdfSync('sha256', secretoDeLaApp(), '', ETIQUETA, 32))

/** El texto cifrado, como `v1.<iv>.<tag>.<cifrado>` (base64url). */
export function cifrar(texto: string, uso: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', clave(), iv)
  c.setAAD(Buffer.from(uso))
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return [VERSION, iv, c.getAuthTag(), datos].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.')
}

/** El texto de cifrar; null si no se puede (otra clave, otro uso, tocado o basura). Nunca tira. */
export function descifrar(valor: string | null | undefined, uso: string): string | null {
  const [version, iv, tag, datos, ...resto] = valor?.split('.') ?? []
  if (version !== VERSION || !iv || !tag || datos === undefined || resto.length) return null
  try {
    // con el tag entero: uno recortado no se acepta
    const d = createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'base64url'), { authTagLength: 16 })
    d.setAAD(Buffer.from(uso))
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([d.update(Buffer.from(datos, 'base64url')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}
