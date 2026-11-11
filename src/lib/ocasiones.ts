import { paletaDe } from '@/lib/colores-fechas'
import { TAPA_EN_COMUN } from '@/lib/tapas'

// Para qué es una lista en común. Hasta acá solo se sabía si era un cumple: el casamiento y el baby shower, las dos
// ocasiones con más regalos por evento, se armaban como "otra cosa", con el formulario pensado para la lista de un hijo.
// La ocasión se elige al crearla y de ahí salen el nombre que se sugiere, cómo se pide la fecha, el color de la tapa, los
// deseos para empezar y lo que se manda por WhatsApp. Sin la base ni React: lo usan el esquema, las pantallas y los tests.

export const OCASIONES = ['cumple', 'casamiento', 'baby_shower', 'casa_nueva', 'otra'] as const
export type Ocasion = (typeof OCASIONES)[number]

export const esOcasion = (s: unknown): s is Ocasion => typeof s === 'string' && (OCASIONES as readonly string[]).includes(s)

/**
 * Un deseo para empezar: se suma con un toque (ver sumarDeseoSugerido), nunca solo. aporte: es plata (ver el deseo de
 * aporte, en items.ts), y antes de sumarlo hay que decir a qué alias: lleva al formulario con el nombre puesto.
 * repetible: lo pueden regalar varios (pañales, ropita).
 */
export type DeseoSugerido = { titulo: string; aporte?: boolean; categoria?: string; repetible?: boolean }

type DefOcasion = {
  /** Como se la nombra al elegirla y en la tapa. */
  nombre: string
  /** Una línea al elegirla: para qué sirve. */
  paraQue: string
  /** El ícono de ui.tsx (los que ya hay). */
  icono: 'cake' | 'heart' | 'star' | 'home' | 'gift'
  /** El nombre de la lista: un ejemplo en el campo y una línea de ayuda. No obliga a nada. */
  ejemploDeNombre: string
  ayudaDelNombre: string
  ejemploDeDescripcion: string
  /** Cómo se pide la fecha; anual: si se repite todos los años (null: se le pregunta, como hasta ahora). */
  fecha: { pregunta: string; ayuda: string; anual: boolean | null }
  /** El color de la tapa (ver lib/tapas.ts): uno de la paleta de fechas que ya hay, o el de las listas en común. */
  tapa: string
  sugerencias: DeseoSugerido[]
}

