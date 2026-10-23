import { and, count, eq, gt, lt, notExists, sql } from 'drizzle-orm'
import sharp from 'sharp'
import { fotosDeseo, idDeFotoDeseo, items, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { bajarFotoConUrl, pedirFoto, type Pedir } from '@/lib/bajar-foto'
import { esUuid } from '@/lib/groups'
import { esUrlPublica } from '@/lib/links'
import { anotarPedidoAfuera } from '@/lib/pedidos-afuera'
import { fotoGrande } from '@/lib/producto-del-link'

// Fotos de deseos subidas desde el teléfono (galería, cámara o pegadas). Se guardan en la base, como la foto
// de perfil, y el deseo las usa por su URL /foto/deseo/:id (que nunca cambia: cada subida es una foto nueva).

export const FOTO_DESEO_MAX_BYTES = 6_000_000
const LADO = 1200

export { esUrlFotoDeseo } from '@/lib/links'

/**
 * Deja cualquier imagen como JPEG de hasta 1200px de lado (sin recortar ni agrandar), derecha (EXIF) y sin
 * metadatos (nada de GPS). Tira error si no es una imagen.
 */
export async function procesarFotoDeseo(datos: Buffer): Promise<Buffer> {
  return sharp(datos, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize(LADO, LADO, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()
}

/** Cuántas fotos de deseos puede subir alguien en un día (cambiar la foto varias veces entra de sobra). */
export const FOTOS_POR_DIA = 40

const haceUnDia = sql`now() - interval '24 hours'`

/** Si todavía puede subir fotos hoy (en las últimas 24 horas). */
export async function quedanFotos(db: Db, userId: string): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(fotosDeseo)
    .where(and(eq(fotosDeseo.userId, userId), gt(fotosDeseo.createdAt, haceUnDia)))
  return n < FOTOS_POR_DIA
}

/**
 * Guarda la foto y devuelve la URL para el deseo; null si ya subió FOTOS_POR_DIA hoy. De paso borra sus fotos de más de
 * un día que ningún deseo usa (las que cambió, quitó o subió y no guardó): el día de margen es para un formulario que
 * sigue abierto. Se mira cualquier deseo, de cualquier lista y archivado o no: el link de una foto subida se puede usar
 * en otro deseo, también de otra persona, y como venga escrito (con el id en mayúsculas, o con "?…" después).
 */
export async function guardarFotoDeseo(db: Db, userId: string, jpeg: Buffer): Promise<string | null> {
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db
    // lock del usuario: dos subidas a la vez no pasan juntas el cupo. "No key update" alcanza para eso y no frena lo que
    // apunta a su fila mientras tanto (una reserva suya, un comentario, un aviso para él).
    await t.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('no key update')
    if (!(await quedanFotos(t, userId))) return null
    // por el índice de items sobre idDeFotoDeseo: las que siguen en uso se vuelven a mirar en cada subida
    const usada = t.select({ id: items.id }).from(items).where(sql`${idDeFotoDeseo(items.fotoUrl)} = ${fotosDeseo.id}::text`)
    await t.delete(fotosDeseo).where(and(eq(fotosDeseo.userId, userId), lt(fotosDeseo.createdAt, haceUnDia), notExists(usada)))
    const [f] = await t.insert(fotosDeseo).values({ userId, datos: jpeg }).returning({ id: fotosDeseo.id })
    return `/foto/deseo/${f.id}`
  })
}

export async function leerFotoDeseo(db: Db, id: string): Promise<Buffer | null> {
  if (!esUuid(id)) return null
  const [f] = await db.select({ datos: fotosDeseo.datos }).from(fotosDeseo).where(eq(fotosDeseo.id, id))
  return f?.datos ?? null
}

/** Para traer la foto de un link: la grande y la original, todo junto (el cliente corta a los 9 s). */
export const FOTO_DESDE_LINK_TIEMPO_MS = 6000
// El CDN de Cúspide manda las fotos como octet-stream: lo que decide si es una foto es sharp
const imagenOBinario = (tipo: string) => /^\s*(image\/|application\/octet-stream\s*(;|$))/i.test(tipo)
// A donde manda ML una foto que no existe (la -F de una publicación vieja, por ejemplo): una imagen gris, que no sirve
const NO_DISPONIBLE = '/img-not-available/'

