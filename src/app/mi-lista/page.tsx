import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { getOwnList } from '@/lib/lists'
import { Banners } from '@/components/Banners'
import { OwnerItemsGrid } from '@/components/OwnerItemsGrid'
import { BottomNav, Icon, LogoSticker, Starburst } from '@/components/ui'

export default async function MiLista() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const lista = await getOwnList(db, session.userId)
  if (!lista) redirect('/')

  const activos = lista.items.filter((i) => i.estadoDueno === 'activo')
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

      <OwnerItemsGrid items={activos} />

      <a href={`https://wa.me/?text=${waText}`} target="_blank"
         className="gr-btn gr-btn--dark fixed bottom-[104px] left-1/2 z-10 h-[54px] -translate-x-1/2 -rotate-2 whitespace-nowrap rounded-[18px] border-[3px] px-[22px]">
        <Icon name="chat" size={20} strokeWidth={2.4} />
        Mandala por WhatsApp
      </a>

      <BottomNav active="mi-lista" />
    </main>
  )
}
