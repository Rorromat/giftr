import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { avisosSinLeer } from '@/lib/bandeja'
import { yo } from '@/lib/perfil'
import { PestanasRegalos } from '@/components/PestanasRegalos'
import { AppHeader, Seccion } from '@/components/ui'

// Mis regalos y Cuentas son dos pestañas de la misma sección. Lo de arriba (el encabezado, el título y las pestañas) va
// acá y no en cada página para que siga montado al pasar de una a otra: la pastilla se desliza y solo cambia lo de abajo,
// en vez de volver a armarse toda la pantalla. Lo de abajo, mientras llega, tiene su esqueleto (el loading.tsx de cada una).
export default async function RegalosLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [{ nombre, foto }, avisos] = await Promise.all([yo(db, session.userId), avisosSinLeer(db, { userId: session.userId })])
  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <AppHeader id={session.userId} nombre={nombre ?? session.user?.name ?? 'Vos'} foto={foto} avisos={avisos} />
      <PestanasRegalos />
      {children}
    </Seccion>
  )
}
