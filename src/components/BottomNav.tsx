'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Icon, type IconName } from '@/components/ui'

const DESTINOS: { href: string; label: string; icon: IconName; columna: number }[] = [
  { href: '/mi-lista', label: 'Mi lista', icon: 'home', columna: 0 },
  { href: '/eventos', label: 'Eventos', icon: 'gift', columna: 1 },
  { href: '/gente', label: 'Tu gente', icon: 'users', columna: 3 },
  { href: '/perfil', label: 'Perfil', icon: 'user', columna: 4 },
]

/** La sección del menú a la que pertenece una pantalla (un grupo es parte de Mi lista; Cuentas, de Perfil). */
function seccionDe(path: string) {
  if (path.startsWith('/grupos/')) return '/mi-lista'
  if (path === '/cuentas') return '/perfil'
  return path
}

/**
 * Píldora negra flotante. Vive en el layout de (menu), así que no se vuelve a montar al cambiar de sección:
 * el círculo verde es una pieza propia que se desliza con CSS hasta el destino, desde el toque mismo.
 * En Agregar se esconde: el + gira hasta ser una × y la barra baja mientras la hoja de agregar sube.
 */
export function BottomNav() {
  const path = usePathname()
  // El destino tocado, mientras la navegación todavía no cambió la URL. Apenas cambia se olvida: si no,
  // al volver atrás a la pantalla de origen el toque viejo revivía (la barra quedaba escondida).
  const [toque, setToque] = useState<{ href: string; desde: string } | null>(null)
  if (toque && toque.desde !== path) setToque(null)
  const actual = seccionDe(path)
  const marcado = toque && toque.desde === path ? toque.href : actual
  const oculta = marcado === '/agregar'
  // En Agregar no hay columna marcada: el círculo se queda donde estaba mientras la barra baja.
  const columna = DESTINOS.find((d) => d.href === marcado)?.columna
  const [ultima, setUltima] = useState(columna)
  if (columna !== undefined && columna !== ultima) setUltima(columna)
  const columnaMarca = columna ?? ultima

  const destino = (d: (typeof DESTINOS)[number]) => (
    <Destino key={d.href} d={d} actual={actual} marcado={marcado} onNavigate={() => setToque({ href: d.href, desde: path })} />
  )

  return (
    <nav aria-label="Navegación principal" className="gr-nav" data-oculta={oculta || undefined} inert={oculta}>
      {columnaMarca !== undefined && <span aria-hidden className="gr-nav__marca" style={{ '--columna': columnaMarca } as React.CSSProperties} />}
      {/* prefetch: las secciones del menú se precargan completas (con datos) y el toque es instantáneo. */}
      {DESTINOS.slice(0, 2).map(destino)}
      <Link href="/agregar" prefetch aria-label="Agregar deseo" onNavigate={() => setToque({ href: '/agregar', desde: path })}>
        <span className="gr-nav__add"><Icon name="plus" size={24} strokeWidth={3} /></span>
      </Link>
      {DESTINOS.slice(2).map(destino)}
    </nav>
  )
}

function Destino({ d, actual, marcado, onNavigate }: { d: (typeof DESTINOS)[number]; actual: string; marcado: string; onNavigate: () => void }) {
  return (
    <Link href={d.href} prefetch onNavigate={onNavigate} aria-label={d.label}
          aria-current={actual === d.href ? 'page' : undefined} data-marcado={marcado === d.href || undefined}>
      <span><Icon name={d.icon} strokeWidth={d.icon === 'users' || (d.icon === 'user' && marcado === d.href) ? 2.4 : 2.2} /></span>
    </Link>
  )
}
