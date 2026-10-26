import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { amigoInvisibleParaViewer } from '@/lib/amigo-invisible'
import { misAmigos, personas } from '@/lib/amigos'
import {
  DatosDelJuego, EditarYBorrar, GenteDelJuego, MiRespuesta, Organizar, Preguntas, QuienMeRegalo, TeToco,
} from '@/components/AmigoInvisible'
import { PageHeader, Seccion } from '@/components/ui'

type Valor = string | string[] | undefined
const uno = (v: Valor) => (typeof v === 'string' ? v : undefined)

/**
 * Un amigo invisible. Antes del sorteo: quiénes juegan y, para el que organiza, invitar, quiénes no se tocan y sortear.
 * Después: a quién te toca (recién al tocar "Ver"), las preguntas anónimas y, pasada la fecha, quién te regaló si lo pedís.
 * Solo lo ven los que están (también un invitado que no contestó).
 */
export default async function AmigoInvisiblePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ sorteo?: Valor; excluir?: Valor; pregunta?: Valor }>
}) {
  const [session, { id }, q] = await Promise.all([auth(), params, searchParams])
  if (!session?.userId) redirect('/')
  const v = await amigoInvisibleParaViewer(db, id, session.userId)
  if (!v) notFound()
  const estan = new Set(v.gente.map((g) => g.persona.id))
  const paraInvitar = v.soyOrganizador && !v.sorteado
    ? (await personas(db, [...await misAmigos(db, session.userId)].filter((a) => !estan.has(a)))).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    : []

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <PageHeader title="Amigo invisible" back={v.fechaEspecial ? `/fechas/${v.fechaEspecial}` : '/inicio'} backLabel="Volver" />
      <DatosDelJuego v={v} />
      <MiRespuesta v={v} />
      <TeToco v={v} />
      <Preguntas v={v} error={uno(q.pregunta) === 'error'} />
      <QuienMeRegalo v={v} />
      {v.sorteado && v.miEstado === 'no_juega' && (
        <p className="gr-empty text-center">Este ya se sorteó y no jugaste.</p>
      )}
      <GenteDelJuego v={v} />
      {v.soyOrganizador && !v.sorteado && (
        <Organizar v={v} paraInvitar={paraInvitar} sorteo={uno(q.sorteo)} excluirError={uno(q.excluir) === 'error'} />
      )}
      <EditarYBorrar v={v} />
    </Seccion>
  )
}
