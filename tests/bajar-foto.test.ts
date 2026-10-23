import { afterEach, expect, test, vi } from 'vitest'
import dns, { type LookupAddress } from 'node:dns'
import https from 'node:https'
import {
  bajarFoto, bajarFotoConUrl, esIpPublica, lookupPublico, pedirAfuera, resolverDeAfuera, UA_GIFTR, type Resolver,
} from '@/lib/bajar-foto'
import { esFotoPublica } from '@/lib/compartir'
import { MB, servidor } from './helpers'

// La foto de la vista previa la baja el servidor desde un link que carga cualquiera.

const permitida = () => true

afterEach(() => {
  vi.restoreAllMocks()
})

/** El DNS de mentira (c-ares): lo que contesta a A y a AAAA por host; lo que no conoce no existe. */
function dnsDeMentira(v4: Record<string, string[]>, v6: Record<string, string[]> = {}) {
  const sinDatos = (host: string) => Promise.reject(Object.assign(new Error(`sin datos para ${host}`), { code: 'ENODATA' }))
  vi.spyOn(dns.promises.Resolver.prototype, 'resolve4').mockImplementation(async (host: string) => v4[host] ?? sinDatos(host))
  vi.spyOn(dns.promises.Resolver.prototype, 'resolve6').mockImplementation(async (host: string) => v6[host] ?? sinDatos(host))
}

const jpg = { 'content-type': 'image/jpeg' }

test('una foto que no termina nunca se corta a los 8 MB, sin bajarla entera', async () => {
  const s = servidor({ 'https://atacante.com/inf.jpg': { headers: jpg } })
  expect(await bajarFoto('https://atacante.com/inf.jpg', s.pedir, permitida, 8 * MB)).toBeNull()
  expect(s.entregados()).toBeLessThanOrEqual(9 * MB)
  expect(s.pedidos[0].signal.aborted).toBe(true)
})

test('si dice que pesa más de 8 MB no se baja nada; si pesa menos, se baja entera', async () => {
  const s = servidor({
    'https://x.com/grande.jpg': { headers: { ...jpg, 'content-length': String(200 * MB) }, trozos: 200 },
    'https://x.com/chica.jpg': { headers: { ...jpg, 'content-length': String(2 * MB) }, trozos: 2 },
    'https://x.com/pagina': { headers: { 'content-type': 'text/html' }, trozos: 1 },
    'https://x.com/no-esta.jpg': { status: 404, headers: jpg, trozos: 1 },
  })
  expect(await bajarFoto('https://x.com/grande.jpg', s.pedir, permitida, 8 * MB)).toBeNull()
  expect(s.entregados()).toBe(0)
  expect((await bajarFoto('https://x.com/chica.jpg', s.pedir, permitida, 8 * MB))?.length).toBe(2 * MB)
  expect(await bajarFoto('https://x.com/pagina', s.pedir, permitida, 8 * MB)).toBeNull()
  expect(await bajarFoto('https://x.com/no-esta.jpg', s.pedir, permitida, 8 * MB)).toBeNull()
})

test('las redirecciones: cada destino se revisa, como mucho 3, y el tiempo es uno solo para toda la cadena', async () => {
  const salto = (a: string) => ({ status: 302, headers: { location: a } })
  const s = servidor({
    'https://a.com/1': salto('/2'), 'https://a.com/2': salto('https://b.com/3'), 'https://b.com/3': { headers: jpg, trozos: 1 },
    'https://a.com/interna': salto('https://localhost./x.jpg'),
    'https://a.com/r1': salto('/r2'), 'https://a.com/r2': salto('/r3'), 'https://a.com/r3': salto('/r4'), 'https://a.com/r4': salto('/r5'),
    'https://lento.com/1': { ...salto('/2'), demora: 150 }, 'https://lento.com/2': { ...salto('/3'), demora: 150 },
    'https://lento.com/3': { ...salto('/4'), demora: 150 }, 'https://lento.com/4': { headers: jpg, trozos: 1, demora: 150 },
  })
  expect((await bajarFoto('https://a.com/1', s.pedir, esFotoPublica))?.length).toBe(MB)
  // la redirección de cada salto se corta al seguir (no queda la conexión colgada)
  expect(s.pedidos.slice(0, 2).every((p) => p.signal.aborted)).toBe(true)
  // a la red interna no se sigue: ni se pide
  expect(await bajarFoto('https://a.com/interna', s.pedir, esFotoPublica)).toBeNull()
  expect(s.pedidos.map((p) => p.url)).not.toContain('https://localhost./x.jpg')
  expect(await bajarFoto('https://a.com/r1', s.pedir, esFotoPublica)).toBeNull()
  expect(s.pedidos.map((p) => p.url)).not.toContain('https://a.com/r5')
  // 4 pedidos de 150 ms con 200 ms en total: se corta a los 200, no a los 600 (antes cada salto tenía su propio tiempo)
  const antes = Date.now()
  expect(await bajarFoto('https://lento.com/1', s.pedir, esFotoPublica, 8 * MB, 200)).toBeNull()
  expect(Date.now() - antes).toBeLessThan(450)
})

