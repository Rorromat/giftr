import Link from 'next/link'
import { archiveItemAction, restoreItemAction } from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { PrioritySelect } from '@/components/PrioritySelect'
import { Icon, ItemPhoto, PriceSticker, PriorityTag } from '@/components/ui'
import type { OwnerItemView } from '@/lib/serialize'
import { textoDueno } from '@/lib/compartir'

// Collage de 2 columnas: alto de foto, giro de la card y giro del precio, alternados cada 4.
const COLLAGE = [
  { foto: 182, giro: -1.2, precio: -6 },
  { foto: 150, giro: 1, precio: 5 },
  { foto: 150, giro: 0.8, precio: -5 },
  { foto: 182, giro: -1, precio: 4 },
]

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
      <BotonEnviar className="gr-btn-primary gr-btn--sm w-full rounded-[14px] text-[15px]">Sí, sacarlo</BotonEnviar>
    </form>
  )
}

/** Los deseos activos del dueño agrupados por categoría (Mi lista y la lista de un grupo). Nunca muestra reservas. */
export function OwnerItemsGrid({ items, shareToken }: { items: OwnerItemView[]; shareToken: string }) {
  const porCategoria = Object.groupBy(items, (i) => i.categoria ?? 'Sin categoría')
  return Object.entries(porCategoria).map(([cat, catItems]) => (
    <section key={cat} className="mt-1.5 flex flex-col gap-3">
      <h2 className="gr-label">{cat}</h2>
      <ul className="grid grid-cols-2 items-start gap-x-3.5 gap-y-5 pr-[5px]">
        {catItems!.map((item, i) => {
          const c = COLLAGE[i % COLLAGE.length]
          const precio = item.precio ?? item.rangoPrecio
          return (
            // Toda la card abre el deseo (el ::after del título la cubre); el menú y la prioridad van por arriba.
            <li key={item.id} className="gr-sticker relative even:mt-[18px]" style={{ transform: `rotate(${c.giro}deg)` }}>
              <div className="relative">
                <ItemPhoto src={item.fotoUrl} titulo={item.titulo} height={c.foto} />
                <PriorityTag prioridad={item.prioridad} className="absolute left-2.5 top-2.5" />
                {precio && <PriceSticker rotate={c.precio}>{precio}</PriceSticker>}
                <details className="group">
                  <summary aria-label={`Opciones de ${item.titulo}`}
                           className="absolute right-0.5 top-0.5 z-[2] flex size-11 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden">
                    <span className="flex size-8 items-center justify-center rounded-full border-[2.5px] border-gr-ink bg-gr-surface group-open:bg-gr-ink group-open:text-gr-bg">
                      <Icon name="more" size={18} strokeWidth={2.6} />
                    </span>
                  </summary>
                  <div className="absolute inset-x-2 top-12 z-10 flex flex-col overflow-hidden rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface shadow-sticker-sm">
                    <Link href={`/editar/${item.id}`} className="flex min-h-11 items-center px-3 text-sm font-bold">Editar</Link>
                    {/* El link del deseo es el de quien regala: WhatsApp muestra la foto y el precio */}
                    <a target="_blank" className="flex min-h-11 items-center border-t-[2.5px] border-gr-ink px-3 text-sm font-bold"
                       href={`https://wa.me/?text=${encodeURIComponent(textoDueno(item, `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${shareToken}/item/${item.id}`))}`}>
                      Mandar por WhatsApp
                    </a>
                    {/* Sacarlo pide confirmar (ver ConfirmarSacar) */}
                    {ARCHIVAR.map(([estado, texto]) => (
                      <details key={estado} className="border-t-[2.5px] border-gr-ink">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-sm font-bold [&::-webkit-details-marker]:hidden">
                          {texto}
                        </summary>
                        <ConfirmarSacar itemId={item.id} estado={estado} />
                      </details>
                    ))}
                  </div>
                </details>
              </div>
              <div className="flex flex-col gap-0.5 px-[11px] pb-[11px] pt-[9px]">
                <Link href={`/deseo/${item.id}`}
                      className="font-display text-base leading-tight font-extrabold tracking-[-0.02em] [overflow-wrap:anywhere] after:absolute after:inset-0 after:z-[1]">
                  {item.titulo}
                </Link>
                <div className="relative z-[2] self-start">
                  <PrioritySelect itemId={item.id} prioridad={item.prioridad} />
                </div>
                {item.notas && <p className="text-xs text-gr-muted [overflow-wrap:anywhere]">{item.notas}</p>}
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
    <details className="mt-4 flex flex-col">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 self-start text-sm font-bold underline decoration-2 underline-offset-4 [&::-webkit-details-marker]:hidden">
        Archivados ({items.length})
      </summary>
      <ul className="mt-1 flex flex-col divide-y-2 divide-dashed divide-gr-dot rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface px-3">
        {/* los últimos primero */}
        {[...items].reverse().map((item) => (
          <li key={item.id} className="flex min-h-14 items-center gap-3 py-2">
            <span className="min-w-0 flex-1 text-sm leading-snug">
              <span className="font-bold [overflow-wrap:anywhere]">{item.titulo}</span>
              <span className="block text-xs font-medium text-gr-muted">
                {item.estadoDueno === 'lo_tengo' ? (grupo ? 'Ya lo tienen' : 'Ya lo tenés') : grupo ? 'Ya no lo quieren' : 'Ya no lo querés'}
              </span>
            </span>
            <form action={restoreItemAction}>
              <input type="hidden" name="itemId" value={item.id} />
              <BotonEnviar className="gr-btn min-h-11 px-2.5 font-sans text-[13px] font-bold">{grupo ? 'Volver a la lista' : 'Volver a mi lista'}</BotonEnviar>
            </form>
          </li>
        ))}
      </ul>
    </details>
  )
}
