// Gustos de la bienvenida: pistas para que la gente acierte (deportes, club, hobbies, marcas, colores, talles…).
// Las opciones son una lista curada de lo más popular en Argentina; lo que se guarda se valida contra ella.
// Sin dependencias de servidor: el formulario de la bienvenida (cliente) usa este mismo catálogo.

import { recortar } from '@/lib/limites'

// Las listas largas van de lo más elegido a lo menos: la bienvenida muestra las primeras (ver POPULARES) y "Ver más".
export const DEPORTES = [
  'Fútbol', 'Pádel', 'Running', 'Gimnasio', 'Tenis', 'Yoga', 'Pilates', 'Natación', 'Básquet', 'Vóley', 'Hockey', 'Rugby',
  'Ciclismo', 'Golf', 'Crossfit', 'Boxeo', 'Artes marciales', 'Trekking', 'Escalada',
  'Surf', 'Esquí y snowboard', 'Handball', 'Skate', 'Pesca', 'Equitación', 'Polo', 'Remo', 'Patín', 'Danza', 'Tenis de mesa',
] as const

export const NO_FUTBOL = 'No me interesa el fútbol'
export const SOLO_SELECCION = 'Solo la Selección'

/** Clubes de Primera y otros con mucha hinchada. Los "grandes" primero, después por orden alfabético. */
export const CLUBES = [
  'Boca Juniors', 'River Plate', 'Racing Club', 'Independiente', 'San Lorenzo',
  'Aldosivi', 'All Boys', 'Almagro', 'Argentinos Juniors', 'Arsenal de Sarandí', 'Atlanta', 'Atlético Tucumán',
  'Banfield', 'Barracas Central', 'Belgrano', 'Central Córdoba', 'Chacarita Juniors', 'Colón', 'Defensa y Justicia',
  'Deportivo Morón', 'Deportivo Riestra', 'Estudiantes de La Plata', 'Estudiantes de Río Cuarto', 'Ferro Carril Oeste',
  'Gimnasia y Esgrima La Plata', 'Gimnasia de Mendoza', 'Gimnasia de Jujuy', 'Godoy Cruz', 'Huracán',
  'Independiente Rivadavia', 'Instituto', 'Lanús', 'Los Andes', "Newell's Old Boys", 'Nueva Chicago', 'Olimpo',
  'Patronato', 'Platense', 'Quilmes', 'Rosario Central', 'San Martín de San Juan', 'San Martín de Tucumán',
  'Sarmiento de Junín', 'Talleres', 'Temperley', 'Tigre', 'Unión de Santa Fe', 'Vélez Sarsfield',
] as const

export const HOBBIES = [
  'Viajar', 'Leer', 'Cocinar', 'Cine y series', 'Música', 'Salir a comer', 'Hacer asado', 'Plantas y jardín',
  'Videojuegos', 'Moda', 'Maquillaje y skincare', 'Tecnología', 'Ir a recitales', 'Juegos de mesa',
  'Vinos', 'Café de especialidad', 'Cerveza artesanal', 'Tocar un instrumento', 'Teatro', 'Fotografía', 'Escapadas',
  'Camping', 'Dibujo y pintura', 'Manualidades', 'Tejer', 'Meditación', 'Spa y masajes', 'Idiomas', 'Autos y motos',
  'Astrología', 'Cursos y talleres', 'Puzzles', 'Podcasts', 'Decoración', 'Coleccionar cosas',
] as const

export const MASCOTAS = ['Perro', 'Gato', 'Otra mascota', 'No tengo'] as const

