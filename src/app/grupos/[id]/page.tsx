import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { grupoParaDueno, juntarNombres } from '@/lib/groups'
import { leaveGroupAction } from '@/app/actions'
import { Banners } from '@/components/Banners'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import { OwnerItemsGrid } from '@/components/OwnerItemsGrid'
import { AvatarStack, BackLink, BottomNav, Icon, Starburst } from '@/components/ui'

export default async function Grupo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.userId) redirect('/')
  const grupo = await grupoParaDueno(db, id, session.userId)
  if (!grupo) notFound()

  const activos = grupo.items.filter((i) => i.estadoDueno === 'activo')
  const otros = grupo.duenos.filter((d) => d.id !== session.userId).map((d) => d.nombre)
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? ''
  const shareUrl = `${base}/l/${grupo.shareToken}`
  const inviteUrl = `${base}/grupos/unirme/${grupo.inviteToken}`
  const waRegalar = encodeURIComponent(`Armamos la lista "${grupo.nombre}" en GiftR 🎁 ${shareUrl}`)
  const waInvitar = encodeURIComponent(`Armemos juntos la lista "${grupo.nombre}" en GiftR: ${inviteUrl}`)

  return (
    <main className="flex flex-col gap-3.5 pb-48 pt-[52px]">
      <div className="flex items-center justify-between">
        <BackLink href="/grupos" label="Volver a Grupos" />
        <Link href={`/agregar?lista=${grupo.id}`} className="gr-btn-primary gr-btn--sm min-h-11 rotate-2 rounded-[14px]">+ Agregar</Link>
      </div>

      <div className="relative flex flex-col gap-1 pr-20">
        <h1 className="gr-title [overflow-wrap:anywhere]">{grupo.nombre}</h1>
        {grupo.descripcion && <p className="text-[15px] font-medium">{grupo.descripcion}</p>}
        {activos.length > 0 && (
          <Starburst label={`${activos.length} ${activos.length === 1 ? 'deseo' : 'deseos'}`}
                     fontSize={activos.length > 99 ? 30 : 40} className="absolute -top-1 right-[10px] rotate-12">
            {activos.length}
          </Starburst>
        )}
      </div>

      <Banners />

      {/* Dueños e invitación. Este link da permiso para editar: es solo para quien arma la lista. */}
      <section className="gr-sticker flex flex-col gap-3 p-3.5">
        <div className="flex items-center gap-3">
          <AvatarStack nombres={grupo.duenos.map((d) => d.nombre)} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg leading-tight font-extrabold">
              {otros.length ? `Con ${juntarNombres(otros)}` : 'Solo vos por ahora'}
            </p>
            <p className="text-[13px] font-medium leading-snug">Invitá a quien arma la lista con vos: va a poder agregar y editar.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-gr-ink py-2 pl-3.5 pr-2 text-gr-bg">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-gr-accent">{inviteUrl.replace(/^https?:\/\//, '')}</p>
          <CopyLinkButton url={inviteUrl} />
        </div>
        <a href={`https://wa.me/?text=${waInvitar}`} target="_blank"
           className="gr-btn min-h-11 justify-center gap-2 font-sans text-sm font-bold">
          <Icon name="users" size={18} strokeWidth={2.4} />
          Invitar por WhatsApp
        </a>
        <p className="text-xs text-gr-muted">Para los que regalan usá “Mandala por WhatsApp”: ese link no deja editar.</p>
      </section>

      {activos.length === 0 && (
        <div className="relative mt-4 rounded-sticker border-[2.5px] border-dashed border-gr-ink px-5 py-8 text-center text-[15px] font-medium">
          <Starburst size={52} fontSize={50} className="absolute -right-2 -top-6 rotate-12">+</Starburst>
          Todavía no hay nada en “{grupo.nombre}”.<br />Agreguen lo primero que necesiten.
        </div>
      )}

      <OwnerItemsGrid items={activos} />

      {grupo.duenos.length > 1 && (
        <form action={leaveGroupAction} className="mt-4 self-center">
          <input type="hidden" name="grupoId" value={grupo.id} />
          <button className="min-h-11 px-3 text-sm font-semibold text-gr-muted underline underline-offset-4">Salir del grupo</button>
        </form>
      )}

      <a href={`https://wa.me/?text=${waRegalar}`} target="_blank"
         className="gr-btn gr-btn--dark fixed bottom-[104px] left-1/2 z-10 h-[54px] -translate-x-1/2 -rotate-2 whitespace-nowrap rounded-[18px] border-[3px] px-[22px]">
        <Icon name="chat" size={20} strokeWidth={2.4} />
        Mandala por WhatsApp
      </a>

      <BottomNav active="grupos" />
    </main>
  )
}
