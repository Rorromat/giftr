'use client'

import { useEffect, useState } from 'react'
import { desuscribirAvisosAction, probarAvisoAction, suscribirAvisosAction } from '@/app/actions'

type Estado = 'cargando' | 'no-soportado' | 'ios-instalar' | 'bloqueado' | 'apagado' | 'activado'

/** La clave pública VAPID viene en base64url; el navegador la quiere en bytes. */
function bytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const instalada = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

/** "Avisos": para que los codazos lleguen como notificación. En iPhone solo anda con GiftR agregado a inicio. */
export function ActivarAvisos({ vapidPublica }: { vapidPublica: string }) {
  const [estado, setEstado] = useState<Estado>('cargando')
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return setEstado(esIOS() && !instalada() ? 'ios-instalar' : 'no-soportado')
      }
      if (Notification.permission === 'denied') return setEstado('bloqueado')
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      setEstado((await reg.pushManager.getSubscription()) ? 'activado' : 'apagado')
    })().catch(() => setEstado('no-soportado'))
  }, [])

  async function activar() {
    setMensaje(null)
    try {
      if (await Notification.requestPermission() !== 'granted') return setEstado('bloqueado')
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(vapidPublica) })
      if (!(await suscribirAvisosAction(sub.toJSON()))) throw new Error('no se guardó')
      setEstado('activado')
    } catch {
      setMensaje('No pudimos activarlos en este dispositivo. Probá de nuevo en un rato.')
    }
  }

  async function desactivar() {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
    if (sub) {
      await desuscribirAvisosAction(sub.endpoint)
      await sub.unsubscribe()
    }
    setEstado('apagado')
  }

  async function probar() {
    setMensaje(null)
    const n = await probarAvisoAction()
    setMensaje(n ? 'Listo: te mandamos uno de prueba.' : 'No llegó. Desactivalos y volvé a activarlos.')
  }

  return (
    <div className="flex flex-col gap-2">
      {estado === 'cargando' && <p className="text-[13px] font-medium text-gr-muted">Fijándonos si este dispositivo puede recibir avisos…</p>}
      {estado === 'ios-instalar' && (
        <p className="text-[13px] font-medium leading-snug">
          En iPhone los avisos andan con GiftR en la pantalla de inicio: tocá <span className="font-bold">Compartir → Agregar a inicio</span>, abrilo desde ahí y activalos.
        </p>
      )}
      {estado === 'no-soportado' && <p className="text-[13px] font-medium text-gr-muted">Este navegador no puede recibir avisos. Igual vas a ver los codazos al entrar.</p>}
      {estado === 'bloqueado' && (
        <p className="text-[13px] font-medium leading-snug">Los avisos están bloqueados para GiftR. Habilitalos en los ajustes del navegador y volvé acá.</p>
      )}
      {estado === 'apagado' && (
        <button type="button" onClick={activar} className="gr-btn-primary gr-btn--sm w-full">Activar avisos</button>
      )}
      {estado === 'activado' && (
        <div className="flex items-center gap-3">
          <span className="flex-1 text-sm font-bold">Avisos activados ✓</span>
          <button type="button" onClick={probar} className="gr-btn min-h-11 px-3 font-sans text-[13px] font-bold">Probar</button>
          <button type="button" onClick={desactivar} className="min-h-11 text-[13px] font-bold underline underline-offset-4">Desactivar</button>
        </div>
      )}
      {mensaje && <p role="status" className="text-[13px] font-semibold">{mensaje}</p>}
    </div>
  )
}
