// Los stickers de GiftR, dibujados con el kit de fun-isometric (ver .claude/skills/fun-isometric): losas con borde de tinta
// que se mueven con los presets del kit. Los colores son los lugares de la paleta (main, deep, gold, tint, ok, hot), así
// cada propuesta de diseño los pinta con los suyos (ver paletas.ts). Para mirarlos:
//   bun .claude/skills/fun-isometric/bin/fi.mjs sheet src/stickers/giftr.ts <nombre> --palette '<json>'
import { VIEWS, arc, ellipse, line, onFace, pill, poly, rect, ring, rosette, spark, star } from './fun'
import { bob, bounce, drift, erase, fall, flick, flicker, float, glint, hop, impact, jolt, latch, look, nudge, sparkle, sway, toss, tossLag2, twinkle, twist, wiggle, wobble } from './motions'
import type { Icon, Layer, Motion, Shape, Vec } from './fun'

const LINE = 5
// la vista de la casa: las caras giradas 18 grados en su plano y echadas 36 para atrás, los costados caen abajo a la izquierda
const { tilt: FACE, extrude: EXT } = VIEWS.right

/** Un destello blanco que va con su padre y aparece con el movimiento que le den. */
const glow = (parent: string, p: Vec, r: number, m: Motion | ReadonlyArray<Motion>, extra: { ip?: number; op?: number } = {}): Layer => ({
  parent,
  a: p,
  p,
  m,
  ...extra,
  shapes: [{ d: spark(p[0], p[1], r), fill: 'white' }],
})

/** Agranda o achica un path de pares "x y" alrededor de un punto y lo corre, para reusar una forma en otro tamaño. */
const escalar = (d: string, k: number, [dx, dy]: Vec = [0, 0], [cx, cy]: Vec = [0, 0]) =>
  d.replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (_, x: string, y: string) => `${+(cx + (+x - cx) * k + dx).toFixed(2)} ${+(cy + (+y - cy) * k + dy).toFixed(2)}`)

const HEART = 'M0 92C-24 74 -132 8 -132 -48C-132 -94 -98 -122 -62 -122C-34 -122 -12 -106 0 -84C12 -106 34 -122 62 -122C98 -122 132 -94 132 -48C132 8 24 74 0 92Z'

// Tu lista: la tablilla con los deseos anotados (cada uno con su corazón), que se borran y se vuelven a escribir, y un
// corazón grande que salta en la punta.
const FILAS = [0, 1, 2]
const CORAZON = onFace(FACE, [96, -104])
export const lista: Icon = {
  name: 'lista',
  frames: 180,
  still: 0,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'tabla', a: [0, 150], p: [240, 392], s: [92, 92], m: { ...sway, k: 0.7 }, shapes: [] },
    {
      id: 'hoja',
      parent: 'tabla',
      tilt: FACE,
      p: [0, 0],
      a: [0, 0],
      shapes: [
        { d: rect(-118, -150, 236, 290, 24), fill: 'deep', depth: 1 },
        { d: rect(-96, -116, 192, 232, 10), fill: 'white', depth: 0.2 },
        { d: pill(-56, -170, 112, 44), fill: 'gold', depth: 0.6 },
        { d: pill(-22, -156, 44, 12), fill: 'ink', line: false },
        ...FILAS.flatMap((i): Array<Shape> => [
          { d: escalar(HEART, 0.13, [-62, -58 + i * 64]), fill: i === 0 ? 'hot' : 'tint', line: 3 },
          { d: line([-36, -64 + i * 64], [i === 2 ? 22 : 70, -64 + i * 64]), trim: erase(22 + i * 6, 84 + i * 6) },
        ]),
      ],
    },
    { id: 'corazon', parent: 'tabla', a: CORAZON, p: CORAZON, m: { ...hop, at: 30 }, shapes: [] },
    { parent: 'corazon', p: CORAZON, tilt: [-14, 30], shapes: [{ d: escalar(HEART, 0.32), fill: 'hot', depth: 0.8, edges: [[0, 29]] }] },
    glow('tabla', onFace(FACE, [-150, -150]), 22, [twinkle(64), twinkle(150, true)]),
    glow('tabla', onFace(FACE, [178, -30]), 16, [twinkle(70), twinkle(156, true)]),
  ],
}

// En secreto: el regalo cerrado; la tapa salta y vuelve a caer, con brillos cuando se levanta.
const MONO = 'M0 -80C-18 -126 -86 -136 -76 -98C-70 -80 -30 -80 0 -80ZM0 -80C18 -126 86 -136 76 -98C70 -80 30 -80 0 -80Z'
export const regalo: Icon = {
  name: 'regalo',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'caja', p: [250, 310], m: impact([3, 12]), shapes: [] },
    {
      id: 'cuerpo',
      parent: 'caja',
      tilt: FACE,
      shapes: [{ d: rect(-112, -40, 224, 136, 16), fill: 'main', depth: 1 }, { d: rect(-22, -40, 44, 136), fill: 'gold', depth: 1 }],
    },
    {
      parent: 'cuerpo',
      p: [0, -44],
      m: latch([0, 44]),
      shapes: [
        { d: MONO, fill: 'gold', depth: 0.5 },
        { d: rect(-130, -80, 260, 52, 16), fill: 'main', depth: 0.8 },
        { d: rect(-24, -80, 48, 52), fill: 'gold', depth: 0.8 },
        { d: pill(-20, -96, 40, 30), fill: 'gold', depth: 0.5 },
      ],
    },
    glow('caja', [-128, -128], 24, { ...glint(0, 110), at: 140 }),
    glow('caja', [122, -146], 30, { ...glint(0, 120), at: 146 }),
  ],
}

