import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db'
import { borrarFoto, FOTO_MAX_BYTES, guardarFoto, procesarFoto, urlFoto } from '@/lib/perfil'

// Subir o quitar la foto de perfil. El cliente ya la achica; acá se valida y se re-codifica igual.

function refrescar() {
  revalidatePath('/perfil')
  revalidatePath('/l', 'layout')
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.userId) return Response.json({ error: 'sin_sesion' }, { status: 401 })
  if (Number(request.headers.get('content-length') ?? 0) > FOTO_MAX_BYTES) return Response.json({ error: 'muy_grande' }, { status: 413 })
  const datos = Buffer.from(await request.arrayBuffer())
  if (!datos.length || datos.length > FOTO_MAX_BYTES) return Response.json({ error: 'muy_grande' }, { status: 413 })
  let jpeg: Buffer
  try {
    jpeg = await procesarFoto(datos)
  } catch {
    return Response.json({ error: 'no_es_imagen' }, { status: 415 })
  }
  const fotoAt = await guardarFoto(db, session.userId, jpeg)
  refrescar()
  return Response.json({ url: urlFoto({ id: session.userId, fotoAt, avatarUrl: null }) })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.userId) return Response.json({ error: 'sin_sesion' }, { status: 401 })
  await borrarFoto(db, session.userId)
  refrescar()
  return Response.json({ ok: true })
}
