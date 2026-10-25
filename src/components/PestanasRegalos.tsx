import Link from 'next/link'

/** Arriba de Mis regalos y de Cuentas (la misma pestaña de la barra): para pasar de una a otra. */
export function PestanasRegalos({ actual }: { actual: 'regalos' | 'cuentas' }) {
  return (
    <nav aria-label="Regalos y cuentas" className="gr-segmented">
      <Link href="/regalos" aria-current={actual === 'regalos' ? 'page' : undefined}>Mis regalos</Link>
      <Link href="/cuentas" aria-current={actual === 'cuentas' ? 'page' : undefined}>Cuentas</Link>
    </nav>
  )
}
