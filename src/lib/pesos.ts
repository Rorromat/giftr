// Plata en pesos enteros. Sin dependencias: lo usan también los componentes de cliente.

/** "$45.000" → 45000, "$20.000 - $30.000" → 20000, "45k" → 45000. Null si no hay un número. */
export function parsePesos(texto: string | null | undefined): number | null {
  const m = texto?.match(/(\d[\d.]*)(?:,\d+)?\s*(k|mil)?/i)
  if (!m) return null
  const n = Number(m[1].replace(/\./g, '')) * (m[2] ? 1000 : 1)
  return Number.isSafeInteger(n) && n > 0 ? n : null
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
