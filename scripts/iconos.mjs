// Genera los íconos de la app desde el moño de la marca (src/lib/mono.ts): el de la pestaña (src/app/icon.png y
// public/favicon.ico), los del manifest (public/icon-*.png) y el de inicio del iPhone (public/apple-touch-icon*.png), con el
// moño sobre tinta. Y los de los deploys de prueba (public/dev/, ver lib/entorno.ts): sobre blanco y con una etiqueta
// "DEV", para que no se confundan con la app de verdad. En los maskable el moño queda adentro de la zona segura (el círculo
// del 80% del medio), y la etiqueta también. Después de correrlo: `node scripts/icono-inicio.mjs` (el de inicio, adentro
// del HTML). Uso: `node scripts/iconos.mjs`.
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { svgMono } from '../src/lib/mono.ts'

const TINTA = '#121216'

/**
 * El ícono en 512: el fondo, el moño (lado: cuánto ocupa; arriba: dónde empieza, con el moño un poco más arriba del medio
 * porque las puntas de la cinta bajan) y, en los de prueba, la etiqueta.
 */
function svg({ fondo, lado, arriba, dev = false }) {
  const x = (512 - lado) / 2
  const etiqueta = dev
    ? `<rect x="166" y="352" width="180" height="64" rx="32" fill="${TINTA}"/>
       <text x="256" y="398" text-anchor="middle" font-family="Inter Display, DejaVu Sans" font-weight="900" font-size="44" letter-spacing="2" fill="#fff">DEV</text>`
    : ''
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="${fondo}"/>${svgMono(undefined, { x, y: arriba, lado })}${etiqueta}</svg>`)
}

const png = (fuente, n) => sharp(fuente).resize(n, n).png({ compressionLevel: 9 }).toBuffer()
/** Con las puntas redondeadas y transparentes, como el de la pestaña. */
const redondo = async (fuente, n) => sharp(await png(fuente, n))
  .composite([{ input: Buffer.from(`<svg width="${n}" height="${n}"><rect width="${n}" height="${n}" rx="${n * 0.22}"/></svg>`), blend: 'dest-in' }])
  .png({ compressionLevel: 9 }).toBuffer()
/** Un .ico con un PNG adentro (lo leen todos los navegadores de ahora). */
function ico(pngBuf, n) {
  const h = Buffer.alloc(22)
  h.writeUInt16LE(0, 0); h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4)
  h.writeUInt8(n, 6); h.writeUInt8(n, 7); h.writeUInt8(0, 8); h.writeUInt8(0, 9)
  h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12); h.writeUInt32LE(pngBuf.length, 14); h.writeUInt32LE(22, 18)
  return Buffer.concat([h, pngBuf])
}

async function juego(carpeta, { fondo, dev }) {
  // a sangre: el moño grande; maskable: más chico, adentro del círculo del 80%
  const comun = svg({ fondo, lado: dev ? 330 : 380, arriba: dev ? 30 : 52, dev })
  const maskable = svg({ fondo, lado: dev ? 250 : 300, arriba: dev ? 90 : 96, dev })
  await writeFile(`${carpeta}/icon-512.png`, await png(comun, 512))
  await writeFile(`${carpeta}/icon-192.png`, await png(comun, 192))
  await writeFile(`${carpeta}/icon-maskable-512.png`, await png(maskable, 512))
  await writeFile(`${carpeta}/icon-maskable-192.png`, await png(maskable, 192))
  await writeFile(`${carpeta}/apple-touch-icon.png`, await png(comun, 180))
  await writeFile(`${carpeta}/favicon.ico`, ico(await redondo(comun, 48), 48))
  return comun
}

const real = await juego('public', { fondo: TINTA, dev: false })
await writeFile('public/apple-touch-icon-precomposed.png', await png(real, 180))
await writeFile('src/app/icon.png', await redondo(real, 96))
const prueba = await juego('public/dev', { fondo: '#FFFFFF', dev: true })
await writeFile('public/dev/icon.png', await redondo(prueba, 96))

// El de inicio del iPhone de los de prueba va adentro del HTML, como el de siempre (ver scripts/icono-inicio.mjs)
const inicio = await sharp(await png(prueba, 180)).png({ palette: true, colors: 64, dither: 0, compressionLevel: 9, effort: 10 }).toBuffer()
await writeFile('src/app/icono-inicio-dev.ts', `// Generado por scripts/iconos.mjs desde el moño (src/lib/mono.ts): no editar a mano.
// El ícono de inicio del iPhone de los deploys de prueba (ver lib/entorno.ts), adentro del HTML como ICONO_INICIO.
export const ICONO_INICIO_DEV = 'data:image/png;base64,${inicio.toString('base64')}'
`)
console.log('íconos listos; falta node scripts/icono-inicio.mjs')
