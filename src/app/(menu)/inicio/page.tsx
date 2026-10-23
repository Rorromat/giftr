import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { necesitaBienvenida } from '@/lib/bienvenida'
import { hoyLocal, miCumple, misEventos } from '@/lib/events'
import { misCuentas } from '@/lib/regalos'
import { Banners } from '@/components/Banners'
import { CargaTuCumple, CuentasPendientes, Proximos } from '@/components/Eventos'
import { Icon, LogoSticker, Seccion } from '@/components/ui'

// Inicio: lo que viene (los avisos, las cuentas, los próximos cumples y fechas de tu gente, con lo que ya hiciste para
// cada uno). Tu lista está en Vos: en ella, por la regla de la sorpresa, nunca pasa nada que puedas ver.
export default async function Inicio() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const hoy = hoyLocal()
  const [bienvenida, eventos, cumple, cuentas] = await Promise.all([
    necesitaBienvenida(db, session.userId), misEventos(db, session.userId, hoy), miCumple(db, session.userId), misCuentas(db, session.userId),
  ])
  // La primera vez que entra: los pasos de bienvenida con sus gustos.
  if (bienvenida) redirect('/bienvenida')

  return (
    <Seccion className="flex flex-col gap-4 pb-32 pt-[52px]">
      <div className="flex min-h-11 items-center justify-between">
        <LogoSticker />
        <Link href="/eventos" className="gr-chip gap-1.5"><Icon name="calendar" size={17} strokeWidth={2.4} />Todo el año</Link>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="gr-title">Lo que viene</h1>
        <p className="text-[15px] font-medium">Cumples, regalos y avisos de tu gente.</p>
      </div>

      <Banners />
      <CuentasPendientes cuentas={cuentas} />

      {eventos.length > 0 ? <Proximos eventos={eventos} hoy={hoy} /> : (
        <div className="flex flex-col gap-3 rounded-sticker bg-gr-soft px-5 py-6 text-[15px] font-medium leading-snug">
          <p>Acá van a aparecer los cumples de tu gente, con tiempo para elegir. Para eso, abrí con tu cuenta el link de su lista.</p>
          <div className="flex flex-col gap-2">
            <Link href="/gente" className="gr-btn bg-gr-surface">Pedile su lista a tu gente</Link>
            <Link href="/agregar" className="gr-btn-primary">Armá tu lista</Link>
          </div>
        </div>
      )}

      {!cumple && <CargaTuCumple />}
    </Seccion>
  )
}
