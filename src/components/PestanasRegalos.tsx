'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const PESTANAS = [
  { href: '/regalos', nombre: 'Mis regalos', titulo: 'Tus regalos', bajada: 'Lo que reservaste, los regalos grupales en los que estás y tus amigos invisibles.' },
  { href: '/cuentas', nombre: 'Cuentas', titulo: 'Cuentas', bajada: 'Los regalos grupales: quién le debe a quién.' },
]

/**
 * El título y las pestañas de Mis regalos y Cuentas. Vive en el layout de las dos (ver (regalos)/layout.tsx), así que al
 * pasar de una a otra no se vuelve a montar: la pastilla negra se desliza y el título cambia desde el toque mismo, como
 * la barra de abajo (ver BottomNav). Las dos se precargan completas, así el cambio suele ser instantáneo; si no, lo de
 * abajo se apaga hasta que llega la otra.
 */
export function PestanasRegalos() {
  const path = usePathname()
  // La pestaña tocada, mientras la navegación todavía no cambió la URL; apenas cambia se olvida (como en BottomNav).
  const [toque, setToque] = useState<{ href: string; desde: string } | null>(null)
  if (toque && toque.desde !== path) setToque(null)
  const pendiente = !!toque && toque.desde === path && toque.href !== path
  const marcada = pendiente ? toque.href : path
  const i = Math.max(0, PESTANAS.findIndex((p) => p.href === marcada))
  const { titulo, bajada } = PESTANAS[i]
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="gr-title">{titulo}</h1>
        <p className="text-[15px] text-gr-muted">{bajada}</p>
      </div>
      {/* pendiente: mientras llega la otra, lo de abajo se apaga (ver .gr-segmented--desliza en tokens.css) */}
      <nav aria-label="Regalos y cuentas" className="gr-segmented gr-segmented--desliza" data-columna={i} data-pendiente={pendiente || undefined}>
        {PESTANAS.map((p) => (
          <Link key={p.href} href={p.href} prefetch onNavigate={() => setToque({ href: p.href, desde: path })}
                aria-current={path === p.href ? 'page' : undefined} data-marcado={marcada === p.href || undefined}>
            {p.nombre}
          </Link>
        ))}
      </nav>
    </>
  )
}
