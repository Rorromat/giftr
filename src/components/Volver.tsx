'use client'

import Link from 'next/link'
import { useEffect, useSyncExternalStore } from 'react'
import { claveDeVolver, esRutaInterna, nombreDeVolver } from '@/lib/volver'

const sinCambios = () => () => {}

/** El ?volver= de la dirección, si es una ruta de GiftR. */
function deLaDireccion(): string | null {
  const v = new URLSearchParams(location.search).get('volver')
  return esRutaInterna(v) ? v : null
}

/** Desde dónde se abrió esta pantalla la última vez en esta pestaña. Sin dónde anotarlo, como si no se supiera. */
function recordado(pantalla: string): string | null {
  try {
    const v = sessionStorage.getItem(claveDeVolver(pantalla))
    return esRutaInterna(v) ? v : null
  } catch {
    return null
  }
}

/**
 * "Volver" a donde la persona estaba (ver lib/volver.ts): el ?volver= con que se abrió esta pantalla, si es una ruta de
 * GiftR; si no, el destino de siempre (`respaldo`). Nunca history.back(): quien entró por un link no tiene a dónde.
 * El origen queda anotado mientras dura la pestaña: Euge abre la lista de Rodri desde Inicio, mira un deseo y vuelve a la
 * lista (ya sin ?volver=); ese "Volver" la tiene que seguir llevando a Inicio. Lo mismo en Perfil después de guardar algo.
 * volver: lo que leyó el servidor de ?volver= (así el link ya sale bien armado); si la pantalla no lo pasa, se lee acá.
 */
export function VolverAOrigen({ respaldo, pantalla, volver, vidrio = false }: {
  respaldo: string
  /** la pantalla que lo muestra, sin su búsqueda ("/avisos", "/l/<token>"): bajo ese nombre se anota el origen */
  pantalla: string
  volver?: unknown
  vidrio?: boolean | 'oscuro'
}) {
  const delServidor = esRutaInterna(volver) ? volver : null
  const origen = useSyncExternalStore(sinCambios, () => deLaDireccion() ?? recordado(pantalla), () => delServidor)
  useEffect(() => {
    const v = deLaDireccion()
    if (!v) return
    try {
      sessionStorage.setItem(claveDeVolver(pantalla), v)
    } catch {
      // no queda anotado: sin ?volver=, vuelve al destino de siempre
    }
  }, [pantalla])
  const href = origen ?? respaldo
  return (
    <Link href={href} aria-label={nombreDeVolver(href)} className={`gr-icon-btn${vidrio === 'oscuro' ? ' gr-vidrio-oscuro' : vidrio ? ' gr-vidrio' : ''}`}>
      <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}
           strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </Link>
  )
}
