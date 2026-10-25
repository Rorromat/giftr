'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Icon } from '@/components/ui'

/**
 * Después de agregar un deseo: la lista va hasta él (está marcado "Recién agregado", ver OwnerItemsGrid) y abajo aparece
 * "¡Listo! Ya está en tu lista" con "Agregar otro". El ?agregado= se saca de la dirección: al volver a entrar (o tirar
 * para actualizar) ya no es el recién agregado.
 */
export function RecienAgregado({ id, otro }: { id: string; otro: string }) {
  useEffect(() => {
    document.getElementById(`d-${id}`)?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    const url = new URL(location.href)
    url.searchParams.delete('agregado')
    history.replaceState(history.state, '', url)
  }, [id])
  return (
    <p role="status" className="gr-toast [animation-duration:6s]">
      <Icon name="check" size={18} strokeWidth={2.6} className="flex-none text-gr-accent" />
      <span className="min-w-0 flex-1"><span className="font-semibold text-gr-accent">¡Listo!</span> Ya está en tu lista</span>
      <Link href={otro} className="flex-none font-semibold text-gr-accent underline underline-offset-4">Agregar otro</Link>
    </p>
  )
}
