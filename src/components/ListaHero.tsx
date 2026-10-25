import { Icon, Starburst } from '@/components/ui'

/**
 * La tarjeta destacada de una lista propia (Mi lista y la de un grupo): cuántos deseos hay en la estrella, la próxima
 * fecha y el botón para mandarla por WhatsApp. Nunca dice nada de reservas.
 * La estrella queda a 22 de arriba y a 30 de la derecha de la tarjeta: en Mi lista es donde termina la estrella de la
 * animación de inicio (ver Arranque y .gr-arranque__vuelo).
 */
export function ListaHero({ etiqueta, titulo, cantidad, fecha, waHref, destino = false, children }: {
  etiqueta: string
  titulo: string
  cantidad: number
  /** "Tu cumple es en 23 días", o null si no hay fecha. */
  fecha: React.ReactNode
  waHref: string
  /** Mi lista: la estrella del arranque termina en el contador. */
  destino?: boolean
  children?: React.ReactNode
}) {
  return (
    <section className="gr-hero flex flex-col gap-4 p-5" data-arranque-destino={(destino && cantidad > 0) || undefined}>
      <div className="flex min-h-[84px] flex-col gap-1.5 pr-[86px]">
        <p className="text-xs font-semibold tracking-[0.08em] text-white/60 uppercase [overflow-wrap:anywhere]">{etiqueta}</p>
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">{titulo}</h1>
        <p className="text-sm text-white/70">{cantidad === 0 ? 'Todavía sin deseos' : `${cantidad} ${cantidad === 1 ? 'deseo' : 'deseos'}`}</p>
      </div>
      {cantidad > 0 && (
        <Starburst label={`${cantidad} ${cantidad === 1 ? 'deseo' : 'deseos'}`} fontSize={cantidad > 99 ? 30 : 40}
                   className="absolute right-[30px] top-[22px]">
          {cantidad}
        </Starburst>
      )}

      {fecha && (
        <p className="flex items-center gap-2 self-start rounded-full bg-white/10 py-1.5 pl-2.5 pr-3.5 text-sm font-medium">
          <Icon name="cake" size={16} className="flex-none text-gr-accent" />{fecha}
        </p>
      )}
      {children}

      <a href={waHref} target="_blank" className="gr-btn gr-btn--accent w-full gap-2">
        <Icon name="chat" size={19} />
        Mandala por WhatsApp
      </a>
    </section>
  )
}
