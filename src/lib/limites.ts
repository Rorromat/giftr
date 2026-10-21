// Lo que se escribe a mano y le llega a todos los que abren la lista. El servidor corta acá (un pedido armado a mano no
// pasa por el maxLength de los inputs); los inputs llevan el mismo largo para que se note antes de mandar.

export const LARGO = {
  titulo: 120, notas: 500, precio: 40, rangoPrecio: 40, categoria: 40, link: 2000, comentario: 500, notaCompra: 200,
  nombreGrupo: 60, descripcionGrupo: 120,
} as const

/** Cuántas unidades puede pedir un deseo (más que eso no es un regalo, y la columna tiene su tope). */
export const CANTIDAD_MAXIMA = 99

export const acotarCantidad = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), CANTIDAD_MAXIMA) : 1)

const segmentos = new Intl.Segmenter('es', { granularity: 'grapheme' })

/** Sin los caracteres de control que Postgres no acepta (\u0000) o que no se ven; los saltos de línea y el tab quedan. */
export const sinControl = (t: string) => t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')

/** Cuántos caracteres de verdad tiene: un emoji (aunque sea una familia o una bandera) cuenta como uno. */
export const largo = (t: string) => [...segmentos.segment(t)].length

/** Sin espacios en las puntas y de hasta max caracteres de verdad, sin partir un emoji al medio. */
export function recortar(texto: string, max: number): string {
  const t = sinControl(texto).trim()
  // cada carácter de verdad ocupa al menos una unidad de JS: si el largo de JS entra, entra
  if (t.length <= max) return t
  let fin = 0
  let n = 0
  for (const { index, segment } of segmentos.segment(t)) {
    if (n === max) break
    fin = index + segment.length
    n++
  }
  return t.slice(0, fin).trim()
}

/** Lo que anotó al comprar ("el negro, talle M"): corto, y null si no anotó nada. */
export const notaDeCompra = (nota?: string | null) => (nota && recortar(nota, LARGO.notaCompra)) || null
