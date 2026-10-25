import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { hoyLocal, misEventos } from '@/lib/events'
import { TodoElAnio } from '@/components/Eventos'
import { PageHeader, Seccion } from '@/components/ui'

// Todo el año: el calendario con los cumples y fechas de tu gente. Los próximos están en Inicio.
export default async function Eventos() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const hoy = hoyLocal()
  const eventos = await misEventos(db, session.userId, hoy)

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <PageHeader title="Todo el año" back="/inicio" backLabel="Volver a Inicio" />
      <p className="-mt-3 text-center text-sm text-gr-muted">Los cumples y fechas de tu gente.</p>
      {eventos.length === 0
        ? <p className="gr-empty py-7 text-center">Acá aparecen los cumples de la gente cuyas listas abrís y las fechas de tus grupos.</p>
        : <TodoElAnio eventos={eventos} hoy={hoy} />}
    </Seccion>
  )
}
