import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { createTestDb } from './helpers'
import { claims, lists, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { createItem } from '@/lib/items'
import { guardarCumple } from '@/lib/events'
import { guardarGustos } from '@/lib/bienvenida'
import { sanitizarGustos } from '@/lib/gustos'
import { borrarFoto, guardarFoto, leerFoto, miFoto, perfilPublico, procesarFoto, urlFoto } from '@/lib/perfil'

async function usuario(db: Db, nombre: string, avatarUrl?: string) {
  return upsertUserFromGoogle(db, { googleId: `g-${nombre}`, email: `${nombre.toLowerCase()}@test.com`, nombre, avatarUrl })
}
const HOY = new Date(Date.UTC(2026, 9, 20))

test('la foto: se re-codifica a JPEG cuadrado sin metadatos; si no es imagen, error', async () => {
  const grande = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#C8F31D' } })
    .withExif({ IFD0: { Copyright: 'secreto' } }).png().toBuffer()
  const jpeg = await procesarFoto(grande)
  const m = await sharp(jpeg).metadata()
  expect(m).toMatchObject({ format: 'jpeg', width: 400, height: 400 })
  expect(m.exif).toBeUndefined()
  await expect(procesarFoto(Buffer.from('no soy una foto'))).rejects.toThrow()
})

test('la foto subida gana a la de Google, y al quitarla vuelve la de Google', async () => {
  const db = await createTestDb()
  const ana = await usuario(db, 'Ana', 'https://lh3.googleusercontent.com/ana')
  expect(await miFoto(db, ana.id)).toBe('https://lh3.googleusercontent.com/ana')
  const jpeg = await procesarFoto(await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer())
  const at = await guardarFoto(db, ana.id, jpeg)
  expect(await miFoto(db, ana.id)).toBe(`/foto/${ana.id}?v=${at.getTime()}`)
  expect(Buffer.compare((await leerFoto(db, ana.id))!, jpeg)).toBe(0)
  expect(await leerFoto(db, 'no-es-uuid')).toBeNull()
  await borrarFoto(db, ana.id)
  expect(await leerFoto(db, ana.id)).toBeNull()
  expect(await miFoto(db, ana.id)).toBe('https://lh3.googleusercontent.com/ana')
  expect(urlFoto({ id: 'x', fotoAt: null, avatarUrl: null })).toBeNull()
})

test('perfil público: cumple con cuenta regresiva, gustos con íconos y talles', async () => {
  const db = await createTestDb()
  const euge = await usuario(db, 'Euge Mateus')
  await guardarCumple(db, euge.id, 1, 11)
  await guardarGustos(db, euge.id, sanitizarGustos({ deportes: ['Pádel'], talles: { remera: 'M', calzado: '38' }, noRegalar: ['Perfumes'] }))
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  const p = await perfilPublico(db, lista.shareToken, undefined, HOY)
  expect(p).toMatchObject({ id: euge.id, nombre: 'Euge Mateus', foto: null, cumple: { dia: 1, mes: 11, dias: 12 }, talles: { remera: 'M', pantalon: null, calzado: '38' }, otros: [] })
  expect(p!.secciones.map((s) => [s.clave, s.icono])).toEqual([['deportes', 'ball'], ['talles', 'shirt'], ['noRegalar', 'ban']])
  expect(await perfilPublico(db, 'no-existe')).toBeNull()
})

test('en un grupo se elige a quién ver, y se puede pasar a los demás', async () => {
  const db = await createTestDb()
  const [delfina, martin, intruso] = [await usuario(db, 'Delfina'), await usuario(db, 'Martín'), await usuario(db, 'Intruso')]
  const grupoId = await crearGrupo(db, delfina.id, { nombre: 'Nuestra casa' })
  const [grupo] = await db.select().from(lists).where(eq(lists.id, grupoId))
  await unirseAGrupo(db, grupo.inviteToken!, martin.id)
  expect((await perfilPublico(db, grupo.shareToken))!.nombre).toBe('Delfina')
  const m = (await perfilPublico(db, grupo.shareToken, martin.id))!
  expect(m.nombre).toBe('Martín')
  expect(m.otros.map((o) => o.nombre)).toEqual(['Delfina'])
  // alguien que no es dueño de esa lista no se puede ver por ese link
  expect((await perfilPublico(db, grupo.shareToken, intruso.id))!.nombre).toBe('Delfina')
})

test('EL TEST DE ORO, perfil: nada de reservas ni de quién regala', async () => {
  const db = await createTestDb()
  const [euge, sofi] = [await usuario(db, 'Euge'), await usuario(db, 'Sofi')]
  const item = (await createItem(db, euge.id, { tipo: 'exacto', titulo: 'Mate' }))!
  await db.insert(claims).values({ itemId: item.id, claimerUserId: sofi.id, estado: 'comprado' })
  await guardarGustos(db, euge.id, sanitizarGustos({ deportes: ['Pádel'] }))
  const [lista] = await db.select().from(lists).where(eq(lists.ownerId, euge.id))
  const json = JSON.stringify(await perfilPublico(db, lista.shareToken)).toLowerCase()
  for (const p of ['sofi', 'comprado', 'reserv', 'mate', 'claim']) expect(json).not.toContain(p)
  // y no expone el mail ni el id de Google
  const [u] = await db.select().from(users).where(eq(users.id, euge.id))
  expect(json).not.toContain(u.email)
  expect(json).not.toContain(u.googleId)
})
