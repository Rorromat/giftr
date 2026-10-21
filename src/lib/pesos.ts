// Plata en pesos enteros. Sin dependencias: lo usan también los componentes de cliente.

// Precios en otra moneda: la pantalla los mostraría como pesos ("US$ 300" → "~$100 cada uno").
const OTRA_MONEDA = /US\$|U\$[SD]|USD|(?<![a-z])(?:EUR|euros?)(?![a-z])|€|d[oó]lar/i
// Un menos antes del primer número: "-$5.000", "$ -5000".
const NEGATIVO = /^\D*[-−–—]\s*\$?\s*\d/
// Un número: miles con punto, coma o espacio ("45.000", "45,000", "45 000"), decimales con coma o punto ("1,5k") y un
// "k", "mil" o "millones" detrás. "mil" no es el principio de "millones" (\b de JS no sabe de acentos).
const NUMERO = /(\d{1,3}(?:([., \u00a0])\d{3}(?!\d))(?:\2\d{3}(?!\d))*|\d+)(?:[.,](\d+))?\s*(k|mil(?![a-záéíóúñ])|mill[oó]n(?:es)?)?/i
// Lo que une los dos números de un rango: "$10–30k", "$10 a 30 mil", "entre 10 y 30 mil".
const HASTA = /^\s*(?:hasta|al|a|y|-|–|—)\s*\$?\s*/i

function leerNumero(texto: string) {
  const m = texto.match(NUMERO)
  if (!m) return null
  const sufijo = m[4]?.toLowerCase()
  return {
    crudo: Number(`${m[1].replace(/[^\d]/g, '')}.${m[3] ?? 0}`),
    por: !sufijo ? null : sufijo === 'k' || sufijo === 'mil' ? 1000 : 1_000_000,
    resto: texto.slice((m.index ?? 0) + m[0].length),
  }
}

/**
 * El precio (texto libre) en pesos: "$45.000", "45.000,50" (redondeado), "45k", "1,5k", "$ 45 000", "$45,000". De un rango,
 * el de abajo ("$10–30k" → 10.000). Desde el primer "$" si hay uno ("2 x $10.000" → 10.000). Null si no hay un número o
 * si no son pesos (otra moneda, negativo): mejor no estimar que estimar mal.
 */
export function parsePesos(texto: string | null | undefined): number | null {
  if (!texto || OTRA_MONEDA.test(texto) || NEGATIVO.test(texto)) return null
  const desde = texto.indexOf('$')
  const n = leerNumero(desde >= 0 ? texto.slice(desde) : texto)
  if (!n) return null
  let por = n.por ?? 1
  // la "k" del final de un rango vale también para el de abajo, si es más chico
  if (!n.por && HASTA.test(n.resto)) {
    const hasta = leerNumero(n.resto.replace(HASTA, ''))
    if (hasta?.por && n.crudo <= hasta.crudo) por = hasta.por
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
