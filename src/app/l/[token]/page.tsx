import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { getListForViewer } from '@/lib/lists'
import { getViewer } from '@/lib/viewer'
import { GuestGate } from '@/components/GuestGate'
import { Banners } from '@/components/Banners'

export default async function ListaAjena({
  params, searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ cat?: string; disp?: string }>
}) {
  const { token } = await params
  const { cat, disp } = await searchParams
  const viewer = await getViewer()
  const vista = await getListForViewer(db, token, viewer)
  if (!vista) notFound()
  if (vista.role === 'owner') redirect('/mi-lista')

  const identified = !!viewer.userId || !!viewer.guestId
  const categorias = [...new Set(vista.items.map((i) => i.categoria).filter(Boolean))] as string[]
  let mostrados = vista.items
  if (cat) mostrados = mostrados.filter((i) => i.categoria === cat)
  if (disp === '1') mostrados = mostrados.filter((i) => i.disponible)
  // disponibles primero, comprados al fondo
  mostrados = [...mostrados].sort((a, b) => Number(b.disponible) - Number(a.disponible))

  return (
    <main className="pt-6">
      <h1 className="text-2xl font-bold">Lista de {vista.ownerNombre} 🎁</h1>
      <p className="text-sm text-stone-500">Elegí, reservá y no te duplicás con nadie.</p>
      <Banners />

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href={`/l/${token}`} className={`rounded-full border px-3 py-1 ${!cat && disp !== '1' ? 'border-[#E2725B] text-[#E2725B]' : 'border-stone-300 text-stone-600'}`}>Todos</Link>
        <Link href={`/l/${token}?disp=1`} className={`rounded-full border px-3 py-1 ${disp === '1' ? 'border-[#E2725B] text-[#E2725B]' : 'border-stone-300 text-stone-600'}`}>Disponibles</Link>
        {categorias.map((c) => (
          <Link key={c} href={`/l/${token}?cat=${encodeURIComponent(c)}`}
                className={`rounded-full border px-3 py-1 ${cat === c ? 'border-[#E2725B] text-[#E2725B]' : 'border-stone-300 text-stone-600'}`}>
            {c}
          </Link>
        ))}
      </div>

      {mostrados.length === 0 && (
        <p className="mt-12 text-center text-stone-500">Todavía no cargó nada — mandale un codazo 👉</p>
      )}

      <ul className="mt-4 space-y-3">
        {mostrados.map((item) => {
          const comprado = !item.disponible && item.claims.some((c) => c.estado === 'comprado')
          const yaEsMio = item.claims.some((c) => c.esMia)
          return (
            <li key={item.id} className={`rounded-2xl bg-white p-4 shadow-sm ${!item.disponible ? 'opacity-60' : ''}`}>
              <div className="flex gap-3">
                {item.fotoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- PoC: remote host images, no next/image config
                  <img src={item.fotoUrl} alt="" className="h-20 w-20 rounded-xl object-cover" />
                )}
                <div className="flex-1">
                  <Link href={`/l/${token}/item/${item.id}`} className="font-semibold">{item.titulo}</Link>
                  <p className="text-sm text-stone-500">{item.precio ?? item.rangoPrecio ?? ''}</p>
                  {item.cantidad > 1 && <p className="text-xs text-stone-400">quedan {item.quedan} de {item.cantidad}</p>}
                  <div className="mt-2 flex items-center justify-between">
                    {item.disponible
                      ? (yaEsMio
                          ? <span className="text-sm font-medium text-[#E2725B]">Ya lo reservaste 🤫</span>
                          : <GuestGate token={token} itemId={item.id} identified={identified} />)
                      : <span className={`text-sm font-medium ${comprado ? 'text-green-700' : 'text-[#E2725B]'}`}>
                          {comprado ? '✓ Comprado' : `Reservado por ${item.claims[0]?.claimerNombre ?? 'alguien'}`}
                        </span>}
                    <Link href={`/l/${token}/item/${item.id}`} className="text-sm text-stone-400">Ver más</Link>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
