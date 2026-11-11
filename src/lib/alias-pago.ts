// El alias o CVU/CBU a donde transferir: cómo se valida y cómo se le dice. Sin dependencias (ni la base ni el servidor):
// lo usan Perfil ("Tu alias o CVU", ver users.ts), el deseo de aporte en plata y sus campos en el navegador.

export type AliasValidado = { ok: true; alias: string | null } | { ok: false; error: 'formato' }

/**
 * Lo que escribió en "Tu alias o CVU", como se guarda: un alias (de 6 a 20 letras, números, puntos o guiones; da igual
 * con mayúsculas, queda en minúsculas) o un CVU/CBU (22 números, sin los espacios ni guiones con que lo muestra el banco).
 * Vacío es borrarlo. Otra cosa no se guarda: con un alias mal escrito la transferencia no sale.
 */
export function validarAliasPago(escrito: unknown): AliasValidado {
  const texto = typeof escrito === 'string' ? escrito.normalize('NFKC').trim() : ''
  if (!texto) return { ok: true, alias: null }
  const numeros = texto.replace(/[\s.-]/g, '')
  if (/^\d{22}$/.test(numeros)) return { ok: true, alias: numeros }
  const alias = texto.replace(/\s+/g, '').toLowerCase()
  return /^[a-z0-9.-]{6,20}$/.test(alias) ? { ok: true, alias } : { ok: false, error: 'formato' }
}

/** Cómo se le dice a lo que cargó: un CVU (los de las billeteras empiezan con 000), un CBU, o un alias. */
export function tipoDeAlias(alias: string): 'alias' | 'CVU' | 'CBU' {
  return !/^\d{22}$/.test(alias) ? 'alias' : alias.startsWith('000') ? 'CVU' : 'CBU'
}

/** Lo que se le dice a quien lo escribió mal, en Perfil y en el deseo de aporte. */
export const AVISO_ALIAS = 'Eso no parece un alias ni un CVU. Un alias tiene de 6 a 20 letras, números, puntos o guiones; un CVU o CBU, 22 números.'
