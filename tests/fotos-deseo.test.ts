import { expect, test } from 'vitest'
import sharp from 'sharp'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { createItem } from '@/lib/items'
import { getListForViewer } from '@/lib/lists'
import { esUrlFotoDeseo, guardarFotoDeseo, leerFotoDeseo, procesarFotoDeseo } from '@/lib/fotos-deseo'

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
  const url = await guardarFotoDeseo(db, owner.id, jpeg)
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
