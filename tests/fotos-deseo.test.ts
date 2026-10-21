import { expect, test, vi } from 'vitest'
import sharp from 'sharp'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import type { Db } from '@/db/types'
import { fotosDeseo, items, lists } from '@/db/schema'
import { createItem } from '@/lib/items'
import { getListForViewer } from '@/lib/lists'
import { esUrlFotoDeseo, FOTOS_POR_DIA, guardarFotoDeseo, leerFotoDeseo, procesarFotoDeseo, quedanFotos } from '@/lib/fotos-deseo'
import { alPegarImagen, estadoDelLink } from '@/lib/foto-del-form'

// La subida (POST /api/deseo/foto) con la base en PGlite y la sesión simulada.
const h = vi.hoisted(() => ({ db: undefined as unknown as Db, session: null as { userId: string } | null }))
vi.mock('@/db', () => ({ get db() { return h.db } }))
vi.mock('@/auth', () => ({ auth: async () => h.session }))

import { POST } from '@/app/api/deseo/foto/route'

const ML = 'https://articulo.mercadolibre.com.ar/MLA-123456-mate-imperial-_JM'

const imagen = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#C8F31D' } })

test('la foto de un deseo: JPEG de hasta 1200px sin recortar ni agrandar, sin metadatos; si no es imagen, error', async () => {
  const grande = await imagen(3000, 1500).withExif({ IFD0: { Copyright: 'secreto' } }).png().toBuffer()
  const m = await sharp(await procesarFotoDeseo(grande)).metadata()
  expect(m).toMatchObject({ format: 'jpeg', width: 1200, height: 600 })
  expect(m.exif).toBeUndefined()
  // una chica queda como está (pasada a JPEG)
  expect(await sharp(await procesarFotoDeseo(await imagen(300, 200).png().toBuffer())).metadata()).toMatchObject({ width: 300, height: 200 })
  await expect(procesarFotoDeseo(Buffer.from('no soy una foto'))).rejects.toThrow()
})

test('se guarda, se lee por su URL y el deseo la usa como foto', async () => {
  const db = await createTestDb()
  const { owner, giver, list } = await seedOwnerAndGiver(db)
  const jpeg = await procesarFotoDeseo(await imagen(40, 40).png().toBuffer())
  const url = (await guardarFotoDeseo(db, owner.id, jpeg))!
  expect(esUrlFotoDeseo(url)).toBe(true)
  expect(Buffer.compare((await leerFotoDeseo(db, url.split('/').at(-1)!))!, jpeg)).toBe(0)
  expect(await leerFotoDeseo(db, 'no-es-uuid')).toBeNull()

  await createItem(db, owner.id, { tipo: 'exacto', titulo: 'Termo', fotoUrl: url })
  const vista = await getListForViewer(db, list.shareToken, { userId: giver.id })
  expect(vista?.items[0].fotoUrl).toBe(url)
})

test('solo cuenta como foto subida la ruta exacta, no cualquier link parecido', () => {
  const id = '6a1c701f-89b2-4797-ad8e-0bec5918fc9a'
  expect(esUrlFotoDeseo(`/foto/deseo/${id}`)).toBe(true)
  for (const v of ['/foto/deseo/abc', `https://otro.com/foto/deseo/${id}`, `/foto/deseo/${id}/../../x`, `//foto/deseo/${id}`, `/foto/${id}`]) {
    expect(esUrlFotoDeseo(v)).toBe(false)
  }
})

