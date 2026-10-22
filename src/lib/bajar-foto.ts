import { lookup } from 'node:dns'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'

// Bajar desde el servidor la foto de un deseo (para la vista previa de WhatsApp). Las fotos las carga cualquiera:
// nada de pedidos a la red interna ni descargas sin fin.

export const FOTO_MAX_BYTES = 8_000_000
/** Tiempo total, con las redirecciones y la descarga (antes eran 4 s por salto, hasta 16 s). */
export const FOTO_TIEMPO_MS = 5000

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

/** Una foto de afuera: por https, conectándose solo a direcciones públicas (ver lookupPublico) y sin reusar conexiones. */
export const pedirAfuera: Pedir = (url, signal) => new Promise((resolve, reject) => {
  https.get(url, { signal, lookup: lookupPublico(), agent: false, headers: { accept: 'image/*' } }, (res) => resolve({
    status: res.statusCode ?? 0,
    header: (nombre) => {
      const v = res.headers[nombre.toLowerCase()]
      return (Array.isArray(v) ? v[0] : v) ?? null
    },
    cuerpo: res,
  })).on('error', reject)
})

/**
 * Baja una foto: sigue a mano hasta 3 redirecciones (cada destino tiene que estar permitido), con un tiempo total, y corta
 * apenas pasa el máximo de bytes: si dice que es más grande, sin bajar nada; si no lo dice o miente, a medida que llega
 * (antes se bajaba entera a memoria y recién ahí se miraba el tamaño). Null si algo no va.
 */
export async function bajarFoto(
  src: string, pedir: Pedir, permitida: (url: string) => boolean, max = FOTO_MAX_BYTES, tiempoMs = FOTO_TIEMPO_MS,
): Promise<Buffer | null> {
  if (!permitida(src)) return null
  const total = AbortSignal.timeout(tiempoMs)
  let url = src
  for (let saltos = 0; saltos < 4; saltos++) {
    // cada pedido se corta aparte al terminar con él (una redirección no deja la conexión colgada), todos con el tiempo total
    const pedido = new AbortController()
    try {
      const r = await pedir(url, AbortSignal.any([total, pedido.signal]))
      const destino = r.header('location')
      if (r.status >= 300 && r.status < 400 && destino) {
        url = new URL(destino, url).toString()
        if (!permitida(url)) return null
        continue
      }
      if (r.status < 200 || r.status >= 300 || !(r.header('content-type') ?? '').startsWith('image/')) return null
      if (Number(r.header('content-length')) > max) return null
      const trozos: Uint8Array[] = []
      let bytes = 0
      for await (const trozo of r.cuerpo) {
        bytes += trozo.byteLength
        if (bytes > max) return null
        trozos.push(trozo)
      }
      return Buffer.concat(trozos, bytes)
    } catch {
      return null
    } finally {
      pedido.abort()
    }
  }
  return null
}
