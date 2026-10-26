import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { necesitaBienvenida } from '@/lib/bienvenida'
import { hoyLocal, miCumple, misEventos } from '@/lib/events'
import { misCuentas } from '@/lib/regalos'
import { Banners } from '@/components/Banners'
import { CargaTuCumple, CuentasPendientes, Proximos } from '@/components/Eventos'
import { yo } from '@/lib/perfil'
import { misAmigos } from '@/lib/amigos'
import { hace, novedadesDeAmigos, PRIMEROS } from '@/lib/novedades'
import { CarruselNovedades } from '@/components/Novedades'
import { InvitacionesRegalo } from '@/components/Dividir'
import { invitacionesPendientes } from '@/lib/invitaciones'
import { AppHeader, Icon, Seccion, SectionHeader } from '@/components/ui'

// Inicio: lo que viene (los avisos, las cuentas, los próximos cumples y fechas de tu gente, con lo que ya hiciste para
// cada uno). Tu lista está en Vos: en ella, por la regla de la sorpresa, nunca pasa nada que puedas ver.
export default async function Inicio({ searchParams }: { searchParams: Promise<{ invitacion?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const hoy = hoyLocal()
  const [bienvenida, eventos, cumple, cuentas, { nombre, foto }, { novedades }, amigos, invitaciones, { invitacion }] = await Promise.all([
    necesitaBienvenida(db, session.userId), misEventos(db, session.userId, hoy), miCumple(db, session.userId), misCuentas(db, session.userId),
    yo(db, session.userId), novedadesDeAmigos(db, session.userId, { limite: PRIMEROS }), misAmigos(db, session.userId),
    invitacionesPendientes(db, session.userId), searchParams,
  ])
  // La primera vez que entra: los pasos de bienvenida con sus gustos.
  if (bienvenida) redirect('/bienvenida')

  return (
    <Seccion className="flex flex-col gap-5 pb-48 pt-2">
      <AppHeader nombre={nombre ?? session.user?.name ?? 'Vos'} foto={foto}
                 left={<Link href="/eventos" aria-label="Todo el año" className="gr-icon-btn"><Icon name="calendar" size={20} /></Link>} />
      <div className="flex flex-col gap-1">
        <h1 className="gr-title">Lo que viene</h1>
        <p className="text-[15px] text-gr-muted">Cumples, regalos y avisos de tu gente.</p>
      </div>

      <Banners />
      {/* te proponen dividir un regalo: te sumás o no */}
      <InvitacionesRegalo invitaciones={invitaciones} noSePudo={invitacion === 'no_se_pudo'} />
      <CuentasPendientes cuentas={cuentas} />

      {eventos.length > 0 ? (
        <>
          <SectionHeader title="Próximos" href="/eventos" linkLabel="Todo el año" />
          <Proximos eventos={eventos} hoy={hoy} />
        </>
      ) : (
        <div className="gr-empty flex flex-col items-center gap-3 py-7 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-gr-surface shadow-card"><Icon name="calendar" size={26} /></span>
          <p>Acá van a aparecer los cumples de tu gente, con tiempo para elegir. Para eso, abrí con tu cuenta el link de su lista.</p>
          <div className="flex w-full flex-col gap-2">
            <Link href="/gente" className="gr-btn">Pedile su lista a tu gente</Link>
            <Link href="/agregar" className="gr-btn-primary">Armá tu lista</Link>
          </div>
        </div>
      )}

      {/* lo nuevo de tus amigos: tarjetas grandes que pasan solas; cada una abre el feed en ese deseo */}
      {novedades.length > 0 ? (
        <section aria-labelledby="novedades" className="flex flex-col gap-3">
          <SectionHeader id="novedades" title="Lo nuevo de tus amigos" href="/novedades" linkLabel="Ver todo" />
          <CarruselNovedades items={novedades.map((n) => ({
            id: n.item.id, titulo: n.item.titulo, foto: n.item.fotoUrl, precio: n.item.precio ?? n.item.rangoPrecio, hace: hace(n.creado),
            nombre: n.dueno.nombre, duenoFoto: n.dueno.foto,
          }))} />
        </section>
      ) : !amigos.size && (
        <Link href="/gente/agregar" className="gr-card flex items-center gap-3 p-4">
          <span className="gr-row__icon"><Icon name="users" size={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-base leading-tight font-semibold">Sumá a tus amigos</span>
            <span className="block text-[13px] leading-snug text-gr-muted">Acá vas a ver lo que se van agregando a sus listas.</span>
          </span>
          <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
        </Link>
      )}

      {!cumple && <CargaTuCumple />}
    </Seccion>
  )
}
