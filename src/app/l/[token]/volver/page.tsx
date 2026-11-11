import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { listaParaCompartir } from '@/lib/compartir'
import { pareceClaveParaVolver } from '@/lib/cookie-invitado'
import { getViewer, invitadoDeEsteNavegador } from '@/lib/viewer'
import { EntrarConGoogle, NoSoyYo } from '@/components/Identidad'
import { Insignia } from '@/components/ui'

export const metadata: Metadata = { title: 'Volver a tu reserva', robots: { index: false } }

/**
 * Cuando el link para volver a una reserva (/l/<token>/volver/<clave>, ver su route) no la pudo traer:
 * - otro: en este navegador ya hay otro invitado anotado. No se lo pisa: en la tablet de la familia, la tía quedaría sin
 *   poder manejar lo suyo. Si el link es de quien lo abrió, sale de ese nombre acá mismo y el link se abre de nuevo.
 * - si no: el link ya no sirve (cortado al copiarlo, cambiaron el link de la lista, o esa reserva ya pasó a una cuenta).
 * No cuenta nada de la lista ni de la reserva: lo puede abrir cualquiera.
 */
export default async function VolverAMiReserva({ params, searchParams }: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ motivo?: string; clave?: string }>
}) {
  const [{ token }, { motivo, clave }] = await Promise.all([params, searchParams])
  if (!(await listaParaCompartir(db, token))) notFound()
  const lista = `/l/${token}`
  const link = motivo === 'otro' && clave && pareceClaveParaVolver(clave) ? `${lista}/volver/${clave}` : null
  const [viewer, anotado] = await Promise.all([getViewer(), link ? invitadoDeEsteNavegador() : null])
  // ya no hay otro anotado (salió de ese nombre, o recargó después): el link, de nuevo
  if (link && !anotado) redirect(link)

  return (
    <main className="flex min-h-[85dvh] flex-col items-center justify-center gap-4 py-12 text-center">
      <Insignia size={120} fontSize={64} label="No se pudo">?</Insignia>
      {link && anotado ? (
        <>
          <h1 className="gr-title [overflow-wrap:anywhere]">Acá ya está anotado “{anotado}”</h1>
          <p className="text-[15px] font-medium leading-snug">
            Ese link es para volver a la reserva de otra persona. Si es la tuya, salí de “{anotado}” y te llevamos a tu reserva.
          </p>
          <NoSoyYo nombre={anotado} volver={link} />
        </>
      ) : (
        <>
          <h1 className="gr-title">Ese link para volver ya no sirve</h1>
          <p className="text-[15px] font-medium leading-snug">
            Puede que esté cortado o que hayan cambiado el link de la lista. Si ya pasaste tu reserva a tu cuenta, entrá con
            Google: la vas a ver ahí.
          </p>
          {!viewer.userId && <div className="w-full"><EntrarConGoogle volver={lista} /></div>}
        </>
      )}
      <Link href={lista} className="gr-btn-primary mt-2 w-full">Ir a la lista</Link>
    </main>
  )
}
