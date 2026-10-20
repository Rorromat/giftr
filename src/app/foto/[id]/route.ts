import { db } from '@/db'
import { leerFoto } from '@/lib/perfil'

// Foto de perfil subida. La URL lleva ?v=<fecha de subida>, así que se puede cachear para siempre.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const foto = await leerFoto(db, (await params).id)
  if (!foto) return new Response('No encontrada', { status: 404 })
  return new Response(new Uint8Array(foto), {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' },
  })
}