// Entre todos: la alcancía; cae una moneda por la ranura, el chancho la recibe con un empujón y brilla.
const CHANCHO = 'M-128 10C-128 -62 -64 -104 6 -104C80 -104 128 -64 132 -14L132 34C128 78 84 104 6 104C-70 104 -128 70 -128 10Z'
const RANURA = pill(-34, -84, 72, 14)
const MONEDA: Vec = [8, -168]
export const alcancia: Icon = {
  name: 'alcancia',
  frames: 180,
  line: LINE,
  extrude: EXT,
  still: 150,
  layers: [
    { id: 'chancho', a: [0, 120], p: [240, 392], m: { ...nudge, at: 92 }, shapes: [] },
    {
      id: 'cuerpo',
      parent: 'chancho',
      tilt: [-14, 26],
      shapes: [
        ...[-70, 64].map((x): Shape => ({ d: rect(x - 20, 70, 40, 62, 12), fill: 'main', depth: 0.7 })),
        { d: poly([[34, -86], [62, -134], [84, -78]], 6), fill: 'main', depth: 0.6 },
        { d: CHANCHO, fill: 'main', depth: 1 },
        { d: arc(-152, 0, 18, 200, 520), round: true },
        { d: ellipse(150, 6, 34, 40), fill: 'tint', depth: 0.6 },
        { d: ellipse(142, -4, 6, 9), fill: 'ink', line: false },
        { d: ellipse(160, 14, 6, 9), fill: 'ink', line: false },
        { d: ellipse(86, -30, 9, 11), fill: 'ink', line: false },
        { d: RANURA, fill: 'deep' },
      ],
    },
    // la moneda pasa por detrás de esta línea y se pierde adentro: el recorte deja solo lo que está arriba de la ranura
    { id: 'arriba', parent: 'chancho', o: 0, shapes: [{ d: rect(-200, -420, 400, onFace([-14, 26], [0, -80])[1] + 420 + 4) }] },
    {
      parent: 'chancho',
      clip: 'arriba',
      a: MONEDA,
      p: MONEDA,
      ip: 6,
      op: 100,
      m: [twinkle(6), fall([0, 150], 70, 24)],
      shapes: [
        { d: ellipse(MONEDA[0], MONEDA[1], 30, 46), fill: 'gold', depth: 0.8 },
        { d: ellipse(MONEDA[0], MONEDA[1], 16, 28) },
      ],
    },
    glow('chancho', [-140, -150], 24, [twinkle(94), twinkle(150, true)]),
    glow('chancho', [124, -158], 18, [twinkle(100), twinkle(156, true)]),
  ],
}

// Amigo invisible: el antifaz, que mira para los costados.
const ANTIFAZ =
  'M-150 -20C-150 -74 -92 -84 -42 -62C-22 -54 -12 -42 0 -42C12 -42 22 -54 42 -62C92 -84 150 -74 150 -20C150 40 100 70 50 52C30 44 16 22 0 22C-16 22 -30 44 -50 52C-100 70 -150 40 -150 -20Z'
// los agujeros van al revés (antihorario), así quedan abiertos y se ve la pared de adentro
const OJO = (cx: number) => `M${cx - 34} -10A34 24 0 1 0 ${cx + 34} -10A34 24 0 1 0 ${cx - 34} -10Z`
const CARA: Vec = [-12, 24]
export const antifaz: Icon = {
  name: 'antifaz',
  frames: 168,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'quien', a: [0, 60], p: [250, 300], m: wobble, shapes: [] },
    {
      id: 'tiras',
      parent: 'quien',
      tilt: CARA,
      shapes: [
        { d: poly([[-146, -28], [-212, -52], [-204, -14], [-146, -4]], 6), fill: 'main', depth: 0.5 },
        { d: poly([[146, -28], [212, -52], [204, -14], [146, -4]], 6), fill: 'main', depth: 0.5 },
      ],
    },
    { id: 'ojoI', parent: 'quien', tilt: CARA, shapes: [{ d: ellipse(-72, -10, 40, 30), fill: 'white', line: false }] },
    { id: 'ojoD', parent: 'quien', tilt: CARA, shapes: [{ d: ellipse(72, -10, 40, 30), fill: 'white', line: false }] },
    { parent: 'quien', tilt: CARA, clip: 'ojoI', m: { ...look, k: 1.4 }, shapes: [{ d: ellipse(-66, -6, 15), fill: 'ink', line: false }] },
    { parent: 'quien', tilt: CARA, clip: 'ojoD', m: { ...look, k: 1.4 }, shapes: [{ d: ellipse(78, -6, 15), fill: 'ink', line: false }] },
    { parent: 'quien', tilt: CARA, shapes: [{ d: ANTIFAZ + OJO(-72) + OJO(72), fill: 'deep', depth: 1 }, { d: arc(-104, -36, 26, 200, 250) }] },
    glow('quien', [150, -110], 26, sparkle(16)),
    glow('quien', [-160, 90], 16, sparkle(92)),
  ],
}

