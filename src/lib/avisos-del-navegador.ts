// Lo que decide la sección "Avisos" de Perfil (ActivarAvisos) a partir de lo que dice el navegador. Aparte del
// componente para poder probarlo con un navegador de mentira.

export type EstadoAvisos = 'cargando' | 'no-soportado' | 'ios-instalar' | 'bloqueado' | 'apagado' | 'activado'

export type NavegadorAvisos = {
  /** Tiene service worker, PushManager y Notification. */
  soporta: boolean
  /** iPhone sin GiftR en la pantalla de inicio: ahí los avisos no andan. */
  pedirInstalar: boolean
  permiso: NotificationPermission
  /** La suscripción que ya tiene este navegador, si tiene. */
  suscripcion: () => Promise<{ toJSON(): unknown } | null>
}

/**
 * Qué mostrar al abrir Perfil. "Activados" es lo que sabe el servidor, no solo el navegador: si el navegador tiene la
 * suscripción y el servidor no (no se pudo guardar al activarlos, o el navegador la cambió y la vieja se borró), confirmar
 * la vuelve a guardar; si no puede, o es de otra cuenta de este navegador, quedan apagados y se pueden activar.
 */
export async function estadoAlAbrir(n: NavegadorAvisos, confirmar: (s: unknown) => Promise<boolean>): Promise<EstadoAvisos> {
  if (!n.soporta) return n.pedirInstalar ? 'ios-instalar' : 'no-soportado'
  if (n.permiso === 'denied') return 'bloqueado'
  const sub = await n.suscripcion()
  if (!sub) return 'apagado'
  return (await confirmar(sub.toJSON()).catch(() => false)) ? 'activado' : 'apagado'
}

/**
 * Después de pedir permiso: bloqueado solo si dijo que no. Si cerró el cartel sin elegir, siguen apagados y puede volver
 * a tocar "Activar avisos" (antes quedaba como bloqueado hasta recargar). Null: tiene permiso, se sigue.
 */
export function trasPedirPermiso(permiso: NotificationPermission): { estado: EstadoAvisos; mensaje?: string } | null {
  if (permiso === 'granted') return null
  if (permiso === 'denied') return { estado: 'bloqueado' }
  return { estado: 'apagado', mensaje: 'Para activarlos, tocá "Permitir" cuando el navegador te pregunte.' }
}
