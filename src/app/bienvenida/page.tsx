import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { misGustos } from '@/lib/bienvenida'
import { miFoto } from '@/lib/perfil'
import { miCumple } from '@/lib/events'
import { GUSTOS_VACIOS } from '@/lib/gustos'
import { BienvenidaForm } from '@/components/BienvenidaForm'

/** Los pasos de la primera vez (deportes, club, hobbies, marcas, colores, talles…). Con ?editar=1, desde Perfil. */
export default async function Bienvenida({ searchParams }: { searchParams: Promise<{ editar?: string; paso?: string; cumple?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [{ editar, paso, cumple: errorCumple }, gustos, cumple, foto] = await Promise.all([
    searchParams, misGustos(db, session.userId), miCumple(db, session.userId), miFoto(db, session.userId),
  ])
  const nombre = (session.user?.name ?? '').split(' ')[0] || 'vos'

  return (
    <main>
      {/* con el aviso de un cumple que no se guardó, se arma de nuevo en el primer paso (ver cumpleInvalido) */}
      <BienvenidaForm key={errorCumple ?? ''} nombre={nombre} nombreCompleto={session.user?.name ?? nombre} foto={foto} inicial={{ ...GUSTOS_VACIOS, ...gustos }}
                      cumple={cumple} editar={editar === '1'} pasoInicial={Number(paso) || 0} cumpleInvalido={errorCumple === 'invalido'} />
    </main>
  )
}
