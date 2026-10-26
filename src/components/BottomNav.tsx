'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Icon, Starburst, type IconName } from '@/components/ui'
import { instalada } from '@/lib/app-instalable'

const DESTINOS: { href: string; label: string; nombre: string; icon: IconName; columna: number }[] = [
  { href: '/inicio', label: 'Inicio', nombre: 'Inicio', icon: 'home', columna: 0 },
  { href: '/gente', label: 'Tu gente', nombre: 'Gente', icon: 'users', columna: 1 },
  { href: '/regalos', label: 'Tus regalos y cuentas', nombre: 'Regalos', icon: 'gift', columna: 2 },
  { href: '/mi-lista', label: 'Vos: tu lista y tu perfil', nombre: 'Vos', icon: 'user', columna: 3 },
]

/** Dónde está el botón de agregar un deseo (ver BotonAgregar): en Inicio y en lo tuyo (tu lista y tu perfil). */
const CON_AGREGAR = new Set(['/inicio', '/mi-lista', '/perfil'])

/**
 * La sección del menú a la que pertenece una pantalla: todo el año, lo nuevo de tus amigos y las fechas especiales son de
 * Inicio; un grupo, un deseo y el perfil, de Vos; la lista de alguien y agregar un amigo, de Gente; Cuentas, una sorpresa y
 * un amigo invisible, de Regalos.
 */
function seccionDe(path: string) {
  if (path === '/eventos' || path === '/novedades' || path.startsWith('/fechas/')) return '/inicio'
  if (path === '/cuentas' || path.startsWith('/sorpresa/') || path.startsWith('/invisible/')) return '/regalos'
  if (path.startsWith('/l/') || path.startsWith('/gente/')) return '/gente'
  if (path.startsWith('/grupos/') || path.startsWith('/deseo/') || path === '/perfil') return '/mi-lista'
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
 * Píldora blanca flotante. Vive en el layout de (menu), así que no se vuelve a montar al cambiar de sección: la
 * sección marcada se estira en negro con su nombre (las columnas se animan con CSS), desde el toque mismo.
 * Agregar un deseo no es una sección: es la estrella lima que flota arriba de la punta derecha, en Inicio y en lo tuyo
 * (ver BotonAgregar). En Agregar la barra se esconde: la estrella gira y se va mientras la hoja de agregar sube (al
 * editar un deseo, armar una sorpresa o un amigo invisible también se esconde).
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
    || path === '/invisible/nuevo' || /^\/invisible\/[^/]+\/editar$/.test(path)
  // En Agregar (o Editar) no hay columna marcada: la píldora se queda donde estaba mientras la barra baja.
  const columna = DESTINOS.find((d) => d.href === marcado)?.columna
  const [ultima, setUltima] = useState(columna)
  if (columna !== undefined && columna !== ultima) setUltima(columna)
  const columnaMarca = columna ?? ultima

  const ref = useRef<HTMLElement>(null)
  useAnclajeAbajo(ref)

  const destino = (d: (typeof DESTINOS)[number]) => (
    <Destino key={d.href} d={d} actual={actual} marcado={marcado} onNavigate={() => setToque({ href: d.href, desde: path })} />
  )

  return (
    <nav ref={ref} aria-label="Navegación principal" className="gr-nav" data-columna={columnaMarca} data-oculta={oculta || undefined} inert={oculta}>
      {/* prefetch: las secciones del menú se precargan completas (con datos) y el toque es instantáneo. */}
      {DESTINOS.map(destino)}
      {/* adentro de la barra: se esconde con ella (en Agregar, con el teclado) y se corre con su --anclaje */}
      {(CON_AGREGAR.has(path) || marcado === '/agregar') && (
        <BotonAgregar onNavigate={() => setToque({ href: '/agregar', desde: path })} />
      )}
    </nav>
  )
}

/** Agregar un deseo: una estrella lima (la de la marca) con un +, que flota abajo a la derecha. */
function BotonAgregar({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Link href="/agregar" prefetch aria-label="Agregar deseo" onNavigate={onNavigate} className="gr-fab">
      <Starburst size={72} className="gr-fab__estrella" />
      <Icon name="plus" size={30} strokeWidth={2.8} className="relative" />
    </Link>
  )
}

function Destino({ d, actual, marcado, onNavigate }: { d: (typeof DESTINOS)[number]; actual: string; marcado: string; onNavigate: () => void }) {
  return (
    <Link href={d.href} prefetch onNavigate={onNavigate} aria-label={d.label}
          aria-current={actual === d.href ? 'page' : undefined} data-marcado={marcado === d.href || undefined}>
      <Icon name={d.icon} strokeWidth={2} />
      <span aria-hidden className="gr-nav__nombre">{d.nombre}</span>
    </Link>
  )
}
