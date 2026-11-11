import { Icon } from '@/components/ui'
import { BarraDeLaFicha } from '@/components/FichaDeseo'

/**
 * Cómo se regala un deseo libre, sin elegir nada antes: "Reservar" (para él) es el botón de la barra de abajo, con la tienda
 * al lado (secundaria), y sale de un toque. Antes había que tocar "Reservar", elegir entre "Lo compro yo" y "Lo dividimos"
 * sin ninguno marcado, y recién ahí reservar: tres toques para lo que hace casi todo el mundo.
 * El regalo grupal es lo de menos veces: queda en el deseo como acción secundaria, "Armar regalo grupal", que se abre para
 * elegir con quiénes (un <details>: anda sin esperar a que cargue la página). grupal: solo para quien puede armarlo, con
 * su cuenta (las cuentas del regalo tienen que tener dueño); a un invitado sin cuenta no se le ofrece lo que no puede hacer.
 */
export function ComoLoRegalas({ reservar, grupal, secundaria }: {
  reservar: React.ReactNode; grupal?: React.ReactNode; secundaria?: React.ReactNode
}) {
  return (
    <>
      {grupal && (
        <details className="group flex flex-col">
          <summary className="gr-btn min-h-11 w-full list-none gap-2 px-3.5 text-[15px] [&::-webkit-details-marker]:hidden">
            <Icon name="users" size={18} strokeWidth={2} />Armar regalo grupal
          </summary>
          <div className="gr-card mt-2.5 flex flex-col gap-3 p-3.5">
            <p className="text-[13px] leading-snug text-gr-muted">
              Lo comprás vos y lo dividen en partes iguales con los amigos que se sumen. Queda todo anotado en Cuentas.
            </p>
            {grupal}
          </div>
        </details>
      )}
      <BarraDeLaFicha secundaria={secundaria}>{reservar}</BarraDeLaFicha>
    </>
  )
}
