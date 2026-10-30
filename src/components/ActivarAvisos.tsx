'use client'

import { useEffect, useState } from 'react'
import { confirmarAvisosAction, desuscribirAvisosAction, probarAvisoAction, suscribirAvisosAction } from '@/app/actions'
import { esIOS, instalada, registrarSW } from '@/lib/app-instalable'
import { estadoAlAbrir, trasPedirPermiso, type EstadoAvisos } from '@/lib/avisos-del-navegador'
import { Icon } from '@/components/ui'

/** La clave pública VAPID viene en base64url; el navegador la quiere en bytes. */
function bytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/**
 * "Avisos": para que los codazos lleguen como notificación. En iPhone solo anda con GiftR agregado a inicio.
 * bienvenida: la pregunta de la primera vez (ver /bienvenida/avisos): un botón grande para activarlos y, ya activados,
 * solo la confirmación (probarlos y desactivarlos queda para Perfil). alCambiar: el estado, cada vez que cambia.
 */
export function ActivarAvisos({ vapidPublica, bienvenida = false, alCambiar }: {
  vapidPublica: string; bienvenida?: boolean; alCambiar?: (estado: EstadoAvisos) => void
}) {
  const [estado, setEstado] = useState<EstadoAvisos>('cargando')
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => { alCambiar?.(estado) }, [estado, alCambiar])

  useEffect(() => {
    const soporta = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    estadoAlAbrir({
      soporta,
      pedirInstalar: esIOS() && !instalada(),
      permiso: soporta ? Notification.permission : 'default',
      suscripcion: async () => (await registrarSW()).pushManager.getSubscription(),
    }, confirmarAvisosAction).then(setEstado, () => setEstado('no-soportado'))
  }, [])

  async function activar() {
    setMensaje(null)
    try {
      const sinPermiso = trasPedirPermiso(await Notification.requestPermission())
      if (sinPermiso) {
        setEstado(sinPermiso.estado)
        return setMensaje(sinPermiso.mensaje ?? null)
      }
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
    setMensaje(n === 'espera' ? 'Recién te mandamos uno. Esperá un minuto para probar de nuevo.'
      : n ? 'Listo: te mandamos uno de prueba.' : 'No llegó. Desactivalos y volvé a activarlos.')
  }

  return (
    <div className="flex flex-col gap-2">
      {estado === 'cargando' && <p className="text-[13px] font-medium text-gr-muted">Fijándonos si este dispositivo puede recibir avisos…</p>}
      {estado === 'ios-instalar' && (
        <p className="text-[13px] font-medium leading-snug">
          En iPhone los avisos andan con GiftR en la pantalla de inicio: tocá <span className="font-semibold">Compartir → Agregar a inicio</span>, abrilo desde ahí y activalos{bienvenida ? ' en Perfil' : ''}.
        </p>
      )}
      {estado === 'no-soportado' && <p className="text-[13px] font-medium text-gr-muted">Este navegador no puede recibir avisos. Igual vas a ver los codazos al entrar.</p>}
      {estado === 'bloqueado' && (
        <p className="text-[13px] font-medium leading-snug">Los avisos están bloqueados para GiftR. Habilitalos en los ajustes del navegador y volvé acá.</p>
      )}
      {estado === 'apagado' && (
        <button type="button" onClick={activar} className={`gr-btn-primary w-full ${bienvenida ? '' : 'gr-btn--sm'}`}>
          {bienvenida ? 'Sí, activar avisos' : 'Activar avisos'}
        </button>
      )}
      {estado === 'activado' && bienvenida && (
        <p role="status" className="flex items-center gap-2 rounded-[18px] bg-gr-soft px-4 py-3 text-sm font-semibold">
          <Icon name="check" size={18} strokeWidth={2.6} className="flex-none" />¡Listo! Te vamos a avisar en este dispositivo.
        </p>
      )}
      {estado === 'activado' && !bienvenida && (
        <div className="flex items-center gap-3">
          <span className="flex-1 text-sm font-semibold">Avisos activados ✓</span>
          <button type="button" onClick={probar} className="gr-btn min-h-11 px-3 text-[13px]">Probar</button>
          <button type="button" onClick={desactivar} className="min-h-11 text-[13px] font-semibold underline underline-offset-4">Desactivar</button>
        </div>
      )}
      {mensaje && <p role="status" className="text-[13px] font-semibold">{mensaje}</p>}
    </div>
  )
}
