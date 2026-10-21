export type Viewer = { userId?: string; guestId?: string }

/** Tiene sesión o es un invitado con nombre. Sin eso no sabemos quién mira: puede ser el dueño sin su sesión. */
export const identificado = (v: Viewer) => !!v.userId || !!v.guestId

export const NOMBRE_INVITADO_MAXIMO = 60
