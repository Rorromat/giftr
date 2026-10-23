import { expect, test, vi } from 'vitest'
import https from 'node:https'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { claims, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { archiveItem, createItem } from '@/lib/items'
import { comprarRegalo, iniciarRegaloGrupal, sumarseARegalo } from '@/lib/regalos'
import { addComment } from '@/lib/comments'
import { esFotoPublica, itemParaCompartir, listaParaCompartir, textoDueno, textoRegalador } from '@/lib/compartir'
import { guardarFotoDeseo } from '@/lib/fotos-deseo'
import { imagenItem } from '@/lib/og'

// La imagen de la vista previa, con la base en PGlite y los headers que manda cualquiera: un x-forwarded-host de la red
// interna. og.tsx ya no lee headers (lo que fija el arreglo son los espías de fetch y https.get del test); quedan para
// que, si alguien vuelve a armar la dirección con ellos, el pedido a ese host salga en los espías.
const h = vi.hoisted(() => ({ db: undefined as unknown as Db }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'giftr.app', 'x-forwarded-host': '10.0.0.5:5432', 'x-forwarded-proto': 'http' }),
}))

async function usuario(db: Db, nombre: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre })
}

test('EL TEST DE ORO, compartir: la vista previa de un deseo nunca dice si está reservado, comprado o de quién', async () => {
  const db = await createTestDb()
  const [euge, rodri, sofi] = [await usuario(db, 'Euge Mateus'), await usuario(db, 'Rodri'), await usuario(db, 'Sofi')]
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  const mate = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Mate imperial', precio: '$45.000', prioridad: 'mucho', fotoUrl: 'https://x.com/mate.jpg' }))!
  const bici = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Bici', rangoPrecio: '$300k' }))!
  await db.insert(claims).values({ itemId: mate.id, claimerUserId: sofi.id, estado: 'comprado', notaQueCompre: 'el de calabaza' })
  await addComment(db, mate.id, { userId: sofi.id }, 'yo lo compro')
  const g = await iniciarRegaloGrupal(db, bici.id, rodri.id)
  if (!g.ok) throw new Error(g.reason)
  await sumarseARegalo(db, g.giftId, sofi.id)
  await comprarRegalo(db, g.giftId, rodri.id, { total: 300000 })

  const i = await itemParaCompartir(db, lista.shareToken, mate.id)
  expect(i).toEqual({ titulo: 'Mate imperial', fotoUrl: 'https://x.com/mate.jpg', precio: '$45.000', prioridad: 'mucho', para: 'Euge Mateus', grupoNombre: null })
  expect((await itemParaCompartir(db, lista.shareToken, bici.id))?.precio).toBe('$300k')
  const l = await listaParaCompartir(db, lista.shareToken)
  for (const json of [i, await itemParaCompartir(db, lista.shareToken, bici.id), l].map((v) => JSON.stringify(v).toLowerCase())) {
    for (const p of ['sofi', 'rodri', 'comprado', 'reservado', 'calabaza', 'yo lo compro', 'grupal', '300000']) expect(json).not.toContain(p)
  }
})

test('solo deseos activos y de esa lista', async () => {
  const db = await createTestDb()
  const [euge, rodri] = [await usuario(db, 'Euge'), await usuario(db, 'Rodri')]
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  const [otra] = await db.select().from(lists).where(eq(lists.ownerId, rodri.id))
  const mate = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Mate' }))!
  expect(await itemParaCompartir(db, otra.shareToken, mate.id)).toBeNull()
  expect(await itemParaCompartir(db, 'no-existe', mate.id)).toBeNull()
  await archiveItem(db, mate.id, euge.id, 'lo_tengo')
  expect(await itemParaCompartir(db, lista.shareToken, mate.id)).toBeNull()
})

test('la lista compartida: de quién es, cuántos deseos y hasta 3 fotos de lo que más quiere', async () => {
  const db = await createTestDb()
  const [delfina, martin] = [await usuario(db, 'Delfina'), await usuario(db, 'Martín')]
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Nuestra casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  await unirseAGrupo(db, grupo.inviteToken!, martin.id)
  for (const [titulo, prioridad, foto] of [['A', 'suelta', 'a.jpg'], ['B', 'mucho', 'b.jpg'], ['C', 'gustaria', null], ['D', 'gustaria', 'd.jpg'], ['E', 'mucho', 'e.jpg']] as const) {
    await createItem(db, delfina.id, { tipo: 'exacto', titulo, prioridad, fotoUrl: foto ?? undefined }, grupoId)
  }
  expect(await listaParaCompartir(db, grupo.shareToken)).toEqual({
    para: 'Delfina y Martín', grupoNombre: 'Nuestra casa', fotos: ['b.jpg', 'e.jpg', 'd.jpg'], cantidad: 5,
  })
})

