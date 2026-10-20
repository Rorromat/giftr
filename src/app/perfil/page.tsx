import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { getOwnList } from '@/lib/lists'
import { saveBirthdayAction } from '@/app/actions'
import { MESES, miCumple } from '@/lib/events'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import { AvatarSticker, BottomNav, Icon, Starburst } from '@/components/ui'

const GIROS_FOTOS = [-8, 3, 9]

export default async function Perfil() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [lista, cumple] = await Promise.all([getOwnList(db, session.userId), miCumple(db, session.userId)])
  if (!lista) redirect('/')

  const activos = lista.items.filter((i) => i.estadoDueno === 'activo')
  const fotos = activos.flatMap((i) => (i.fotoUrl ? [{ id: i.id, src: i.fotoUrl }] : [])).slice(0, 3)
  const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${lista.shareToken}`
  const email = session.user?.email ?? ''
  const nombre = session.user?.name ?? email

  return (
    <main className="flex flex-col gap-3.5 pb-32 pt-[60px]">
      <div className="flex items-center gap-4">
        <AvatarSticker nombre={nombre} size={84} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="font-display text-[32px] leading-none font-extrabold tracking-[-0.04em] [overflow-wrap:anywhere]">{nombre}</h1>
          {email && <p className="truncate text-sm text-gr-muted">{email}</p>}
        </div>
      </div>

      <Link href="/mi-lista" className="gr-sticker mt-1.5 flex items-center gap-3.5 px-3.5 py-3">
        <div className="relative h-[60px] w-[86px] flex-none">
          {fotos.length > 0
            ? fotos.map((f, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- PoC: remote host images, no next/image config
                <img key={f.id} src={f.src} alt="" className="absolute size-[46px] rounded-xl border-[2.5px] border-gr-ink object-cover"
                     style={{ left: i * 20, top: [6, 0, 10][i], transform: `rotate(${GIROS_FOTOS[i]}deg)` }} />
              ))
            : <Starburst size={60} className="mx-auto rotate-12">{activos.length}</Starburst>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-extrabold">Mi lista</p>
          <p className="text-[13px] font-medium">{activos.length} {activos.length === 1 ? 'regalo' : 'regalos'} en tu lista</p>
        </div>
        <Icon name="chevron" size={20} strokeWidth={2.6} />
      </Link>

      <div className="flex items-center gap-3 rounded-sticker border-[3px] border-gr-ink bg-gr-ink py-3 pl-4 pr-3 text-gr-bg">
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold">Compartir mi lista</p>
          <p className="truncate text-[13px] font-semibold text-gr-accent">{shareUrl.replace(/^https?:\/\//, '')}</p>
        </div>
        <CopyLinkButton url={shareUrl} />
      </div>

      {/* Tu cumple: tu gente lo ve en Eventos y en la cuenta regresiva de tu lista */}
      <form id="cumple" action={saveBirthdayAction} className="gr-sticker flex flex-col gap-3 p-3.5">
        <div>
          <p className="font-display text-lg font-extrabold">Tu cumple</p>
          <p className="text-[13px] font-medium leading-snug">
            {cumple ? `El ${cumple.dia} de ${MESES[cumple.mes - 1]}. ` : ''}Tu gente lo ve en Eventos, con tiempo para elegir.
          </p>
        </div>
        <div className="flex gap-2">
          <select name="dia" aria-label="Día" defaultValue={cumple?.dia ?? ''} className="gr-input w-[30%] min-w-0">
            <option value="">Día</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select name="mes" aria-label="Mes" defaultValue={cumple?.mes ?? ''} className="gr-input min-w-0 flex-1">
            <option value="">Mes</option>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
          <button className="gr-btn-primary gr-btn--sm flex-none rounded-[14px]">Guardar</button>
        </div>
      </form>

      <BottomNav active="perfil" />
    </main>
  )
}
