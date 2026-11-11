import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { CumpleCampos } from '@/components/CumpleCampos'
import { FotoConRespaldo } from '@/components/FotoConRespaldo'
import { SkeletonFormulario, SkeletonInicio, SkeletonTapa } from '@/components/Skeleton'
import { AppHeader, AvatarSticker, SectionHeader } from '@/components/ui'
import * as appInstalable from '@/lib/app-instalable'
import { siguienteDelCarrusel } from '@/lib/carrusel'
import { TAPA_EN_COMUN } from '@/lib/tapas'

// Lo que una auditoría de accesibilidad encontró y se arregló, para que no vuelva: el zoom trabado, el blanco que no se
// leía sobre la tapa verde, los botones que no se veían sobre una foto blanca, lo que se movía para siempre, el cartel de
// "Girá el teléfono", los campos que hacían zoom en iPhone y las pantallas de carga que no se parecían a la que venía.

const CSS = readFileSync('src/app/tokens.css', 'utf8')
const LAYOUT = readFileSync('src/app/layout.tsx', 'utf8')
const archivos = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const ruta = join(dir, n)
  return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta]
})
/** La regla de una clase en tokens.css (lo de adentro de sus llaves). */
function regla(selector: string) {
  const desde = CSS.indexOf(`${selector} {`)
  expect(desde, selector).toBeGreaterThan(-1)
  return CSS.slice(desde, CSS.indexOf('}', desde))
}

test('el zoom queda libre: ni el viewport, ni touch-action, ni un script lo traban', () => {
  const viewport = LAYOUT.slice(LAYOUT.indexOf('export const viewport'), LAYOUT.indexOf('export default'))
  expect(viewport).not.toMatch(/maximumScale|userScalable/)
  expect(CSS).not.toMatch(/html\s*\{[^}]*touch-action/)
  expect(appInstalable).not.toHaveProperty('SIN_ZOOM')
  expect(LAYOUT).not.toContain('gesturestart')
})

test('ningún campo lleva letra de menos de 16 px (con menos, el iPhone hace zoom al tocarlo)', () => {
  // por defecto, 16 (un campo sin tamaño propio heredaba el del texto de alrededor, a veces de 14)
  expect(CSS).toMatch(/input, select, textarea \{ font-size: 16px; \}/)
  expect(regla('.gr-input')).toContain('font-size: 16px')
  const PX: Record<string, number> = { xs: 12, sm: 14 }
  const chicos: string[] = []
  for (const archivo of archivos('src').filter((a) => a.endsWith('.tsx'))) {
    const fuente = readFileSync(archivo, 'utf8')
    for (const m of fuente.matchAll(/<(input|select|textarea)\b/g)) {
      // hasta el > que cierra la etiqueta (los de adentro de { } son de flechas y comparaciones)
      let fin = m.index, llaves = 0
      for (; fin < fuente.length; fin++) {
        if (fuente[fin] === '{') llaves++
        else if (fuente[fin] === '}') llaves--
        else if (fuente[fin] === '>' && !llaves) break
      }
      const etiqueta = fuente.slice(m.index, fin)
      // los que no se escriben (y los escondidos) no hacen zoom
      if (/type="(hidden|radio|checkbox|file)"|sr-only/.test(etiqueta)) continue
      const letra = [...etiqueta.matchAll(/(?<![:\w-])text-(xs|sm|\[(\d+(?:\.\d+)?)px\])/g)].map((t) => PX[t[1]] ?? Number(t[2]))
      if (letra.some((px) => px < 16)) chicos.push(`${archivo}:${fuente.slice(0, m.index).split('\n').length}`)
    }
  }
  expect(chicos).toEqual([])
})

test('la app se usa con el teléfono de costado: no hay cartel que la tape', () => {
  expect(CSS).not.toContain('gr-girar')
  expect(LAYOUT).not.toMatch(/gr-girar|Girá el teléfono/)
})

test('viewport-fit=cover: los insets del iPhone valen, y la barra de abajo queda arriba de la barra de gestos', () => {
  expect(LAYOUT).toContain("viewportFit: 'cover'")
  expect(regla('.gr-nav')).toContain('max(22px, env(safe-area-inset-bottom, 0px))')
  for (const fija of ['.gr-floatbar', '.gr-ficha__barra', '.gr-toast']) expect(regla(fija)).toContain('env(safe-area-inset-bottom)')
})

