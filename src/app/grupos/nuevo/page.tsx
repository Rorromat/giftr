import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { createGroupAction } from '@/app/actions'
import { ANIO_MAXIMO, ANIO_MINIMO } from '@/lib/groups'
import { PageHeader } from '@/components/ui'
import { BotonEnviar } from '@/components/BotonEnviar'
import { LARGO } from '@/lib/limites'

export default async function NuevoGrupo() {
  const session = await auth()
  if (!session?.userId) redirect('/')

  return (
    <main className="flex flex-col gap-1 pb-10 pt-2">
      <PageHeader title="Nuevo grupo" back="/mi-lista" backLabel="Volver a Mi lista" />
      <p className="text-center text-sm text-gr-muted">Una lista en común para pedir juntos.</p>

      <form action={createGroupAction} className="mt-3 flex flex-col gap-4">
        <div className="gr-card flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1">
            <span className="gr-label">¿Cómo se llama?</span>
            <input name="nombre" required maxLength={LARGO.nombreGrupo} placeholder="Nuestra casa"
                   className="bg-transparent text-xl font-semibold outline-none placeholder:font-normal placeholder:text-gr-muted" />
          </label>
        </div>
        <label className="flex flex-col gap-2">
          <span className="gr-label">¿Para qué es? (opcional)</span>
          <input name="descripcion" maxLength={LARGO.descripcionGrupo} placeholder="Para equipar la casa" className="gr-input" />
        </label>
        <div className="flex flex-col gap-2">
          <label htmlFor="fecha" className="gr-label">¿Hay una fecha? (opcional)</label>
          <input id="fecha" name="fecha" type="date" min={`${ANIO_MINIMO}-01-01`} max={`${ANIO_MAXIMO}-12-31`} className="gr-input" />
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" name="anual" defaultChecked className="size-[22px] accent-gr-ink" /> Se repite todos los años (un cumple)
          </label>
        </div>
        <p className="gr-empty text-sm text-gr-muted">
          Después invitás a quien la arma con vos. Los que regalan la ven como una sola lista, y ninguno de ustedes ve quién reserva qué.
        </p>
        <BotonEnviar pendiente="Creando…" className="gr-btn-primary mt-2 h-14 w-full text-[17px]">Crear grupo</BotonEnviar>
      </form>
    </main>
  )
}
