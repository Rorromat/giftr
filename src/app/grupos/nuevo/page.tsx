import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { createGroupAction } from '@/app/actions'
import { ANIO_MAXIMO, ANIO_MINIMO } from '@/lib/groups'
import { BackLink } from '@/components/ui'
import { BotonEnviar } from '@/components/BotonEnviar'

export default async function NuevoGrupo() {
  const session = await auth()
  if (!session?.userId) redirect('/')

  return (
    <main className="pb-8 pt-[52px]">
      <div className="flex items-center gap-3.5">
        <BackLink href="/mi-lista" label="Volver a Mi lista" />
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-[30px] leading-none font-extrabold tracking-[-0.04em]">Nuevo grupo</h1>
          <p className="text-sm font-medium">Una lista en común para pedir juntos.</p>
        </div>
      </div>

      <form action={createGroupAction} className="mt-3.5 flex flex-col gap-4">
        <div className="gr-sticker flex flex-col gap-3 p-3.5">
          <label className="flex flex-col gap-1">
            <span className="gr-label">¿Cómo se llama?</span>
            <input name="nombre" required maxLength={60} placeholder="Nuestra casa"
                   className="bg-transparent font-display text-xl font-bold outline-none placeholder:text-gr-muted" />
          </label>
        </div>
        <label className="flex flex-col gap-2">
          <span className="gr-label">¿Para qué es? (opcional)</span>
          <input name="descripcion" maxLength={120} placeholder="Para equipar la casa" className="gr-input" />
        </label>
        <div className="flex flex-col gap-2">
          <label htmlFor="fecha" className="gr-label">¿Hay una fecha? (opcional)</label>
          <input id="fecha" name="fecha" type="date" min={`${ANIO_MINIMO}-01-01`} max={`${ANIO_MAXIMO}-12-31`} className="gr-input" />
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input type="checkbox" name="anual" defaultChecked className="size-[22px] accent-gr-ink" /> Se repite todos los años (un cumple)
          </label>
        </div>
        <p className="rounded-sticker border-[2.5px] border-dashed border-gr-ink px-4 py-3 text-sm font-medium leading-snug">
          Después invitás a quien la arma con vos. Los que regalan la ven como una sola lista, y ninguno de ustedes ve quién reserva qué.
        </p>
        <BotonEnviar pendiente="Creando…" className="gr-btn-primary mt-2 h-[60px] w-full rounded-[20px] border-[3px] text-[21px]">Crear grupo</BotonEnviar>
      </form>
    </main>
  )
}