test('fotos de afuera: solo https a hosts públicos', () => {
  for (const ok of ['https://http2.mlstatic.com/D_NQ_NP_123.webp', 'https://images.example.com.ar/a.jpg?x=1']) expect(esFotoPublica(ok)).toBe(true)
  for (const no of [
    'http://example.com/a.jpg', 'https://localhost/a.jpg', 'https://127.0.0.1/a.jpg', 'https://10.0.0.5/a.jpg',
    'https://169.254.169.254/latest', 'https://[::1]/a.jpg', 'https://intranet/a.jpg', 'https://db.internal/a.jpg',
    'https://user:pass@example.com/a.jpg', 'https://example.com:8443/a.jpg', 'file:///etc/passwd', 'no es una url',
    // URL los acepta, pero ninguno es un nombre del DNS: con puntos seguidos o de más de 253
    'https://cdn..example.com/a.jpg', `https://${'a'.repeat(250)}.com/a.jpg`, 'https://localhost../a.jpg',
  ]) expect(esFotoPublica(no), no).toBe(false)
  expect(esFotoPublica(`https://${'a'.repeat(249)}.com./a.jpg`)).toBe(true)
})

test('textos para WhatsApp', () => {
  expect(textoRegalador({ titulo: 'Mate', precio: '$45.000', para: 'Euge Mateus' }, 'https://g.app/l/t/item/1'))
    .toBe('Mirá este regalo para Euge: Mate ($45.000) 🎁\nhttps://g.app/l/t/item/1')
  expect(textoRegalador({ titulo: 'Copas', precio: null, para: 'Delfina y Martín' }, 'u')).toBe('Mirá este regalo para Delfina y Martín: Copas 🎁\nu')
  expect(textoDueno({ titulo: 'Mate' }, 'u')).toBe('Esto es algo que me encantaría: Mate 🎁\nu')
})

test('la foto subida de la vista previa se lee de la base: el servidor no le pide nada a nadie, diga lo que diga x-forwarded-host', async () => {
  h.db = await createTestDb()
  const { owner } = await seedOwnerAndGiver(h.db)
  const rojo = await sharp({ create: { width: 60, height: 60, channels: 3, background: '#FF0000' } }).jpeg().toBuffer()
  const id = (await guardarFotoDeseo(h.db, owner.id, rojo))!.split('/').at(-1)!
  // ImageResponse se trae su wasm con un fetch de data:; cualquier otro pedido sería al host que dijo el header
  const fetchDeVerdad = globalThis.fetch
  const pedidos: string[] = []
  const espiaFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const u = url instanceof Request ? url.url : String(url)
    if (u.startsWith('data:')) return fetchDeVerdad(url, init)
    pedidos.push(u)
    throw new Error('sin red')
  })
  const espiaHttps = vi.spyOn(https, 'get').mockImplementation(() => { throw new Error('sin red') })
  /** Si el medio de la foto sale rojo (sin foto, ahí va el starburst: verde y tinta). */
  const conLaFoto = async (fotoUrl: string) => {
    const r = await imagenItem({ titulo: 'Mate', fotoUrl, precio: null, prioridad: 'gustaria', para: 'Euge', grupoNombre: null })
    const data = await sharp(Buffer.from(await r.arrayBuffer())).extract({ left: 301, top: 310, width: 1, height: 1 }).raw().toBuffer()
    return data[0] > 200 && data[1] < 80 && data[2] < 80
  }
  try {
    // como venga escrita (el id en mayúsculas en un deseo viejo), la foto sale
    expect(await conLaFoto(`/foto/deseo/${id.toUpperCase()}`)).toBe(true)
    // otra ruta del sitio no es una foto subida: ni se pide
    expect(await conLaFoto('/api/deseo/foto')).toBe(false)
    expect(pedidos).toEqual([])
    expect(espiaHttps).not.toHaveBeenCalled()
  } finally {
    espiaFetch.mockRestore()
    espiaHttps.mockRestore()
  }
})
