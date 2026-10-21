import { auth } from '@/auth'
import { db } from '@/db'
import { FOTO_DESEO_MAX_BYTES, guardarFotoDeseo, procesarFotoDeseo } from '@/lib/fotos-deseo'

// Subir la foto de un deseo (antes de guardarlo). El cliente ya la achica; acá se valida y se re-codifica igual.
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.userId) return Response.json({ error: 'sin_sesion' }, { status: 401 })
  if (Number(request.headers.get('content-length') ?? 0) > FOTO_DESEO_MAX_BYTES) return Response.json({ error: 'muy_grande' }, { status: 413 })
  const datos = Buffer.from(await request.arrayBuffer())
  if (!datos.length || datos.length > FOTO_DESEO_MAX_BYTES) return Response.json({ error: 'muy_grande' }, { status: 413 })
  let jpeg: Buffer
  try {
    jpeg = await procesarFotoDeseo(datos)
  } catch {
    return Response.json({ error: 'no_es_imagen' }, { status: 415 })
  }
  return Response.json({ url: await guardarFotoDeseo(db, session.userId, jpeg) })
}