// Cumples: el almanaque con el día marcado y una estrella que aparece encima.
const MARCA = onFace(FACE, [96, 80])
export const calendario: Icon = {
  name: 'calendario',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'cal', p: [244, 262], m: jolt(), shapes: [] },
    {
      parent: 'cal',
      tilt: FACE,
      shapes: [
        { d: rect(-122, -104, 244, 214, 26), fill: 'white', depth: 1 },
        { d: poly([[-122, -104], [122, -104], [122, -44], [-122, -44]], [26, 26, 0, 0]), fill: 'main' },
        ...[-1, 1].map((s): Shape => ({ d: pill(s * 60 - 13, -128, 26, 50), fill: 'deep', depth: 0.5 })),
        ...[0, 1, 2, 3].flatMap((c) => [0, 1].map((r): Shape => ({ d: rect(-96 + c * 50, -22 + r * 52, 34, 34, 9), ...(c === 1 && r === 1 ? { fill: 'gold' } : {}) }))),
      ],
    },
    {
      parent: 'cal',
      a: MARCA,
      p: MARCA,
      m: [twinkle(14), twinkle(100, true)],
      shapes: [{ d: star(MARCA[0], MARCA[1], 52, 0.5, 5, 6), fill: 'gold', depth: 0.6 }],
    },
    glow('cal', [-160, -120], 20, [twinkle(20), twinkle(106, true)]),
  ],
}

// Las llamas de una vela, con los mismos comandos para que pasen de una a otra punto por punto (la del kit, en chico)
const llama = (lean: number, tip: number, k = 1, dy = 0) => {
  const y = (v: number) => v * k + dy
  return (
    `M0 ${y(110)}C${-70 * k} ${y(110)} ${-104 * k} ${y(60)} ${-100 * k} ${y(6)}C${-96 * k} ${y(-38)} ${(-62 + lean * 0.4) * k} ${y(-62)} ${(-56 + lean) * k} ${y(-108)}` +
    `C${(-22 + lean * 0.6) * k} ${y(-86)} ${-6 * k} ${y(-62)} 0 ${y(-30)}C${16 * k} ${y(-62)} ${(34 + lean) * k} ${y(-94 - tip * 0.3)} ${(26 + lean * 1.4) * k} ${y(-140 - tip)}` +
    `C${(86 + lean) * k} ${y(-100)} ${106 * k} ${y(-40)} ${100 * k} ${y(10)}C${98 * k} ${y(64)} ${66 * k} ${y(110)} 0 ${y(110)}Z`
  )
}

// el glaseado con sus chorreadas: x del medio de cada una y hasta dónde baja
const GLASEADO = (() => {
  let d = 'M-112 -6C-112 -20 -102 -28 -88 -28L88 -28C102 -28 112 -20 112 -6L112 10'
  for (const [x, y] of [[84, 34], [42, 56], [0, 28], [-44, 48], [-84, 26]]) d += `L${x + 14} 10L${x + 14} ${y - 14}A14 14 0 0 1 ${x - 14} ${y - 14}L${x - 14} 10`
  return d + 'L-112 10Z'
})()
const PABILO = onFace(FACE, [0, -118])

// Tu cumple: la torta con su vela; salta y la llama tiembla.
export const torta: Icon = {
  name: 'torta',
  frames: 160,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'torta', p: [250, 292], m: { ...hop, k: 0.7 }, shapes: [] },
    {
      parent: 'torta',
      tilt: FACE,
      shapes: [
        { d: rect(-146, 88, 292, 28, 14), fill: 'deep', depth: 0.6 },
        { d: rect(-112, -20, 224, 112, 18), fill: 'tint', depth: 1 },
        { d: GLASEADO, fill: 'main', depth: 0.3 },
        ...[[-70, -14], [-24, -18], [30, -12], [74, -16]].map(([x, y], i): Shape => ({ d: pill(x, y, 18, 8), fill: i % 2 ? 'white' : 'gold', line: 3 })),
        { d: rect(-13, -116, 26, 92, 8), fill: 'white', depth: 0.6 },
        ...[-96, -70, -44].map((y): Shape => ({ d: poly([[-13, y], [13, y - 12], [13, y - 2], [-13, y + 10]]), fill: 'main', line: 3 })),
      ],
    },
    {
      parent: 'torta',
      p: [PABILO[0], PABILO[1] - 26],
      shapes: [
        { d: flicker([llama(0, 0, 0.24), llama(-14, 10, 0.24), llama(10, -6, 0.24), llama(-14, 10, 0.24)]), fill: 'hot', depth: 0.5 },
        { d: flicker([llama(0, 0, 0.13, 10), llama(12, 14, 0.13, 10), llama(-10, -4, 0.13, 10), llama(12, 14, 0.13, 10)]), fill: 'gold' },
      ],
    },
    glow('torta', [-150, -96], 24, [twinkle(36), twinkle(120, true)]),
    glow('torta', [146, -150], 18, [twinkle(42), twinkle(126, true)]),
  ],
}

