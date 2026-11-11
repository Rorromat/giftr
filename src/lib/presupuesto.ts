import { plata, type Moneda } from '@/lib/pesos'

// "Hasta $X" en la lista de alguien: quien la abre para regalar casi siempre llega con un presupuesto en la cabeza. Puro
// (sin base ni React): qué topes se ofrecen, qué entra en cada uno y cuándo un precio ya es viejo.

/** Lo que hace falta de un deseo para filtrarlo: su piso en número y la moneda (ver leerPrecio). */
export type ConPrecio = { precioMin: number | null; precioMoneda: Moneda | null }

/** Con menos deseos con precio que esto no se ofrece el filtro: no hay qué filtrar, y los topes saldrían de dos precios. */
export const DESEOS_CON_PRECIO = 6

// Los "números lindos" de un tope, por cada orden de magnitud: $10.000, $15.000, $20.000, $30.000, $50.000, $75.000.
const PASOS = [1, 1.5, 2, 3, 5, 7.5, 10]

/** El primer número lindo que no queda por debajo de ese precio ($18.500 → $20.000, $34.990 → $50.000). */
export function topeRedondo(precio: number): number {
  const base = 10 ** Math.floor(Math.log10(precio))
  for (const paso of PASOS) {
    const tope = Math.round(paso * base)
    // de un dígito, "1,5" y "7,5" no son topes
    if (tope >= precio && Number.isInteger(paso * base)) return tope
  }
  return base * 10
}

export type Presupuesto = { moneda: Moneda; topes: number[] }

/**
 * Los topes que se ofrecen en una lista, calculados de sus propios precios: el cuarto, la mitad y los tres cuartos de los
 * deseos con precio (de a quintos si son 12 o más), cada uno redondeado para arriba a un número lindo. Un tope que deja
 * adentro a todos no filtra nada y no va. Null si no hay filtro: menos de 6 deseos con precio, o todos cuestan parecido.
 * Pesos y dólares no se comparan (no hay tipo de cambio que valga mañana): se filtra en la moneda que más deseos tienen
 * (pesos, si empatan) y los de la otra van con los que no tienen precio (ver partirPorTope).
 */
export function presupuestoDeLista(deseos: readonly ConPrecio[]): Presupuesto | null {
  const pisosEn = (m: Moneda) => deseos.flatMap((d) => (d.precioMoneda === m && d.precioMin !== null ? [d.precioMin] : []))
  const [ars, usd] = [pisosEn('ARS'), pisosEn('USD')]
  const moneda: Moneda = usd.length > ars.length ? 'USD' : 'ARS'
  const pisos = (moneda === 'USD' ? usd : ars).sort((a, b) => a - b)
  const n = pisos.length
  if (n < DESEOS_CON_PRECIO) return null
  const cortes = n >= 12 ? [0.2, 0.4, 0.6, 0.8] : [0.25, 0.5, 0.75]
  const topes = [...new Set(cortes.map((q) => topeRedondo(pisos[Math.ceil(q * n) - 1])))].filter((t) => t < pisos[n - 1])
  return topes.length ? { moneda, topes } : null
}

/** El tope de la URL (?hasta=50000): un entero positivo; cualquier otra cosa, sin tope. */
export function topeDeLaUrl(hasta: string | undefined): number | null {
  if (!hasta || !/^[1-9]\d{0,9}$/.test(hasta)) return null
  return Number(hasta)
}

/**
 * Los deseos que entran en el tope y los que no se pueden comparar. Una idea con rango ("$20.000 a $40.000") entra si su
 * piso entra: algo de eso se consigue. Los que no tienen precio, o lo tienen en la otra moneda o escrito de una forma que
 * no se pudo leer, no desaparecen en silencio: van aparte, al final. Los que se pasan del tope, afuera.
 */
export function partirPorTope<T extends ConPrecio>(deseos: readonly T[], tope: number, moneda: Moneda): { dentro: T[]; sinPrecio: T[] } {
  const comparable = (d: T) => d.precioMoneda === moneda && d.precioMin !== null
  return { dentro: deseos.filter((d) => comparable(d) && d.precioMin! <= tope), sinPrecio: deseos.filter((d) => !comparable(d)) }
}

/** "Hasta $50.000" / "Hasta US$ 100". */
export const textoDelTope = (tope: number, moneda: Moneda) => `Hasta ${plata(tope, moneda)}`

/** Desde cuántos días un precio se avisa como viejo: con la inflación de acá, dos meses ya lo mueven. */
export const PRECIO_VIEJO_DIAS = 60
const DIA_MS = 24 * 60 * 60 * 1000

/**
 * Hace cuánto se cargó (o se confirmó) el precio, si ya pasaron 60 días: "hace 3 meses", "hace más de un año". Null si es
 * reciente o no se sabe: no se dice nada.
 */
export function antiguedadDelPrecio(precioAt: Date | null | undefined, ahora = new Date()): string | null {
  if (!precioAt) return null
  const dias = Math.floor((ahora.getTime() - precioAt.getTime()) / DIA_MS)
  if (dias < PRECIO_VIEJO_DIAS) return null
  if (dias >= 365) return 'hace más de un año'
  return `hace ${Math.floor(dias / 30)} meses`
}