export const MARCAS = [
  { grupo: 'Deportivas', marcas: ['Nike', 'Adidas', 'Puma', 'New Balance', 'Vans', 'Converse', 'Topper', 'Fila', 'Under Armour', 'Reebok', 'Asics', 'Montagne', 'The North Face'] },
  { grupo: 'Para ella', marcas: ['Rapsodia', 'Jazmín Chebar', 'Ayres', 'Kosiuko', 'Las Pepas', "Paula Cahen d'Anvers", 'Akiabara', '47 Street', 'Vitamina', 'Sweet Victorian', 'Muaa', 'María Cher', 'Tucci', 'Portsaid', 'Uma', 'Desiderata', 'Complot', 'Prüne', 'Mishka', 'Sarkany'] },
  { grupo: 'Para él', marcas: ['Kevingston', 'Legacy', 'La Martina', 'Bensimon', 'Wanama', 'Cardón', 'Etiqueta Negra', 'Bowen', 'Equus', 'Rever Pass', 'Prototype', 'Taverniti'] },
  { grupo: 'De todos lados', marcas: ['Zara', "Levi's", 'Lacoste', 'Tommy Hilfiger', 'Quiksilver', 'Billabong', 'Rip Curl', 'Volcom', 'Cheeky', 'Grisino', 'Mimo & Co'] },
] as const
export const TODAS_LAS_MARCAS: readonly string[] = MARCAS.flatMap((g) => g.marcas)

export const ESTILOS = ['Clásico', 'Deportivo', 'Urbano', 'Elegante', 'Relajado', 'Bohemio', 'Minimalista', 'Rockero', 'Colorido'] as const

/**
 * Las fotos de ejemplo de cada estilo (en public/estilos, 360×480): hechas con IA para GiftR, todas con el mismo encuadre y
 * la misma luz, cada una con el fondo de su color. Una de mujer y una de hombre, que se alternan en la bienvenida (la
 * primera va en las demás pantallas). Arrancan mezcladas, así la grilla nunca es toda de unos ni toda de otros.
 */
const FOTOS_ESTILOS: Record<(typeof ESTILOS)[number], string[]> = {
  Clásico: ['clasico-mujer'], Deportivo: ['deportivo-hombre', 'deportivo-mujer'], Urbano: ['urbano-mujer', 'urbano-hombre'],
  Elegante: ['elegante-hombre', 'elegante-mujer'], Relajado: ['relajado-mujer', 'relajado-hombre'], Bohemio: ['bohemio-mujer', 'bohemio-hombre'],
  Minimalista: ['minimalista-hombre', 'minimalista-mujer'], Rockero: ['rockero-mujer', 'rockero-hombre'],
  Colorido: ['colorido-hombre', 'colorido-mujer'],
}
export const fotosDeEstilo = (estilo: string): string[] =>
  estilo in FOTOS_ESTILOS ? FOTOS_ESTILOS[estilo as keyof typeof FOTOS_ESTILOS].map((f) => `/estilos/${f}.webp`) : []
export const fotoDeEstilo = (estilo: string) => fotosDeEstilo(estilo)[0] ?? null

/** Colores con su muestra. "Estampados" y "Pasteles" se dibujan aparte. */
export const COLORES = [
  { nombre: 'Negro', hex: '#121212' }, { nombre: 'Blanco', hex: '#FFFFFF' }, { nombre: 'Gris', hex: '#9A9A9A' },
  { nombre: 'Beige', hex: '#E6D5B8' }, { nombre: 'Marrón', hex: '#7A4B2A' }, { nombre: 'Azul marino', hex: '#1F2B5B' },
  { nombre: 'Celeste', hex: '#8EC5FF' }, { nombre: 'Verde', hex: '#2E8B57' }, { nombre: 'Verde oliva', hex: '#6B6B2E' },
  { nombre: 'Rojo', hex: '#D7263D' }, { nombre: 'Bordó', hex: '#6D1A2A' }, { nombre: 'Rosa', hex: '#F4A6C0' },
  { nombre: 'Lila', hex: '#B79CED' }, { nombre: 'Amarillo', hex: '#F7D547' }, { nombre: 'Naranja', hex: '#F28C28' },
  { nombre: 'Pasteles', hex: 'linear-gradient(135deg,#F4C6D6 0 33%,#C9E4F6 33% 66%,#E9F3C2 66%)' },
  { nombre: 'Estampados', hex: 'repeating-linear-gradient(45deg,#121212 0 4px,#FFF6E5 4px 9px)' },
] as const

