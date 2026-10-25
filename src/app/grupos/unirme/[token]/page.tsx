import { notFound, redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'
import { db } from '@/db'
import { grupoPorInvitacion, juntarNombres } from '@/lib/groups'
import { joinGroupAction } from '@/app/actions'
import { AvatarStack } from '@/components/ui'
import { BotonEnviar } from '@/components/BotonEnviar'

// Unirse pide un toque (POST): WhatsApp abre los links solo para armar la vista previa,
// y eso no tiene que sumar a nadie como dueño.
export default async function Unirme({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const grupo = await grupoPorInvitacion(db, token)
  if (!grupo) notFound()
  const session = await auth()
  if (session?.userId && grupo.duenos.some((d) => d.id === session.userId)) redirect(`/grupos/${grupo.id}`)

  const nombres = grupo.duenos.map((d) => d.nombre)
  const invitan = `${juntarNombres(nombres)} te ${nombres.length > 1 ? 'invitan' : 'invita'}`

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 pb-12 text-center">
      <AvatarStack nombres={nombres} fotos={grupo.duenos.map((d) => d.foto)} size={64} />
      <p className="text-[15px] font-medium">{invitan} a armar juntos</p>
      <h1 className="text-[32px] leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">{grupo.nombre}</h1>
      {grupo.descripcion && <p className="text-[15px] font-medium">{grupo.descripcion}</p>}
      <p className="mt-1 rounded-[22px] bg-gr-soft px-4 py-3 text-sm font-medium leading-snug">
        Vas a poder agregar y editar deseos de esta lista. Como es tuya también, no vas a ver quién regala qué, y aunque
        después salgas (o te saquen) del grupo no vas a poder reservar en ella. Si te llegó para regalar, no te sumes:
        pedí el link para regalar.
      </p>
      {/* lo mismo para todos: unirseAGrupo lo resuelve en el servidor */}
      <p className="text-[13px] font-medium leading-snug text-gr-muted">
        Si reservaste algo de esta lista, se libera. De los regalos grupales abiertos te bajás; si organizabas uno, pasa a
        otro de los que se sumaron y, si no queda nadie, se cancela (les avisamos). Lo que ya compraste queda como está.
      </p>
      {session?.userId ? (
        <form action={joinGroupAction} className="mt-2 w-full">
          <input type="hidden" name="invite" value={token} />
          <BotonEnviar pendiente="Uniéndote…" className="gr-btn-primary h-14 w-full">Unirme al grupo</BotonEnviar>
        </form>
      ) : (
        <form action={async () => { 'use server'; await signIn('google', { redirectTo: `/grupos/unirme/${token}` }) }} className="mt-2 w-full">
          <button className="gr-btn-primary h-14 w-full gap-3">
            <span aria-hidden className="flex size-[30px] items-center justify-center rounded-full border border-gr-line bg-gr-surface text-base">G</span>
            Entrar con Google para unirme
          </button>
        </form>
      )}
    </main>
  )
}
