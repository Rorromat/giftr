// Plata en pesos enteros. Sin dependencias: lo usan también los componentes de cliente.

// Precios en otra moneda: la pantalla los mostraría como pesos ("US$ 300" → "~$100 cada uno"). "R$" son reales; "AR$" sí
// son pesos.
const OTRA_MONEDA = /US\$|U\$[SD]|USD|(?<![a-z])R\$|(?<![a-z])(?:EUR|euros?)(?![a-z])|€|d[oó]lar/i
// Un menos pegado al número o al "$": al principio ("-$5.000", "- 5000"), después del "$" ("$ -5000") o después de un
// espacio ("aprox -5000"). Un guion entre palabras no ("Talle M - $30.000", "Modelo XR-500, $80.000").
const NEGATIVO = /^\s*[-−–—]\s*\$?\s*\d|\$\s*[-−–—]\s*\d|\s[-−–—]\$?\d/
// Un número: miles con punto, coma o espacio ("45.000", "45,000", "45 000"), decimales con coma o punto ("1,5k") y un
// "k", "mil", "lucas" o "millones" detrás. "mil" no es el principio de "millones" (\b de JS no sabe de acentos).
const NUMERO = /(\d{1,3}(?:([., \u00a0])\d{3}(?!\d))(?:\2\d{3}(?!\d))*|\d+)(?:[.,](\d+))?\s*(k|mil(?![a-záéíóúñ])|lucas?(?![a-záéíóúñ])|mill[oó]n(?:es)?)?/i
// Lo que une los dos números de un rango: "$10–30k", "$10 a 30 mil", "entre 10 y 30 mil".
const HASTA = /^\s*(?:hasta|al|a|y|-|–|—)\s*\$?\s*/i
// "2 x 45.000": cuántos, y después el precio de cada uno.
const POR = /^\s*[x×]\s*\$?\s*(?=\d)/i
// Las palabras que van antes de un precio sin "$" ("entre 10 y 15 lucas", "aprox. 20.000"). Otra palabra dice qué es el
// número que sigue: "Talle 42 - 30.000", "N° 3", "Pack x 6", "Modelo 2024".
const ANTES_DEL_PRECIO = /^(?:entre|de|desde|hasta|aprox|aproximadamente|unos|unas|alrededor|cerca|m[aá]s|menos|o|como|tipo|precio|sale|cuesta|ars|pesos)$/i

function leerNumero(texto: string) {
  const m = texto.match(NUMERO)
  if (!m) return null
  const sufijo = m[4]?.toLowerCase()
  return {
    crudo: Number(`${m[1].replace(/[^\d]/g, '')}.${m[3] ?? 0}`),
    por: !sufijo ? null : sufijo.startsWith('mill') ? 1_000_000 : 1000,
    // cuántos grupos de miles tiene escritos ("30.000": 1)
    grupos: m[2] ? m[1].split(m[2]).length - 1 : 0,
    // solo dígitos, hasta 3, sin miles ni decimales ni sufijo: "20" de "$20-30.000", el "2" de "2 x 45.000"
    corto: !m[2] && !m[3] && !sufijo && m[1].length <= 3,
    resto: texto.slice((m.index ?? 0) + m[0].length),
  }
}

/** Antes del primer número hay una palabra que no es de precio (ver ANTES_DEL_PRECIO). */
function conEtiqueta(texto: string) {
  const antes = texto.slice(0, Math.max(0, texto.search(/\d/)))
  return (antes.match(/[a-záéíóúñü]+/gi) ?? []).some((p) => !ANTES_DEL_PRECIO.test(p))
}

/** Un menos antes del primer número (ver NEGATIVO). */
function esNegativo(texto: string) {
  const i = texto.search(/\d/)
  return i >= 0 && NEGATIVO.test(texto.slice(0, i + 1))
}

/**
 * El precio (texto libre) en pesos: "$45.000", "45.000,50" (redondeado), "45k", "15 lucas", "1,5k", "$ 45 000", "$45,000".
 * De un rango, el de abajo ("$10–30k" → 10.000, "$20-30.000" → 20.000). Desde el primer "$" si hay uno ("2 x $10.000" →
 * 10.000); sin "$", "2 x 45.000" → 45.000 y "Talle 42 - 30.000" → 30.000. Null si no hay un número o si no son pesos
 * (otra moneda, negativo): mejor no estimar que estimar mal.
 */
export function parsePesos(texto: string | null | undefined): number | null {
  if (!texto || OTRA_MONEDA.test(texto)) return null
  const desde = texto.indexOf('$')
  const desdeAca = desde >= 0 ? texto.slice(desde) : texto
  if (esNegativo(texto) || esNegativo(desdeAca)) return null
  let n = leerNumero(desdeAca)
  // Sin "$", un número pelado (sin miles ni "k") detrás de una palabra es de esa palabra (el talle, el número, cuántos, el
  // año): el precio es el que sigue, si hay otro. Si no, puede ser el precio ("Zapatillas 30000").
  for (let antes = desdeAca; desde < 0 && n && !n.grupos && !n.por && conEtiqueta(antes);) {
    const sigue = leerNumero(n.resto)
    if (!sigue) break
    antes = n.resto
    n = sigue
  }
  // "2 x 45.000": el primero es cuántos si no tiene "$" delante y es más chico que el que sigue ("100 x 2" son 100)
  if (desde < 0 && n?.corto && POR.test(n.resto)) {
    const cada = leerNumero(n.resto.replace(POR, ''))
    if (cada && cada.crudo * (cada.por ?? 1) > n.crudo) n = cada
  }
  if (!n) return null
  let por = n.por ?? 1
  if (!n.por && HASTA.test(n.resto)) {
    const hasta = leerNumero(n.resto.replace(HASTA, ''))
    // la "k" del final de un rango vale también para el de abajo, si es más chico
    if (hasta?.por && n.crudo <= hasta.crudo) por = hasta.por
    // y los miles escritos solo en el de arriba también ("$20-30.000"), si así queda más chico
    else if (hasta && !hasta.por && hasta.grupos && n.corto && n.crudo * 1000 ** hasta.grupos <= hasta.crudo) por = 1000 ** hasta.grupos
  }
  const pesos = Math.round(n.crudo * por)
  return Number.isSafeInteger(pesos) && pesos > 0 ? pesos : null
}

/**
 * La parte de alguien al dividir "A mano": vacía es que no pone, igual que 0 (la pantalla y el servidor la leen igual).
 * Null si no son pesos.
 */
export function partePesos(texto: string): number | null {
  return /^[\s$.,0]*$/.test(texto) ? 0 : parsePesos(texto)
}

/** 45000 → "$45.000" (separador de miles de Argentina, sin depender del ICU del servidor). */
export function pesos(n: number): string {
  return `${n < 0 ? '-' : ''}$${String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

/** Partes iguales en pesos enteros; los pesos que sobran van a los primeros (el encargado va primero). */
export function dividir(total: number, n: number): number[] {
  const base = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => base + (i < total - base * n ? 1 : 0))
}
