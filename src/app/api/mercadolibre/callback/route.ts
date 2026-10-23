import { auth } from '@/auth'
import { db } from '@/db'
import {
  canjearCodigo, conexionConfigurada, cookieDelPedido, cookieDelPedidoEn, guardarConexion, leerPedidoDeConexion, noExiste,
  paginaDeConexion, puedeConectar,
} from '@/lib/mercadolibre-conexion'

// Adonde vuelve MercadoLibre después de autorizar (?code=…&state=…). La misma sesión y el mismo permiso que al conectar
// (si no, 404); el pedido de la cookie tiene que estar bien firmado, sin vencer, ser de esta cuenta y traer este state.
// Canjea el código, guarda la conexión y contesta una página corta con lo que pasó. Nunca redirige: ni a lo que venga en
// el pedido ni a ningún lado.

// node:crypto
export const runtime = 'nodejs'

/** Un código de ML es corto: uno largo no se manda a ningún lado. */
const CODIGO_MAX = 512

export async function GET(request: Request) {
  if (!conexionConfigurada()) return noExiste()
  const userId = (await auth())?.userId
  try {
    if (!userId || !(await puedeConectar(db, userId))) return noExiste()
  } catch {
    return paginaDeConexion('No pudimos revisar tu cuenta. Probá de nuevo en un rato.', { status: 503, reintentar: true })
  }
  const q = new URL(request.url).searchParams
  const pedido = leerPedidoDeConexion(cookieDelPedidoEn(request), q.get('state'), userId)
  if (!pedido) {
    return paginaDeConexion('Este pedido para conectar MercadoLibre venció o no salió de este navegador.', { status: 400, reintentar: true })
  }
  // el pedido ya se usó: se borra pase lo que pase
  const cookie = cookieDelPedido(null)
  const code = q.get('code')
  if (!code || code.length > CODIGO_MAX) {
    return paginaDeConexion('MercadoLibre no dio el permiso, así que no quedó conectado.', { status: 400, reintentar: true, cookie })
  }
  const par = await canjearCodigo(code, pedido.verifier)
  if ('error' in par) return paginaDeConexion('MercadoLibre no aceptó la conexión. Probá de nuevo.', { status: 502, reintentar: true, cookie })
  if (!par.refresh) {
    return paginaDeConexion(
      'MercadoLibre no dio permiso para renovar el acceso, que vence a las 6 horas. En tu aplicación de developers.mercadolibre.com.ar ' +
        'activá offline_access y volvé a conectar.',
      { status: 502, reintentar: true, cookie },
    )
  }
  try {
    await guardarConexion(db, { ...par, refresh: par.refresh }, userId)
  } catch {
    // sin el error: trae lo que se mandó a la base, con los tokens (cifrados, pero no van al log)
    console.warn('MercadoLibre: no se pudo guardar la conexión')
    return paginaDeConexion('No pudimos guardar la conexión. Probá de nuevo en un rato.', { status: 503, reintentar: true, cookie })
  }
  return paginaDeConexion('MercadoLibre quedó conectado. Desde ahora, los links de MercadoLibre se completan con su nombre, foto y precio.', {
    cookie,
  })
}
