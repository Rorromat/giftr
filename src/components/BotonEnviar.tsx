'use client'

import { useFormStatus } from 'react-dom'

/**
 * El botón de enviar de un formulario, que no se puede tocar dos veces: mientras la acción corre queda deshabilitado
 * (con 3G, un segundo toque mandaba otra reserva u otro deseo). El servidor igual se cuida solo: antes de que cargue la
 * página, el formulario se manda sin esto.
 */
export function BotonEnviar({ pendiente, disabled, className = '', children, ...props }: React.ComponentProps<'button'> & {
  /** Lo que dice mientras corre ("Guardando…"); si no, el mismo texto. */
  pendiente?: React.ReactNode
}) {
  const { pending } = useFormStatus()
  return (
    <button {...props} disabled={disabled || pending} aria-busy={pending || undefined}
            className={`${className} disabled:opacity-60 aria-busy:cursor-wait`}>
      {pending && pendiente ? pendiente : children}
    </button>
  )
}
