'use client'

import { useEffect } from 'react'
import { vistaBandejaAction } from '@/app/actions'

/**
 * Al abrir Avisos (no al armarla: un prefetch no cuenta como verla), lo que había hasta que se armó deja de ser nuevo. Los
 * puntos de nuevo siguen en pantalla hasta que vuelva a entrar.
 */
export function MarcarBandejaVista({ hasta }: { hasta: string }) {
  useEffect(() => {
    vistaBandejaAction(hasta).catch(() => {})
  }, [hasta])
  return null
}
