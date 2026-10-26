// Lo que se escribe a mano y le llega a todos los que abren la lista. El servidor corta acá (un pedido armado a mano no
// pasa por el maxLength de los inputs); los inputs llevan el mismo largo para que se note antes de mandar.

export const LARGO = {
  titulo: 120, notas: 500, precio: 40, rangoPrecio: 40, categoria: 40, link: 2000, comentario: 500, notaCompra: 200,
  nombreGrupo: 60, descripcionGrupo: 120, paraSorpresa: 60,
} as const

/** Cuántas unidades puede pedir un deseo (más que eso no es un regalo, y la columna tiene su tope). */
export const CANTIDAD_MAXIMA = 99

export const acotarCantidad = (n: number, tope = CANTIDAD_MAXIMA) => (Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), tope) : 1)

// Intl.Segmenter se crea recién cuando hace falta, y si no existe se cuenta por puntos de código: este archivo también va
// en los formularios del navegador, y en uno sin Intl.Segmenter (Firefox antes de 125, Safari antes de 14.1) no se podía ni
// cargar la página.
let segmentador: Intl.Segmenter | null | undefined

/** Los caracteres de verdad del texto, uno por uno (sin Intl.Segmenter, una tilde o un tono de piel cuentan aparte). */
function* caracteres(t: string): Generator<string> {
  segmentador ??= typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('es', { granularity: 'grapheme' }) : null
  if (!segmentador) yield* t
  else for (const { segment } of segmentador.segment(t)) yield segment
}

/**
 * Sin los caracteres de control que Postgres no acepta (\u0000) o que no se ven, ni los que dan vuelta lo que sigue
 * (U+202E en el nombre de un invitado daba vuelta el resto de "Reservado por …"). Los saltos de línea y el tab quedan.
 */
export const sinControl = (t: string) => t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')

/** Cuántos caracteres de verdad tiene: un emoji (aunque sea una familia o una bandera) cuenta como uno. */
export const largo = (t: string) => [...caracteres(t)].length

// Un carácter de verdad puede llevar cientos de miles de marcas encimadas (el texto "zalgo"), o de emojis unidos con
// ZWJ, que no son marcas: cuenta como uno, pero desborda hacia arriba y abajo, o es un bloque que no se puede partir y se
// sale de la tarjeta. Con tildes, una letra lleva una o dos marcas; un emoji, a lo sumo dos (las de la tecla del 1️⃣), y el
// más largo (una familia con tonos de piel) no llega a 20 unidades de JS.
const MARCAS_POR_CARACTER = 4
const UNIDADES_POR_CARACTER = 32
const MARCA = /\p{M}/u

/** Un carácter de verdad con hasta 4 marcas encimadas y 32 unidades de JS: lo que pasa de eso se va. */
function sinEncimar(caracter: string): string {
  if (caracter.length <= MARCAS_POR_CARACTER) return caracter
  let r = ''
  let marcas = 0
  for (const c of caracter) {
    if (MARCA.test(c) && ++marcas > MARCAS_POR_CARACTER) continue
    if (r.length + c.length > UNIDADES_POR_CARACTER) break
    r += c
  }
  return r
}

/** Sin lo encimado de más (ver sinEncimar), para lo que no pasa por recortar (el nombre de un invitado). */
export const sinZalgo = (t: string) => Array.from(caracteres(t), sinEncimar).join('')

/**
 * Sin espacios en las puntas y de hasta max caracteres de verdad, sin partir un emoji al medio ni encimar. Se mira siempre
 * carácter por carácter: aunque el largo de JS entre, uno solo puede ocupar cientos de unidades sin tener una marca.
 */
export function recortar(texto: string, max: number): string {
  const t = sinControl(texto).trim()
  let r = ''
  let n = 0
  for (const c of caracteres(t)) {
    if (n === max) break
    r += sinEncimar(c)
    n++
  }
  return r.trim()
}

/** Lo que anotó al comprar ("el negro, talle M"): corto, y null si no anotó nada. */
export const notaDeCompra = (nota?: string | null) => (nota && recortar(nota, LARGO.notaCompra)) || null
