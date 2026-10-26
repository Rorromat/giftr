import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { fechaPropuesta, propuestasDeFechas } from '@/lib/amigo-invisible'
import { misAmigos, personas } from '@/lib/amigos'
import { hoyLocal } from '@/lib/events'
import { datosDe, esFechaEspecial } from '@/lib/fechas-especiales'
import { FormJuego } from '@/components/AmigoInvisible'
import { PageHeader } from '@/components/ui'

/** Armar un amigo invisible: de una fecha especial (?fecha=navidad, con su día ya puesto) o aparte, para cuando quieran. */
export default async function NuevoAmigoInvisible({ searchParams }: { searchParams: Promise<{ fecha?: string | string[]; error?: string | string[] }> }) {
  const [session, q] = await Promise.all([auth(), searchParams])
  if (!session?.userId) redirect('/')
  const fecha = typeof q.fecha === 'string' && esFechaEspecial(q.fecha) ? q.fecha : null
  const hoy = hoyLocal()
  const amigos = (await personas(db, [...await misAmigos(db, session.userId)])).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return (
    <main className="gr-hoja flex flex-col gap-1 pt-2 pb-8">
      <PageHeader title="Armar amigo invisible" back={fecha ? `/fechas/${fecha}` : '/regalos'} backLabel="Volver" />
      <FormJuego fechaEspecial={fecha} propuestas={propuestasDeFechas(hoy)} amigos={amigos} hoy={hoy.toISOString().slice(0, 10)} error={q.error === '1'}
                 inicial={{ nombre: fecha ? `${datosDe(fecha).nombre} ${fechaPropuesta(fecha, hoy).slice(0, 4)}` : '', descripcion: '', presupuesto: '', fecha: fechaPropuesta(fecha, hoy) }} />
    </main>
  )
}