// Deportes: la paleta de pádel que gira y la pelotita que pica al lado.
const PALA = 'M0 -150C72 -150 108 -102 108 -40C108 22 72 62 30 74L22 92L-22 92L-30 74C-72 62 -108 22 -108 -40C-108 -102 -72 -150 0 -150Z'
const AGUJEROS: ReadonlyArray<Vec> = [[-50, -96], [0, -108], [50, -96], [-70, -48], [-24, -56], [24, -56], [70, -48], [-48, -6], [0, -14], [48, -6], [-20, 34], [20, 34]]
const MANGO = onFace([-20, 30], [0, 196])
export const padel: Icon = {
  name: 'padel',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'pala', a: MANGO, p: [250 + MANGO[0], 236 + MANGO[1]], s: [86, 86], m: twist, shapes: [] },
    {
      parent: 'pala',
      tilt: [-20, 30],
      shapes: [
        { d: rect(-20, 86, 40, 116, 12), fill: 'deep', depth: 1 },
        ...[112, 140, 168].map((y): Shape => ({ d: line([-20, y], [20, y + 14]) })),
        { d: PALA, fill: 'main', depth: 1, edges: [[0, 92]] },
        { d: escalar(PALA, 0.84, [0, -6]) },
        ...AGUJEROS.map(([x, y]): Shape => ({ d: ellipse(x, y, 9), fill: 'ink', line: false })),
        { d: ellipse(0, 62, 12, 9), fill: 'ink', line: false },
      ],
    },
    {
      id: 'pelota',
      p: [370, 150],
      m: bounce,
      shapes: [
        { d: ellipse(0, 0, 38), fill: 'gold', depth: 0.8 },
        { d: arc(-48, 0, 34, -50, 50), round: true },
        { d: arc(48, 0, 34, 130, 230), round: true },
      ],
    },
    glow('pelota', [52, -46], 18, glint(4, 110)),
    glow('pala', [-150, -60], 20, sparkle(40)),
  ],
}

// Fútbol: la camiseta a rayas con sus tres estrellas, y la pelota que pica adelante.
const CAMISETA = 'M-52 -130L-128 -98L-152 -22L-98 -6L-94 128L94 128L98 -6L152 -22L128 -98L52 -130C40 -106 20 -96 0 -96C-20 -96 -40 -106 -52 -130Z'
const PELOTA: Vec = [362, 378]
export const camiseta: Icon = {
  name: 'camiseta',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'percha', a: [0, -150], p: [232, 112], m: { ...sway, k: 0.8 }, shapes: [] },
    { id: 'camiseta', parent: 'percha', tilt: FACE, shapes: [{ d: CAMISETA, fill: 'main', depth: 1 }] },
    {
      parent: 'percha',
      tilt: FACE,
      clip: 'camiseta',
      shapes: [-84, -16, 52].map((x): Shape => ({ d: rect(x, -150, 32, 300), fill: 'white', line: 3 })),
    },
    {
      parent: 'percha',
      tilt: FACE,
      shapes: [
        { d: 'M-52 -130C-40 -106 -20 -96 0 -96C20 -96 40 -106 52 -130L64 -124C50 -92 26 -80 0 -80C-26 -80 -50 -92 -64 -124Z', fill: 'deep', depth: 0.3 },
        ...[-1, 0, 1].map((i): Shape => ({ d: star(52 + i * 22, -58 - Math.abs(i) * 0 + (i === 0 ? -6 : 0), 11, 0.48, 5, 2), fill: 'gold', line: 3 })),
      ],
    },
    {
      id: 'pelota',
      a: PELOTA,
      p: PELOTA,
      m: { ...bounce, at: 30 },
      shapes: [
        { d: ellipse(PELOTA[0], PELOTA[1], 52), fill: 'white', depth: 0.8 },
        { d: poly([0, 1, 2, 3, 4].map((i): Vec => [PELOTA[0] + Math.cos((i * 72 - 90) * (Math.PI / 180)) * 18, PELOTA[1] + 2 + Math.sin((i * 72 - 90) * (Math.PI / 180)) * 18]), 3), fill: 'ink', line: false },
        ...[0, 1, 2, 3, 4].map((i): Shape => {
          const a = ((i * 72 - 90) * Math.PI) / 180
          return { d: line([PELOTA[0] + Math.cos(a) * 18, PELOTA[1] + 2 + Math.sin(a) * 18], [PELOTA[0] + Math.cos(a) * 40, PELOTA[1] + 2 + Math.sin(a) * 40]), line: 4 }
        }),
      ],
    },
    glow('pelota', [PELOTA[0] + 66, PELOTA[1] - 52], 18, glint(34, 110)),
  ],
}

