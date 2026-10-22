'use client'

import { useFormStatus } from 'react-dom'

/**
 * El botón de enviar de un formulario, que no se puede tocar dos veces: mientras la acción corre queda deshabilitado
 * (con 3G, un segundo toque mandaba otra reserva u otro deseo). Antes de que cargue la página el formulario se manda sin
 * esto, así que el servidor también se cuida: reservar, archivar, armar un regalo y "Ya lo compré" devuelven lo que ya
 * estaba, y agregar un deseo, crear un grupo y comentar no repiten lo recién hecho (ver recienHecho).
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