test('cupo: hasta 40 fotos por día por persona; las de ayer no cuentan, y el de otro tiene el suyo', async () => {
  const db = await createTestDb()
  const { owner, giver } = await seedOwnerAndGiver(db)
  const jpeg = await procesarFotoDeseo(await imagen(20, 20).png().toBuffer())
  const ayer = new Date(Date.now() - 25 * 3600_000)
  await db.insert(fotosDeseo).values(Array.from({ length: 5 }, () => ({ userId: owner.id, datos: jpeg, createdAt: ayer })))
  await db.insert(fotosDeseo).values(Array.from({ length: FOTOS_POR_DIA - 1 }, () => ({ userId: owner.id, datos: jpeg })))
  expect(await quedanFotos(db, owner.id)).toBe(true)
  expect(await guardarFotoDeseo(db, owner.id, jpeg)).toMatch(/^\/foto\/deseo\//)
  expect(await quedanFotos(db, owner.id)).toBe(false)
  expect(await guardarFotoDeseo(db, owner.id, jpeg)).toBeNull()
  expect(await guardarFotoDeseo(db, giver.id, jpeg)).toMatch(/^\/foto\/deseo\//)
})

test('al subir se borran las fotos propias de más de un día que ningún deseo usa (de nadie, archivado o no)', async () => {
  const db = await createTestDb()
  const { owner, giver, list } = await seedOwnerAndGiver(db)
  const jpeg = await procesarFotoDeseo(await imagen(20, 20).png().toBuffer())
  const ayer = new Date(Date.now() - 25 * 3600_000)
  const vieja = async (userId: string) => (await db.insert(fotosDeseo).values({ userId, datos: jpeg, createdAt: ayer }).returning())[0].id
  const [huerfana, enMiDeseo, enUnArchivado, enDeseoAjeno, conLinkEntero, deOtro] = [
    await vieja(owner.id), await vieja(owner.id), await vieja(owner.id), await vieja(owner.id), await vieja(owner.id), await vieja(giver.id),
  ]
  const [reciente] = await db.insert(fotosDeseo).values({ userId: owner.id, datos: jpeg }).returning()
  const [listaDeRodri] = await db.insert(lists).values({ ownerId: giver.id, shareToken: 'tok-rodri' }).returning()
  await db.insert(items).values([
    { listId: list.id, tipo: 'exacto', titulo: 'Mate', fotoUrl: `/foto/deseo/${enMiDeseo}` },
    { listId: list.id, tipo: 'exacto', titulo: 'Velas', fotoUrl: `/foto/deseo/${enUnArchivado}`, estadoDueno: 'no_lo_quiero' },
    { listId: listaDeRodri.id, tipo: 'exacto', titulo: 'Termo', fotoUrl: `/foto/deseo/${enDeseoAjeno}` },
    { listId: listaDeRodri.id, tipo: 'exacto', titulo: 'Copas', fotoUrl: `https://giftr.app/foto/deseo/${conLinkEntero}` },
  ])

  const nueva = (await guardarFotoDeseo(db, owner.id, jpeg))!
  const quedan = (await db.select({ id: fotosDeseo.id }).from(fotosDeseo)).map((f) => f.id)
  expect(quedan).not.toContain(huerfana)
  expect(quedan).toEqual(expect.arrayContaining([enMiDeseo, enUnArchivado, enDeseoAjeno, conLinkEntero, deOtro, reciente.id, nueva.split('/').at(-1)]))
  expect(quedan).toHaveLength(7)
})

test('la subida: con el cupo lleno, 429 antes de procesar la foto', async () => {
  h.db = await createTestDb()
  const { owner } = await seedOwnerAndGiver(h.db)
  h.session = { userId: owner.id }
  const png = await imagen(30, 30).png().toBuffer()
  const subir = () => POST(new Request('http://x/api/deseo/foto', { method: 'POST', body: new Uint8Array(png), headers: { 'content-type': 'image/png' } }))
  const ok = await subir()
  expect(ok.status).toBe(200)
  expect(esUrlFotoDeseo((await ok.json()).url)).toBe(true)
  await h.db.insert(fotosDeseo).values(Array.from({ length: FOTOS_POR_DIA }, () => ({ userId: owner.id, datos: png })))
  const r = await subir()
  expect(r.status).toBe(429)
  expect(await r.json()).toMatchObject({ error: 'muchas' })
  h.session = null
  expect((await subir()).status).toBe(401)
})

test('el link de una foto en el formulario: el guardado vale, uno nuevo se prueba, y el que no carga no se manda', () => {
  const guardado = 'https://tienda.com/termo.jpg'
  expect(estadoDelLink('', guardado, {})).toEqual({ link: null, estado: null })
  expect(estadoDelLink(guardado, guardado, {})).toEqual({ link: guardado, estado: 'ok' })
  expect(estadoDelLink('tienda.com/mate.jpg', guardado, {})).toEqual({ link: 'https://tienda.com/mate.jpg', estado: 'probando' })
  expect(estadoDelLink('tienda.com/mate.jpg', guardado, { 'https://tienda.com/mate.jpg': true }).estado).toBe('ok')
  expect(estadoDelLink(ML, null, { [ML]: false }).estado).toBe('no-es-foto')
  expect(estadoDelLink('no es un link', null, {})).toEqual({ link: null, estado: 'no-es-foto' })
  expect(estadoDelLink('__proto__', null, {}).estado).toBe('no-es-foto')
})

test('pegar algo con imagen: el texto va al campo y la imagen solo si no hay foto; una imagen sola es la foto; nunca dos a la vez', () => {
  const planilla = { texto: 'Talle M, color negro', enCampoDeTexto: true }
  expect(alPegarImagen({ ...planilla, hayFoto: true, subiendo: false })).toEqual({ dejarTexto: true, subir: false })
  expect(alPegarImagen({ ...planilla, hayFoto: false, subiendo: false })).toEqual({ dejarTexto: true, subir: true })
  expect(alPegarImagen({ ...planilla, hayFoto: false, subiendo: true })).toEqual({ dejarTexto: true, subir: false })
  // "Copiar imagen": sin texto, o con el link de la imagen
  for (const texto of ['', '  ', 'https://x.com/foto.jpg']) {
    expect(alPegarImagen({ texto, enCampoDeTexto: true, hayFoto: true, subiendo: false })).toEqual({ dejarTexto: false, subir: true })
  }
  expect(alPegarImagen({ texto: '', enCampoDeTexto: false, hayFoto: true, subiendo: true })).toEqual({ dejarTexto: false, subir: false })
  // fuera de un campo, el texto no tiene dónde ir
  expect(alPegarImagen({ texto: 'hola', enCampoDeTexto: false, hayFoto: true, subiendo: false })).toEqual({ dejarTexto: false, subir: true })
})
