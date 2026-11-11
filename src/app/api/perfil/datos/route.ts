import { auth } from '@/auth'
import { db } from '@/db'
import { exportarMisDatos } from '@/lib/cuenta'

// "Descargar mis datos" (Perfil): lo que GiftR guarda de la cuenta que lo pide, en un JSON que baja como archivo. Solo con
// sesión y solo lo propio: no recibe ningún id. Qué trae y qué no (la sorpresa), en exportarMisDatos.

export async function GET() {
  const session = await auth()
  if (!session?.userId) return Response.json({ error: 'sin_sesion' }, { status: 401 })
  const ahora = new Date()
  const datos = await exportarMisDatos(db, session.userId, ahora)
  // la sesión de una cuenta que ya no está (se borró desde otro dispositivo)
  if (!datos) return Response.json({ error: 'sin_sesion' }, { status: 401 })
  return new Response(JSON.stringify(datos, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="giftr-mis-datos-${ahora.toISOString().slice(0, 10)}.json"`,
      // es de una sola persona: que no quede en ningún caché compartido ni en el del navegador
      'Cache-Control': 'private, no-store',
    },
  })
}