test('una redirección a http:// se sigue por https; solo un 200 es la foto; y se sabe de dónde vino', async () => {
  const s = servidor({
    'https://cdn.com/a.jpg': { status: 302, headers: { location: 'http://fotos.cdn.com/a.jpg' } },
    'https://fotos.cdn.com/a.jpg': { headers: jpg, trozos: 1 },
    'https://cdn.com/parcial.jpg': { status: 206, headers: jpg, trozos: 1 },
    'https://cdn.com/binario': { headers: { 'content-type': 'application/octet-stream' }, trozos: 1 },
  })
  expect(await bajarFotoConUrl('https://cdn.com/a.jpg', s.pedir, esFotoPublica)).toMatchObject({ urlFinal: 'https://fotos.cdn.com/a.jpg' })
  expect(s.pedidos.map((p) => p.url)).not.toContain('http://fotos.cdn.com/a.jpg')
  // una foto http:// de entrada sigue como antes: no es pública, no se pide (ni por https)
  const antes = s.pedidos.length
  expect(await bajarFoto('http://fotos.cdn.com/a.jpg', s.pedir, esFotoPublica)).toBeNull()
  expect(s.pedidos).toHaveLength(antes)
  expect(await bajarFoto('https://cdn.com/parcial.jpg', s.pedir, esFotoPublica)).toBeNull()
  // lo que no dice image/* no es una foto, salvo que quien llama acepte más (después lo decide sharp)
  expect(await bajarFoto('https://cdn.com/binario', s.pedir, esFotoPublica)).toBeNull()
  expect(await bajarFotoConUrl('https://cdn.com/binario', s.pedir, esFotoPublica)).toEqual({ falla: 'otro-tipo', urlProducto: 'https://cdn.com/binario' })
  const binario = (t: string) => t.startsWith('image/') || t === 'application/octet-stream'
  expect((await bajarFoto('https://cdn.com/binario', s.pedir, esFotoPublica, 8 * MB, 5000, binario))?.length).toBe(MB)
})

test('fotos de afuera: el host con un punto al final es el mismo nombre', () => {
  for (const no of [
    'https://localhost./a.jpg', 'https://LOCALHOST./a.jpg', 'https://metadata.google.internal./x', 'https://foo.local./a.jpg',
    'https://db.internal../a.jpg', 'https://intranet./a.jpg', 'https://127.0.0.1./a.jpg',
  ]) expect(esFotoPublica(no), no).toBe(false)
  expect(esFotoPublica('https://http2.mlstatic.com./D_NQ_NP_123.webp')).toBe(true)
})

test('qué direcciones son de internet', () => {
  for (const ip of ['8.8.8.8', '200.45.12.3', '2800:3f0:4002:80b::200e', '::ffff:8.8.8.8', '172.32.0.1', '100.128.0.1']) {
    expect(esIpPublica(ip), ip).toBe(true)
  }
  for (const ip of [
    '127.0.0.1', '10.0.0.5', '172.16.3.4', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '255.255.255.255', '192.0.2.10', '198.18.0.1', '::1', '::', 'fd00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
    '64:ff9b::a00:1', '2002:a00:1::', '2001:db8::1', 'no es una ip', '',
    // la forma traducida de SIIT: adentro van 127.0.0.1, 10.0.0.1 y la metadata de la nube
    '::ffff:0:7f00:1', '::ffff:0:a00:1', '::ffff:0:a9fe:a9fe',
  ]) expect(esIpPublica(ip), ip).toBe(false)
})