// Hobbies: los auriculares que se mecen, con notas que salen al compás (los del kit).
const NOTA = (x: number, y: number): ReadonlyArray<Shape> => [
  { d: poly([[x + 6, y - 54], [x + 34, y - 44], [x + 34, y - 28], [x + 14, y - 34], [x + 14, y], [x + 6, y]], 3), fill: 'gold', depth: 0.4 },
  { d: ellipse(x - 4, y + 2, 16, 13), fill: 'gold', depth: 0.4 },
]
const VINCHA = 'M-128 28A128 128 0 0 1 128 28L100 28A100 100 0 0 0 -100 28Z'
export const auriculares: Icon = {
  name: 'auriculares',
  frames: 168,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'set', a: [0, 120], p: [250, 392], m: wobble, shapes: [] },
    {
      parent: 'set',
      tilt: [-12, 24],
      shapes: [
        { d: VINCHA, fill: 'deep', depth: 0.8 },
        ...[-1, 1].flatMap((lado): Array<Shape> => [
          { d: rect(lado * 114 - 36, 4, 72, 126, 30), fill: 'main', depth: 1 },
          { d: rect(lado * 114 - 20, 22, 40, 90, 18), fill: 'tint', depth: 0.3 },
        ]),
      ],
    },
    { parent: 'set', a: [150, -110], p: [150, -110], m: [twinkle(20), twinkle(100, true)], shapes: NOTA(150, -110) },
    { parent: 'set', a: [-150, -70], p: [-150, -70], m: [twinkle(60), twinkle(132, true)], shapes: NOTA(-150, -70) },
  ],
}

// Marcas y estilo: la bolsa de compras; se sacude y el papel de seda se mueve adentro.
const ASAS = 'M-62 -66L-62 -112A62 62 0 0 1 62 -112L62 -66L44 -66L44 -112A44 44 0 0 0 -44 -112L-44 -66Z'
const PAPEL = poly([[-86, -60], [-70, -124], [-34, -84], [-4, -140], [26, -86], [62, -128], [80, -60]], 4)
export const bolsa: Icon = {
  name: 'bolsa',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { parent: 'bolsa', shapes: [{ d: ASAS, fill: 'deep', depth: 0.5 }] },
    { parent: 'bolsa', a: [-60, -60], p: [-60, -60], m: tossLag2, shapes: [{ d: PAPEL, fill: 'tint', depth: 0.3 }] },
    {
      id: 'bolsa',
      a: [-120, 120],
      p: [140, 396],
      tilt: FACE,
      m: { ...toss, k: 0.6 },
      shapes: [
        { d: poly([[-112, -66], [112, -66], [128, 128], [-128, 128]], 14), fill: 'main', depth: 1 },
        { d: rect(-112, -66, 224, 30), fill: 'gold' },
        { d: rect(24, 24, 70, 44, 8), fill: 'white', depth: 0.25 },
        { d: line([38, 46], [80, 46]) },
      ],
    },
    glow('bolsa', [150, -170], 22, { ...glint(0, 110), at: 44 }),
  ],
}

// Colores y talles: la remera con su etiqueta, y las muestras de color que aparecen de a una.
const REMERA = 'M-44 -112L-112 -86L-140 -24L-96 -8L-94 120L94 120L96 -8L140 -24L112 -86L44 -112C34 -92 18 -84 0 -84C-18 -84 -34 -92 -44 -112Z'
const MUESTRAS: ReadonlyArray<[Vec, 'main' | 'gold' | 'ok' | 'hot']> = [[[148, 60], 'main'], [[182, 108], 'gold'], [[132, 140], 'hot']]
export const remera: Icon = {
  name: 'remera',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'percha', a: [0, -130], p: [222, 140], m: { ...sway, k: 0.8 }, shapes: [] },
    {
      id: 'remera',
      parent: 'percha',
      tilt: FACE,
      shapes: [
        { d: REMERA, fill: 'tint', depth: 1 },
        { d: 'M-44 -112C-34 -92 -18 -84 0 -84C18 -84 34 -92 44 -112' },
        { d: rect(-60, 0, 120, 26), fill: 'main' },
      ],
    },
    {
      parent: 'remera',
      a: [-118, -40],
      p: [-118, -40],
      m: { ...flick, k: 1.4 },
      shapes: [
        { d: line([-118, -40], [-118, -6]), line: 3 },
        { d: poly([[-138, -8], [-98, -8], [-98, 40], [-118, 52], [-138, 40]], 6), fill: 'white', depth: 0.3 },
        { d: line([-128, 18], [-108, 18]), line: 4 },
      ],
    },
    ...MUESTRAS.map(([p, fill], i): Layer => ({
      a: [222 + p[0], 140 + p[1]],
      p: [222 + p[0], 140 + p[1]],
      m: [twinkle(20 + i * 12), twinkle(140 + i * 6, true)],
      shapes: [{ d: ellipse(222 + p[0], 140 + p[1], 26), fill, depth: 0.6 }],
    })),
  ],
}