// --- contraste (WCAG): la luminancia relativa de un color sRGB y la razón entre dos
type RGB = [number, number, number]
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const lineal = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const luminancia = (c: RGB) => 0.2126 * lineal(c[0]) + 0.7152 * lineal(c[1]) + 0.0722 * lineal(c[2])
const contraste = (a: RGB, b: RGB) => {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (oscuro + 0.05)
}
/** Un color con alfa pintado encima de otro. */
const sobre = (color: RGB, alfa: number, fondo: RGB) => color.map((c, i) => c * alfa + fondo[i] * (1 - alfa)) as RGB
/** color-mix(in oklch, color p%, black): el negro no tiene croma ni tono, así que es el color en OKLab por p. */
function conNegro(color: RGB, p: number): RGB {
  const [r, g, b] = color.map(lineal)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const [L, A, B] = [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s].map((v) => v * p)
  const [l2, m2, s2] = [L + 0.3963377774 * A + 0.2158037573 * B, L - 0.1055613458 * A - 0.0638541728 * B, L - 0.0894841775 * A - 1.291485548 * B].map((v) => v ** 3)
  return [4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * s2, -1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * s2,
    -0.0041960863 * l2 - 0.7034186147 * m2 + 1.707614701 * s2]
    .map((c) => { c = Math.min(1, Math.max(0, c)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) }) as RGB
}
const BLANCO: RGB = [255, 255, 255], NEGRO: RGB = [0, 0, 0]
const numero = (texto: string, patron: RegExp) => {
  const m = texto.match(patron)
  expect(m, String(patron)).not.toBeNull()
  return Number(m![1])
}

