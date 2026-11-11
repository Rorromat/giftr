import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { updateItemAction } from '@/app/actions'
import { deseoParaEditar } from '@/lib/items'
import { DeseoForm } from '@/components/DeseoForm'
import { AporteForm } from '@/components/AporteForm'
import { EliminarDeseo } from '@/components/EliminarDeseo'
import { PageHeader } from '@/components/ui'

export default async function Editar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams])
  const session = await auth()
  if (!session?.userId) redirect('/')
  const editable = await deseoParaEditar(db, id, session.userId)
  if (!editable) notFound()
  const { deseo } = editable

  return (
    <main className="gr-hoja flex flex-col gap-1 pt-2 pb-[max(24px,env(safe-area-inset-bottom))]">
      <PageHeader title={deseo.tipo === 'aporte' ? 'Editar aporte' : 'Editar deseo'} back={`/deseo/${deseo.id}`} backLabel="Volver al deseo" />

      {/* un aporte en plata tiene su formulario: el nombre, la descripción, el alias y la meta */}
      {deseo.tipo === 'aporte'
        ? <AporteForm action={updateItemAction} deseo={deseo} boton="Guardar cambios" error={error} />
        : <DeseoForm action={updateItemAction} deseo={deseo} boton="Guardar cambios" />}
      {/* al final de todo: eliminar (con confirmación) */}
      <div className="mt-8 border-t border-gr-line pt-6">
        <EliminarDeseo itemId={deseo.id} titulo={deseo.titulo} />
      </div>
    </main>
  )
}