const DEFS: Record<Ocasion, DefOcasion> = {
  cumple: {
    nombre: 'Cumple', paraQue: 'La lista de tu hijo, de la abuela, de quien cumple.', icono: 'cake',
    ejemploDeNombre: 'Juancito', ayudaDelNombre: 'El nombre de quien cumple: los que regalan la ven como “Cumple de Juancito”.',
    ejemploDeDescripcion: 'Cumple 6: le gustan los dinosaurios',
    fecha: { pregunta: '¿Cuándo cumple?', ayuda: '', anual: true },
    tapa: TAPA_EN_COMUN, sugerencias: [],
  },
  casamiento: {
    nombre: 'Casamiento', paraQue: 'La lista de los dos, con aportes para la luna de miel.', icono: 'heart',
    ejemploDeNombre: 'El casamiento de Euge y Rodri', ayudaDelNombre: 'Con los nombres de los dos, así se entiende de quiénes es apenas llega el link.',
    ejemploDeDescripcion: 'Nos casamos y armamos la casa',
    fecha: { pregunta: '¿Cuándo es el casamiento?', ayuda: 'Con la fecha, a los que regalan les avisamos cuando se acerca.', anual: false },
    // frambuesa, la de las flores del Día de la Madre
    tapa: paletaDe('madre').fondo,
    sugerencias: [
      { titulo: 'Luna de miel', aporte: true },
      { titulo: 'Vajilla', categoria: 'Casa' },
      { titulo: 'Sábanas', categoria: 'Casa' },
      { titulo: 'Juego de toallas', categoria: 'Casa' },
      { titulo: 'Electrodoméstico', categoria: 'Casa' },
      { titulo: 'Valijas' },
    ],
  },
  baby_shower: {
    nombre: 'Baby shower', paraQue: 'Lo que hace falta para recibir al bebé.', icono: 'star',
    ejemploDeNombre: 'La llegada de Olivia', ayudaDelNombre: 'Si todavía no tiene nombre, “La llegada del bebé de Euge y Rodri” también va.',
    ejemploDeDescripcion: 'Lo esperamos para marzo',
    fecha: { pregunta: '¿Cuándo es el baby shower?', ayuda: 'O la fecha en que lo esperan. Con la fecha, a los que regalan les avisamos cuando se acerca.', anual: false },
    // verde agua, la del barrilete del Día del Niño
    tapa: paletaDe('ninos').fondo,
    sugerencias: [
      { titulo: 'Cochecito', aporte: true },
      { titulo: 'Pañales', repetible: true },
      { titulo: 'Ropa de 0 a 3 meses', categoria: 'Ropa', repetible: true },
      { titulo: 'Cuna' },
      { titulo: 'Huevito para el auto' },
      { titulo: 'Mamaderas' },
      { titulo: 'Bañera' },
    ],
  },
  casa_nueva: {
    nombre: 'Casa nueva', paraQue: 'Para equipar la casa entre todos.', icono: 'home',
    ejemploDeNombre: 'Nuestra casa', ayudaDelNombre: 'Como la van a reconocer los que regalan: “La casa de Delfi y Martín”.',
    ejemploDeDescripcion: 'Nos mudamos y falta de todo',
    fecha: { pregunta: '¿Hay una fecha? (la inauguración, la mudanza)', ayuda: '', anual: false },
    tapa: TAPA_EN_COMUN,
    sugerencias: [
      { titulo: 'Para los muebles', aporte: true },
      { titulo: 'Juego de ollas', categoria: 'Casa' },
      { titulo: 'Vajilla', categoria: 'Casa' },
      { titulo: 'Sábanas', categoria: 'Casa' },
      { titulo: 'Herramientas', categoria: 'Casa' },
      { titulo: 'Una planta', categoria: 'Casa', repetible: true },
    ],
  },
  otra: {
    nombre: 'Otra', paraQue: 'Cualquier lista para armar con otros.', icono: 'gift',
    ejemploDeNombre: 'Los regalos de la abuela', ayudaDelNombre: 'Como la van a ver los que regalan.',
    ejemploDeDescripcion: 'Para qué es',
    fecha: { pregunta: '¿Hay una fecha?', ayuda: '', anual: null },
    tapa: TAPA_EN_COMUN, sugerencias: [],
  },
}

export const datosDeOcasion = (o: Ocasion) => DEFS[o]

/**
 * La ocasión de una lista en común. Que es un cumple lo dice es_cumple, que se cambia con la fecha ("Es un cumple" /
 * "Otra cosa", ver guardarFechaGrupo): manda ese, así nunca dicen cosas distintas. Si deja de ser un cumple, vuelve a la
 * que eligió al crearla (o "otra"). Una lista personal no tiene: null.
 */
export function ocasionDeLista(l: { tipo: string; esCumple: boolean; ocasion: Ocasion }): Ocasion | null {
  if (l.tipo !== 'grupo') return null
  if (l.esCumple) return 'cumple'
  return l.ocasion === 'cumple' ? 'otra' : l.ocasion
}

/** La tapa de una lista en común según su ocasión (sin ocasión, la de siempre). */
export const tapaDeOcasion = (o: Ocasion | null | undefined) => (o ? DEFS[o].tapa : TAPA_EN_COMUN)

const mismoTitulo = (a: string, b: string) => a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es')

/** Los deseos para empezar de una ocasión que la lista todavía no tiene (por el nombre, sin importar mayúsculas). */
export function sugerenciasPara(o: Ocasion | null, titulos: readonly string[]): DeseoSugerido[] {
  if (!o) return []
  return DEFS[o].sugerencias.filter((s) => !titulos.some((t) => mismoTitulo(t, s.titulo)))
}

/** El deseo para empezar de esa ocasión con ese nombre, si es uno de los suyos (lo que llega del formulario no se cree). */
export function deseoSugerido(o: Ocasion | null, titulo: string): DeseoSugerido | null {
  return (o && DEFS[o].sugerencias.find((s) => mismoTitulo(s.titulo, titulo))) || null
}

/** Con cuántos deseos la lista ya arrancó y las ideas para empezar dejan de ofrecerse. */
export const SUGERIR_HASTA = 8
