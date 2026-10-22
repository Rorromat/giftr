import { LARGO } from '@/lib/limites'

// Links escritos o pegados a mano (el de la tienda, el de una foto, uno pegado en el título). Sin dependencias: lo usan
// también los formularios en el navegador.

const ESQUEMA_HTTP = /^https?:\/\//i
// "mercadolibre.com.ar/…", "www.zara.com/ar": un dominio con punto, sin espacios, y lo que siga después de / ? o #
const DOMINIO = /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+(:\d+)?([/?#]\S*)?$/u

/**
 * Un link http(s), tal como lo escribieron: si viene sin esquema pero con pinta de dominio, con https:// adelante.
 * Null si no es un link de una página (javascript:, data:, texto suelto) o si es más largo de lo que se guarda (cortado
 * no anda). Termina en un <a href>: nunca otro esquema.
 */
export function linkHttp(valor: string): string | null {
  const v = valor.trim().replace(/^\/\//, '')
  // new URL acepta un \u0000 en el medio, y Postgres no: con eso, guardar el deseo daba la pantalla de error
  if (!v || /[\s\u0000-\u001f\u007f]/.test(v) || v.length > LARGO.link) return null
  const conEsquema = ESQUEMA_HTTP.test(v) ? v : DOMINIO.test(v) ? `https://${v}` : null
  if (!conEsquema || conEsquema.length > LARGO.link) return null
  try {
    const u = new URL(conEsquema)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? conEsquema : null
  } catch {
    return null
  }
}

/** Para el título de un deseo que era solo un link: el sitio, legible ("mercadolibre.com.ar"), para que el dueño lo cambie. */
export function sitioDeLink(link: string): string {
  try {
    return new URL(link).hostname.replace(/^(www|m|articulo|listado|produto)\./i, '')
  } catch {
    return link
  }
}

const LINK_EN_TEXTO = /(?:https?:\/\/|www\.)\S+/i
const PUNTUACION = `.,;:!?'"»”`
const cuenta = (s: string, c: string) => s.split(c).length - 1

// La puntuación de la oración pegada al final ("…/m, el negro", "…/x.", "(ver www.zara.com/ar)") no es del link: con eso
// "Ver en la tienda" llevaba a una página que no existe. Un ")" que abre adentro se queda (wikipedia …/Mate_(infusión)).
// Letra por letra desde el final, sin una regex con $: el título no tiene largo máximo y una así tarda el cuadrado.
function sinPuntuacionFinal(s: string): string {
  const abren = cuenta(s, '(')
  let cierran = cuenta(s, ')')
  let fin = s.length
  while (fin > 0) {
    const c = s[fin - 1]
    if (c === ')' && cierran > abren) cierran--
    else if (!PUNTUACION.includes(c)) break
    fin--
  }
  return s.slice(0, fin)
}

/**
 * El primer link http(s) de un texto ("Mate imperial https://…") y lo que queda sin él ni la puntuación pegada ("Remera
 * (ver": el dueño lo corrige si quiere). Null si no tiene.
 */
export function linkEnTexto(texto: string): { link: string; resto: string } | null {
  const m = LINK_EN_TEXTO.exec(texto)
  const link = m && linkHttp(sinPuntuacionFinal(m[0]))
  if (!m || !link) return null
  return { link, resto: `${texto.slice(0, m.index)} ${texto.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim() }
}

const RUTA_FOTO_DESEO = /^\/foto\/deseo\/([0-9a-f-]{36})$/i

/** Si el valor es la URL de una foto de deseo subida (y no un link cualquiera). */
export const esUrlFotoDeseo = (v: string) => RUTA_FOTO_DESEO.test(v)