export type FotoImportada = { url: string } | { error: 'muchas' | 'muchos' | 'no_carga' | 'no_es_imagen' }

/** El cuerpo tal como llega, sumando los bytes de cada pedazo. */
async function* contado(cuerpo: AsyncIterable<Uint8Array>, sumar: (bytes: number) => void): AsyncGenerator<Uint8Array> {
  for await (const trozo of cuerpo) {
    sumar(trozo.byteLength)
    yield trozo
  }
}

/**
 * Trae la foto de un link (la que encontró la lectura del producto) y la guarda como una subida: así el deseo no depende
 * de que la tienda la siga sirviendo. Primero la versión grande (ver fotoGrande) y si no, la del link; en 6 s y 6 MB en
 * total, como una subida: lo que bajó la grande, aunque no sirviera, se descuenta de lo que puede bajar la del link. Sin
 * cupo de fotos no se baja nada; el pedido cuenta en el tope de pedidos de afuera aunque después falle (si no, se podría
 * pedir sin fin un link que no es una foto). no_es_imagen: lo que hay en el link no es una foto. no_carga también si
 * falla la base (que no conteste, o la tabla de pedidos sin migrar): el formulario prueba la foto en el navegador.
 */
export async function importarFotoDeseo(db: Db, userId: string, src: string, o: {
  pedir?: Pedir; signal?: AbortSignal; tiempoMs?: number
} = {}): Promise<FotoImportada> {
  const { pedir = pedirFoto, signal, tiempoMs: total = FOTO_DESDE_LINK_TIEMPO_MS } = o
  try {
    if (!(await quedanFotos(db, userId))) return { error: 'muchas' }
    if (!(await anotarPedidoAfuera(db, userId))) return { error: 'muchos' }
  } catch (e) {
    // sin base, o sin la tabla de pedidos (un preview con la base sin migrar): no se sale a la red
    console.error('deseo/foto/desde-link: no se pudo mirar el cupo ni anotar el pedido', e)
    return { error: 'no_carga' }
  }
  const fin = Date.now() + total
  let bajados = 0
  const contando: Pedir = async (url, s) => {
    const r = await pedir(url, s)
    return { ...r, cuerpo: contado(r.cuerpo, (bytes) => { bajados += bytes }) }
  }
  let error: 'no_carga' | 'no_es_imagen' = 'no_carga'
  for (const candidata of new Set([fotoGrande(src), src])) {
    const tiempoMs = fin - Date.now()
    if (tiempoMs <= 0 || signal?.aborted) return { error: 'no_carga' }
    if (bajados >= FOTO_DESEO_MAX_BYTES) break
    const r = await bajarFotoConUrl(candidata, contando, esUrlPublica, {
      max: FOTO_DESEO_MAX_BYTES - bajados, tiempoMs, aceptar: imagenOBinario, signal,
    })
    if (!('datos' in r)) {
      error = r.falla === 'otro-tipo' ? 'no_es_imagen' : 'no_carga'
      continue
    }
    if (r.urlFinal.includes(NO_DISPONIBLE)) {
      error = 'no_carga'
      continue
    }
    let jpeg: Buffer
    try {
      jpeg = await procesarFotoDeseo(r.datos)
    } catch {
      error = 'no_es_imagen'
      continue
    }
    let url: string | null
    try {
      url = await guardarFotoDeseo(db, userId, jpeg)
    } catch (e) {
      // el error de la base y no el de drizzle, que trae en el mensaje los parámetros: la foto, como texto
      console.error('deseo/foto/desde-link: no se pudo guardar la foto', e instanceof Error ? e.cause ?? e.message.slice(0, 300) : e)
      return { error: 'no_carga' }
    }
    return url ? { url } : { error: 'muchas' }
  }
  return { error }
}