// Bebidas y antojos: el cafecito humeando en su plato, con una medialuna al lado.
// la medialuna: gorda al medio y con las puntas para abajo
const MEDIALUNA = 'M-92 32C-98 6 -72 -32 -40 -42C-20 -60 20 -60 40 -42C72 -32 98 6 92 32C78 22 62 20 48 24C30 10 -30 10 -48 24C-62 20 -78 22 -92 32Z'
const VAPOR = (x: number) => `M${x} 0C${x - 16} -22 ${x + 16} -42 ${x} -64C${x - 16} -86 ${x + 16} -104 ${x} -124`
const TAZA: Vec = [-40, -6]
const BOCA = onFace(FACE, [TAZA[0], TAZA[1] - 70])
export const cafe: Icon = {
  name: 'cafe',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'mesa', p: [250, 286], m: { ...bob, loop: 180 }, shapes: [] },
    {
      parent: 'mesa',
      tilt: FACE,
      p: onFace(FACE, TAZA),
      shapes: [
        { d: rect(-118, 46, 236, 28, 14), fill: 'tint', depth: 0.6 },
        { d: ring(104, 4, 40, 22), fill: 'white', depth: 0.8 },
        { d: poly([[-88, -62], [88, -62], [78, 50], [-78, 50]], [0, 0, 30, 30]), fill: 'white', depth: 1 },
        { d: rect(-84, -22, 168, 30), fill: 'main' },
      ],
    },
    {
      parent: 'mesa',
      a: [112, 92],
      p: [112, 92],
      m: { ...hop, at: 40, k: 0.5 },
      shapes: [
        { d: escalar(MEDIALUNA, 0.62, [112, 92]), fill: 'gold', depth: 0.8 },
        { d: escalar('M-34 -46C-24 -26 -22 -4 -26 16', 0.62, [112, 92]), round: true },
        { d: escalar('M34 -46C24 -26 22 -4 26 16', 0.62, [112, 92]), round: true },
      ],
    },
    {
      parent: 'mesa',
      p: BOCA,
      shapes: [-38, 0, 38].map((x, i): Shape => ({ d: VAPOR(x), round: true, trim: erase(10 + i * 8, 90 + i * 8) })),
    },
  ],
}

// Lo que no querés: tazas apiladas y el cartel de prohibido que salta adelante (otra taza, no).
const TAZON = (y: number) => poly([[-78, y - 50], [78, y - 50], [70, y + 40], [-70, y + 40]], [0, 0, 24, 24])
const PROHIBIDO = (cx: number, cy: number) => ring(cx, cy, 66, 46) + poly([[cx - 46, cy - 32], [cx - 32, cy - 46], [cx + 46, cy + 32], [cx + 32, cy + 46]], 3)
export const tazas: Icon = {
  name: 'tazas',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    {
      id: 'pila',
      p: [214, 280],
      tilt: FACE,
      shapes: [
        { d: ring(84, 70, 34, 18), fill: 'white', depth: 0.7 },
        { d: TAZON(70), fill: 'white', depth: 1 },
        { d: ring(80, -40, 30, 16), fill: 'tint', depth: 0.7 },
        { d: TAZON(-34), fill: 'tint', depth: 1 },
        { d: rect(-72, 50, 144, 22), fill: 'deep' },
      ],
    },
    { id: 'cartel', a: [350, 360], p: [350, 360], m: { ...hop, at: 10 }, shapes: [{ d: PROHIBIDO(350, 300), fill: 'hot', depth: 0.8 }] },
    glow('cartel', [440, 220], 20, [twinkle(46), twinkle(130, true)]),
  ],
}

// Navidad: el arbolito con sus bolas, la estrella arriba que brilla y un regalo al pie.
const ARBOL = poly([[0, -150], [56, -78], [30, -78], [88, -4], [58, -4], [114, 72], [-114, 72], [-58, -4], [-88, -4], [-30, -78], [-56, -78]], 12)
const PUNTA = onFace(FACE, [0, -156])
export const arbol: Icon = {
  name: 'arbol',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'arbol', a: [0, 140], p: [236, 400], m: { ...sway, k: 0.6 }, shapes: [] },
    {
      parent: 'arbol',
      tilt: FACE,
      shapes: [
        { d: rect(-20, 66, 40, 44, 6), fill: 'deep', depth: 0.8 },
        { d: ARBOL, fill: 'ok', depth: 1 },
        ...([[-28, -66, 'hot'], [36, -28, 'gold'], [-44, 18, 'white'], [20, 34, 'hot'], [64, 54, 'white'], [-6, -104, 'gold']] as const).map(
          ([x, y, fill]): Shape => ({ d: ellipse(x, y, 12), fill, line: 4 }),
        ),
        { d: rect(70, 70, 70, 58, 8), fill: 'main', depth: 0.7 },
        { d: rect(97, 70, 16, 58), fill: 'gold' },
      ],
    },
    { parent: 'arbol', a: PUNTA, p: PUNTA, m: { ...hop, at: 20, k: 0.5 }, shapes: [{ d: star(PUNTA[0], PUNTA[1], 40, 0.46, 5, 4), fill: 'gold', depth: 0.6 }] },
    glow('arbol', [PUNTA[0] + 66, PUNTA[1] - 20], 22, sparkle(30)),
    glow('arbol', [PUNTA[0] - 70, PUNTA[1] + 50], 14, sparkle(110)),
  ],
}

