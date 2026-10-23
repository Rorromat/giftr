// GiftRBot: cómo nos presentamos cuando pedimos algo afuera (la página del link de un producto, su foto, la API de
// MercadoLibre). Sin dependencias: lo usan bajar-foto.ts, mercadolibre.ts y la página /bot.

/**
 * Un bot con nombre propio y la página que explica qué hace (/bot). Nunca el de un navegador ni el de otro servicio:
 * sería hacerse pasar por otro.
 */
export const UA_GIFTR = (() => {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '')
  return `Mozilla/5.0 (compatible; GiftRBot/1.0${base?.startsWith('https://') ? `; +${base}/bot` : ''})`
})()
