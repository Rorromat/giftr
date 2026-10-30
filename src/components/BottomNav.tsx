'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Agregado, abrirAgregado, cerrarAgregado, useAgregado } from '@/components/Agregado'
import { Icon, type IconName } from '@/components/ui'
import { instalada } from '@/lib/app-instalable'

const DESTINOS: { href: string; label: string; nombre: string; icon: IconName }[] = [
  { href: '/inicio', label: 'Inicio', nombre: 'Inicio', icon: 'home' },
  { href: '/gente', label: 'Tu gente', nombre: 'Gente', icon: 'users' },
  { href: '/regalos', label: 'Tus regalos y cuentas', nombre: 'Regalos', icon: 'gift' },
  { href: '/mi-lista', label: 'Vos: tu lista y tu perfil', nombre: 'Vos', icon: 'user' },
]

/**
 * La sección del menú a la que pertenece una pantalla: todo el año, lo nuevo de tus amigos, las fechas especiales y Avisos
 * son de Inicio; un grupo, un deseo y el perfil, de Vos; la lista de alguien y agregar un amigo, de Gente; Cuentas, una sorpresa y
 * un amigo invisible, de Regalos.
 */
function seccionDe(path: string) {
  if (path === '/eventos' || path === '/novedades' || path === '/avisos' || path.startsWith('/fechas/')) return '/inicio'
  if (path === '/cuentas' || path.startsWith('/sorpresa/') || path.startsWith('/invisible/')) return '/regalos'
  if (path.startsWith('/l/') || path.startsWith('/gente/')) return '/gente'
  if (path.startsWith('/grupos/') || path.startsWith('/deseo/') || path === '/perfil' || path.startsWith('/perfil/')) return '/mi-lista'
  return path
}

/** Cuánto achica el teclado lo que se ve: con más que esto, está abierto. */
const TECLADO_PX = 150

/**
 * iOS 26 con GiftR instalado: después de usar el teclado, lo que se ve de la pantalla (el visual viewport) puede quedar
 * corrido de lo que usa position: fixed, y la barra flotaba por la mitad de la pantalla al scrollear (un bug de WebKit).
 * Solo en la app instalada, la barra se vuelve a pegar abajo de lo que se ve (--anclaje: cuánto se corre) y, con el
 * teclado abierto, se esconde. En los demás navegadores los dos coinciden y no cambia nada.
 */
function useAnclajeAbajo(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv || !instalada()) return
    let frame = 0
    const ajustar = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const nav = ref.current
        if (!nav) return
        const alto = document.documentElement.clientHeight
        const desfase = vv.scale > 1.01 ? 0 : vv.offsetTop + vv.height - alto
        nav.toggleAttribute('data-teclado', vv.scale <= 1.01 && alto - vv.height > TECLADO_PX)
        if (Math.abs(desfase) < 1) nav.style.removeProperty('--anclaje')
        else nav.style.setProperty('--anclaje', `${Math.round(desfase)}px`)
      })
    }
    ajustar()
    vv.addEventListener('resize', ajustar)
    vv.addEventListener('scroll', ajustar)
    window.addEventListener('scroll', ajustar, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      vv.removeEventListener('resize', ajustar)
      vv.removeEventListener('scroll', ajustar)
      window.removeEventListener('scroll', ajustar)
    }
  }, [ref])
}

/**
 * La barra de abajo: una píldora de vidrio esmerilado con las cuatro secciones y, al costado, el + en un círculo del mismo
 * vidrio. Vive en el layout de (menu), así que no se vuelve a montar al cambiar de sección: la sección tocada se marca
 * desde el toque mismo, y su columna se estira con un rebote (las columnas se animan con CSS). El + abre el agregado (ver Agregado): gira y queda como × mientras la píldora se esconde. En
 * Agregar la barra se esconde entera (al editar un deseo o tus gustos, armar una sorpresa o un amigo invisible también), y
 * en un deseo, que tiene una sola acción principal, tampoco va.
 */
export function BottomNav() {
  const path = usePathname()
  // El destino tocado, mientras la navegación todavía no cambió la URL. Apenas cambia se olvida: si no,
  // al volver atrás a la pantalla de origen el toque viejo revivía (la barra quedaba escondida).
  const [toque, setToque] = useState<{ href: string; desde: string } | null>(null)
  if (toque && toque.desde !== path) setToque(null)
  const actual = seccionDe(path)
  const marcado = toque && toque.desde === path ? toque.href : actual
  const oculta = marcado === '/agregar' || path.startsWith('/editar/') || path === '/sorpresa/nueva' || /^\/sorpresa\/[^/]+\/editar$/.test(path)
    || path === '/invisible/nuevo' || /^\/invisible\/[^/]+\/editar$/.test(path) || /^\/perfil\/gustos\/[^/]+$/.test(path)
    || path.startsWith('/deseo/') || /^\/l\/[^/]+\/item\//.test(path)
  const { paso } = useAgregado()
  const abierto = paso !== ''
  // La columna que se estira: la marcada. En Agregar (o un deseo) no hay marcada: queda la última mientras la barra baja.
  const columna = DESTINOS.findIndex((d) => d.href === marcado)
  const [ultima, setUltima] = useState(Math.max(columna, 0))
  if (columna >= 0 && columna !== ultima) setUltima(columna)

  const ref = useRef<HTMLElement>(null)
  useAnclajeAbajo(ref)

  return (
    <>
      <Agregado />
      <nav ref={ref} aria-label="Navegación principal" className="gr-nav" data-oculta={oculta || undefined} data-abierto={abierto || undefined}
           inert={oculta}>
        {/* prefetch: las secciones del menú se precargan completas (con datos) y el toque es instantáneo. */}
        <div className="gr-nav__tabs" data-columna={columna >= 0 ? columna : ultima} inert={abierto}>
          {DESTINOS.map((d) => (
            <Destino key={d.href} d={d} actual={actual} marcado={marcado} onNavigate={() => setToque({ href: d.href, desde: path })} />
          ))}
        </div>
        <button type="button" className="gr-mas" aria-label={abierto ? 'Cerrar' : 'Agregar un deseo'} aria-expanded={abierto}
                onClick={() => (abierto ? cerrarAgregado() : abrirAgregado())}>
          <Icon name="plus" size={24} strokeWidth={2.4} />
        </button>
      </nav>
    </>
  )
}

function Destino({ d, actual, marcado, onNavigate }: { d: (typeof DESTINOS)[number]; actual: string; marcado: string; onNavigate: () => void }) {
  return (
    <Link href={d.href} prefetch onNavigate={onNavigate} aria-label={d.label}
          aria-current={actual === d.href ? 'page' : undefined} data-marcado={marcado === d.href || undefined}>
      <Icon name={d.icon} size={22} strokeWidth={2} />
      <span aria-hidden>{d.nombre}</span>
    </Link>
  )
}
