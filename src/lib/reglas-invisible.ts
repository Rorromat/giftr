// Las reglas del amigo invisible: opcionales, para jugarlo distinto ("De tu casa", "Con su inicial", "Robo de regalos"…).
// Cada una con su nombre, una línea que la cuenta, cómo se juega paso a paso y, si cambia algo, qué: sin presupuesto, o algo
// que le toca a cada uno (la inicial de a quién le regala, un color, una palabra o una década), que sale del sorteo: el mismo
// para el mismo par, sin guardarlo. Sin dependencias: lo usan el servidor y la pantalla.

export const GRUPOS_REGLAS = [
  { id: 'hay', nombre: 'Con lo que hay a mano' },
  { id: 'forma', nombre: 'Con una regla de forma' },
  { id: 'risa', nombre: 'Para reírse' },
  { id: 'juego', nombre: 'Con dinámica de juego' },
  { id: 'corazon', nombre: 'Con corazón' },
] as const
export type GrupoRegla = (typeof GRUPOS_REGLAS)[number]['id']

/** Lo que le toca a cada uno con la regla, para su regalo (ver loQueTeToca). */
export type Personal = 'inicial' | 'color' | 'palabra' | 'decada'

export type Regla = {
  id: string
  grupo: GrupoRegla
  nombre: string
  /** una línea, en la tarjeta para elegirla */
  corta: string
  /** cómo se juega, paso a paso */
  como: string[]
  /** no lleva presupuesto: sale de lo que ya tienen */
  sinPresupuesto?: boolean
  personal?: Personal
}

