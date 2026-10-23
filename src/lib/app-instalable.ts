// Corre en el navegador: GiftR como app (el service worker, si está instalada y el pedido de instalar de Chrome).

/**
 * El service worker de GiftR (avisos y compartir). Siempre el mismo script y el mismo scope, desde todos lados
 * (RegistrarSW y ActivarAvisos): con otro, el navegador reemplaza el registro (y con él, la suscripción a los avisos).
 */
export const registrarSW = () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })

/** iPhone o iPad (el iPad nuevo se presenta como una Mac, pero con pantalla táctil). */
export const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Abierta como app (desde el ícono), no en una pestaña del navegador. */
export const instalada = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

/** El evento beforeinstallprompt de Chrome (no está en los tipos de TypeScript). */
export type PedidoInstalar = Event & {
  prompt(): Promise<unknown>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>
}

// El pedido de Chrome llega cuando quiere (también antes de abrir Perfil), así que lo guarda RegistrarSW y lo lee Perfil.
let pedido: PedidoInstalar | null = null
const oyentes = new Set<() => void>()

export function guardarPedidoInstalar(e: PedidoInstalar | null) {
  pedido = e
  for (const avisar of oyentes) avisar()
}

/** Si Chrome ofrece instalar GiftR (y todavía no se usó ese pedido). */
export const puedeInstalar = () => pedido !== null

/** Para useSyncExternalStore: avisa cuando llega o se va el pedido. */
export function alCambiarPedido(avisar: () => void) {
  oyentes.add(avisar)
  return () => { oyentes.delete(avisar) }
}

/**
 * Abre el diálogo de instalar de Chrome y dice si aceptó. Tiene que llamarse desde el toque (Chrome pide un gesto) y el
 * pedido sirve una sola vez: se descarta antes de abrirlo, y si Chrome vuelve a ofrecer, llega otro.
 */
export async function instalarGiftR(): Promise<boolean> {
  const p = pedido
  if (!p) return false
  guardarPedidoInstalar(null)
  try {
    await p.prompt()
    return (await p.userChoice).outcome === 'accepted'
  } catch {
    return false
  }
}

/**
 * Guarda el pedido de instalar cuando llega y lo borra al instalarse. Sin preventDefault: Chrome sigue ofreciendo instalar
 * por su cuenta como siempre, y el botón de Perfil abre el mismo diálogo.
 */
export function escucharPedidoInstalar(w: Pick<Window, 'addEventListener' | 'removeEventListener'> = window) {
  const guardar = (e: Event) => guardarPedidoInstalar(e as PedidoInstalar)
  const borrar = () => guardarPedidoInstalar(null)
  w.addEventListener('beforeinstallprompt', guardar)
  w.addEventListener('appinstalled', borrar)
  return () => {
    w.removeEventListener('beforeinstallprompt', guardar)
    w.removeEventListener('appinstalled', borrar)
  }
}
