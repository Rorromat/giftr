'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Icon, Starburst } from '@/components/ui'

// Tirar para abajo desde arriba de todo trae lo último del servidor (router.refresh: no pierde el scroll ni lo que está
// abierto). La estrella baja girando con el dedo; pasado el umbral, al soltar gira hasta que llega lo nuevo y dice "Al
// día". En la app instalada no hay uno del sistema; en el navegador reemplaza al suyo (overscroll-behavior en el body),
// que recargaba la página entera.

/** Las pantallas donde lo que se ve lo pueden cambiar otros (Mis regalos: un regalo grupal en el que estás). No los formularios (Agregar, Editar, Perfil, un grupo nuevo). */
const DONDE = /^\/(?:inicio|novedades|gente|cuentas|regalos|mi-lista|eventos|deseo\/[^/]+|grupos\/(?!nuevo$|unirme(?:\/|$))[^/]+|l\/.+)$/
export const refrescaEn = (path: string) => DONDE.test(path)

/** Cuánto hay que tirar (con la resistencia, la mitad de lo que baja el dedo) para que al soltar actualice. */
const UMBRAL = 64
const TOPE = 104
/** Que la estrella llegue a girar aunque la respuesta sea instantánea. */
const MINIMO_MS = 600
const LISTO_MS = 1100

type Fase = 'quieto' | 'tirando' | 'cargando' | 'listo' | 'sin-red'

export function Refrescar() {
  const path = usePathname()
  const router = useRouter()
  const activo = refrescaEn(path)
  const [fase, setFase] = useState<Fase>('quieto')
  const [pendiente, startTransition] = useTransition()
  const faseRef = useRef<Fase>('quieto')
  const desde = useRef(0)
  const caja = useRef<HTMLDivElement>(null)

  const pintar = (tiron: number) => {
    caja.current?.style.setProperty('--tiron', `${tiron}px`)
    caja.current?.style.setProperty('--avance', String(Math.min(1, tiron / UMBRAL)))
  }
  const pasarA = (f: Fase) => {
    faseRef.current = f
    setFase(f)
  }

  useEffect(() => {
    if (!activo) return
    let y0 = 0
    let x0 = 0
    let siguiendo = false
    let decidido = false
    let tiron = 0

    function empieza(e: TouchEvent) {
      if (e.touches.length !== 1 || window.scrollY > 0 || faseRef.current !== 'quieto') return
      // no desde un campo, la barra de abajo o algo que pide quedar afuera
      if ((e.target as Element).closest?.('input, textarea, select, [contenteditable], nav, .gr-floatbar, [data-sin-refrescar]')) return
      y0 = e.touches[0].clientY
      x0 = e.touches[0].clientX
      siguiendo = true
      decidido = false
      tiron = 0
    }
    function mueve(e: TouchEvent) {
      if (!siguiendo) return
      const dy = e.touches[0].clientY - y0
      const dx = e.touches[0].clientX - x0
      if (!decidido) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return
        decidido = true
        // hacia arriba, de costado (un carrusel) o ya con scroll: no es un tirón
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
          siguiendo = false
          return
        }
        pasarA('tirando')
      }
      if (e.cancelable) e.preventDefault()
      const antes = tiron
      tiron = Math.min(TOPE, Math.max(0, dy) / 2)
      pintar(tiron)
      // un toquecito al pasar el umbral (en Android; iOS no deja vibrar)
      if (antes < UMBRAL && tiron >= UMBRAL) navigator.vibrate?.(8)
      caja.current?.toggleAttribute('data-suelta', tiron >= UMBRAL)
    }
    function termina() {
      if (!siguiendo) return
      siguiendo = false
      if (!decidido) return
      caja.current?.removeAttribute('data-suelta')
      if (tiron < UMBRAL) {
        pintar(0)
        pasarA('quieto')
        return
      }
      pintar(UMBRAL)
      if (!navigator.onLine) {
        pasarA('sin-red')
        return
      }
      desde.current = Date.now()
      pasarA('cargando')
      startTransition(() => router.refresh())
    }
    function cancela() {
      if (!siguiendo) return
      siguiendo = false
      caja.current?.removeAttribute('data-suelta')
      pintar(0)
      if (faseRef.current === 'tirando') pasarA('quieto')
    }

    document.addEventListener('touchstart', empieza, { passive: true })
    document.addEventListener('touchmove', mueve, { passive: false })
    document.addEventListener('touchend', termina)
    document.addEventListener('touchcancel', cancela)
    return () => {
      document.removeEventListener('touchstart', empieza)
      document.removeEventListener('touchmove', mueve)
      document.removeEventListener('touchend', termina)
      document.removeEventListener('touchcancel', cancela)
    }
  }, [activo, router])

  // Llegó lo nuevo (la transición del refresh terminó): "Al día", después de que la estrella haya girado un poco
  useEffect(() => {
    if (fase !== 'cargando' || pendiente) return
    const t = setTimeout(() => pasarA('listo'), Math.max(0, MINIMO_MS - (Date.now() - desde.current)))
    return () => clearTimeout(t)
  }, [fase, pendiente])
  // "Al día" (o "Sin conexión") un rato, y se va
  useEffect(() => {
    if (fase !== 'listo' && fase !== 'sin-red') return
    const t = setTimeout(() => {
      pintar(0)
      pasarA('quieto')
    }, LISTO_MS)
    return () => clearTimeout(t)
  }, [fase])

  if (!activo) return null
  return (
    <>
      <div ref={caja} aria-hidden className="gr-refrescar" data-fase={fase}>
        {fase === 'listo' || fase === 'sin-red' ? (
          <>
            <Icon name={fase === 'listo' ? 'check' : 'close'} size={18} strokeWidth={2.6} className="text-gr-acento" />
            <span>{fase === 'listo' ? 'Al día' : 'Sin conexión'}</span>
          </>
        ) : (
          <Starburst size={26} className="gr-refrescar__estrella" />
        )}
      </div>
      <p role="status" className="sr-only">
        {fase === 'cargando' ? 'Actualizando…' : fase === 'listo' ? 'Al día' : fase === 'sin-red' ? 'Sin conexión: no se pudo actualizar' : ''}
      </p>
    </>
  )
}
