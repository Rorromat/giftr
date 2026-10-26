import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { amigoInvisibleParaViewer } from '@/lib/amigo-invisible'
import { hoyLocal } from '@/lib/events'
import { pesos } from '@/lib/pesos'
import { FormJuego } from '@/components/AmigoInvisible'
import { PageHeader } from '@/components/ui'

/** Cambiar nombre, temática, presupuesto o fecha: solo el que lo organiza. */
export default async function EditarAmigoInvisible({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string | string[] }>
}) {
  const [session, { id }, q] = await Promise.all([auth(), params, searchParams])
  if (!session?.userId) redirect('/')
  const v = await amigoInvisibleParaViewer(db, id, session.userId)
  if (!v?.soyOrganizador) notFound()

  return (
    <main className="gr-hoja flex flex-col gap-1 pt-2 pb-8">
      <PageHeader title="Editar amigo invisible" back={`/invisible/${v.id}`} backLabel="Volver" />
      <FormJuego fechaEspecial={v.fechaEspecial} amigos={[]} hoy={hoyLocal().toISOString().slice(0, 10)} error={q.error === '1'} editar={{ id: v.id }}
                 inicial={{ nombre: v.nombre, descripcion: v.descripcion ?? '', presupuesto: v.presupuesto ? pesos(v.presupuesto) : '', fecha: v.fecha }} />
    </main>
  )
}