export const REGLAS = [
  {
    id: 'de-tu-casa', grupo: 'hay', nombre: 'De tu casa', corta: 'El regalo sale de tu casa. Sin gastar nada.', sinPresupuesto: true,
    como: [
      'El regalo tiene que ser algo que ya tenés en tu casa: el adorno raro del living, el libro que nunca leíste, la taza que no usás.',
      'No se compra nada: si lo comprás, perdiste.',
      'Al abrirlo, el que regala cuenta de dónde salió.',
    ],
  },
  {
    id: 'segunda-mano', grupo: 'hay', nombre: 'Segunda mano', corta: 'Solo cosas usadas: feria, garage sale o Marketplace.',
    como: [
      'El regalo tiene que ser usado: de una feria americana, un garage sale, Marketplace o de lo de un amigo.',
      'Respetan el presupuesto, que rinde mucho más.',
      'Suma puntos si viene con su historia.',
    ],
  },
  {
    id: 'bazar', grupo: 'hay', nombre: 'Del bazar', corta: 'Todo del bazar o del todo por $2, con un tope bajito.',
    como: [
      'Todo tiene que salir de un bazar, un todo por $2 o un supermercado de barrio.',
      'Pongan un presupuesto bajito y exacto: ni un peso más.',
      'Puede ser una cosa o varias, mientras entre en el tope.',
    ],
  },
  {
    id: 'inicial', grupo: 'forma', nombre: 'Con su inicial', corta: 'El regalo empieza con la letra de quien lo recibe.', personal: 'inicial',
    como: [
      'El regalo tiene que empezar con la inicial del nombre de a quién le regalás: un Mate para Martín, unas Pantuflas para Paula.',
      'GiftR te muestra la letra al ver a quién le regalás.',
      'Si cuesta, vale un adjetivo: una Planta Preciosa.',
    ],
  },
  {
    id: 'color', grupo: 'forma', nombre: 'Un solo color', corta: 'A cada uno le toca un color y todo es de ese color.', personal: 'color',
    como: [
      'A cada uno le toca un color, que GiftR te muestra al ver a quién le regalás.',
      'Todo el regalo tiene que ser de ese color, también el envoltorio.',
      'Al abrirlos, se arma un arcoíris.',
    ],
  },
  {
    id: 'palabra', grupo: 'forma', nombre: 'Una palabra', corta: 'Te toca una palabra y tu regalo la tiene que contar.', personal: 'palabra',
    como: [
      'Al ver a quién le regalás, GiftR te da una palabra: «verano», «caos», «domingo»…',
      'Tu regalo tiene que tener que ver con esa palabra, como la interpretes.',
      'Al abrirlo, el que lo recibe adivina cuál era la palabra.',
    ],
  },
  {
    id: 'epoca', grupo: 'forma', nombre: 'De otra época', corta: 'Algo de otra década: de los 80, de los 90, de la infancia.', personal: 'decada',
    como: [
      'A cada uno le toca una década (los 70, los 80, los 90, los 2000), que GiftR te muestra al ver a quién le regalás.',
      'El regalo tiene que ser de esa época o hacerle acordar: un juguete, música, una golosina que ya no existe.',
      'Vale lo que te habría regalado tu abuela.',
    ],
  },
  {
    id: 'bizarro', grupo: 'risa', nombre: 'Lo más bizarro', corta: 'Gana el regalo más raro que encuentres por poca plata.',
    como: [
      'El regalo tiene que ser lo más raro que encuentres sin pasarte del presupuesto.',
      'Al final, entre todos votan el más bizarro.',
      'El ganador elige con qué regalo se queda (o se queda con la gloria).',
    ],
  },
  {
    id: 'peor', grupo: 'risa', nombre: 'El peor regalo', corta: 'A propósito: el más feo se lleva un premio.',
    como: [
      'Se trata de regalar algo espantoso, a propósito: el peor regalo que se te ocurra.',
      'Respetan el presupuesto, así no hay ventaja.',
      'Se vota el peor, y el que lo regaló se lleva un premio (o una prenda).',
    ],
  },
  {
    id: 'envoltorio', grupo: 'risa', nombre: 'Envoltorio extremo', corta: 'El envoltorio vale más que el regalo.',
    como: [
      'Lo importante es el envoltorio: cajas dentro de cajas, cinta por todos lados, envuelto en algo absurdo.',
      'El regalo puede ser chiquito; abrirlo tiene que ser una aventura.',
      'Gana el que más tarda en abrirse.',
    ],
  },
  {
    id: 'robo', grupo: 'juego', nombre: 'Robo de regalos', corta: 'Por turnos, abrís uno nuevo o le robás el suyo a otro.',
    como: [
      'Todos traen su regalo envuelto y lo dejan en el medio. Se sortea el orden de los turnos.',
      'En tu turno, abrís uno nuevo o le robás el regalo abierto a otro. Al que le roban, abre otro o roba.',
      'Un regalo se puede robar dos veces como mucho; después queda con el último.',
      'El primero tiene revancha al final: puede cambiar el suyo por cualquiera.',
    ],
  },
  {
    id: 'adivina', grupo: 'juego', nombre: 'Adiviná quién fue', corta: 'Tu regalo viene con 3 pistas sobre quién sos.',
    como: [
      'Con el regalo, escribí tres pistas sobre vos, sin decir tu nombre: de la más difícil a la más fácil.',
      'El que lo recibe lee una pista por vez y trata de adivinar.',
      'Si adivina con la primera, se gana un aplauso; si no, al final lo revelás.',
    ],
  },
  {
    id: 'tesoro', grupo: 'juego', nombre: 'Búsqueda del tesoro', corta: 'El regalo está escondido y das pistas para encontrarlo.',
    como: [
      'Escondé el regalo donde se juntan (o en la casa de quien lo recibe, si se puede).',
      'Le das una primera pista; cada lugar tiene la siguiente, hasta el regalo.',
      'Con tres o cuatro pistas alcanza: que sea un juego, no una maratón.',
    ],
  },
  {
    id: 'rima', grupo: 'juego', nombre: 'Con rima', corta: 'Cada regalo trae un versito que lo describe.',
    como: [
      'Con el regalo, escribí un versito que lo describa sin nombrarlo.',
      'Antes de abrir, se lee en voz alta y el que lo recibe adivina qué es.',
      'Cuanto peor la rima, mejor.',
    ],
  },
  {
    id: 'hecho-a-mano', grupo: 'corazon', nombre: 'Hecho a mano', corta: 'Algo que hiciste vos: cocinado, tejido, pintado o armado.',
    como: [
      'El regalo lo hacés vos: algo cocinado, tejido, pintado, armado, una playlist o un álbum de fotos.',
      'Vale pedir ayuda, no vale comprarlo hecho.',
      'Lo que cuenta es el tiempo que le pusiste.',
    ],
  },
  {
    id: 'experiencia', grupo: 'corazon', nombre: 'Una experiencia', corta: 'En vez de un objeto, un vale para hacer algo juntos.',
    como: [
      'En vez de un objeto, regalás algo para hacer: una cena que cocinás vos, una salida, una clase, un día de algo.',
      'Hacé un vale lindo, con qué es y para cuándo.',
      'Lo mejor: hacerlo juntos.',
    ],
  },
  {
    id: 'cuatro', grupo: 'corazon', nombre: 'Quiero, necesito, me pongo, leo', corta: 'Cuatro cositas: una de cada.',
    como: [
      'El regalo son cuatro cosas chiquitas: algo que quiera, algo que necesite, algo para ponerse y algo para leer.',
      'Las cuatro entran en el presupuesto.',
      'Envolvelas por separado, con su etiqueta.',
    ],
  },
] as const satisfies readonly Regla[]

