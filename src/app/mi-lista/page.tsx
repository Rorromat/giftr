import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { getOwnList } from '@/lib/lists'
import { archiveItemAction } from '@/app/actions'
import { Banners } from '@/components/Banners'
import { PrioritySelect } from '@/components/PrioritySelect'

export default async function MiLista() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const lista = await getOwnList(db, session.userId)
  if (!lista) redirect('/')

  const activos = lista.items.filter((i) => i.estadoDueno === 'activo')
  const porCategoria = Object.groupBy(activos, (i) => i.categoria ?? 'Sin categoría')
  const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${lista.shareToken}`
  const waText = encodeURIComponent(`Armé mi lista de deseos en GiftR 🎁 ${shareUrl}`)

  return (
    <main className="pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mi lista</h1>
        <Link href="/agregar" className="rounded-full bg-[#E2725B] px-4 py-2 text-sm font-semibold text-white">+ Agregar</Link>
      </div>
      <Banners />

      <a href={`https://wa.me/?text=${waText}`} target="_blank"
         className="mt-4 block rounded-2xl bg-green-600 py-3 text-center font-semibold text-white shadow-md">
        Compartir por WhatsApp
      </a>

      {activos.length === 0 && (
        <p className="mt-12 text-center text-stone-500">
          Agregá lo primero que se te venga a la cabeza.<br />¿Un link? Pegalo en “Agregar”.
        </p>
      )}

      {Object.entries(porCategoria).map(([cat, catItems]) => (
        <section key={cat} className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{cat}</h2>
          <ul className="mt-2 space-y-3">
            {catItems!.map((item) => (
              <li key={item.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="font-semibold">{item.titulo}</p>
                    <div className="flex items-center gap-1 text-sm text-stone-500">
                      <span>{item.precio ?? item.rangoPrecio ?? ''}</span> ·
                      <PrioritySelect itemId={item.id} prioridad={item.prioridad} />
                    </div>
                    {item.notas && <p className="mt-1 text-sm text-stone-600">{item.notas}</p>}
                  </div>
                  <form action={archiveItemAction} className="flex flex-col gap-1 text-xs">
                    <input type="hidden" name="itemId" value={item.id} />
                    <button name="estado" value="lo_tengo" className="rounded-lg border px-2 py-1 text-stone-500">Ya lo tengo</button>
                    <button name="estado" value="no_lo_quiero" className="rounded-lg border px-2 py-1 text-stone-500">Ya no lo quiero</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
