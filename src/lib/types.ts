// cuentas: solo para un invitado, las cuentas de Google que tuvieron sesión en este navegador (CUENTAS_COOKIE).
export type Viewer = { userId?: string; guestId?: string; cuentas?: string[] }

/** Tiene sesión o es un invitado con nombre. Sin eso no sabemos quién mira: puede ser el dueño sin su sesión. */
export const identificado = (v: Viewer) => !!v.userId || !!v.guestId

export const NOMBRE_INVITADO_MAXIMO = 60
