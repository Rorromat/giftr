import { createHash } from 'node:crypto'

// "Ahora no" en Gente que quizás conocés: a esa persona no se la vuelve a sugerir a esta cuenta en este navegador. Va en
// una cookie con una marca por (cuenta, persona) (`<marca>~<marca>…`): en la tablet de la familia, lo que saca Rodri no se
// lo saca a Euge, y no se lee a quiénes. Si se borra o la tocan a mano, solo vuelven las sugerencias.
export const NO_SUGERIR_COOKIE = 'giftr_no_sugerir'

// las más recientes (unos 1,2 KB)
const NO_SUGERIR_MAXIMO = 50

const marca = (userId: string, otro: string) => createHash('sha256').update(`giftr_no_sugerir:${userId}:${otro}`).digest('base64url').slice(0, 22)

/** Las marcas de antes más la de no sugerirle `otro` a esta cuenta. */
export function sumarNoSugerir(valor: string | undefined, userId: string, otro: string): string {
  const m = marca(userId, otro)
  return [...(valor?.split('~') ?? []).filter((x) => x && x !== m), m].slice(-NO_SUGERIR_MAXIMO).join('~')
}

/** A quién no sugerirle a esta cuenta, según la cookie. */
export function noSugerir(valor: string | undefined, userId: string): (otro: string) => boolean {
  const marcas = new Set(valor?.split('~'))
  return (otro) => marcas.has(marca(userId, otro))
}
