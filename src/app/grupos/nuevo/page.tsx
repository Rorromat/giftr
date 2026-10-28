import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { createGroupAction } from '@/app/actions'
import { misAmigos, personas } from '@/lib/amigos'
import { PageHeader } from '@/components/ui'
import { BotonEnviar } from '@/components/BotonEnviar'
import { ElegirAmigos } from '@/components/Dividir'
import { FotoDeLista } from '@/components/FotoDeLista'
import { CampoParentesco, CamposFecha } from '@/components/ListaEnComun'
import { LARGO } from '@/lib/limites'

export default async function NuevoGrupo() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const amigos = (await personas(db, [...await misAmigos(db, session.userId)])).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return (
    <main className="flex flex-col gap-1 pb-10 pt-2">
      <PageHeader title="Lista en común" back="/mi-lista" backLabel="Volver a Mi lista" />
      <p className="text-center text-sm text-gr-muted">Una lista para armar con otros: la de tu hijo, la de la abuela, la de la casa.</p>

      <form action={createGroupAction} className="mt-3 flex flex-col gap-5">
        <div className="gr-card flex items-center gap-4 p-4">
          <FotoDeLista foto={null} size={72} />
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="gr-label">¿Cómo se llama?</span>
            <input name="nombre" required maxLength={LARGO.nombreGrupo} placeholder="Juancito"
                   className="min-w-0 bg-transparent text-xl font-semibold outline-none placeholder:font-normal placeholder:text-gr-muted" />
          </label>
        </div>

        <CamposFecha esCumple />

        <CampoParentesco />

        <label className="flex flex-col gap-2">
          <span className="gr-label">¿Para qué es? (opcional)</span>
          <input name="descripcion" maxLength={LARGO.descripcionGrupo} placeholder="Para equipar la casa" className="gr-input" />
        </label>

        <div className="flex flex-col gap-2">
          <span className="gr-label">¿Con quién la armás?</span>
          {amigos.length > 0 ? (
            <>
              <ElegirAmigos amigos={amigos} ambito="amigos-lista" />
              <p className="text-xs leading-snug text-gr-muted">
                A cada uno le llega un aviso con el nombre de la lista y se suma con un toque. Como es suya también, no va a ver
                quién regala qué.
              </p>
            </>
          ) : (
            <p className="gr-empty text-sm text-gr-muted">
              Todavía no tenés amigos en GiftR: después de crearla, invitá a quien la arma con vos por WhatsApp, o{' '}
              <Link href="/gente/agregar" className="font-semibold underline underline-offset-2">sumá amigos</Link>.
            </p>
          )}
        </div>

        <p className="gr-empty text-sm text-gr-muted">
          Los que regalan la ven como una sola lista, y ninguno de ustedes ve quién reserva qué. Tus amigos la ven en su gente y,
          si la agregan, su cumple les aparece en Eventos.
        </p>
        <BotonEnviar pendiente="Creando…" className="gr-btn-primary mt-1 h-14 w-full text-[17px]">Crear lista en común</BotonEnviar>
      </form>
    </main>
  )
}
