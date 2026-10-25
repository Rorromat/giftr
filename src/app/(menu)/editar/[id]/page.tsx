import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { updateItemAction } from '@/app/actions'
import { deseoParaEditar } from '@/lib/items'
import { DeseoForm } from '@/components/DeseoForm'
import { PageHeader } from '@/components/ui'

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.userId) redirect('/')
  const editable = await deseoParaEditar(db, id, session.userId)
  if (!editable) notFound()
  const { deseo } = editable

  return (
    <main className="gr-hoja flex flex-col gap-1 pb-8 pt-2">
      <PageHeader title="Editar deseo" back={`/deseo/${deseo.id}`} backLabel="Volver al deseo" />
      <p className="text-center text-sm text-gr-muted">Cambiá lo que necesites.</p>

      <DeseoForm action={updateItemAction} deseo={deseo} boton="Guardar cambios" />
    </main>
  )
}
