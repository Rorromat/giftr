import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { hoyLocal, misEventos } from '@/lib/events'
import { todasLasFechas } from '@/lib/fechas-especiales'
import { TodoElAnio } from '@/components/Eventos'
import { Seccion } from '@/components/ui'

// Todo el año: el calendario con los cumples y fechas de tu gente, y las fechas especiales; de ahí se entra a un mes y a un
// día (?mes=10&dia=27, ver Calendario), y de un día a la lista de quien cumple. Los próximos están en Inicio.
export default async function Eventos() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const hoy = hoyLocal()
  const eventos = await misEventos(db, session.userId, hoy)

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <TodoElAnio eventos={eventos} hoy={hoy} especiales={todasLasFechas(hoy)} />
    </Seccion>
  )
}
