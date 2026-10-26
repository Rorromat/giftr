import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedOwnerAndGiver } from './helpers'
import { items } from '@/db/schema'
import { createItem, updateItem } from '@/lib/items'
import { deseoDesdeForm, paraAgregar } from '@/lib/deseo-form'
import { getItemForViewer } from '@/lib/lists'
import { embebido, sitioDelVideo } from '@/lib/video'

const form = (campos: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

test('los links de video que se ven adentro del deseo, con su reproductor', () => {
  const yt = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`
  expect(embebido('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toEqual({ src: yt('dQw4w9WgXcQ'), vertical: false, sitio: 'YouTube' })
  expect(embebido('https://m.youtube.com/watch?v=dQw4w9WgXcQ')?.src).toBe(yt('dQw4w9WgXcQ'))
  expect(embebido('https://youtu.be/dQw4w9WgXcQ?si=abc')?.src).toBe(yt('dQw4w9WgXcQ'))
  expect(embebido('https://youtube.com/shorts/abcDEF12345')).toEqual({ src: yt('abcDEF12345'), vertical: true, sitio: 'YouTube' })
  expect(embebido('https://www.tiktok.com/@tienda/video/7311234567890123456?lang=es'))
    .toEqual({ src: 'https://www.tiktok.com/embed/v2/7311234567890123456', vertical: true, sitio: 'TikTok' })
  expect(embebido('https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=xyz'))
    .toEqual({ src: 'https://www.instagram.com/reel/C1a2B3c4D5e/embed', vertical: true, sitio: 'Instagram' })
  expect(embebido('https://www.instagram.com/reels/C1a2B3c4D5e/')?.src).toBe('https://www.instagram.com/reel/C1a2B3c4D5e/embed')
  expect(embebido('https://www.instagram.com/p/C1a2B3c4D5e/')?.vertical).toBe(false)
  expect(embebido('https://vimeo.com/123456789')).toEqual({ src: 'https://player.vimeo.com/video/123456789', vertical: false, sitio: 'Vimeo' })
})

test('lo que no se puede ver adentro: un botón que lo abre', () => {
  // un link corto de TikTok no dice qué video es; una tienda, un perfil, algo que no es un link
  for (const l of ['https://vm.tiktok.com/ZMabc123/', 'https://www.youtube.com/@canal', 'https://www.youtube.com/watch?v=<script>',
    'https://www.instagram.com/tienda/', 'https://mercadolibre.com.ar/x', 'javascript:alert(1)', 'no es un link']) {
    expect(embebido(l), l).toBeNull()
  }
  expect(sitioDelVideo('https://vm.tiktok.com/ZMabc123/')).toBe('vm.tiktok.com')
})

test('el video se guarda con el deseo (sin https:// también) y se cambia o se borra al editar', async () => {
  const db = await createTestDb()
  const { owner, giver } = await seedOwnerAndGiver(db)
  const datos = deseoDesdeForm(form({ titulo: 'Zapatillas', videoUrl: 'youtu.be/dQw4w9WgXcQ' }), true)
  expect(datos?.videoUrl).toBe('https://youtu.be/dQw4w9WgXcQ')
  const d = (await createItem(db, owner.id, paraAgregar(datos!)))!
  expect(d.videoUrl).toBe('https://youtu.be/dQw4w9WgXcQ')
  // lo ve quien regala
  const detalle = await getItemForViewer(db, 'tok-euge', d.id, { userId: giver.id })
  expect(detalle?.item.videoUrl).toBe('https://youtu.be/dQw4w9WgXcQ')
  // algo que no es un link, al editar, deja el que había; vacío lo borra
  await updateItem(db, d.id, owner.id, deseoDesdeForm(form({ titulo: 'Zapatillas', videoUrl: 'no es un link' }))!)
  expect((await db.select().from(items).where(eq(items.id, d.id)))[0].videoUrl).toBe('https://youtu.be/dQw4w9WgXcQ')
  await updateItem(db, d.id, owner.id, deseoDesdeForm(form({ titulo: 'Zapatillas', videoUrl: '' }))!)
  expect((await db.select().from(items).where(eq(items.id, d.id)))[0].videoUrl).toBeNull()
})
