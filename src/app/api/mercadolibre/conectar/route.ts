import { auth } from '@/auth'
import { db } from '@/db'
import {
  conexionConfigurada, cookieDelPedido, firmarPedidoDeConexion, noExiste, nuevoPedidoDeConexion, paginaDeConexion, puedeConectar,
  urlDeAutorizacion,
} from '@/lib/mercadolibre-conexion'

// Conectar la cuenta de MercadoLibre del dueño de GiftR (una sola vez, ver mercadolibre-conexion.ts). Solo con sesión y
// un email de MELI_ADMIN_EMAILS; si no, 404. Arma el pedido (state y verificador PKCE al azar), lo deja en una cookie
// firmada y lleva a la autorización de ML, que vuelve a /api/mercadolibre/callback.

// node:crypto
export const runtime = 'nodejs'

export async function GET() {
  if (!conexionConfigurada()) return noExiste()
  const userId = (await auth())?.userId
  try {
    if (!userId || !(await puedeConectar(db, userId))) return noExiste()
  } catch {
    return paginaDeConexion('No pudimos revisar tu cuenta. Probá de nuevo en un rato.', { status: 503, reintentar: true })
  }
  const pedido = nuevoPedidoDeConexion(userId)
  // 302 armado a mano: lleva la cookie, y redirect() de next/navigation da 307
  return new Response(null, {
    status: 302,
    headers: { location: urlDeAutorizacion(pedido), 'set-cookie': cookieDelPedido(firmarPedidoDeConexion(pedido)), 'cache-control': 'no-store' },
  })
}