test('sobre las tapas (la verde de las personas y la uva de las listas en común) el blanco se lee: 4.5:1 el texto, 3:1 los íconos', () => {
  const verde = hex(CSS.match(/--gr-acento: (#[0-9A-F]{6});/)![1])
  const tapa = regla('.gr-tapa')
  // el arranque del degradé (lo más claro) y el brillo de arriba a la derecha, con el color de la tapa encima
  const arranque = numero(tapa, /linear-gradient\(in oklch 180deg, color-mix\(in oklch, var\(--c\) (\d+)%, black\)/) / 100
  const brillo = numero(regla('.gr-tapa::before'), /opacity: ([\d.]+)/)
  expect(regla('.gr-tapa::before')).toContain('var(--c) 0%')
  const bajada = numero(regla('.gr-tapa .gr-muted, .gr-tapa__sub'), /rgb\(255 255 255 \/ ([\d.]+)\)/)
  const etiqueta = numero(regla('.gr-tapa .gr-label'), /rgb\(255 255 255 \/ ([\d.]+)\)/)
  // el vidrio de los botones: ahumado (negro con alfa), nunca más claro que la tapa
  const vidrio = numero(regla('.gr-btn--vidrio, .gr-vidrio'), /background: rgb\(0 0 0 \/ ([\d.]+)\)/)
  // la tarjeta grande de Inicio lleva la misma tapa
  const destacada = numero(regla('.gr-destacada'), /linear-gradient\(in oklch 155deg, color-mix\(in oklch, var\(--c\) (\d+)%, black\)/) / 100

  for (const color of [verde, hex(TAPA_EN_COMUN)]) {
    const fondo = conNegro(color, arranque)
    for (const peor of [fondo, sobre(color, brillo, fondo)]) {
      expect(contraste(BLANCO, peor)).toBeGreaterThanOrEqual(4.5)
      expect(contraste(sobre(BLANCO, bajada, peor), peor)).toBeGreaterThanOrEqual(4.5)
      expect(contraste(sobre(BLANCO, etiqueta, peor), peor)).toBeGreaterThanOrEqual(4.5)
      expect(contraste(BLANCO, sobre(NEGRO, vidrio, peor))).toBeGreaterThanOrEqual(4.5)
    }
    const tarjeta = conNegro(color, destacada)
    expect(contraste(BLANCO, tarjeta)).toBeGreaterThanOrEqual(4.5)
    // su etiqueta de 11.5 px va en blanco al 90 % (ver Destacada)
    expect(contraste(sobre(BLANCO, 0.9, tarjeta), tarjeta)).toBeGreaterThanOrEqual(4.5)
  }
  // el verde de la marca puro no alcanzaba: por eso la tapa arranca oscurecida
  expect(contraste(BLANCO, verde)).toBeLessThan(3)
})

test('volver, compartir y "Ver foto" se ven sobre cualquier foto: blanco sobre vidrio oscuro, 4.5:1 hasta en una foto blanca', () => {
  const alfa = numero(regla('.gr-icon-btn.gr-vidrio-oscuro, .gr-vidrio-oscuro'), /background: rgb\(18 18 22 \/ ([\d.]+)\)/)
  for (const foto of [BLANCO, NEGRO]) expect(contraste(BLANCO, sobre([18, 18, 22], alfa, foto))).toBeGreaterThanOrEqual(4.5)
})

test('nada se mueve para siempre al lado de lo que hay que leer: los íconos de los avisos animan dos veces y paran', () => {
  const icono = CSS.match(/\.gr-aviso-icono\[data-mueve\] > svg \{ animation: ([^;]+);/)![1]
  expect(icono).not.toContain('infinite')
  expect(icono).toMatch(/ 1\.85 /)
  expect(CSS.match(/animation: gr-aviso-punto ([^;]+);/)![1]).not.toContain('infinite')
  // con "reducir movimiento" siguen quietos
  expect(CSS.slice(CSS.lastIndexOf('@media (prefers-reduced-motion: reduce)'))).toContain('.gr-aviso-icono[data-mueve] > svg, .gr-aviso-icono[data-mueve] .gr-aviso__punto { animation: none; }')
})

test('el carrusel de Inicio da una vuelta y avisa que terminó: de la última tarjeta (o del final) vuelve a la primera', () => {
  // tres tarjetas de 200 con 12 de separación, en un carrusel de 340 de ancho
  const tarjetas = [0, 212, 424].map((offsetLeft) => ({ offsetLeft, offsetWidth: 200 }))
  const carrusel = (scrollLeft: number) => ({ scrollLeft, clientWidth: 340, scrollWidth: 624, children: tarjetas })
  expect(siguienteDelCarrusel(carrusel(0))).toEqual({ izquierda: 142, volvio: false })
  // en la segunda: a la tercera, centrada
  expect(siguienteDelCarrusel(carrusel(142))).toEqual({ izquierda: 354, volvio: false })
  // ya no se desliza más (la última quedó a la vista): vuelve a la primera y dio la vuelta
  expect(siguienteDelCarrusel(carrusel(284))).toEqual({ izquierda: -70, volvio: true })
  // una sola tarjeta a la vista y es la última
  expect(siguienteDelCarrusel({ scrollLeft: 0, clientWidth: 340, scrollWidth: 1000, children: tarjetas.slice(0, 1) }).volvio).toBe(true)
})

test('las fotos se piden cuando se acercan a la pantalla; las de lo primero que se ve (pronto), ya', () => {
  const foto = (props: object) => renderToStaticMarkup(createElement(FotoConRespaldo, { src: '/f.jpg', respaldo: null, ...props }))
  expect(foto({})).toBe('<img loading="lazy" decoding="async" src="/f.jpg" alt=""/>')
  // sin lazy, React además la precarga desde el <head>
  expect(foto({ pronto: true })).toBe('<link rel="preload" as="image" href="/f.jpg"/><img decoding="async" src="/f.jpg" alt=""/>')
  expect(renderToStaticMarkup(createElement(AvatarSticker, { nombre: 'Ana', foto: '/a.jpg' }))).toContain('<img loading="lazy" decoding="async"')
  // tu foto en la barra de arriba se ve apenas abre
  const barra = renderToStaticMarkup(createElement(AppHeader, { nombre: 'Ana', foto: '/a.jpg' }))
  expect(barra).toContain('<img decoding="async" src="/a.jpg"')
  expect(barra).not.toContain('loading="lazy"')
})

test('lo chico se toca en 44 × 44: los "Ver más", los chips, las pestañas y los puntitos', () => {
  expect(renderToStaticMarkup(createElement(SectionHeader, { title: 'Próximos', href: '/eventos', linkLabel: 'Todo el año' })))
    .toContain('<a class="gr-toque flex-none')
  expect(regla('.gr-toque::after')).toMatch(/width: max\(100%, 44px\);\s+height: max\(100%, 44px\);/)
  // los chips se ven de 38 y las opciones de un segmentado, de 38 (o 32): el ::after los lleva a 44
  expect(regla('.gr-chip')).toContain('height: 38px')
  expect(CSS).toContain(".gr-chip::after { content: ''; position: absolute; inset: -3px 0; }")
  expect(CSS).toContain(".gr-segmented > *::after { content: ''; position: absolute; inset: -6px 0; }")
  // el selector de prioridad: el <select> de verdad mide 44 de alto y lleva letra de 16
  expect(readFileSync('src/components/PrioritySelect.tsx', 'utf8')).toMatch(/className="absolute [^"]*\bh-11\b[^"]*\bmin-w-11\b[^"]*\btext-base\b/)
})

test('el cumple que no se guardó: los dos campos quedan marcados y leen el mensaje', () => {
  const sin = renderToStaticMarkup(createElement(CumpleCampos, {}))
  expect(sin).not.toMatch(/aria-invalid|aria-describedby/)
  const con = renderToStaticMarkup(createElement(CumpleCampos, { error: 'cumple-error' }))
  expect(con.match(/aria-invalid="true" aria-describedby="cumple-error"/g)).toHaveLength(2)
})

test('las pantallas de carga copian la que viene: la tapa de su color, el logo a la izquierda en Inicio, el formulario', () => {
  const tapa = renderToStaticMarkup(createElement(SkeletonTapa, { color: TAPA_EN_COMUN, barra: 'volver' }))
  expect(tapa).toMatch(/^<main aria-busy="true" class="flex flex-col gap-5 pb-36"><span class="sr-only" role="status">Cargando…<\/span><section aria-hidden="true" class="gr-tapa" style="--c:#5B3FB5">/)
  expect(tapa.match(/class="gr-arte /g)).toHaveLength(4)
  const inicio = renderToStaticMarkup(createElement(SkeletonInicio))
  // la barra del menú: el logo a la izquierda y tres redondos a la derecha; la tarjeta grande, del alto de la de verdad
  expect(inicio).toContain('<div class="flex min-h-14 items-center justify-between gap-3">')
  expect(inicio.match(/size-10 rounded-full/g)).toHaveLength(3)
  expect(inicio).toContain('h-[268px] rounded-[26px]')
  expect(regla('.gr-destacada')).toContain('min-height: 268px')
  const formulario = renderToStaticMarkup(createElement(SkeletonFormulario))
  expect(formulario).toContain('grid-cols-[48px_1fr_48px]')
  expect(formulario).not.toContain('gr-tapa')
})

test('cada loading.tsx arma una pantalla de carga que la animación de inicio reconoce (aria-busy)', async () => {
  const rutas = archivos('src/app').filter((a) => a.endsWith('/loading.tsx'))
  expect(rutas.length).toBeGreaterThanOrEqual(18)
  const pantalla = async (ruta: string) => {
    const { default: Loading } = await import(/* @vite-ignore */ resolve(ruta)) as { default: () => ReactElement }
    return renderToStaticMarkup(createElement(Loading))
  }
  for (const ruta of rutas) {
    const html = await pantalla(ruta)
    expect(html, ruta).toMatch(/^<(main|div) aria-busy="true"/)
    expect(html, ruta).toContain('<span class="sr-only" role="status">Cargando…</span>')
  }
  // las que tienen tapa la traen en su pantalla de carga; las de formulario, no
  const de = (ruta: string) => pantalla(rutas.find((r) => r.endsWith(ruta))!)
  expect(await de('/mi-lista/loading.tsx')).toContain('class="gr-tapa" style="--c:var(--gr-acento)"')
  expect(await de('/grupos/[id]/loading.tsx')).toContain('style="--c:#5B3FB5"')
  expect(await de('/inicio/loading.tsx')).toContain('h-[268px]')
  for (const formulario of ['/agregar/loading.tsx', '/editar/[id]/loading.tsx', '/perfil/loading.tsx']) {
    expect(await de(formulario)).toContain('grid-cols-[48px_1fr_48px]')
  }
})
