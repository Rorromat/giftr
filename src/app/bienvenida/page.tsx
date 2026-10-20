import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { misGustos } from '@/lib/bienvenida'
import { miCumple } from '@/lib/events'
import { GUSTOS_VACIOS } from '@/lib/gustos'
import { BienvenidaForm } from '@/components/BienvenidaForm'

/** Los pasos de la primera vez (deportes, club, hobbies, marcas, colores, talles…). Con ?editar=1, desde Perfil. */
export default async function Bienvenida({ searchParams }: { searchParams: Promise<{ editar?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [{ editar }, gustos, cumple] = await Promise.all([searchParams, misGustos(db, session.userId), miCumple(db, session.userId)])
  const nombre = (session.user?.name ?? '').split(' ')[0] || 'vos'

  return (
    <main className="pt-[52px]">
      <BienvenidaForm nombre={nombre} inicial={{ ...GUSTOS_VACIOS, ...gustos }} cumple={cumple} editar={editar === '1'} />
    </main>
  )
}