/** Cuántas opciones se ven antes de "Ver más" (las marcas, por grupo). Lo ya elegido se ve siempre. */
export const POPULARES = { deportes: 12, hobbies: 14, bebidas: 12, marcas: 6 } as const

/** Los clubes que se ven sin buscar: los grandes (los primeros de CLUBES). */
export const CLUBES_SIN_BUSCAR = 5

/** La muestra de un color (un hex o un degradado), para dibujarla al lado del nombre. */
export const muestraDeColor = (nombre: string) => COLORES.find((c) => c.nombre === nombre)?.hex ?? null

export const TALLES = {
  remera: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  pantalon: ['34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56'],
  calzado: ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'],
} as const

export const BEBIDAS = [
  'Café', 'Mate', 'Té', 'Vino tinto', 'Vino blanco', 'Espumante', 'Cerveza', 'Fernet', 'Gin', 'Nada de alcohol',
  'Chocolate', 'Alfajores', 'Helado', 'Dulce de leche', 'Rosado', 'Whisky', 'Vermú', 'Aperitivos', 'Ron', 'Picadas',
  'Sushi', 'Pastas', 'Lo dulce', 'Lo salado',
] as const

export const NO_REGALAR = [
  'Perfumes', 'Ropa', 'Adornos', 'Velas y difusores', 'Cosas de cocina', 'Libros', 'Plantas', 'Alcohol', 'Dulces',
  'Peluches', 'Gift cards', 'Bijou', 'Maquillaje', 'Cosas que ocupan lugar',
] as const

export type Talles = { remera: string | null; pantalon: string | null; calzado: string | null }

export type Gustos = {
  deportes: string[]
  /** Un club de CLUBES, NO_FUTBOL, SOLO_SELECCION o uno que escribió a mano. */
  club: string | null
  hobbies: string[]
  mascotas: string[]
  marcas: string[]
  estilos: string[]
  colores: string[]
  talles: Talles
  bebidas: string[]
  noRegalar: string[]
  /** "Algo más": texto libre corto (alergias, "ya tengo mil tazas"…). */
  nota: string | null
}

export const GUSTOS_VACIOS: Gustos = {
  deportes: [], club: null, hobbies: [], mascotas: [], marcas: [], estilos: [], colores: [],
  talles: { remera: null, pantalon: null, calzado: null }, bebidas: [], noRegalar: [], nota: null,
}

// por caracteres de verdad: cortar un emoji al medio deja medio carácter, que el jsonb de Postgres rechaza (y no se
// guardaba nada de la bienvenida)
const texto = (v: unknown, max: number) => (typeof v === 'string' && recortar(v.replace(/\s+/g, ' '), max)) || null
const lista = (v: unknown) => (Array.isArray(v) ? v : v == null ? [] : [v]).filter((x): x is string => typeof x === 'string')
const delCatalogo = (v: unknown, catalogo: readonly string[]) => [...new Set(lista(v).filter((x) => catalogo.includes(x)))]
const NOMBRES_COLORES: readonly string[] = COLORES.map((c) => c.nombre)

