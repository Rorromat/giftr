import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

// Páginas de producto de verdad (tiendas AR, MercadoLibre, internacionales), comprimidas: <caso>.html.gz y <caso>.json
// con lo que se pidió, lo que contestó y lo que tendría que salir (expected).

const DIR = join(__dirname)

export type Esperado = {
  blocked?: boolean; notFound?: boolean; genericPage?: boolean; redirect?: boolean
  tipo?: string; pageKind?: string
  title?: string | null; image?: string | null; imageHiRes?: string | null; price?: number | string | null; currency?: string | null
  location?: string; destino?: string
  generico?: { title?: string | null; image?: string | null; price?: string | null; currency?: string | null }
}

export type Fixture = {
  tienda: string
  caso: string
  urlPegadaPorElUsuario: string
  urlFinal: string
  status: number
  contentType: string | null
  cadenaDeRespuestas: { status: number; location: string | null; contentType: string | null; server: string | null }[]
  expected: Esperado
}

/** Los nombres de todos los casos ("mercadolibre-1", "crocs-1"…). */
export const casos = () => readdirSync(DIR).filter((f) => f.endsWith('.html.gz')).map((f) => f.slice(0, -'.html.gz'.length)).sort()

export const fixture = (caso: string): Fixture => JSON.parse(readFileSync(join(DIR, `${caso}.json`), 'utf-8'))

/** El cuerpo tal como llegó (sin comprimir). */
export const cuerpo = (caso: string): Buffer => gunzipSync(readFileSync(join(DIR, `${caso}.html.gz`)))

export const mlUrls = (): { casos: { url: string; tipo: string; siteId?: string; itemId?: string; catalogProductId?: string; userProductId?: string; slugTitle?: string }[] } =>
  JSON.parse(readFileSync(join(DIR, 'ml-urls.json'), 'utf-8'))
