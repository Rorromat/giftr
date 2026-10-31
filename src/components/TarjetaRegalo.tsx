import Link from 'next/link'
import { Arte, Heart, Mono } from '@/components/ui'

/**
 * Un deseo como regalo posible (los estantes de Inicio): la foto en su tarjeta, con el moño pegado en la esquina como en un
 * paquete, qué es y el precio en el verde. Es lo que la distingue de las fechas (que llevan la hojita de calendario, ver
 * Faltan). corazones: cuánto lo quiere, al lado del precio. estado: lo que ya no está libre. pie: lo de abajo (quién lo
 * agregó y cuándo). Toda la tarjeta lleva al deseo.
 */
export function TarjetaRegalo({ href, foto, titulo, precio, apagado = false, corazones, estado, pie }: {
  href: string
  foto: string | null
  titulo: string
  precio: string | null
  apagado?: boolean
  corazones?: number
  estado?: string | null
  pie?: React.ReactNode
}) {
  return (
    <Link href={href} className="gr-regalo">
      <div className="relative">
        <Arte src={foto} titulo={titulo} apagado={apagado} className="rounded-[16px]" />
        <Mono borde="#FFFFFF" className="gr-regalo__mono" />
      </div>
      <div className="flex flex-1 flex-col gap-1 px-1.5 pb-1">
        <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">{titulo}</h3>
        {(precio || corazones) && (
          <div className="flex items-center justify-between gap-2">
            {precio ? <span className="gr-regalo__precio">{precio}</span> : <span />}
            {corazones && (
              <span role="img" aria-label={`${corazones} de 3 corazones`} className="flex flex-none gap-px text-gr-acento-texto">
                {[1, 2, 3].map((n) => <span key={n} className={n <= corazones ? '' : 'opacity-25'}><Heart size={12} /></span>)}
              </span>
            )}
          </div>
        )}
        {estado && (
          <span className="flex items-center gap-1.5 text-xs font-bold">
            <i aria-hidden className="size-[7px] rounded-full bg-gr-acento" />{estado}
          </span>
        )}
        {pie && <div className="mt-auto pt-1">{pie}</div>}
      </div>
    </Link>
  )
}
