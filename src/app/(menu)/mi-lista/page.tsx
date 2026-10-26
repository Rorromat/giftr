import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { getOwnList } from '@/lib/lists'
import { nombresDeMisGrupos } from '@/lib/groups'
import { necesitaBienvenida } from '@/lib/bienvenida'
import { miFoto } from '@/lib/perfil'
import { diasEntre, fechaLarga, hoyLocal, miCumple, proximaFecha } from '@/lib/events'
import { Banners } from '@/components/Banners'
import { Archivados, OwnerItemsGrid } from '@/components/OwnerItemsGrid'
import { ListaHero } from '@/components/ListaHero'
import { RecienAgregado } from '@/components/RecienAgregado'
import { Buscador } from '@/components/Buscador'
import { BUSCAR_DESDE } from '@/lib/buscar'
import { AppHeader, Icon, Seccion, SectionHeader } from '@/components/ui'

export default async function MiLista({ searchParams }: { searchParams: Promise<{ agregado?: string }> }) {
  const { agregado } = await searchParams
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [lista, bienvenida, grupos, foto, cumple] = await Promise.all([
    getOwnList(db, session.userId), necesitaBienvenida(db, session.userId), nombresDeMisGrupos(db, session.userId), miFoto(db, session.userId),
    miCumple(db, session.userId),
  ])
  if (!lista) redirect('/')
  // La primera vez que entra: los pasos de bienvenida con sus gustos.
  if (bienvenida) redirect('/bienvenida')

  const activos = lista.items.filter((i) => i.estadoDueno === 'activo')
  const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${lista.shareToken}`
  const waText = encodeURIComponent(`Armé mi lista de deseos en GiftR 🎁 ${shareUrl}`)
  const nombre = session.user?.name ?? session.user?.email ?? 'Vos'
  const hoy = hoyLocal()
  const fechaCumple = cumple ? proximaFecha(cumple.dia, cumple.mes, hoy) : null
  const dias = fechaCumple ? diasEntre(hoy, fechaCumple) : null

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      {/* Vos: tu lista y, tocando tu foto, tu perfil. La barra mide 56 y la tarjeta arranca a 84 de arriba: su estrella
          queda donde la busca la animación de inicio (ver ListaHero). */}
      <AppHeader nombre={nombre} foto={foto} />

      <ListaHero
        destino
        etiqueta={nombre.split(' ')[0]}
        titulo="Mi lista"
        cantidad={activos.length}
        waHref={`https://wa.me/?text=${waText}`}
        fecha={fechaCumple
          ? <>Tu cumple {dias === 0 ? 'es hoy' : dias === 1 ? 'es mañana' : `es en ${dias} días`} · {fechaLarga(fechaCumple)}</>
          : <Link href="/perfil#cumple" className="underline underline-offset-4">Cargá tu cumple</Link>}
      />

      {/* Tus listas: la tuya y las que armás con otros (grupos) */}
      <nav aria-label="Tus listas" className="-mx-[18px] flex gap-2 overflow-x-auto px-[18px] py-1 [scrollbar-width:none]">
        <Link href="/mi-lista" aria-current="page" className="gr-chip">Mi lista</Link>
        {grupos.map((g) => <Link key={g.id} href={`/grupos/${g.id}`} className="gr-chip">{g.nombre}</Link>)}
        <Link href="/grupos/nuevo" className="gr-chip">+ Lista en común</Link>
      </nav>

      <Banners />

      {activos.length === 0 ? (
        <div className="gr-empty flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-gr-surface shadow-card"><Icon name="gift" size={26} /></span>
          <p>Agregá lo primero que se te venga a la cabeza.<br />¿Un link? Pegalo en “Agregar”.</p>
          <Link href="/agregar" className="gr-btn-primary gr-btn--sm">Agregar un deseo</Link>
        </div>
      ) : (
        <SectionHeader title="Tus deseos" href="/agregar" linkLabel="+ Agregar" />
      )}

      {activos.length >= BUSCAR_DESDE && <Buscador ambito="mis-deseos" placeholder="Buscar en tu lista" vacio="No tenés ningún deseo con «%s»." />}
      <div id="mis-deseos" className="flex flex-col gap-5">
        <OwnerItemsGrid items={activos} shareToken={lista.shareToken} agregado={agregado} />
      </div>
      <Archivados items={lista.items.filter((i) => i.estadoDueno !== 'activo')} />
      {agregado && activos.some((i) => i.id === agregado) && <RecienAgregado id={agregado} otro="/agregar" />}
    </Seccion>
  )
}