// Día del Amigo: el mate con su bombilla, y la Luna del 20 de julio flotando atrás.
const CALABAZA = 'M-70 -70L70 -70C76 -40 102 -18 102 30C102 92 58 122 0 122C-58 122 -102 92 -102 30C-102 -18 -76 -40 -70 -70Z'
const LUNA = 'M-58 -50C-104 -46 -118 26 -76 52C-52 66 -18 60 -2 40C-40 44 -74 8 -58 -50Z'
export const mate: Icon = {
  name: 'mate',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'cielo', a: [150, 140], p: [150, 140], m: float, shapes: [{ d: escalar(LUNA, 0.86, [160, 140]), fill: 'gold', depth: 0.5 }] },
    glow('cielo', [200, 86], 14, [twinkle(20), twinkle(100, true)]),
    { id: 'mate', a: [0, 120], p: [270, 404], s: [92, 92], m: { ...sway, k: 0.8 }, shapes: [] },
    {
      parent: 'mate',
      p: onFace(FACE, [0, 0]),
      shapes: [
        { d: poly([[-4, -96], [10, -100], [62, -206], [50, -212]], 3), fill: 'grey', depth: 0.4 },
        { d: pill(40, -230, 34, 22), fill: 'grey', depth: 0.4 },
      ],
    },
    {
      id: 'calabaza',
      parent: 'mate',
      tilt: FACE,
      shapes: [
        { d: 'M-66 -82C-52 -112 52 -112 66 -82Z', fill: 'ok', depth: 0.4 },
        { d: CALABAZA, fill: 'main', depth: 1 },
      ],
    },
    { parent: 'mate', tilt: FACE, clip: 'calabaza', shapes: [{ d: rect(-110, 10, 220, 22), fill: 'tint', line: 3 }] },
    { parent: 'mate', tilt: FACE, shapes: [{ d: rect(-80, -92, 160, 26, 8), fill: 'grey', depth: 0.6 }] },
  ],
}

// Día del Padre: la camisa con su corbata, que se balancea del nudo.
const CAMISA = poly([[-130, -118], [-72, -140], [0, -104], [72, -140], [130, -118], [130, 136], [-130, 136]], [18, 6, 0, 6, 18, 26, 26])
const NUDO: Vec = [0, -60]
export const corbata: Icon = {
  name: 'corbata',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'pecho', a: [0, 130], p: [250, 384], s: [90, 90], m: { ...bob, loop: 180 }, shapes: [] },
    {
      id: 'camisa',
      parent: 'pecho',
      tilt: FACE,
      shapes: [
        { d: CAMISA, fill: 'tint', depth: 1 },
        { d: rect(54, 6, 52, 44, 6) },
      ],
    },
    {
      id: 'hoja',
      parent: 'camisa',
      a: NUDO,
      p: NUDO,
      m: { ...wiggle, k: 0.45 },
      shapes: [{ d: poly([[-18, -62], [18, -62], [46, 92], [0, 136], [-46, 92]], [4, 4, 8, 8, 8]), fill: 'main', depth: 0.5 }],
    },
    {
      parent: 'hoja',
      clip: 'hoja',
      shapes: [-20, 30, 80].map((y): Shape => ({ d: poly([[-60, y], [60, y - 40], [60, y - 22], [-60, y + 18]]), fill: 'gold', line: 3 })),
    },
    {
      parent: 'camisa',
      shapes: [
        { d: poly([[-26, -100], [26, -100], [18, -58], [-18, -58]], 6), fill: 'main', depth: 0.6 },
        { d: poly([[-72, -140], [-4, -102], [-26, -50], [-92, -100]], 6), fill: 'white', depth: 0.4 },
        { d: poly([[72, -140], [4, -102], [26, -50], [92, -100]], 6), fill: 'white', depth: 0.4 },
      ],
    },
    glow('pecho', [-150, -190], 22, [twinkle(30), twinkle(120, true)]),
  ],
}

// Día de la Madre: el ramo envuelto, con cada flor meciéndose a su tiempo.
const FLORES: ReadonlyArray<[Vec, number, number, 'main' | 'hot' | 'gold']> = [[[-64, -40], 46, 6, 'hot'], [[66, -46], 44, 7, 'gold'], [[0, -104], 54, 8, 'main']]
export const flores: Icon = {
  name: 'flores',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'ramo', a: [0, 170], p: [250, 414], s: [92, 92], m: { ...sway, k: 0.5 }, shapes: [] },
    {
      parent: 'ramo',
      tilt: [-12, 24],
      shapes: [
        { d: poly([[-40, 0], [-120, -60], [-96, -86], [-20, -16]], 20), fill: 'ok', depth: 0.5 },
        { d: poly([[40, 0], [124, -72], [100, -96], [20, -16]], 20), fill: 'ok', depth: 0.5 },
      ],
    },
    ...FLORES.map(([c, r, n, fill], i): Layer => ({
      parent: 'ramo',
      a: [c[0], c[1] + r],
      p: [c[0], c[1] + r],
      tilt: [-12, 24],
      m: { ...sway, at: i * 30, k: 1.4 },
      shapes: [{ d: rosette(c[0], c[1], r, n), fill, depth: 0.6 }, { d: ellipse(c[0], c[1], r * 0.36), fill: 'white', depth: 0.3 }],
    })),
    {
      parent: 'ramo',
      tilt: [-12, 24],
      shapes: [
        { d: poly([[-112, -6], [112, -6], [22, 172], [-22, 172]], [12, 12, 6, 6]), fill: 'paper', depth: 1 },
        { d: line([-60, 20], [-8, 120]) },
        { d: escalar(MONO, 0.6, [0, 150]), fill: 'main', depth: 0.4 },
      ],
    },
    glow('ramo', [140, -180], 22, sparkle(20)),
    glow('ramo', [-150, -130], 14, sparkle(96)),
  ],
}

