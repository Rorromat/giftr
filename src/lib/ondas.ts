// El círculo con el borde ondulado de los sellos y las insignias. Sin dependencias: lo usan los componentes (ui.tsx,
// SelloDibujo) y las imágenes para compartir (og.tsx).

/** Un círculo con el borde ondulado (n ondas), como un sello: centro (cx, cy), radio r y cada onda de radio o. */
export function ondas(cx: number, cy: number, r: number, n: number, o: number) {
  const punto = (i: number) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2
    return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`
  }
  let d = `M${punto(0)}`
  for (let i = 1; i <= n; i++) d += ` A${o} ${o} 0 0 1 ${punto(i)}`
  return `${d}Z`
}
/** El círculo ondulado, justo adentro de una caja de 100 × 100. */
export const ONDAS = ondas(50, 50, 43, 16, 8.8)
