import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { updateItemAction } from '@/app/actions'
import { deseoParaEditar } from '@/lib/items'
import { DeseoForm } from '@/components/DeseoForm'
import { BackLink } from '@/components/ui'

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.userId) redirect('/')
  const editable = await deseoParaEditar(db, id, session.userId)
  if (!editable) notFound()
  const { deseo, grupo } = editable

  return (
    <main className="gr-hoja pb-8 pt-[52px]">
      <div className="flex items-center gap-3.5">
        <BackLink href={grupo ? `/grupos/${grupo.id}` : '/mi-lista'} label={`Volver a ${grupo?.nombre ?? 'Mi lista'}`} />
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-[30px] leading-none font-extrabold tracking-[-0.04em]">Editar deseo</h1>
          <p className="text-sm font-medium">Cambiá lo que necesites.</p>
        </div>
      </div>

      <DeseoForm action={updateItemAction} deseo={deseo} boton="Guardar cambios" />
    </main>
  )
}
