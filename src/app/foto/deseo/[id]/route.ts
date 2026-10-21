import { db } from '@/db'
import { leerFotoDeseo } from '@/lib/fotos-deseo'

// Foto de un deseo subida desde el teléfono. Cada subida tiene su id, así que se puede cachear para siempre.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const foto = await leerFotoDeseo(db, (await params).id)
  if (!foto) return new Response('No encontrada', { status: 404 })
  return new Response(new Uint8Array(foto), {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' },
  })
}
