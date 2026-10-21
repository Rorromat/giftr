import { gt, sql, type AnyColumn } from 'drizzle-orm'

/**
 * Antes de que cargue la página (con 3G, un rato largo) BotonEnviar todavía no deshabilita el botón, y un doble toque manda
 * el formulario dos veces. Lo mismo, de la misma persona, hecho hace menos de esto es ese envío repetido: no se hace otra
 * vez. Se mira bajo un lock, así dos envíos a la vez no pasan juntos.
 */
export const recienHecho = (creado: AnyColumn) => gt(creado, sql`now() - interval '30 seconds'`)
