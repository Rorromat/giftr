'use client'

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { STAR_POINTS } from '@/components/ui'

/** Lo que dice el sello en cada momento (dos renglones) y el tamaño de la letra para que entre en la estrella. */
const TEXTOS = {
  tuyo: ['¡Es', 'tuyo!', 22],
  listo: ['¡Ya', 'está!', 22],
  todos: ['¡Entre', 'todos!', 18],
} as const
export type TipoSello = keyof typeof TEXTOS

const sinCambios = () => () => {}

// Los sellos que ya se vieron caer en este navegador. Sin dónde anotarlo, como si no se hubiera visto ninguno.
const anotado = (clave: string) => `giftr:sello:${clave}`
function yaSeVio(clave: string): boolean {
  try {
    return localStorage.getItem(anotado(clave)) !== null
  } catch {
    return false
  }
}
function anotar(clave: string) {
  try {
    localStorage.setItem(anotado(clave), '1')
  } catch {
    // no queda anotado: la próxima vez vuelve a caer
  }
}

/**
 * El sello: la estrella del logo con borde blanco, pegada torcida sobre la foto de lo que te tocó regalar. "¡Es tuyo!" al
 * reservarlo, "¡Ya está!" al comprarlo y "¡Entre todos!" con el regalo grupal comprado; el chico (en las tarjetas) lleva
 * un tilde. Es adorno: al lado ya lo dice un texto.
 * Cae (gr-sello--cae) la primera vez que se ve en este navegador (`clave`, la misma para el grande y el chico), cuando
 * aparece en la pantalla: después de reservar, o al entrar sin recargar. Al cargar la página no, que ya estaba dibujado.
 * Si aparece fuera de la vista (reservaste abajo de todo), espera escondido (gr-sello--espera) a que se vea para caer.
 */
export function Sello({ tipo, clave, size, chico = false, className = '' }: {
  tipo: TipoSello
  clave: string
  size: number
  chico?: boolean
  className?: string
}) {
  const ref = useRef<SVGSVGElement>(null)
  // true mientras se hidrata lo que vino del servidor: lo que aparece después ya no
  const hidratando = useSyncExternalStore(sinCambios, () => false, () => true)
  const [alCargar] = useState(hidratando)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const k = `${clave}:${tipo}`
    // el mismo sello con otro texto ("¡Es tuyo!" → "¡Ya está!"): vuelve a caer, o queda quieto, desde cero
    el.classList.remove('gr-sello--espera', 'gr-sello--cae')
    if (yaSeVio(k)) return
    // ya estaba dibujado, o sin animaciones: queda como visto, quieto
    if (alCargar || matchMedia('(prefers-reduced-motion: reduce)').matches) return anotar(k)
    el.classList.add('gr-sello--espera')
    let golpe: ReturnType<typeof setTimeout> | undefined
    const mirar = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return
      mirar.disconnect()
      anotar(k)
      el.classList.remove('gr-sello--espera')
      el.classList.add('gr-sello--cae')
      // el golpe, donde se puede
      golpe = setTimeout(() => navigator.vibrate?.(12), 200)
    }, { threshold: 0.6 })
    mirar.observe(el)
    return () => {
      mirar.disconnect()
      clearTimeout(golpe)
    }
  }, [clave, tipo, alCargar])

  const [arriba, abajo, letra] = TEXTOS[tipo]
  const texto = (t: string, y: number) => (
    <text x="50" y={y} dy="0.35em" textAnchor="middle" fontSize={letra} fontWeight={800} fill="var(--gr-ink)"
          style={{ fontFamily: 'var(--gr-font-display)' }}>{t}</text>
  )
  return (
    <svg ref={ref} aria-hidden width={size} height={size} viewBox="-7 -7 114 114" className={`gr-sello ${className}`}>
      <polygon points={STAR_POINTS} fill="var(--gr-accent)" stroke="var(--gr-surface)" strokeWidth={chico ? 12 : 10}
               strokeLinejoin="round" paintOrder="stroke" />
      {chico
        ? <path d="M30 52l13 13 27-29" fill="none" stroke="var(--gr-ink)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
        : <>{texto(arriba, 39)}{texto(abajo, 61)}</>}
    </svg>
  )
}
