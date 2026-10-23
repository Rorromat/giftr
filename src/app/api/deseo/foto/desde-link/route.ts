import { auth } from '@/auth'
import { db } from '@/db'
import { importarFotoDeseo } from '@/lib/fotos-deseo'
import { urlDelPedido } from '@/lib/pedidos-afuera'

// Traer la foto de un link (la que encontró la lectura del producto) y guardarla como si la hubiera subido: el deseo no
// queda dependiendo de que la tienda la siga sirviendo. Si no se puede, el formulario prueba el link en el navegador,
// como con cualquier link de foto. De quien pide toca solo users (el lock), pedidos_afuera y fotos_deseo.

// node:https, node:dns y sharp
export const runtime = 'nodejs'
export const maxDuration = 10

const STATUS = { muchas: 429, muchos: 429, no_es_imagen: 415, no_carga: 422 } as const

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.userId) return Response.json({ error: 'sin_sesion' }, { status: 401 })
  const pedido = await urlDelPedido(request)
  if ('error' in pedido) return Response.json({ error: pedido.error }, { status: pedido.error === 'muy_grande' ? 413 : 400 })
  const r = await importarFotoDeseo(db, session.userId, pedido.url, { signal: request.signal })
  return 'url' in r ? Response.json({ url: r.url }) : Response.json({ error: r.error }, { status: STATUS[r.error] })
}
