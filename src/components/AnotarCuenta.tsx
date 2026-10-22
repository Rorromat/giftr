'use client'

import { useEffect } from 'react'
import { anotarCuentaAction } from '@/app/actions'

/**
 * Anota en este navegador la cuenta de una sesión que nunca lo hizo (ver anotarCuentaAction). Una cookie solo se puede
 * escribir desde una server action, no al armar la página: por eso va desde el navegador, una vez, al abrir la app.
 * El layout solo lo pone cuando falta.
 */
export function AnotarCuenta() {
  useEffect(() => {
    // si falla, se vuelve a intentar al abrir la app otra vez
    anotarCuentaAction().catch(() => {})
  }, [])
  return null
}