test('al conectarse se revisa a qué IP resuelve el nombre (un nombre público que apunta adentro no pasa)', async () => {
  const dns: Record<string, LookupAddress[]> = {
    '127.0.0.1.nip.io': [{ address: '127.0.0.1', family: 4 }],
    'mitad.com': [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.5', family: 4 }],
    'siit.com': [{ address: '::ffff:0:7f00:1', family: 6 }],
    'fotos.com': [{ address: '2800:3f0:4002:80b::200e', family: 6 }, { address: '200.45.12.3', family: 4 }],
  }
  const resolver: Resolver = (host, cb) => (dns[host] ? cb(null, dns[host]) : cb(Object.assign(new Error('no existe'), { code: 'ENOTFOUND' }), []))
  const buscar = (host: string, opciones: { all?: boolean; family?: number } = {}) => new Promise((ok, mal) => {
    lookupPublico(resolver)(host, opciones, (err, address, family) => (err ? mal(err) : ok(opciones.all ? address : { address, family })))
  })
  await expect(buscar('127.0.0.1.nip.io')).rejects.toThrow('no es una dirección pública')
  await expect(buscar('mitad.com')).rejects.toThrow('no es una dirección pública')
  await expect(buscar('siit.com')).rejects.toThrow('no es una dirección pública')
  await expect(buscar('no-existe.com')).rejects.toThrow('no existe')
  expect(await buscar('fotos.com')).toEqual({ address: '2800:3f0:4002:80b::200e', family: 6 })
  expect(await buscar('fotos.com', { family: 4 })).toEqual({ address: '200.45.12.3', family: 4 })
  expect(await buscar('fotos.com', { all: true })).toEqual(dns['fotos.com'])
})

test('la descarga de afuera usa ese control en la conexión misma', async () => {
  // un nombre que el DNS manda a 127.0.0.1: sin el control sería "conexión rechazada"; con él, ni se conecta
  dnsDeMentira({ 'fotos.ejemplo.com': ['127.0.0.1'] })
  await expect(pedirAfuera('https://fotos.ejemplo.com:1/x.jpg', AbortSignal.timeout(2000))).rejects.toThrow('no es una dirección pública')
})

test('el DNS se pregunta sin dns.lookup (que ocupa el threadpool): IPv4 primero, y con una familia alcanza', async () => {
  const sistema = vi.spyOn(dns, 'lookup')
  dnsDeMentira({ 'a.com': ['200.45.12.3'], 'b.com': ['8.8.8.8'] }, { 'a.com': ['2800:3f0:4002:80b::200e'], 'c.com': ['2800:3f0:4002:80b::200e'] })
  const resolver = (host: string) => new Promise((ok) => resolverDeAfuera()(host, (err, dirs) => ok(err ? err.code : dirs)))
  expect(await resolver('a.com')).toEqual([{ address: '200.45.12.3', family: 4 }, { address: '2800:3f0:4002:80b::200e', family: 6 }])
  expect(await resolver('b.com')).toEqual([{ address: '8.8.8.8', family: 4 }])
  expect(await resolver('c.com')).toEqual([{ address: '2800:3f0:4002:80b::200e', family: 6 }])
  expect(await resolver('no-existe.com')).toBe('ENODATA')
  expect(sistema).not.toHaveBeenCalled()
})

test('si el pedido se corta, la pregunta al DNS se cancela (no queda esperando a un DNS que no contesta)', async () => {
  const colgadas: (() => void)[] = []
  const colgada = () => new Promise<string[]>((_, mal) => colgadas.push(() => mal(Object.assign(new Error('cancelada'), { code: 'ECANCELLED' }))))
  vi.spyOn(dns.promises.Resolver.prototype, 'resolve4').mockImplementation(colgada)
  vi.spyOn(dns.promises.Resolver.prototype, 'resolve6').mockImplementation(colgada)
  const cancelar = vi.spyOn(dns.promises.Resolver.prototype, 'cancel').mockImplementation(() => colgadas.splice(0).forEach((f) => f()))
  const pedido = new AbortController()
  const respuesta = new Promise((ok) => resolverDeAfuera(pedido.signal)('lento.com', (err) => ok(err?.code)))
  pedido.abort()
  expect(await respuesta).toBe('ECANCELLED')
  expect(cancelar).toHaveBeenCalledTimes(1)
})

test('la descarga de afuera se presenta: sin User-Agent hay hosts de fotos (Wikimedia) que contestan 403', async () => {
  let opciones: https.RequestOptions | undefined
  const espia = vi.spyOn(https, 'get').mockImplementation((_url, o) => {
    opciones = o
    throw new Error('sin red')
  })
  try {
    await expect(pedirAfuera('https://upload.wikimedia.org/x.jpg', AbortSignal.timeout(2000))).rejects.toThrow('sin red')
    // el mismo bot que lee las páginas de producto (ver pagina-de-afuera.test.ts)
    expect(opciones?.headers).toMatchObject({ 'user-agent': UA_GIFTR, accept: 'image/*' })
  } finally {
    espia.mockRestore()
  }
})
