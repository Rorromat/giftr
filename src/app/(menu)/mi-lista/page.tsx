import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { avisosSinLeer } from '@/lib/bandeja'
import { getOwnList } from '@/lib/lists'
import { nombresDeMisGrupos } from '@/lib/groups'
import { necesitaBienvenida } from '@/lib/bienvenida'
import { yo } from '@/lib/perfil'
import { diasEntre, fechaLarga, hoyLocal, miCumple, proximaFecha } from '@/lib/events'
import { Banners } from '@/components/Banners'
import { Archivados, OwnerItemsGrid } from '@/components/OwnerItemsGrid'
import { ListaHero } from '@/components/ListaHero'
import { DeseoEliminado, RecienAgregado } from '@/components/RecienAgregado'
import { Buscador } from '@/components/Buscador'
import { BUSCAR_DESDE } from '@/lib/buscar'
import { tapaDe } from '@/lib/tapas'
import { AppHeader, Icon, Seccion, SectionHeader } from '@/components/ui'

export default async function MiLista({ searchParams }: { searchParams: Promise<{ agregado?: string; eliminado?: string }> }) {
  const { agregado, eliminado } = await searchParams
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [lista, bienvenida, grupos, { nombre: suNombre, foto }, cumple, avisos] = await Promise.all([
    getOwnList(db, session.userId), necesitaBienvenida(db, session.userId), nombresDeMisGrupos(db, session.userId), yo(db, session.userId),
    miCumple(db, session.userId), avisosSinLeer(db, { userId: session.userId }),
  ])
  if (!lista) redirect('/')
  // La primera vez que entra: los pasos de bienvenida con sus gustos.
  if (bienvenida) redirect('/bienvenida')

  const activos = lista.items.filter((i) => i.estadoDueno === 'activo')
  const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${lista.shareToken}`
  const waText = encodeURIComponent(`Armé mi lista de deseos en GiftR 🎁 ${shareUrl}`)
  const nombre = suNombre ?? session.user?.name ?? 'Vos'
  const hoy = hoyLocal()
  const fechaCumple = cumple ? proximaFecha(cumple.dia, cumple.mes, hoy) : null
  const dias = fechaCumple ? diasEntre(hoy, fechaCumple) : null
  const color = tapaDe(session.userId)
  const nuevo = agregado ? activos.find((i) => i.id === agregado) : undefined

  return (
    <Seccion className="flex flex-col gap-5 pb-48">
      {/* Vos: tu lista con tu tapa (tus amigos la ven con el mismo color) y, tocando tu foto, tu perfil */}
      <ListaHero
        color={color}
        arriba={<AppHeader id={session.userId} nombre={nombre} foto={foto} avisos={avisos} sobreTapa />}
        etiqueta={nombre.split(' ')[0]}
        titulo="Mi lista"
        cantidad={activos.length}
        waHref={`https://wa.me/?text=${waText}`}
        fecha={fechaCumple
          ? <>tu cumple {dias === 0 ? 'es hoy' : dias === 1 ? 'es mañana' : `es en ${dias} días`}, el {fechaLarga(fechaCumple).toLowerCase()}</>
          : <Link href="/perfil#cumple" className="underline underline-offset-4">cargá tu cumple</Link>}
      />

      {/* Tus listas: la tuya y las que armás con otros (grupos) */}
      <nav aria-label="Tus listas" className="-mx-[18px] -mt-3 flex gap-2 overflow-x-auto px-[18px] py-1 [scrollbar-width:none]">
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
      {nuevo && <RecienAgregado deseo={{ id: nuevo.id, titulo: nuevo.titulo, foto: nuevo.fotoUrl, prioridad: nuevo.prioridad, grupo: false }} />}
      {eliminado === '1' && <DeseoEliminado />}
    </Seccion>
  )
}
