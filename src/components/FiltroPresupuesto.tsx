import Link from 'next/link'
import { Icon } from '@/components/ui'
import { plata } from '@/lib/pesos'
import { textoDelTope, type Presupuesto } from '@/lib/presupuesto'

// "Hasta $X" en la lista de alguien (ver presupuestoDeLista). Todo son links con ?hasta= (como cat y disp): se filtra en
// el servidor, el link filtrado se puede compartir y anda sin JS. Elegir el tope tampoco pide JS: el chip es un casillero
// y la fila de topes se abre con CSS (el contenedor lleva group/presupuesto).

/**
 * El chip de la fila de filtros. Sin tope elegido, "Hasta $…" abre los topes (abajo, ver TopesPresupuesto). Con uno, dice
 * cuál y tocarlo lo saca (sinTope: la misma lista con los otros filtros).
 */
export function ChipPresupuesto({ presupuesto, tope, sinTope }: { presupuesto: Presupuesto; tope: number | null; sinTope: string }) {
  if (tope) {
    const texto = textoDelTope(tope, presupuesto.moneda)
    return (
      <Link href={sinTope} aria-current="page" aria-label={`${texto}: sacar el tope`} className="gr-chip pr-3">
        {texto}<Icon name="close" size={14} strokeWidth={2.6} />
      </Link>
    )
  }
  return (
    <label className="gr-chip">
      <input type="checkbox" id="elegir-tope" className="sr-only" />
      <span className="sr-only">Filtrar por precio: </span>Hasta {presupuesto.moneda === 'USD' ? 'US$' : '$'}…
    </label>
  )
}

/**
 * Los topes de esta lista, en una fila que desliza como la de los filtros. Se ve con un tope elegido (para cambiarlo) o
 * cuando se tocó "Hasta $…". href: la lista con ese tope y los otros filtros que ya estaban.
 */
export function TopesPresupuesto({ presupuesto, tope, href }: { presupuesto: Presupuesto; tope: number | null; href: (tope: number) => string }) {
  return (
    <div role="group" aria-label="Hasta cuánto querés gastar"
         className={`-mx-[18px] items-center gap-2 overflow-x-auto px-[18px] py-1 [scrollbar-width:none] ${tope ? 'flex' : 'hidden group-has-[#elegir-tope:checked]/presupuesto:flex'}`}>
      <span aria-hidden className="flex-none text-[13px] font-semibold text-gr-muted">Hasta</span>
      {presupuesto.topes.map((t) => (
        <Link key={t} href={href(t)} aria-current={t === tope ? 'page' : undefined} aria-label={textoDelTope(t, presupuesto.moneda)}
              className="gr-chip tabular-nums">
          {plata(t, presupuesto.moneda)}
        </Link>
      ))}
    </div>
  )
}
