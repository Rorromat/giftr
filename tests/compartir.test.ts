import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from './helpers'
import { claims, lists } from '@/db/schema'
import type { Db } from '@/db/types'
import { upsertUserFromGoogle } from '@/lib/users'
import { crearGrupo, unirseAGrupo } from '@/lib/groups'
import { archiveItem, createItem } from '@/lib/items'
import { comprarRegalo, iniciarRegaloGrupal, sumarseARegalo } from '@/lib/regalos'
import { addComment } from '@/lib/comments'
import { esFotoPublica, itemParaCompartir, listaParaCompartir, textoDueno, textoRegalador } from '@/lib/compartir'

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
  ]) expect(esFotoPublica(no), no).toBe(false)
})

test('textos para WhatsApp', () => {
  expect(textoRegalador({ titulo: 'Mate', precio: '$45.000', para: 'Euge Mateus' }, 'https://g.app/l/t/item/1'))
    .toBe('Mirá este regalo para Euge: Mate ($45.000) 🎁\nhttps://g.app/l/t/item/1')
  expect(textoRegalador({ titulo: 'Copas', precio: null, para: 'Delfina y Martín' }, 'u')).toBe('Mirá este regalo para Delfina y Martín: Copas 🎁\nu')
  expect(textoDueno({ titulo: 'Mate' }, 'u')).toBe('Esto es algo que me encantaría: Mate 🎁\nu')
})
