import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { getOwnList } from '@/lib/lists'
import { archiveItemAction } from '@/app/actions'
import { Banners } from '@/components/Banners'
import { PrioritySelect } from '@/components/PrioritySelect'
import { BottomNav, Icon, ItemPhoto, LogoSticker, PriceSticker, PriorityTag, Starburst } from '@/components/ui'

// Collage de 2 columnas: alto de foto, giro de la card y giro del precio, alternados cada 4.
const COLLAGE = [
  { foto: 182, giro: -1.2, precio: -6 },
  { foto: 150, giro: 1, precio: 5 },
  { foto: 150, giro: 0.8, precio: -5 },
  { foto: 182, giro: -1, precio: 4 },
]

export default async function MiLista() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const lista = await getOwnList(db, session.userId)
  if (!lista) redirect('/')

  const activos = lista.items.filter((i) => i.estadoDueno === 'activo')
  const porCategoria = Object.groupBy(activos, (i) => i.categoria ?? 'Sin categoría')
  // Un solo collage (mantiene el orden agrupado por categoría); las categorías pasan a ser las pistas de "Te gusta".
  const enOrden = Object.values(porCategoria).flatMap((items) => items ?? [])
  const gustos = activos.flatMap((i) => (i.categoria ? [i.categoria] : [])).filter((c, i, all) => all.indexOf(c) === i)
  const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${lista.shareToken}`
  const waText = encodeURIComponent(`Armé mi lista de deseos en GiftR 🎁 ${shareUrl}`)

  return (
    <main className="flex flex-col gap-3.5 pb-48 pt-[52px]">
      <div className="flex items-center justify-between">
        <LogoSticker />
        <Link href="/agregar" className="gr-btn-primary gr-btn--sm min-h-11 rotate-2 rounded-[14px]">+ Agregar</Link>
      </div>

      <div className="relative flex flex-col gap-1">
        <h1 className="gr-title">Mi lista</h1>
        <p className="text-[15px] font-medium">Pedí lo que querés sin pedirlo.</p>
        {activos.length > 0 && (
          <Starburst label={`${activos.length} ${activos.length === 1 ? 'deseo' : 'deseos'}`}
                     fontSize={activos.length > 99 ? 30 : 40} className="absolute -top-1 right-[30px] rotate-12">
            {activos.length}
          </Starburst>
        )}
      </div>

      <Banners />

      {activos.length === 0 && (
        <div className="relative mt-6 rounded-sticker border-[2.5px] border-dashed border-gr-ink px-5 py-8 text-center text-[15px] font-medium">
          <Starburst size={52} fontSize={50} className="absolute -right-2 -top-6 rotate-12">+</Starburst>
          Agregá lo primero que se te venga a la cabeza.<br />¿Un link? Pegalo en “Agregar”.
        </div>
      )}

      {gustos.length > 0 && (
        <div className="-mx-[18px] flex items-center gap-2 overflow-x-auto px-[18px] py-1">
          <h2 className="gr-label flex-none tracking-[0.06em]">Te gusta</h2>
          {gustos.map((g, i) => (
            <span key={g} className="gr-chip h-[34px] flex-none cursor-default px-3 text-[13px]"
                  style={{ transform: `rotate(${[-3, 2, -1][i % 3]}deg)` }}>
              {g}
            </span>
          ))}
        </div>
      )}

      {enOrden.length > 0 && (
        <ul className="mt-1 grid grid-cols-2 items-start gap-x-3.5 gap-y-5 pr-[5px]">
          {enOrden.map((item, i) => {
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
                    <form action={archiveItemAction}
                          className="absolute inset-x-2 top-12 z-10 flex flex-col overflow-hidden rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface shadow-sticker-sm">
                      <input type="hidden" name="itemId" value={item.id} />
                      <button name="estado" value="lo_tengo" className="min-h-11 px-3 text-left text-sm font-bold">Ya lo tengo</button>
                      <button name="estado" value="no_lo_quiero" className="min-h-11 border-t-[2.5px] border-gr-ink px-3 text-left text-sm font-bold">Ya no lo quiero</button>
                    </form>
                  </details>
                </div>
                <div className="flex flex-col gap-0.5 px-[11px] pb-[11px] pt-[9px]">
                  <p className="font-display text-base leading-tight font-extrabold tracking-[-0.02em] [overflow-wrap:anywhere]">{item.titulo}</p>
                  <PrioritySelect itemId={item.id} prioridad={item.prioridad} />
                  {item.notas && <p className="line-clamp-2 text-xs text-gr-muted">{item.notas}</p>}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <a href={`https://wa.me/?text=${waText}`} target="_blank"
         className="gr-btn gr-btn--dark fixed bottom-[104px] left-1/2 z-10 h-[54px] -translate-x-1/2 -rotate-2 whitespace-nowrap rounded-[18px] border-[3px] px-[22px]">
        <Icon name="chat" size={20} strokeWidth={2.4} />
        Mandala por WhatsApp
      </a>

      <BottomNav active="mi-lista" />
    </main>
  )
}
