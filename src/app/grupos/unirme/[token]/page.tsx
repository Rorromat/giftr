import { notFound, redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'
import { db } from '@/db'
import { grupoPorInvitacion, juntarNombres } from '@/lib/groups'
import { joinGroupAction } from '@/app/actions'
import { AvatarStack } from '@/components/ui'

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
      <h1 className="font-display text-[40px] leading-[0.95] font-extrabold tracking-[-0.05em] [overflow-wrap:anywhere]">{grupo.nombre}</h1>
      {grupo.descripcion && <p className="text-[15px] font-medium">{grupo.descripcion}</p>}
      <p className="mt-1 rounded-sticker border-[2.5px] border-dashed border-gr-ink px-4 py-3 text-sm font-medium leading-snug">
        Vas a poder agregar y editar deseos de esta lista. Como es tuya también, no vas a ver quién regala qué.
      </p>
      {/* lo mismo para todos: unirseAGrupo lo resuelve en el servidor */}
      <p className="text-[13px] font-medium leading-snug text-gr-muted">
        Si reservaste algo de esta lista, se libera. De los regalos grupales abiertos te bajás (si organizabas uno, pasa al
        primero que se sumó). Lo que ya compraste queda como está.
      </p>
      {session?.userId ? (
        <form action={joinGroupAction} className="mt-2 w-full">
          <input type="hidden" name="invite" value={token} />
          <button className="gr-btn-primary h-[58px] w-full rounded-[18px] border-[3px]">Unirme al grupo</button>
        </form>
      ) : (
        <form action={async () => { 'use server'; await signIn('google', { redirectTo: `/grupos/unirme/${token}` }) }} className="mt-2 w-full">
          <button className="gr-btn-primary h-[58px] w-full gap-3 rounded-[18px] border-[3px]">
            <span aria-hidden className="flex size-[30px] items-center justify-center rounded-full border-2 border-gr-ink bg-gr-surface font-sans text-base font-bold">G</span>
            Entrar con Google para unirme
          </button>
        </form>
      )}
    </main>
  )
}
