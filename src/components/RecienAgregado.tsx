'use client'

import { useEffect, useEffectEvent } from 'react'
import { mostrarAnotado, type Anotado } from '@/components/Agregado'
import { Icon } from '@/components/ui'

/**
 * Después de agregar un deseo: "¡Anotado!" con el color del deseo, donde se marca cuánto lo querés (ver Agregado). Al
 * cerrarlo, la lista va hasta él, que entra primero (ver OwnerItemsGrid), y el ?agregado= se saca de la dirección.
 */
export function RecienAgregado({ deseo }: { deseo: Anotado }) {
  const { id } = deseo
  const anotar = useEffectEvent(() => mostrarAnotado(deseo))
  // una vez por deseo agregado (lo que se vuelva a armar la lista, al cambiar cuánto lo querés, no lo vuelve a abrir)
  useEffect(() => { anotar() }, [id])
  return null
}

/** Después de eliminar un deseo (ver EliminarDeseo): "Listo, lo eliminaste". El ?eliminado= se saca de la dirección. */
export function DeseoEliminado() {
  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.delete('eliminado')
    history.replaceState(history.state, '', url)
  }, [])
  return (
    <p role="status" className="gr-toast [animation-duration:4s]">
      <Icon name="check" size={18} strokeWidth={2.6} className="flex-none text-gr-acento" />
      <span className="min-w-0 flex-1"><span className="font-semibold">Listo,</span> lo eliminaste</span>
    </p>
  )
}

/** Después de editar un paso de Tus gustos: "Listo, guardado" y la tarjeta de ese paso a la vista. */
export function GustosGuardados({ paso }: { paso: string }) {
  useEffect(() => {
    document.getElementById(`g-${paso}`)?.scrollIntoView({ block: 'center' })
    const url = new URL(location.href)
    url.searchParams.delete('guardado')
    history.replaceState(history.state, '', url)
  }, [paso])
  return (
    <p role="status" className="gr-toast [animation-duration:4s]">
      <Icon name="check" size={18} strokeWidth={2.6} className="flex-none text-gr-acento" />
      <span className="min-w-0 flex-1"><span className="font-semibold">Listo,</span> tu gente ya lo ve</span>
    </p>
  )
}
