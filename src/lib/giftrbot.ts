// Cómo nos presentamos cuando pedimos algo afuera (la página del link de un producto, su foto, la API de
// MercadoLibre). Sin dependencias: lo usan bajar-foto.ts, mercadolibre.ts y la página /bot.

/**
 * Con nombre propio y la página que explica qué hace (/bot). Nunca el de un navegador ni el de otro servicio: sería
 * hacerse pasar por otro. "GiftR/1.0" y no "GiftRBot/1.0": el CDN de fotos de las tiendas VTEX (OnCity, Carrefour,
 * Jumbo) le contesta 429 a lo segundo, y las páginas contestan igual a los dos.
 */
export const UA_GIFTR = (() => {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '')
  return `Mozilla/5.0 (compatible; GiftR/1.0${base?.startsWith('https://') ? `; +${base}/bot` : ''})`
})()
