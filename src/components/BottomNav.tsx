'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Icon, type IconName } from '@/components/ui'
import { instalada } from '@/lib/app-instalable'

const DESTINOS: { href: string; label: string; nombre: string; icon: IconName; columna: number }[] = [
  { href: '/inicio', label: 'Inicio', nombre: 'Inicio', icon: 'home', columna: 0 },
  { href: '/gente', label: 'Tu gente', nombre: 'Gente', icon: 'users', columna: 1 },
  { href: '/regalos', label: 'Tus regalos y cuentas', nombre: 'Regalos', icon: 'gift', columna: 3 },
  { href: '/mi-lista', label: 'Vos: tu lista y tu perfil', nombre: 'Vos', icon: 'user', columna: 4 },
]

/**
 * La sección del menú a la que pertenece una pantalla: todo el año y lo nuevo de tus amigos son de Inicio; un grupo, un deseo y el perfil, de Vos; la
 * lista de alguien y agregar un amigo, de Gente; Cuentas, de Regalos.
 */
function seccionDe(path: string) {
  if (path === '/eventos' || path === '/novedades') return '/inicio'
  if (path === '/cuentas') return '/regalos'
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
 * En Agregar se esconde: el + gira hasta ser una × y la barra baja mientras la hoja de agregar sube
 * (al editar un deseo también se esconde).
 */
export function BottomNav() {
  const path = usePathname()
  // El destino tocado, mientras la navegación todavía no cambió la URL. Apenas cambia se olvida: si no,
  // al volver atrás a la pantalla de origen el toque viejo revivía (la barra quedaba escondida).
  const [toque, setToque] = useState<{ href: string; desde: string } | null>(null)
  if (toque && toque.desde !== path) setToque(null)
  const actual = seccionDe(path)
  const marcado = toque && toque.desde === path ? toque.href : actual
  const oculta = marcado === '/agregar' || path.startsWith('/editar/')
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
      {DESTINOS.slice(0, 2).map(destino)}
      <Link href="/agregar" prefetch aria-label="Agregar deseo" onNavigate={() => setToque({ href: '/agregar', desde: path })}>
        <span className="gr-nav__add"><Icon name="plus" size={22} strokeWidth={2.6} /></span>
      </Link>
      {DESTINOS.slice(2).map(destino)}
    </nav>
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