/** Deja solo valores del catálogo (más un club y hasta 3 marcas escritos a mano, cortos). Nunca tira error. */
export function sanitizarGustos(raw: Record<string, unknown>): Gustos {
  const t = (raw.talles ?? {}) as Record<string, unknown>
  const talle = (k: keyof typeof TALLES) => (typeof t[k] === 'string' && (TALLES[k] as readonly string[]).includes(t[k] as string) ? t[k] as string : null)
  const marcasPropias = lista(raw.marcasOtras).flatMap((m) => m.split(',')).map((m) => texto(m, 30)).filter((m): m is string => !!m).slice(0, 3)
  return {
    deportes: delCatalogo(raw.deportes, DEPORTES),
    club: texto(raw.club, 40),
    hobbies: delCatalogo(raw.hobbies, HOBBIES),
    mascotas: delCatalogo(raw.mascotas, MASCOTAS),
    marcas: [...new Set([...delCatalogo(raw.marcas, TODAS_LAS_MARCAS), ...marcasPropias])],
    estilos: delCatalogo(raw.estilos, ESTILOS),
    colores: delCatalogo(raw.colores, NOMBRES_COLORES),
    talles: { remera: talle('remera'), pantalon: talle('pantalon'), calzado: talle('calzado') },
    bebidas: delCatalogo(raw.bebidas, BEBIDAS),
    noRegalar: delCatalogo(raw.noRegalar, NO_REGALAR),
    nota: texto(raw.nota, 200),
  }
}

/** Lee el formulario de la bienvenida (checkboxes con el mismo nombre se repiten). */
export function gustosDesdeForm(fd: FormData): Gustos {
  const club = fd.get('club')
  return sanitizarGustos({
    deportes: fd.getAll('deportes'), hobbies: fd.getAll('hobbies'), mascotas: fd.getAll('mascotas'),
    marcas: fd.getAll('marcas'), marcasOtras: fd.get('marcasOtras'), estilos: fd.getAll('estilos'),
    colores: fd.getAll('colores'), bebidas: fd.getAll('bebidas'), noRegalar: fd.getAll('noRegalar'),
    club: club === 'otro' ? fd.get('clubOtro') : club,
    talles: { remera: fd.get('remera'), pantalon: fd.get('pantalon'), calzado: fd.get('calzado') },
    nota: fd.get('nota'),
  })
}

/**
 * Los pasos de la bienvenida, en orden. Cada uno se edita también solo, desde Tus gustos (/perfil/gustos/<paso>): para
 * cambiar el talle no hay que pasar por los ocho.
 */
export const PASOS_GUSTOS = ['cumple', 'deportes', 'futbol', 'hobbies', 'ropa', 'colores', 'bebidas', 'no-regalar'] as const
export type PasoGustos = (typeof PASOS_GUSTOS)[number]
export const esPasoGustos = (s: unknown): s is PasoGustos => PASOS_GUSTOS.includes(s as PasoGustos)

/** Ícono de cada sección (nombres de <Icon>; acá van como texto para no depender de los componentes). */
export type IconoGusto = 'cake' | 'ball' | 'shield' | 'star' | 'paw' | 'bag' | 'hanger' | 'palette' | 'shirt' | 'cup' | 'ban' | 'note'

export type SeccionGustos = { clave: string; titulo: string; icono: IconoGusto; items: string[] }

