import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { clavesVapid } from '@/lib/codazos'
import { AvisosDeBienvenida } from '@/components/AvisosDeBienvenida'
import { Icon, LogoSticker, Starburst } from '@/components/ui'

/**
 * La primera vez, después de los gustos: si quiere que le avisemos. Es para que, cuando alguien quiera saber qué
 * regalarle, le pueda dar un codazo y le llegue al toque (y lo de amigos). Activarlos o no, sigue al "¡Todo listo!" (o a
 * su lista, si dejó los gustos para más tarde: luego=lista).
 */
export default async function AvisosBienvenida({ searchParams }: { searchParams: Promise<{ luego?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [{ luego }, vapid] = await Promise.all([searchParams, clavesVapid(db)])
  const siguiente = luego === 'lista' ? '/mi-lista' : '/bienvenida/listo'

  return (
    <main className="flex flex-col gap-5 pb-12 pt-2">
      <header className="flex min-h-14 items-center justify-center"><LogoSticker /></header>
      <div className="gr-hero flex flex-col items-center gap-3 px-5 pb-6 pt-7 text-center">
        <span className="relative flex items-center justify-center">
          <Starburst size={104} />
          <Icon name="bell" size={40} strokeWidth={2.2} className="absolute text-gr-ink" />
        </span>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">¿Te avisamos?</h1>
        <p className="text-[15px] leading-snug text-gr-on-hero/75">
          Activá las notificaciones para que, cuando alguien quiera saber qué regalarte, te lo pueda pedir y te enteres al toque.
        </p>
      </div>

      <ul className="gr-card gr-rows flex flex-col">
        <li className="flex items-start gap-3 px-4 py-3.5">
          <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-full bg-gr-accent text-lg">👉</span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug font-semibold">Un codazo</p>
            <p className="text-[13px] leading-snug text-gr-muted">Alguien quiere saber qué regalarte y te pide que cargues tu lista.</p>
          </div>
        </li>
        <li className="flex items-start gap-3 px-4 py-3.5">
          <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-full bg-gr-soft"><Icon name="users" size={19} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug font-semibold">Tus amigos</p>
            <p className="text-[13px] leading-snug text-gr-muted">Alguien te quiere sumar como amigo, o aceptó tu solicitud.</p>
          </div>
        </li>
      </ul>
      <p className="px-1 text-[13px] leading-snug text-gr-muted">Nada de publicidad. Los podés apagar cuando quieras desde Perfil.</p>

      <AvisosDeBienvenida vapidPublica={vapid.publica} siguiente={siguiente} />
    </main>
  )
}
