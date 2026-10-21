import Link from 'next/link'
import { archiveItemAction } from '@/app/actions'
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
            <li key={item.id} className="gr-sticker even:mt-[18px]" style={{ transform: `rotate(${c.giro}deg)` }}>
              <div className="relative">
                <ItemPhoto src={item.fotoUrl} titulo={item.titulo} height={c.foto} />
                <PriorityTag prioridad={item.prioridad} className="absolute left-2.5 top-2.5" />
                {precio && <PriceSticker rotate={c.precio}>{precio}</PriceSticker>}
                <details className="group">
                  <summary aria-label={`Opciones de ${item.titulo}`}
                           className="absolute right-0.5 top-0.5 flex size-11 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden">
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
                    <form action={archiveItemAction} className="flex flex-col">
                      <input type="hidden" name="itemId" value={item.id} />
                      <button name="estado" value="lo_tengo" className="min-h-11 border-t-[2.5px] border-gr-ink px-3 text-left text-sm font-bold">Ya lo tengo</button>
                      <button name="estado" value="no_lo_quiero" className="min-h-11 border-t-[2.5px] border-gr-ink px-3 text-left text-sm font-bold">Ya no lo quiero</button>
                    </form>
                  </div>
                </details>
              </div>
              <div className="flex flex-col gap-0.5 px-[11px] pb-[11px] pt-[9px]">
                <p className="font-display text-base leading-tight font-extrabold tracking-[-0.02em] [overflow-wrap:anywhere]">{item.titulo}</p>
                <PrioritySelect itemId={item.id} prioridad={item.prioridad} />
                {item.notas && <p className="text-xs text-gr-muted [overflow-wrap:anywhere]">{item.notas}</p>}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  ))
}