/** Los gustos en secciones para mostrar ("Hincha de", "Talles", "No le regales"…). Vacío si no cargó nada. */
export function seccionesDeGustos(g: Gustos | null, propio = false): SeccionGustos[] {
  if (!g) return []
  const talles = [g.talles.remera && `Remera ${g.talles.remera}`, g.talles.pantalon && `Pantalón ${g.talles.pantalon}`, g.talles.calzado && `Calzado ${g.talles.calzado}`]
    .filter((x): x is string => !!x)
  const sinFutbol = g.club === NO_FUTBOL
  const club = g.club === SOLO_SELECCION ? 'La Selección' : g.club
  const secciones: SeccionGustos[] = [
    { clave: 'deportes', titulo: 'Deportes', icono: 'ball', items: g.deportes },
    sinFutbol
      ? { clave: 'club', titulo: propio ? 'No me interesa' : 'No le interesa', icono: 'shield', items: ['El fútbol'] }
      : { clave: 'club', titulo: 'Hincha de', icono: 'shield', items: club ? [club] : [] },
    { clave: 'hobbies', titulo: 'Hobbies y planes', icono: 'star', items: g.hobbies },
    { clave: 'mascotas', titulo: 'Mascotas', icono: 'paw', items: g.mascotas.filter((m) => m !== 'No tengo') },
    { clave: 'marcas', titulo: 'Marcas', icono: 'bag', items: g.marcas },
    { clave: 'estilos', titulo: 'Estilo', icono: 'hanger', items: g.estilos },
    { clave: 'colores', titulo: 'Colores', icono: 'palette', items: g.colores },
    { clave: 'talles', titulo: 'Talles', icono: 'shirt', items: talles },
    { clave: 'bebidas', titulo: 'Bebidas y antojos', icono: 'cup', items: g.bebidas },
    { clave: 'noRegalar', titulo: propio ? 'No me regalen' : 'No le regales', icono: 'ban', items: g.noRegalar },
    { clave: 'nota', titulo: 'Algo más', icono: 'note', items: g.nota ? [g.nota] : [] },
  ]
  return secciones.filter((s) => s.items.length)
}

export type BloqueGustos = {
  paso: Exclude<PasoGustos, 'cumple'>
  titulo: string
  icono: IconoGusto
  /** Lo cargado, por parte (Hobbies / Mascotas…); vacías también, así se ve qué falta. */
  partes: { clave: keyof Gustos; titulo: string; items: string[] }[]
  cargado: boolean
}

/**
 * Tus gustos tal cual los cargaste, un bloque por paso de la bienvenida (sin el del cumple, que está en Perfil): lo que
 * se ve en Tus gustos y en "¡Todo listo!", y cuántos completaste.
 */
export function bloquesDeGustos(g: Gustos | null): BloqueGustos[] {
  const v = g ?? GUSTOS_VACIOS
  const club = v.club === NO_FUTBOL ? 'No me interesa' : v.club
  const talles = (['remera', 'pantalon', 'calzado'] as const).filter((k) => v.talles[k])
    .map((k) => `${k === 'remera' ? 'Remera' : k === 'pantalon' ? 'Pantalón' : 'Calzado'} ${v.talles[k]}`)
  const bloque = (paso: BloqueGustos['paso'], titulo: string, icono: IconoGusto, ...partes: BloqueGustos['partes']): BloqueGustos =>
    ({ paso, titulo, icono, partes, cargado: partes.some((p) => p.items.length > 0) })
  return [
    bloque('deportes', 'Deportes', 'ball', { clave: 'deportes', titulo: 'Deportes', items: v.deportes }),
    bloque('futbol', 'Fútbol', 'shield', { clave: 'club', titulo: 'Club', items: club ? [club] : [] }),
    bloque('hobbies', 'Hobbies y mascotas', 'star',
      { clave: 'hobbies', titulo: 'Hobbies y planes', items: v.hobbies }, { clave: 'mascotas', titulo: 'Mascotas', items: v.mascotas.map((m) => (m === 'No tengo' ? 'Sin mascota' : m)) }),
    bloque('ropa', 'Marcas y estilo', 'bag', { clave: 'marcas', titulo: 'Marcas', items: v.marcas }, { clave: 'estilos', titulo: 'Estilo', items: v.estilos }),
    bloque('colores', 'Colores y talles', 'palette', { clave: 'colores', titulo: 'Colores', items: v.colores }, { clave: 'talles', titulo: 'Talles', items: talles }),
    bloque('bebidas', 'Bebidas y antojos', 'cup', { clave: 'bebidas', titulo: 'Bebidas y antojos', items: v.bebidas }),
    bloque('no-regalar', 'Lo que no querés', 'ban',
      { clave: 'noRegalar', titulo: 'No me regalen', items: v.noRegalar }, { clave: 'nota', titulo: 'Algo más', items: v.nota ? [v.nota] : [] }),
  ]
}
