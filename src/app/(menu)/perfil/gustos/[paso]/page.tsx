import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { gustosPorContar, misGustos } from '@/lib/bienvenida'
import { yo } from '@/lib/perfil'
import { miCumple } from '@/lib/events'
import { esPasoGustos, GUSTOS_VACIOS } from '@/lib/gustos'
import { BienvenidaForm } from '@/components/BienvenidaForm'

/**
 * Un paso de los gustos solo (los deportes, los talles…), para cambiarlo sin pasar por los ocho: desde Tus gustos, desde
 * "¡Todo listo!" (?volver=listo, que vuelve ahí al guardar) y desde la tarjeta "Contá tus gustos" de Mi lista
 * (?volver=lista, que al guardar sigue por el próximo que falta).
 */
export default async function EditarGustos({ params, searchParams }: {
  params: Promise<{ paso: string }>
  searchParams: Promise<{ volver?: string; cumple?: string }>
}) {
  const [session, { paso }, { volver, cumple: errorCumple }] = await Promise.all([auth(), params, searchParams])
  if (!session?.userId) redirect('/')
  if (!esPasoGustos(paso)) notFound()
  const [gustos, cumple, { nombre: suNombre, foto }] = await Promise.all([
    misGustos(db, session.userId), miCumple(db, session.userId), yo(db, session.userId),
  ])

  return (
    <BienvenidaForm key={errorCumple ?? ''} nombreCompleto={(suNombre ?? session.user?.name) || 'Vos'} foto={foto}
                    inicial={{ ...GUSTOS_VACIOS, ...gustos }} cumple={cumple} solo={paso}
                    volver={volver === 'listo' || volver === 'listo-perfil' || volver === 'lista' ? volver : null}
                    sigue={gustosPorContar(gustos, paso).siguiente !== null} cumpleInvalido={errorCumple === 'invalido'} />
  )
}
