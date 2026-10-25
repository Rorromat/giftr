import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { necesitaBienvenida } from '@/lib/bienvenida'
import { hoyLocal, miCumple, misEventos } from '@/lib/events'
import { misCuentas } from '@/lib/regalos'
import { Banners } from '@/components/Banners'
import { CargaTuCumple, CuentasPendientes, Proximos } from '@/components/Eventos'
import { miFoto } from '@/lib/perfil'
import { AppHeader, Icon, Seccion, SectionHeader } from '@/components/ui'

// Inicio: lo que viene (los avisos, las cuentas, los próximos cumples y fechas de tu gente, con lo que ya hiciste para
// cada uno). Tu lista está en Vos: en ella, por la regla de la sorpresa, nunca pasa nada que puedas ver.
export default async function Inicio() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const hoy = hoyLocal()
  const [bienvenida, eventos, cumple, cuentas, foto] = await Promise.all([
    necesitaBienvenida(db, session.userId), misEventos(db, session.userId, hoy), miCumple(db, session.userId), misCuentas(db, session.userId),
    miFoto(db, session.userId),
  ])
  // La primera vez que entra: los pasos de bienvenida con sus gustos.
  if (bienvenida) redirect('/bienvenida')

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <AppHeader nombre={session.user?.name ?? session.user?.email ?? 'Vos'} foto={foto}
                 left={<Link href="/eventos" aria-label="Todo el año" className="gr-icon-btn"><Icon name="calendar" size={20} /></Link>} />
      <div className="flex flex-col gap-1">
        <h1 className="gr-title">Lo que viene</h1>
        <p className="text-[15px] text-gr-muted">Cumples, regalos y avisos de tu gente.</p>
      </div>

      <Banners />
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

      {!cumple && <CargaTuCumple />}
    </Seccion>
  )
}
