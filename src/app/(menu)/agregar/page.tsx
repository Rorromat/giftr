import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { addItemAction } from '@/app/actions'
import { nombresDeMisGrupos } from '@/lib/groups'
import { DeseoForm } from '@/components/DeseoForm'
import { BackLink } from '@/components/ui'

export default async function Agregar({ searchParams }: { searchParams: Promise<{ lista?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  // Con grupos se elige la lista; ?lista=<id> llega preseleccionada desde la pantalla del grupo.
  const [{ lista }, grupos] = await Promise.all([searchParams, nombresDeMisGrupos(db, session.userId)])
  const desdeGrupo = grupos.find((g) => g.id === lista)

  return (
    <main className="gr-hoja pb-8 pt-[52px]">
      <div className="flex items-center gap-3.5">
        <BackLink href={desdeGrupo ? `/grupos/${desdeGrupo.id}` : '/mi-lista'} label={`Volver a ${desdeGrupo?.nombre ?? 'Mi lista'}`} />
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-[30px] leading-none font-extrabold tracking-[-0.04em]">Agregar deseo</h1>
          <p className="text-sm font-medium">Menos de 30 segundos, prometido.</p>
        </div>
      </div>

      <DeseoForm action={addItemAction} grupos={grupos} grupoElegido={desdeGrupo?.id} boton="Agregar a mi lista" />
    </main>
  )
}
