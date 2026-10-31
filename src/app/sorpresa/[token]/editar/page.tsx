import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { hoyLocal } from '@/lib/events'
import { sorpresaParaEditar } from '@/lib/sorpresas'
import { FormSorpresa } from '@/components/Sorpresas'
import { PageHeader } from '@/components/ui'

/** Editar una sorpresa: solo quien la armó, mientras sigue en pie (para cualquier otro, el link no es nada). */
export default async function EditarSorpresa({ params, searchParams }: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const [session, { token }, { error }] = await Promise.all([auth(), params, searchParams])
  if (!session?.userId) redirect('/')
  const s = await sorpresaParaEditar(db, token, session.userId)
  if (!s) notFound()
  // para alguien sin GiftR se edita también su nombre y la fecha; para alguien de GiftR o una lista en común, no
  const deAfuera = !s.para.userId && !s.para.esLista
  const titulo = deAfuera ? 'Editar la sorpresa' : `Sorpresa para ${s.para.esLista ? s.para.nombre : s.para.nombre.split(' ')[0]}`

  return (
    <main className="gr-hoja flex flex-col gap-1 pt-2 pb-8">
      <PageHeader title={titulo} back={`/sorpresa/${token}`} backLabel="Volver a la sorpresa" />
      <FormSorpresa para={deAfuera ? { tipo: 'sin' } : s.para.esLista ? { tipo: 'lista', token: s.para.token ?? '', nombre: s.para.nombre, enComun: true }
        : { tipo: 'amigo', id: s.para.userId!, nombre: s.para.nombre }} amigos={[]}
                    hoy={hoyLocal().toISOString().slice(0, 10)} error={error === '1'}
                    editar={{ token, deseo: s.deseo, nombre: deAfuera ? s.para.nombre : null, fecha: s.fecha }} />
    </main>
  )
}
