import Link from 'next/link'
import { archiveItemAction, restoreItemAction } from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { PrioritySelect } from '@/components/PrioritySelect'
import { Arte, Icon } from '@/components/ui'
import type { OwnerItemView } from '@/lib/serialize'
import { textoDueno } from '@/lib/compartir'
import { paraBuscar } from '@/lib/buscar'

export const ARCHIVAR = [['lo_tengo', 'Ya lo tengo'], ['no_lo_quiero', 'Ya no lo quiero']] as const

/**
 * Confirmar que sale de la lista (un toque sin querer lo hacía desaparecer). El texto es siempre el mismo: no dice nada
 * de reservas. volver: adónde ir después (desde la pantalla del deseo, que archivado ya no se abre).
 */
export function ConfirmarSacar({ itemId, estado, volver }: { itemId: string; estado: (typeof ARCHIVAR)[number][0]; volver?: string }) {
  return (
    <form action={archiveItemAction} className="flex flex-col gap-2 px-3 pb-3">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="estado" value={estado} />
      {volver && <input type="hidden" name="volver" value={volver} />}
      <p className="text-xs font-medium leading-snug">Sale de la lista. Si te arrepentís, lo volvés a poner desde Archivados, abajo de todo.</p>
      <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">Sí, sacarlo</BotonEnviar>
    </form>
  )
}

/**
 * Los deseos activos del dueño agrupados por categoría (Mi lista y la lista de un grupo), cada uno en su cuadrado de color.
 * Nunca muestra reservas. agregado: el que se acaba de agregar, que entra primero con "Nuevo" (ver RecienAgregado).
 */
export function OwnerItemsGrid({ items, shareToken, agregado }: { items: OwnerItemView[]; shareToken: string; agregado?: string }) {
  // el recién agregado primero, y su categoría arriba (groupBy deja las categorías en el orden en que aparecen)
  const ordenados = agregado ? [...items].sort((a, b) => Number(b.id === agregado) - Number(a.id === agregado)) : items
  const porCategoria = Object.groupBy(ordenados, (i) => i.categoria ?? 'Sin categoría')
  return Object.entries(porCategoria).map(([cat, catItems]) => (
    <section key={cat} data-buscar-grupo className="flex flex-col gap-2.5">
      <h3 className="gr-label">{cat}</h3>
      <ul className="grid grid-cols-2 items-start gap-x-3 gap-y-[18px]">
        {catItems!.map((item) => {
          const precio = item.precio ?? item.rangoPrecio
          return (
            // Toda la card abre el deseo (el ::after del título la cubre); el menú y la prioridad van por arriba.
            <li key={item.id} id={`d-${item.id}`} data-buscar={paraBuscar(`${item.titulo} ${item.categoria ?? ''} ${item.notas ?? ''}`)}
                className="relative flex scroll-mt-24 flex-col gap-2">
              <div className="relative">
                <Arte id={item.id} src={item.fotoUrl} titulo={item.titulo} />
                {item.id === agregado && (
                  <span className="pointer-events-none absolute left-2 top-2 z-[1] rounded-full bg-gr-acento px-2 py-0.5 text-[11px] font-extrabold text-gr-on-acento">Nuevo</span>
                )}
                <details className="group">
                  <summary aria-label={`Opciones de ${item.titulo}`}
                           className="absolute right-0.5 top-0.5 z-[2] flex size-11 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden">
                    <span className="flex size-8 items-center justify-center rounded-full bg-white/95 text-[#121216] shadow-[0_1px_4px_rgb(20_20_20/0.14)] group-open:bg-gr-brand group-open:text-gr-on-brand">
                      <Icon name="more" size={18} strokeWidth={2.2} />
                    </span>
                  </summary>
                  <div className="absolute inset-x-2 top-12 z-10 flex flex-col overflow-hidden rounded-2xl border border-gr-line bg-gr-surface shadow-float">
                    <Link href={`/editar/${item.id}`} className="flex min-h-11 items-center px-3 text-sm font-semibold">Editar</Link>
                    {/* El link del deseo es el de quien regala: WhatsApp muestra la foto y el precio */}
                    <a target="_blank" className="flex min-h-11 items-center border-t border-gr-line px-3 text-sm font-semibold"
                       href={`https://wa.me/?text=${encodeURIComponent(textoDueno(item, `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${shareToken}/item/${item.id}`))}`}>
                      Mandar por WhatsApp
                    </a>
                    {/* Sacarlo pide confirmar (ver ConfirmarSacar) */}
                    {ARCHIVAR.map(([estado, texto]) => (
                      <details key={estado} className="border-t border-gr-line">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                          {texto}
                        </summary>
                        <ConfirmarSacar itemId={item.id} estado={estado} />
                      </details>
                    ))}
                  </div>
                </details>
              </div>
              <div className="flex flex-col gap-0.5 px-0.5">
                <Link href={`/deseo/${item.id}`}
                      className="text-[15px] leading-tight font-bold tracking-[-0.01em] [overflow-wrap:anywhere] after:absolute after:inset-0 after:z-[1]">
                  {item.titulo}
                </Link>
                {precio && <p className="text-[13px] text-gr-muted tabular-nums">{precio}</p>}
                <div className="relative z-[2] self-start">
                  <PrioritySelect itemId={item.id} prioridad={item.prioridad} />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  ))
}

/**
 * Los deseos que salieron de la lista ("Ya lo tengo", "Ya no lo quiero"), para volver a ponerlos con todo lo que tenían.
 * Como el resto de la vista del dueño, sin nada de reservas.
 */
export function Archivados({ items, grupo = false }: { items: OwnerItemView[]; grupo?: boolean }) {
  if (!items.length) return null
  return (
    <details className="flex flex-col">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 self-start text-sm font-semibold text-gr-muted [&::-webkit-details-marker]:hidden">
        Archivados ({items.length})
      </summary>
      <ul className="gr-card mt-1 flex flex-col divide-y divide-gr-line px-3.5">
        {/* los últimos primero */}
        {[...items].reverse().map((item) => (
          <li key={item.id} className="flex min-h-14 items-center gap-3 py-2">
            <span className="min-w-0 flex-1 text-sm leading-snug">
              <span className="font-semibold [overflow-wrap:anywhere]">{item.titulo}</span>
              <span className="block text-xs font-medium text-gr-muted">
                {item.estadoDueno === 'lo_tengo' ? (grupo ? 'Ya lo tienen' : 'Ya lo tenés') : grupo ? 'Ya no lo quieren' : 'Ya no lo querés'}
              </span>
            </span>
            <form action={restoreItemAction}>
              <input type="hidden" name="itemId" value={item.id} />
              <BotonEnviar className="gr-btn min-h-11 px-2.5 text-[13px]">{grupo ? 'Volver a la lista' : 'Volver a mi lista'}</BotonEnviar>
            </form>
          </li>
        ))}
      </ul>
    </details>
  )
}
