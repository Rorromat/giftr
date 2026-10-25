import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { clavesVapid } from '@/lib/codazos'
import { AvisosDeBienvenida, PorQueAvisos } from '@/components/AvisosDeBienvenida'
import { LogoSticker } from '@/components/ui'

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
      <PorQueAvisos />
      <AvisosDeBienvenida vapidPublica={vapid.publica} siguiente={siguiente} />
    </main>
  )
}
