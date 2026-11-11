// "Volver" lleva a donde la persona estaba. La campanita y tu foto están en las cuatro secciones, y la lista de alguien se
// abre desde Inicio, Tu gente o Todo el año: con un destino fijo, quien abría Avisos desde Tu gente volvía a Inicio y
// perdía el lugar. El origen viaja en ?volver= (como lo compartido desde otra app, ver esRutaAgregar) y se usa solo si es
// una ruta de GiftR; si no (entró por un link, o lo que llegó no es nuestro), vale el destino de siempre.

/** Lo más largo que se acepta: una ruta de GiftR con su búsqueda entra de sobra. */
export const VOLVER_MAX = 200

/**
 * Si es una ruta de GiftR a la que se puede volver: empieza con una sola barra y no trae nada que un navegador pueda leer
 * como otro sitio ("//otro.com", "/\otro.com") ni caracteres raros. No alcanza con que empiece con "/".
 */
export function esRutaInterna(v: unknown): v is string {
  return typeof v === 'string' && v.length <= VOLVER_MAX && /^\/(?![/\\])[A-Za-z0-9/_\-.~%?&=#+]*$/.test(v)
}

/** Adónde vuelve: el origen si es una ruta de GiftR; si no, el destino de siempre. */
export const rutaParaVolver = (v: unknown, respaldo: string): string => (esRutaInterna(v) ? v : respaldo)

/** El mismo link, avisando desde dónde se abre (para que su "Volver" traiga de vuelta acá). */
export function conVolver(href: string, desde: string): string {
  const [sinAncla, ancla] = href.split('#', 2)
  return `${sinAncla}${sinAncla.includes('?') ? '&' : '?'}volver=${encodeURIComponent(desde)}${ancla ? `#${ancla}` : ''}`
}

const NOMBRES: Record<string, string> = {
  '/inicio': 'Volver a Inicio', '/gente': 'Volver a tu gente', '/regalos': 'Volver a tus regalos', '/cuentas': 'Volver a Cuentas',
  '/mi-lista': 'Volver a tu lista', '/avisos': 'Volver a Avisos', '/eventos': 'Volver a Todo el año', '/novedades': 'Volver a lo nuevo de tus amigos',
}

/** Cómo se llama el botón para quien no lo ve: "Volver a tu gente" si se sabe adónde va; si no, "Volver". */
export const nombreDeVolver = (ruta: string): string => NOMBRES[ruta.split(/[?#]/)[0]] ?? 'Volver'

/** Dónde se recuerda, mientras dura la pestaña, desde dónde se abrió cada pantalla (ver VolverAOrigen). */
export const claveDeVolver = (pantalla: string) => `gr-volver:${pantalla}`
