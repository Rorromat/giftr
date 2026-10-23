'use client'

import { useEffect } from 'react'
import { escucharPedidoInstalar, registrarSW } from '@/lib/app-instalable'
import { limpiarBuzon } from '@/lib/buzon-compartido'

/**
 * Registra el service worker para todos, no solo al activar los avisos: es el que recibe lo que se comparte a GiftR desde
 * otra app, y la persona instala desde cualquier pantalla y comparte después. Cuando termina de cargar la página, para no
 * competir con ella. Si falla, compartir sigue andando por el servidor (sin la foto). De paso saca del buzón lo compartido
 * que nadie levantó (ver limpiarBuzon), y guarda desde el principio el pedido de instalar de Chrome para el botón de Perfil
 * (puede llegar antes de abrirlo; el que llega antes de hidratar lo atrapa el layout, ver ATRAPAR_PEDIDO_INSTALAR).
 */
export function RegistrarSW() {
  useEffect(() => escucharPedidoInstalar(), [])
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const registrar = () => {
      void registrarSW().catch(() => {})
      void limpiarBuzon()
    }
    if (document.readyState === 'complete') registrar()
    else window.addEventListener('load', registrar, { once: true })
    return () => window.removeEventListener('load', registrar)
  }, [])
  return null
}
