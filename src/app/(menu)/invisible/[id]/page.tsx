import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { amigoInvisibleParaViewer, linkDelJuego, misAmigosInvisibles, tambienTeToco } from '@/lib/amigo-invisible'
import { misAmigos, personas } from '@/lib/amigos'
import {
  Bajarme, CambiosDelJuego, DatosDelJuego, EditarYBorrar, GenteDelJuego, MiRespuesta, Organizar, Preguntas, QuienMeRegalo, SumarGente, TeToco,
} from '@/components/AmigoInvisible'
import { PageHeader, Seccion } from '@/components/ui'

type Valor = string | string[] | undefined
const uno = (v: Valor) => (typeof v === 'string' ? v : undefined)

/**
 * Un amigo invisible. Antes del sorteo: quiénes juegan y, para el que organiza, sumar gente (el link para WhatsApp o sus
 * amigos), quiénes no se tocan y sortear. Después: a quién te toca (recién al tocar "Ver"), las preguntas anónimas y,
 * pasada la fecha, quién te regaló si lo pedís; si alguien se bajó o se sumó, al que organiza le dice qué pasó y si tiene
 * que sortear de nuevo. Solo lo ven los que están (también un invitado que no contestó).
 */
export default async function AmigoInvisiblePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ sorteo?: Valor; excluir?: Valor; pregunta?: Valor }>
}) {
  const [session, { id }, q] = await Promise.all([auth(), params, searchParams])
  if (!session?.userId) redirect('/')
  const v = await amigoInvisibleParaViewer(db, id, session.userId)
  if (!v) notFound()
  const estan = new Set(v.gente.map((g) => g.persona.id))
  // el que organiza suma gente mientras no pasó la fecha, también después del sorteo
  const suma = v.soyOrganizador && v.dias >= 0
  const [paraInvitar, token, juegos] = await Promise.all([
    suma
      ? personas(db, [...await misAmigos(db, session.userId)].filter((a) => !estan.has(a))).then((p) => p.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      : [],
    suma ? linkDelJuego(db, id, session.userId) : null,
    // si le toca la misma persona en otro juego, se lo avisa
    v.meToca ? misAmigosInvisibles(db, session.userId) : [],
  ])
  const link = token ? `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/invisible/unirme/${token}` : null

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <PageHeader title="Amigo invisible" back="/regalos" backLabel="Volver a Regalos" />
      <DatosDelJuego v={v} />
      <CambiosDelJuego v={v} />
      <MiRespuesta v={v} />
      <TeToco v={v} tambien={tambienTeToco(juegos).get(v.id)} />
      <Preguntas v={v} error={uno(q.pregunta) === 'error'} />
      <QuienMeRegalo v={v} />
      {v.sorteado && v.miEstado === 'no_juega' && !v.puedoSumarme && (
        <p className="gr-empty text-center">Este ya se sorteó y no jugaste.</p>
      )}
      <GenteDelJuego v={v} />
      <SumarGente v={v} link={link} paraInvitar={paraInvitar} />
      <Organizar v={v} sorteo={uno(q.sorteo)} excluirError={uno(q.excluir) === 'error'} />
      <Bajarme v={v} />
      <EditarYBorrar v={v} />
    </Seccion>
  )
}