export type ReglaId = (typeof REGLAS)[number]['id']

export const esRegla = (s: unknown): s is ReglaId => typeof s === 'string' && REGLAS.some((r) => r.id === s)
export const reglaDe = (id: string | null | undefined): Regla | null => REGLAS.find((r) => r.id === id) ?? null

/** Los colores de "Un solo color": el nombre y cómo se ve. */
export const COLORES = [
  { nombre: 'Rojo', hex: '#E5484D' }, { nombre: 'Naranja', hex: '#F76B15' }, { nombre: 'Amarillo', hex: '#FFC53D' },
  { nombre: 'Verde', hex: '#10B66E' }, { nombre: 'Azul', hex: '#2D5BD0' }, { nombre: 'Violeta', hex: '#6E56CF' },
  { nombre: 'Rosa', hex: '#E93D82' }, { nombre: 'Blanco', hex: '#FFFFFF' }, { nombre: 'Negro', hex: '#121216' },
  { nombre: 'Dorado', hex: '#C9A227' },
] as const

/** Las palabras de "Una palabra": que den para interpretar. */
export const PALABRAS = [
  'verano', 'caos', 'domingo', 'infancia', 'viaje', 'mar', 'calma', 'fiesta', 'sueño', 'música', 'desayuno', 'aventura', 'lluvia',
  'risa', 'ciudad', 'campo', 'noche', 'café', 'juego', 'magia', 'invierno', 'hogar', 'ruta', 'cine', 'libro', 'jardín', 'estrellas',
  'picnic', 'pijama', 'brillo', 'sorpresa', 'montaña', 'asado', 'siesta', 'mate', 'fútbol', 'cumpleaños', 'abuela', 'playa', 'otoño',
] as const

export const DECADAS = ['los 70', 'los 80', 'los 90', 'los 2000'] as const

/** Un número estable para un texto (FNV-1a): el mismo par da siempre lo mismo, en el servidor y en el navegador. */
function hash(texto: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** La inicial del nombre (sin tilde), en mayúscula: "Ángela" → "A". */
const inicialDe = (nombre: string) => nombre.trim().charAt(0).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase() || '?'

export type LoQueTeToca =
  | { tipo: 'inicial'; letra: string }
  | { tipo: 'color'; nombre: string; hex: string }
  | { tipo: 'palabra'; palabra: string }
  | { tipo: 'decada'; decada: string }

/**
 * Lo que le toca al que regala con la regla del juego, para su regalo: la inicial de a quién le regala, o un color, una
 * palabra o una década que salen del juego y de a quién le regala (siempre lo mismo para ese par). Null si la regla no da
 * nada.
 */
export function loQueTeToca(regla: Regla | null, juegoId: string, para: { id: string; nombre: string }): LoQueTeToca | null {
  if (!regla?.personal) return null
  const n = hash(`${juegoId}:${para.id}`)
  switch (regla.personal) {
    case 'inicial': return { tipo: 'inicial', letra: inicialDe(para.nombre) }
    case 'color': return { tipo: 'color', ...COLORES[n % COLORES.length] }
    case 'palabra': return { tipo: 'palabra', palabra: PALABRAS[n % PALABRAS.length] }
    case 'decada': return { tipo: 'decada', decada: DECADAS[n % DECADAS.length] }
  }
}
