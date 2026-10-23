import { ID_COMPARTIDO } from '@/lib/recibir-compartido'

// Corre en el navegador: lo que dejó el service worker al compartir a GiftR desde otra app (ver public/sw.js), para el
// formulario de /agregar. El caches de la página es el mismo Cache Storage del service worker (mismo origen).

/** El mismo nombre que en public/sw.js (lo fija un test). */
export const BUZON = 'giftr-compartido'

/** Lo que guardó el service worker: los textos tal cual los mandó la app, y la foto si la tomó. */
export type DelBuzon = { title: string; text: string; url: string; foto: Blob | null; fotoRechazada: boolean }

const s = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * Lo compartido con ese id, o null (no es un id, otro navegador, ya se levantó, sin Cache Storage). No lo borra: en
 * desarrollo el efecto que lo lee corre dos veces (ver borrarCompartido).
 */
export async function leerCompartido(id: string, c: CacheStorage | undefined = globalThis.caches): Promise<DelBuzon | null> {
  if (!ID_COMPARTIDO.test(id) || !c) return null
  try {
    const buzon = await c.open(BUZON)
    const sobre: unknown = await (await buzon.match(`/compartido/${id}`))?.json()
    if (!sobre || typeof sobre !== 'object') return null
    const { title, text, url, foto, fotoRechazada } = sobre as Record<string, unknown>
    const blob = foto === true ? (await (await buzon.match(`/compartido/${id}/foto`))?.blob()) ?? null : null
    return {
      title: s(title), text: s(text), url: s(url),
      foto: blob && blob.size > 0 && blob.type.startsWith('image/') ? blob : null,
      fotoRechazada: fotoRechazada === true,
    }
  } catch {
    return null
  }
}

/** Ya está en el formulario: se borra, con la foto. */
export async function borrarCompartido(id: string, c: CacheStorage | undefined = globalThis.caches) {
  try {
    const buzon = await c?.open(BUZON)
    await Promise.all([buzon?.delete(`/compartido/${id}`), buzon?.delete(`/compartido/${id}/foto`)])
  } catch { /* queda hasta el próximo compartir, o un día (ver limpiarBuzon) */ }
}

/** Lo que nadie levantó (compartió y no entró) no queda más que esto. */
export const BUZON_MAX_MS = 24 * 60 * 60 * 1000

/**
 * Saca del buzón lo de más de un día (o sin fecha legible), con su foto. Lo llama RegistrarSW cada vez que se abre GiftR, y
 * es la única limpieza por edad (además, cada compartir vacía el buzón). Una foto sin sus datos no se toca: puede ser la de
 * un compartir que se está guardando (el SW guarda la foto primero), y la saca el SW al activarse (ver public/sw.js).
 */
export async function limpiarBuzon(c: CacheStorage | undefined = globalThis.caches, ahora = Date.now()) {
  try {
    if (!c || !(await c.has(BUZON))) return
    const buzon = await c.open(BUZON)
    for (const pedido of await buzon.keys()) {
      const clave = new URL(pedido.url).pathname
      if (clave.endsWith('/foto')) continue
      const sobre: unknown = await (await buzon.match(pedido))?.json().catch(() => null)
      const en = sobre && typeof sobre === 'object' ? Number((sobre as { en?: unknown }).en) : NaN
      if (Number.isFinite(en) && ahora - en <= BUZON_MAX_MS) continue
      await Promise.all([buzon.delete(pedido), buzon.delete(`${clave}/foto`)])
    }
  } catch { /* sin Cache Storage: no hay nada que limpiar */ }
}
