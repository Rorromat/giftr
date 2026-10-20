// Genera src/app/icono-inicio.ts: el ícono de inicio del iPhone como data: URI, en una paleta chica para
// que pese poco en cada página. Si cambia public/apple-touch-icon.png: `node scripts/icono-inicio.mjs`.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const png = await sharp(await readFile('public/apple-touch-icon.png'))
  .png({ palette: true, colors: 64, dither: 0, compressionLevel: 9, effort: 10 })
  .toBuffer()

await writeFile('src/app/icono-inicio.ts', `// Generado por scripts/icono-inicio.mjs desde public/apple-touch-icon.png: no editar a mano.
// El ícono de inicio va adentro del HTML porque el instalador de iOS 27 no carga los que vienen por red
// (pone la inicial sobre un cuadrado gris).
export const ICONO_INICIO = 'data:image/png;base64,${png.toString('base64')}'
`)
console.log(`src/app/icono-inicio.ts: PNG de ${png.length} bytes`)
