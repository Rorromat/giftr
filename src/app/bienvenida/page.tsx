import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { misGustos } from '@/lib/bienvenida'
import { yo } from '@/lib/perfil'
import { miCumple } from '@/lib/events'
import { GUSTOS_VACIOS, PASOS_GUSTOS } from '@/lib/gustos'
import { BienvenidaForm } from '@/components/BienvenidaForm'

/**
 * Los pasos de la primera vez (deportes, club, hobbies, marcas, colores, talles…). Editarlos después es desde Tus gustos,
 * de a un paso: ?editar=1 (los links de antes) lleva ahí.
 */
export default async function Bienvenida({ searchParams }: { searchParams: Promise<{ editar?: string; paso?: string; cumple?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [{ editar, paso, cumple: errorCumple }, gustos, cumple, { nombre: suNombre, foto }] = await Promise.all([
    searchParams, misGustos(db, session.userId), miCumple(db, session.userId), yo(db, session.userId),
  ])
  if (editar === '1') redirect(paso && PASOS_GUSTOS[Number(paso)] ? `/perfil/gustos/${PASOS_GUSTOS[Number(paso)]}` : '/perfil/gustos')
  const completo = suNombre ?? session.user?.name ?? ''
  const nombre = completo.split(' ')[0] || 'vos'

  return (
    <main>
      {/* con el aviso de un cumple que no se guardó, se arma de nuevo en el primer paso (ver cumpleInvalido) */}
      <BienvenidaForm key={errorCumple ?? ''} nombre={nombre} nombreCompleto={completo || nombre} foto={foto} inicial={{ ...GUSTOS_VACIOS, ...gustos }}
                      cumple={cumple} pasoInicial={Number(paso) || 0} cumpleInvalido={errorCumple === 'invalido'} />
    </main>
  )
}
