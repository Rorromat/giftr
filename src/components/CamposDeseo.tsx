'use client'

import type { ComponentProps } from 'react'
import { avisoDelLink, avisoDelTitulo } from '@/lib/deseo-form'

type Props = Omit<ComponentProps<'input'>, 'onChange' | 'maxLength'>

/**
 * Un campo del formulario de un deseo que frena el envío, con el motivo, si el servidor lo cortaría o no lo guardaría.
 * Lo que vino cargado no se mira hasta que lo cambien: un deseo de antes de los topes se sigue pudiendo editar.
 */
function CampoConAviso({ aviso, defaultValue, ...props }: Props & { aviso: (v: string) => string }) {
  return (
    <input {...props} defaultValue={defaultValue} onChange={(e) => {
      const v = e.currentTarget.value
      e.currentTarget.setCustomValidity(v === String(defaultValue ?? '') ? '' : aviso(v))
    }} />
  )
}

/** "¿Qué querés?": hasta 120 letras, sin contar un link pegado (ver avisoDelTitulo). */
export const CampoTitulo = (props: Props) => <CampoConAviso {...props} aviso={avisoDelTitulo} />

/** "Link a la tienda": sin maxLength, que cortaría en silencio un link pegado (y se guardaría roto). */
export const CampoLink = (props: Props) => <CampoConAviso {...props} aviso={avisoDelLink} />