// Día del Niño: el barrilete a cuadros, que planea con la cola atrás.
export const barrilete: Icon = {
  name: 'barrilete',
  frames: 180,
  line: LINE,
  extrude: [-4, 13],
  layers: [
    { id: 'barrilete', a: [0, 0], p: [262, 196], m: drift, shapes: [] },
    {
      parent: 'barrilete',
      a: [0, 112],
      p: [0, 112],
      m: { ...sway, k: 2.4, at: 12 },
      shapes: [
        { d: 'M0 112C-30 150 30 186 0 222C-24 252 4 276 -10 296', round: true },
        ...([[-6, 168, 'hot'], [8, 230, 'gold'], [-8, 284, 'ok']] as const).map(([x, y, fill]): Shape => ({
          d: poly([[x - 22, y - 14], [x, y], [x - 22, y + 14]], 3) + poly([[x + 22, y - 14], [x + 22, y + 14], [x, y]], 3),
          fill,
          line: 4,
        })),
      ],
    },
    {
      parent: 'barrilete',
      tilt: [-20, 26],
      shapes: [
        { d: poly([[0, -150], [104, -24], [0, 122], [-104, -24]], 8), fill: 'main', depth: 0.6 },
        { d: poly([[0, -150], [0, -24], [-104, -24]], [8, 0, 8]), fill: 'gold' },
        { d: poly([[0, -24], [104, -24], [0, 122]], [0, 8, 8]), fill: 'gold' },
        { d: line([0, -150], [0, 122]) },
        { d: line([-104, -24], [104, -24]) },
      ],
    },
    glow('barrilete', [140, -110], 20, sparkle(40)),
  ],
}

// Avisos: la campana que suena (la del kit).
const CAMPANA = 'M-96 40C-94 -20 -80 -96 0 -98C80 -96 94 -20 96 40C108 46 120 54 122 66Q0 96 -122 66C-120 54 -108 46 -96 40Z'
const LABIO = 'M-122 66Q0 96 122 66A9 9 0 0 1 124 84Q0 116 -124 84A9 9 0 0 1 -122 66Z'
export const campana: Icon = {
  name: 'campana',
  frames: 180,
  line: LINE,
  extrude: EXT,
  layers: [
    { parent: 'campana', a: [0, 80], p: [0, 80], m: { ...wiggle, at: 6, k: 0.8 }, shapes: [{ d: ellipse(0, 112, 24), fill: 'hot', depth: 0.8 }] },
    {
      id: 'campana',
      a: [0, -112],
      p: [250, 150],
      r: -8,
      m: wiggle,
      shapes: [
        { d: ring(0, -116, 22, 9), fill: 'gold', depth: 0.6 },
        { d: CAMPANA, fill: 'gold', depth: 1 },
        { d: LABIO, fill: 'gold', depth: 1 },
      ],
    },
  ],
}

// Tu gente: dos caras amigas que miran para todos lados, con un corazón que aparece entre las dos.
const CARA_AMIGA = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r * 0.94)
export const amigos: Icon = {
  name: 'amigos',
  frames: 168,
  line: LINE,
  extrude: EXT,
  layers: [
    { id: 'uno', a: [-70, 120], p: [180, 380], m: wobble, shapes: [] },
    { id: 'caraUno', parent: 'uno', tilt: [-12, 20], shapes: [{ d: CARA_AMIGA(-70, 20, 100), fill: 'deep', depth: 1 }, { d: arc(-56, 44, 30, 30, 150) }] },
    { id: 'ojoUno', parent: 'caraUno', shapes: [{ d: ellipse(-96, -4, 20, 24), fill: 'white' }, { d: ellipse(-34, -4, 20, 24), fill: 'white' }] },
    { parent: 'caraUno', clip: 'ojoUno', m: { ...look, k: 1.2 }, shapes: [{ d: ellipse(-92, 0, 11), fill: 'ink', line: false }, { d: ellipse(-30, 0, 11), fill: 'ink', line: false }] },
    { id: 'dos', a: [70, 120], p: [320, 392], m: { ...wobble, at: 24 }, shapes: [] },
    { id: 'caraDos', parent: 'dos', tilt: [-12, 20], shapes: [{ d: CARA_AMIGA(70, 30, 92), fill: 'main', depth: 1 }, { d: arc(84, 50, 26, 30, 150) }] },
    { id: 'ojoDos', parent: 'caraDos', shapes: [{ d: ellipse(46, 8, 18, 22), fill: 'white' }, { d: ellipse(104, 8, 18, 22), fill: 'white' }] },
    { parent: 'caraDos', clip: 'ojoDos', m: { ...look, k: 1.2, at: 20 }, shapes: [{ d: ellipse(50, 12, 10), fill: 'ink', line: false }, { d: ellipse(108, 12, 10), fill: 'ink', line: false }] },
    { id: 'latido', a: [250, 150], p: [250, 150], m: [twinkle(30), twinkle(140, true)], shapes: [] },
    { parent: 'latido', p: [250, 150], tilt: [-14, 30], shapes: [{ d: escalar(HEART, 0.3), fill: 'hot', depth: 0.8, edges: [[0, 28]] }] },
  ],
}

export const STICKERS = { lista, regalo, alcancia, antifaz, calendario, torta, padel, camiseta, auriculares, bolsa, remera, cafe, tazas, arbol, mate, corbata, flores, barrilete, campana, amigos } as const
export type NombreSticker = keyof typeof STICKERS
