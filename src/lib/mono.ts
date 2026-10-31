// El moño de GiftR, el logo: un moño lleno, en tres tonos del verde del acento, en una caja de 100×100 (con las puntas de la
// cinta, ocupa de x 3 a 97 y de y 18 a 88). Lo dibujan el componente Mono (ui.tsx), las imágenes para compartir (og.tsx) y
// los íconos de la app (scripts/iconos.mjs), así es el mismo en todos lados. Sin dependencias: lo lee también node.

export type TonosMono = { claro: string; medio: string; oscuro: string; nudo: string }

/** Los tonos del moño: de la lazada de la izquierda (la que da a la luz) al nudo. */
export const TONOS_MONO: TonosMono = { claro: '#10B66E', medio: '#0EA765', oscuro: '#0A9A5B', nudo: '#08794A' }

/** Las partes del moño, de atrás para adelante: las dos puntas de la cinta, las dos lazadas, sus pliegues y el nudo. */
export const PARTES_MONO: { d: string; tono: keyof TonosMono; opacidad?: number }[] = [
  { d: 'M45 54 L32 84 L41 79 L46 88 L54 56 Z', tono: 'nudo' },
  { d: 'M55 54 L68 84 L59 79 L54 88 L46 56 Z', tono: 'oscuro' },
  { d: 'M50 46 C42 28 16 18 9 32 C3 46 24 60 50 52 Z', tono: 'claro' },
  { d: 'M50 46 C58 28 84 18 91 32 C97 46 76 60 50 52 Z', tono: 'medio' },
  { d: 'M44 47 C36 40 24 36 20 40 C26 42 36 46 44 49 Z', tono: 'nudo', opacidad: 0.55 },
  { d: 'M56 47 C64 40 76 36 80 40 C74 42 64 46 56 49 Z', tono: 'nudo', opacidad: 0.55 },
  { d: 'M48 40 H52 Q58 40 58 46 V51 Q58 57 52 57 H48 Q42 57 42 51 V46 Q42 40 48 40 Z', tono: 'nudo' },
]

/** El moño como SVG (sin el <svg> de afuera), para meterlo en otro: en (x, y) y de lado × lado. */
export function svgMono(tonos: TonosMono = TONOS_MONO, { x = 0, y = 0, lado = 100 } = {}): string {
  const partes = PARTES_MONO.map((p) => `<path d="${p.d}" fill="${tonos[p.tono]}"${p.opacidad ? ` opacity="${p.opacidad}"` : ''}/>`)
  return `<g transform="translate(${x} ${y}) scale(${lado / 100})">${partes.join('')}</g>`
}
