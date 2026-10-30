import { Icon, Tapa } from '@/components/ui'

/**
 * La tapa de una lista propia (Mi lista y la de un grupo): su color de arriba a abajo, el nombre enorme con cuántos deseos
 * hay al lado, la próxima fecha y el botón blanco para mandarla por WhatsApp. Nunca dice nada de reservas.
 */
export function ListaHero({ color, arriba, etiqueta, titulo, cantidad, fecha, waHref, foto, children }: {
  /** La tapa: la tuya en Mi lista, la de la lista en un grupo (ver lib/tapas.ts). */
  color: string
  /** La barra de arriba, sobre la tapa (el logo y la campanita, o volver). */
  arriba: React.ReactNode
  etiqueta: string
  titulo: string
  cantidad: number
  /** "tu cumple es en 23 días, el lunes 2 de noviembre", o null si no hay fecha. */
  fecha: React.ReactNode
  waHref: string
  /** La foto de una lista en común, arriba del nombre (ver FotoDeLista). */
  foto?: React.ReactNode
  children?: React.ReactNode
}) {
  const deseos = cantidad === 0 ? 'Todavía sin deseos' : `${cantidad} ${cantidad === 1 ? 'deseo' : 'deseos'}`
  return (
    <Tapa color={color}>
      {arriba}
      <div className="mt-5 flex flex-col gap-3.5">
        {foto}
        <p className="gr-label [overflow-wrap:anywhere]">{etiqueta}</p>
        <div className="flex items-end justify-between gap-3">
          <h1 className="gr-title min-w-0 text-[clamp(38px,12vw,52px)] [overflow-wrap:anywhere]">{titulo}</h1>
          {cantidad > 0 && (
            <span aria-hidden className="gr-number flex-none text-[clamp(38px,12vw,52px)] opacity-55">{cantidad}</span>
          )}
        </div>
        <p className="gr-tapa__sub text-sm">{deseos}{fecha && <> · {fecha}</>}</p>
        {children}
        <a href={waHref} target="_blank" className="gr-btn gr-btn--blanco min-h-[50px] w-full gap-2">
          <Icon name="chat" size={19} />
          Mandala por WhatsApp
        </a>
      </div>
    </Tapa>
  )
}
