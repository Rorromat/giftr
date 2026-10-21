// cuentas: solo para un invitado, las cuentas de Google que tuvieron sesión en este navegador (CUENTAS_COOKIE).
export type Viewer = { userId?: string; guestId?: string; cuentas?: string[] }

/** Tiene sesión o es un invitado con nombre. Sin eso no sabemos quién mira: puede ser el dueño sin su sesión. */
export const identificado = (v: Viewer) => !!v.userId || !!v.guestId

export const NOMBRE_INVITADO_MAXIMO = 60

/**
 * Cuántas cosas sin comprar puede tener tomadas una persona en una lista: reservas sueltas y regalos grupales en los que
 * sigue sola (ver tomadasEnLista). Nadie más puede soltar una reserva ajena: sin tope, una sola persona (un primo en
 * broma, un nene con la tablet de la abuela) dejaba la lista entera tomada hasta que vencía. Lo comprado no cuenta: el
 * que regala mucho marca lo que ya compró y sigue.
 */
export const RESERVAS_POR_LISTA = 10
