// Genera los íconos de los deploys de prueba (la rama dev y los previews de Vercel, ver lib/entorno.ts) en public/dev/: los
// de siempre con el fondo en el verde del acento en vez de negro y una etiqueta "DEV", para que no se confundan con la app de
// verdad en la pestaña ni en la pantalla de inicio. La etiqueta queda adentro de la zona segura de los maskable (el círculo
// del 80% del medio). Si cambian los íconos de public/: `node scripts/iconos-dev.mjs`.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

// el verde pino del acento (ver tokens.css)
const PINO = [0x12, 0x86, 0x5f]
// el fondo de los de siempre
const NEGRO = [0x12, 0x12, 0x12]

/** El ícono a sangre con el fondo negro pasado al verde del acento: se pinta lo oscuro que toca el borde (no la G, que está adentro de la estrella). */
async function aRojo(archivo) {
  const { data, info } = await sharp(await readFile(archivo)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  // cuánto de lima tiene cada píxel (0 el negro del fondo, 1 la estrella), por el verde
  const lima = (i) => Math.min(1, Math.max(0, (data[i * 4 + 1] - NEGRO[1]) / (243 - NEGRO[1])))
  const visto = new Uint8Array(w * h)
  const pila = [0, w - 1, (h - 1) * w, h * w - 1]
  while (pila.length) {
    const p = pila.pop()
    if (visto[p] || lima(p) > 0.97) continue
    visto[p] = 1
    const x = p % w, y = (p - x) / w
    if (x > 0) pila.push(p - 1)
    if (x < w - 1) pila.push(p + 1)
    if (y > 0) pila.push(p - w)
    if (y < h - 1) pila.push(p + w)
  }
  for (let p = 0; p < w * h; p++) {
    if (!visto[p]) continue
    const t = lima(p)
    // lo que tenía de negro pasa al verde; el borde de la estrella, en la misma proporción
    for (let c = 0; c < 3; c++) data[p * 4 + c] = Math.round(data[p * 4 + c] + (1 - t) * (PINO[c] - NEGRO[c]))
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
}

/** La etiqueta "DEV": una píldora blanca abajo del medio, encima de la estrella. */
function etiqueta(lado) {
  const pw = lado * 0.44, ph = lado * 0.15, x = (lado - pw) / 2, y = lado * 0.74 - ph / 2
  return Buffer.from(`<svg width="${lado}" height="${lado}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="${ph / 2}" fill="#FFFFFF" />
    <text x="${lado / 2}" y="${y + ph * 0.74}" text-anchor="middle" font-family="Inter Display, DejaVu Sans" font-weight="900"
          font-size="${ph * 0.72}" letter-spacing="${lado * 0.004}" fill="#121216">DEV</text>
  </svg>`)
}

const base = await sharp(await aRojo('public/icon-512.png')).composite([{ input: etiqueta(512) }]).png().toBuffer()
const lado = (n) => sharp(base).resize(n, n).png({ compressionLevel: 9 }).toBuffer()
/** Con las esquinas redondeadas y transparentes, como el de la pestaña (src/app/icon.png). */
const redondo = async (n) => sharp(await lado(n))
  .composite([{ input: Buffer.from(`<svg width="${n}" height="${n}"><rect width="${n}" height="${n}" rx="${n * 0.22}" /></svg>`), blend: 'dest-in' }])
  .png({ compressionLevel: 9 }).toBuffer()

await writeFile('public/dev/icon-512.png', await lado(512))
await writeFile('public/dev/icon-192.png', await lado(192))
await writeFile('public/dev/apple-touch-icon.png', await lado(180))
await writeFile('public/dev/icon.png', await redondo(96))
// un .ico con un PNG adentro (lo leen todos los navegadores de ahora)
const png = await redondo(48)
const ico = Buffer.alloc(22)
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4)
ico.writeUInt8(48, 6); ico.writeUInt8(48, 7); ico.writeUInt8(0, 8); ico.writeUInt8(0, 9)
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18)
await writeFile('public/dev/favicon.ico', Buffer.concat([ico, png]))

// El de inicio del iPhone va adentro del HTML, como el de siempre (ver scripts/icono-inicio.mjs)
const inicio = await sharp(await lado(180)).png({ palette: true, colors: 64, dither: 0, compressionLevel: 9, effort: 10 }).toBuffer()
await writeFile('src/app/icono-inicio-dev.ts', `// Generado por scripts/iconos-dev.mjs desde public/icon-512.png: no editar a mano.
// El ícono de inicio del iPhone de los deploys de prueba (ver lib/entorno.ts), adentro del HTML como ICONO_INICIO.
export const ICONO_INICIO_DEV = 'data:image/png;base64,${inicio.toString('base64')}'
`)
console.log('public/dev y src/app/icono-inicio-dev.ts: listos')
