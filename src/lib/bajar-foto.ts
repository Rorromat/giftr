import { lookup } from 'node:dns'
import type { IncomingMessage } from 'node:http'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import { pipeline } from 'node:stream'
import zlib from 'node:zlib'

// Bajar desde el servidor algo de afuera: la foto de un deseo (para la vista previa de WhatsApp, o para guardarla) o la
// página de un producto. Los links los pega cualquiera: nada de pedidos a la red interna ni descargas sin fin.

export const FOTO_MAX_BYTES = 8_000_000
/** Tiempo total, con las redirecciones y la descarga (antes eran 4 s por salto, hasta 16 s). */
export const FOTO_TIEMPO_MS = 5000

/**
 * Cómo nos presentamos afuera: un bot con nombre propio y la página que explica qué hace (/bot). Nunca el de un navegador
 * ni el de otro servicio: sería hacerse pasar por otro.
 */
export const UA_GIFTR = (() => {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '')
  return `Mozilla/5.0 (compatible; GiftRBot/1.0${base?.startsWith('https://') ? `; +${base}/bot` : ''})`
})()

/** Direcciones que no son de internet: loopback, privadas, link-local, CGNAT, de documentación, multicast, reservadas. */
const NO_PUBLICAS = new BlockList()
for (const [red, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) NO_PUBLICAS.addSubnet(red, bits, 'ipv4')
// Una IPv4 escrita como IPv6 (::ffff:10.0.0.1) se revisa con las reglas de arriba: BlockList lo hace solo. NAT64, 6to4 y
// la forma traducida de SIIT (::ffff:0:10.0.0.1) llevan adentro una IPv4 que no miramos, así que también quedan afuera.
for (const [red, bits] of [
  ['::', 96], ['::ffff:0:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23], ['2001:db8::', 32],
  ['2002::', 16], ['3fff::', 20], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) NO_PUBLICAS.addSubnet(red, bits, 'ipv6')

export function esIpPublica(ip: string): boolean {
  const v = isIP(ip)
  return v !== 0 && !NO_PUBLICAS.check(ip, v === 4 ? 'ipv4' : 'ipv6')
}

type Direccion = { address: string; family: number }
export type Resolver = (host: string, cb: (err: NodeJS.ErrnoException | null, dirs: Direccion[]) => void) => void
const resolverDelSistema: Resolver = (host, cb) => lookup(host, { all: true }, cb)

/**
 * El lookup de la conexión: resuelve el nombre y, si alguna dirección no es pública, no se conecta. Un nombre público
 * puede apuntar a una IP privada (127.0.0.1.nip.io). Va en la conexión misma, y cada redirección es otra conexión:
 * revisar antes y conectar después dejaría que el DNS conteste otra cosa la segunda vez.
 */
export function lookupPublico(resolver: Resolver = resolverDelSistema): LookupFunction {
  return (host, opciones, cb) => {
    resolver(host, (err, todas = []) => {
      const familia = opciones.family === 4 || opciones.family === 6 ? opciones.family : 0
      const dirs = familia ? todas.filter((d) => d.family === familia) : todas
      if (err || !dirs.length || todas.some((d) => !esIpPublica(d.address))) {
        return cb(err ?? Object.assign(new Error(`${host} no es una dirección pública`), { code: 'ENOTFOUND' }), '')
      }
      if (opciones.all) return cb(null, dirs)
      cb(null, dirs[0].address, dirs[0].family)
    })
  }
}

/** Una respuesta a medio bajar: el cuerpo se lee de a pedazos (y se corta abortando la señal del pedido). */
export type Respuesta = { status: number; header: (nombre: string) => string | null; cuerpo: AsyncIterable<Uint8Array> }
export type Pedir = (url: string, signal: AbortSignal) => Promise<Respuesta>

function encabezado(res: IncomingMessage, nombre: string): string | null {
  const v = res.headers[nombre.toLowerCase()]
  return (Array.isArray(v) ? v[0] : v) ?? null
}

/**
 * El cuerpo ya descomprimido. Se lee de a pedazos, como el original: lo que cuenta para el tope es lo que se va a leer,
 * no lo que viajó, así una bomba gzip se corta igual. Al dejar de leerlo se cierran los dos. Una página cortada por la
 * mitad (o un gzip que llega trunco) se descomprime hasta donde llegó, como hace un navegador.
 */
async function* descomprimido(res: IncomingMessage, codificacion: string): AsyncGenerator<Uint8Array> {
  const flush = { finishFlush: zlib.constants.Z_SYNC_FLUSH }
  const d = codificacion === 'gzip' || codificacion === 'x-gzip' ? zlib.createGunzip(flush)
    : codificacion === 'deflate' ? zlib.createInflate(flush)
      : codificacion === 'br' ? zlib.createBrotliDecompress({ finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH })
        : null
  if (!d && codificacion && codificacion !== 'identity') {
    res.destroy()
    throw new Error(`codificación desconocida: ${codificacion}`)
  }
  yield* d ? pipeline(res, d, () => {}) : res
}

/**
 * Un pedido a afuera con estos headers: por https, conectándose solo a direcciones públicas (ver lookupPublico) y sin
 * reusar conexiones, así cada salto es otra conexión que se revisa de nuevo. Nada de cookies ni Referer: no se guarda
 * nada entre un pedido y otro. Con descomprimir, el cuerpo llega descomprimido (gzip, deflate o br) y sin los headers del
 * comprimido.
 */
export function pedidoAfuera(headers: Record<string, string>, o: { descomprimir?: boolean } = {}): Pedir {
  return (url, signal) => new Promise((resolve, reject) => {
    https.get(url, { signal, lookup: lookupPublico(), agent: false, headers }, (res) => resolve({
      status: res.statusCode ?? 0,
      header: (nombre) => (o.descomprimir && /^content-(length|encoding)$/i.test(nombre) ? null : encabezado(res, nombre)),
      cuerpo: o.descomprimir ? descomprimido(res, (encabezado(res, 'content-encoding') ?? '').trim().toLowerCase()) : res,
    })).on('error', reject)
  })
}

/**
 * La foto de la vista previa (og.tsx). Con User-Agent: https.get no manda ninguno y hay hosts de fotos, como Wikimedia,
 * que sin él dan 403.
 */
export const pedirAfuera: Pedir = pedidoAfuera({ accept: 'image/*', 'user-agent': UA_GIFTR })
/** La foto que se trae para guardarla en un deseo. */
export const pedirFoto: Pedir = pedidoAfuera({ accept: 'image/webp,image/*;q=0.9,*/*;q=0.1', 'user-agent': UA_GIFTR })
/** La página de un producto: HTML, en castellano de Argentina si la hay, comprimida si quiere. */
export const pedirPagina: Pedir = pedidoAfuera({
  'user-agent': UA_GIFTR,
  accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
  'accept-language': 'es-AR,es;q=0.9,en;q=0.5',
  'accept-encoding': 'gzip, deflate, br',
}, { descomprimir: true })

/** Por qué no se bajó: lo de afuera nunca vuelve al usuario (ni el status ni el HTML), solo esto. */
export type Falla = 'no-permitida' | 'bloqueada' | 'no-esta' | 'no-carga' | 'otro-tipo' | 'sin-datos'
/** Un corte, con la URL de la que sale el nombre del producto (la última que se pidió, o la que dice el muro). */
export type Corte = { falla: Falla; urlProducto: string | null }
export type Bajado = { datos: Buffer; tipo: string; urlFinal: string; cortado: boolean }

// 202 es el challenge de un WAF (Booking): para fetch() no es un error, pero no trae la página
const BLOQUEADA = new Set([202, 401, 403, 418, 429, 451, 503])
const NO_ESTA = new Set([404, 410])

/** Nunca se conecta por http: un link o una redirección a http:// se pide por https (si el host no tiene TLS, falla). */
export const aHttps = (url: string) => url.replace(/^\s*http:\/\//i, 'https://')

export type OpcionesBajar = {
  max: number
  /** Para todo: los saltos y la descarga. */
  tiempoMs: number
  /** Cuántas redirecciones se siguen. */
  saltos: number
  aceptar: (tipo: string) => boolean
  /** Si pasa del máximo: 'nada' no devuelve nada (una foto a medias no sirve), 'cortar' devuelve lo que llegó. */
  siSePasa: 'nada' | 'cortar'
  /** Destinos que no se piden (un muro, la home a la que manda un link roto): con qué se corta. desde es null en el primero. */
  noPedir?: (url: string, desde: string | null) => Corte | null
  /** La del pedido que la origina: si el usuario se va, se corta también lo de afuera. */
  signal?: AbortSignal
}

/**
 * Baja algo de afuera: sigue a mano las redirecciones (cada destino tiene que estar permitido), con un tiempo total, y
 * corta apenas pasa el máximo de bytes: si dice que es más grande, sin bajar nada; si no lo dice o miente, a medida que
 * llega. Un error de red, de TLS o de tiempo es 'no-carga'.
 */
export async function bajarDeAfuera(src: string, pedir: Pedir, permitida: (url: string) => boolean, o: OpcionesBajar):
  Promise<Bajado | Corte> {
  const tiempo = AbortSignal.timeout(o.tiempoMs)
  const total = o.signal ? AbortSignal.any([tiempo, o.signal]) : tiempo
  let url = aHttps(src)
  const corte = o.noPedir?.(url, null)
  if (corte) return corte
  if (!permitida(url)) return { falla: 'no-permitida', urlProducto: null }
  for (let salto = 0; ; salto++) {
    // cada pedido se corta aparte al terminar con él (una redirección no deja la conexión colgada), todos con el tiempo total
    const pedido = new AbortController()
    try {
      const r = await pedir(url, AbortSignal.any([total, pedido.signal]))
      const destino = r.header('location')
      if (r.status >= 300 && r.status < 400 && destino) {
        if (salto >= o.saltos) return { falla: 'no-carga', urlProducto: url }
        const siguiente = aHttps(new URL(destino, url).toString())
        const corte = o.noPedir?.(siguiente, url)
        if (corte) return corte
        if (!permitida(siguiente)) return { falla: 'no-permitida', urlProducto: url }
        url = siguiente
        continue
      }
      if (BLOQUEADA.has(r.status)) return { falla: 'bloqueada', urlProducto: url }
      if (NO_ESTA.has(r.status)) return { falla: 'no-esta', urlProducto: url }
      if (r.status !== 200) return { falla: 'no-carga', urlProducto: url }
      const tipo = r.header('content-type') ?? ''
      if (!o.aceptar(tipo)) return { falla: 'otro-tipo', urlProducto: url }
      if (o.siSePasa === 'nada' && Number(r.header('content-length')) > o.max) return { falla: 'no-carga', urlProducto: url }
      const trozos: Uint8Array[] = []
      let bytes = 0
      let cortado = false
      for await (const trozo of r.cuerpo) {
        if (bytes + trozo.byteLength > o.max) {
          if (o.siSePasa === 'nada') return { falla: 'no-carga', urlProducto: url }
          trozos.push(trozo.subarray(0, o.max - bytes))
          bytes = o.max
          cortado = true
          break
        }
        trozos.push(trozo)
        bytes += trozo.byteLength
      }
      return { datos: Buffer.concat(trozos, bytes), tipo, urlFinal: url, cortado }
    } catch {
      return { falla: 'no-carga', urlProducto: url }
    } finally {
      pedido.abort()
    }
  }
}

const esImagen = (tipo: string) => tipo.startsWith('image/')

/**
 * Baja una foto: hasta 3 redirecciones, con un tiempo total, y nada si pasa del máximo (ver bajarDeAfuera). Además de la
 * foto, la URL de la que vino (el placeholder de "imagen no disponible" de ML se reconoce por ahí). Null si algo no va.
 */
export async function bajarFotoConUrl(src: string, pedir: Pedir, permitida: (url: string) => boolean, o: {
  max?: number; tiempoMs?: number; aceptar?: (tipo: string) => boolean; signal?: AbortSignal
} = {}): Promise<{ datos: Buffer; urlFinal: string } | null> {
  const r = await bajarDeAfuera(src, pedir, permitida, {
    max: o.max ?? FOTO_MAX_BYTES, tiempoMs: o.tiempoMs ?? FOTO_TIEMPO_MS, saltos: 3, aceptar: o.aceptar ?? esImagen,
    siSePasa: 'nada', signal: o.signal,
  })
  return 'datos' in r ? { datos: r.datos, urlFinal: r.urlFinal } : null
}

/** Baja una foto (ver bajarFotoConUrl). Null si algo no va. */
export async function bajarFoto(
  src: string, pedir: Pedir, permitida: (url: string) => boolean, max = FOTO_MAX_BYTES, tiempoMs = FOTO_TIEMPO_MS,
  aceptar: (tipo: string) => boolean = esImagen,
): Promise<Buffer | null> {
  return (await bajarFotoConUrl(src, pedir, permitida, { max, tiempoMs, aceptar }))?.datos ?? null
}
