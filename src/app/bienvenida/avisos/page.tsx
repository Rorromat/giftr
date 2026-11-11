import { redirect } from 'next/navigation'

/**
 * Acá la bienvenida preguntaba por los avisos, antes del primer deseo. Ahora se pregunta después, con el cartel de una sola
 * vez (ver preguntarAvisos y PreguntaAvisos). A quien le quedó esta pantalla abierta o guardada ya se le había preguntado:
 * sigue a su lista.
 */
export default function AvisosBienvenida() {
  redirect('/mi-lista')
}
