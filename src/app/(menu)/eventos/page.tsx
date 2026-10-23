import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { hoyLocal, misEventos } from '@/lib/events'
import { TodoElAnio } from '@/components/Eventos'
import { BackLink, Seccion } from '@/components/ui'

// Todo el año: el calendario con los cumples y fechas de tu gente. Los próximos están en Inicio.
export default async function Eventos() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const hoy = hoyLocal()
  const eventos = await misEventos(db, session.userId, hoy)

  return (
    <Seccion className="flex flex-col gap-4 pb-32 pt-[52px]">
      <div className="flex items-center gap-3.5">
        <BackLink href="/inicio" label="Volver a Inicio" />
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-[30px] leading-none font-extrabold tracking-[-0.04em]">Todo el año</h1>
          <p className="text-sm font-medium">Los cumples y fechas de tu gente.</p>
        </div>
      </div>
      {eventos.length === 0
        ? <p className="mt-4 rounded-sticker bg-gr-soft px-5 py-7 text-center text-[15px] font-medium leading-snug">Acá aparecen los cumples de la gente cuyas listas abrís y las fechas de tus grupos.</p>
        : <TodoElAnio eventos={eventos} hoy={hoy} />}
    </Seccion>
  )
}
