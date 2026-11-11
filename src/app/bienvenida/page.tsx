import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { bienvenidaAction } from '@/app/actions'
import { necesitaBienvenida } from '@/lib/bienvenida'
import { yo } from '@/lib/perfil'
import { miCumple } from '@/lib/events'
import { PASOS_GUSTOS } from '@/lib/gustos'
import { paletaGusto } from '@/lib/colores-gustos'
import { BotonEnviar } from '@/components/BotonEnviar'
import { CumpleCampos } from '@/components/CumpleCampos'
import { IlustracionGusto } from '@/components/IlustracionGusto'
import { LogoSticker } from '@/components/ui'

/**
 * La bienvenida, la primera vez que entra: una sola pantalla. Su cumple (de ahí salen su fecha en Todo el año y hasta
 * cuándo valen las reservas de su gente) o "Ahora no", y de acá a anotar su primer deseo. El nombre y la foto ya vinieron
 * de Google. Antes eran ocho pasos de gustos, que ahora se cuentan después, de a uno (Mi lista y Tus gustos): ?editar=1
 * (los links de antes) lleva ahí. Quien ya la pasó no la vuelve a ver.
 */
export default async function Bienvenida({ searchParams }: { searchParams: Promise<{ editar?: string; paso?: string; cumple?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [{ editar, paso, cumple: errorCumple }, falta, cumple, { nombre: suNombre }] = await Promise.all([
    searchParams, necesitaBienvenida(db, session.userId), miCumple(db, session.userId), yo(db, session.userId),
  ])
  if (editar === '1') redirect(paso && PASOS_GUSTOS[Number(paso)] ? `/perfil/gustos/${PASOS_GUSTOS[Number(paso)]}` : '/perfil/gustos')
  // una pestaña que quedó abierta, o un link de antes: ya la pasó
  if (!falta) redirect('/inicio')
  const nombre = (suNombre ?? session.user?.name ?? '').split(' ')[0]

  return (
    <main className="flex min-h-dvh flex-col gap-5 pb-10 pt-2">
      <header className="flex min-h-14 items-center justify-center"><LogoSticker /></header>

      {/* el cartel del cumple, con su color y su ilustración (los mismos que en Tus gustos) */}
      <div className="relative flex min-h-[148px] flex-col justify-center gap-1.5 overflow-hidden rounded-[26px] py-5 pl-5 pr-[124px] text-white shadow-card"
           style={{ background: paletaGusto('cumple').fondo }}>
        <IlustracionGusto paso="cumple" size={140} className="absolute -right-3 top-1/2 -translate-y-1/2" />
        <h1 className="text-[26px] leading-[1.08] font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">{nombre ? `¡Hola, ${nombre}!` : '¡Hola!'}</h1>
        <p className="text-sm leading-snug text-white/85">Armás tu lista, se la mandás a tu gente y ellos se organizan para regalarte, sin que te enteres.</p>
      </div>

      {/* con el aviso de un cumple que no se guardó se arma de nuevo, con lo guardado: cambiar solo la dirección no lo vuelve a montar */}
      <form key={errorCumple ?? ''} action={bienvenidaAction} className="flex flex-col gap-3">
        <div role="group" aria-labelledby="tu-cumple" className="gr-card flex flex-col gap-2.5 p-3.5">
          <p id="tu-cumple" className="text-base font-semibold">¿Cuándo es tu cumple?</p>
          <div className="flex gap-2">
            <CumpleCampos dia={cumple?.dia} mes={cumple?.mes} claseDia="w-[34%]" error={errorCumple === 'invalido' ? 'cumple-error' : undefined} />
          </div>
          {errorCumple === 'invalido' && (
            <p id="cumple-error" role="alert" className="text-[13px] font-semibold">Tu cumple no se guardó: elegí el día y el mes, o tocá «Ahora no».</p>
          )}
          <p className="text-[13px] leading-snug text-gr-muted">Tu gente lo ve en Todo el año, con tiempo para elegir.</p>
        </div>
        <div className="mt-1 flex flex-col gap-2.5">
          <BotonEnviar pendiente="Guardando…" className="gr-btn-primary w-full">Seguir</BotonEnviar>
          {/* un botón, no un texto chico: quien no quiere cargar su cumple ahora sigue igual a anotar su primer deseo */}
          <BotonEnviar name="ahoraNo" value="1" className="gr-btn w-full">Ahora no</BotonEnviar>
        </div>
        <p className="text-center text-[13px] text-gr-muted">Lo que sigue: anotar tu primer deseo.</p>
      </form>
    </main>
  )
}
