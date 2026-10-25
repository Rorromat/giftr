import Link from 'next/link'
import { BotonEnviar } from '@/components/BotonEnviar'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { miFoto } from '@/lib/perfil'
import { getOwnList } from '@/lib/lists'
import { miGente, type Contacto } from '@/lib/gente'
import { juntarNombres } from '@/lib/groups'
import { anioSiEstaLejos, hoyLocal, MESES } from '@/lib/events'
import { unfollowAction } from '@/app/actions'
import { AvatarStack, AvatarSticker, Icon, Seccion, AppHeader } from '@/components/ui'

/**
 * "Cumple el 22 de agosto · en 14 días", "El 12 de octubre", "El 20 de noviembre de 2027" (a más de un año), "Sin cumple
 * cargado". La cuenta no se corta en dos renglones.
 */
function cuando(c: Contacto, hoy: Date) {
  if (!c.proxima) return c.tipo === 'personal' ? 'Sin cumple cargado' : null
  const { fecha, dias } = c.proxima
  const falta = dias === 0 ? '¡hoy!' : dias === 1 ? 'mañana' : dias <= 60 ? `en\u00a0${dias}\u00a0días` : null
  const anio = anioSiEstaLejos(fecha, hoy)
  const dia = `${fecha.getUTCDate()} de ${MESES[fecha.getUTCMonth()]}${anio ? ` de ${anio}` : ''}`
  return [`${c.tipo === 'personal' ? 'Cumple el' : 'El'} ${dia}`, falta].filter(Boolean).join(' · ')
}

function Persona({ c, hoy }: { c: Contacto; hoy: Date }) {
  const detalle = [
    c.tipo === 'grupo' && `De ${juntarNombres(c.duenos.map((d) => d.nombre.split(' ')[0]))}`,
    `${c.deseos} ${c.deseos === 1 ? 'deseo' : 'deseos'}`,
  ].filter(Boolean).join(' · ')
  const fecha = cuando(c, hoy)
  return (
    <li className="gr-card flex items-center gap-1 overflow-visible py-3 pl-3.5 pr-1.5">
      <Link href={c.href} className="flex min-w-0 flex-1 items-center gap-3">
        {c.tipo === 'personal'
          ? <AvatarSticker nombre={c.nombre} foto={c.duenos[0]?.foto} size={48} />
          : <AvatarStack nombres={c.duenos.map((d) => d.nombre).slice(0, 3)} fotos={c.duenos.map((d) => d.foto).slice(0, 3)} />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-base leading-tight font-semibold [overflow-wrap:anywhere]">{c.nombre}</p>
          {fecha && <p className="flex items-center gap-1.5 text-[13px] font-medium leading-snug"><Icon name="cake" size={14} className="flex-none" />{fecha}</p>}
          <p className="text-[13px] font-medium leading-snug text-gr-muted [overflow-wrap:anywhere]">{detalle}</p>
        </div>
      </Link>
      {/* Quitar pide dos toques: sin el link, no hay otra forma de volver a su lista */}
      <details className="relative flex-none">
        <summary aria-label={`Opciones de ${c.nombre}`}
                 className="flex size-11 cursor-pointer list-none items-center justify-center rounded-xl [&::-webkit-details-marker]:hidden">
          <Icon name="more" size={22} strokeWidth={2.2} />
        </summary>
        <form action={unfollowAction}
              className="absolute right-0 top-full z-20 mt-1 flex w-60 flex-col gap-2 rounded-2xl border border-gr-line bg-gr-surface p-3 shadow-float">
          <input type="hidden" name="listId" value={c.listId} />
          <p className="text-[13px] font-medium leading-snug">Deja de aparecer acá y en Eventos. Si volvés a abrir su lista, vuelve.</p>
          <BotonEnviar className="gr-btn gr-btn--sm min-h-11 text-sm">Quitar de tu gente</BotonEnviar>
        </form>
      </details>
    </li>
  )
}

export default async function Gente() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const hoy = hoyLocal()
  const [gente, lista, foto] = await Promise.all([miGente(db, session.userId, hoy), getOwnList(db, session.userId), miFoto(db, session.userId)])
  const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${lista?.shareToken ?? ''}`
  const wa = encodeURIComponent(`Te paso mi lista de deseos en GiftR 🎁 ${shareUrl} ¿Me pasás la tuya así sé qué regalarte?`)

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <AppHeader nombre={session.user?.name ?? session.user?.email ?? 'Vos'} foto={foto} />
      <div className="flex flex-col gap-1">
        <h1 className="gr-title">Tu gente</h1>
        <p className="text-[15px] text-gr-muted">A quienes les regalás, con sus listas a mano.</p>
      </div>

      {gente.length === 0 ? (
        <div className="gr-empty flex flex-col items-center gap-2 py-7 text-center">
          <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-gr-surface shadow-card"><Icon name="users" size={26} /></span>
          <p>Acá aparece la gente cuyas listas abrís con tu cuenta.</p>
          <p className="text-gr-muted">Es solo para vos: nadie ve a quién tenés.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {gente.map((c) => <Persona key={c.listId} c={c} hoy={hoy} />)}
        </ul>
      )}

      <section className="gr-card flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="gr-row__icon"><Icon name="plus" size={20} /></span>
          <div>
            <p className="text-base leading-tight font-semibold">¿Falta alguien?</p>
            <p className="mt-0.5 text-[13px] leading-snug text-gr-muted">Pedile el link de su lista y abrilo con tu cuenta: queda acá y su cumple aparece en Eventos.</p>
          </div>
        </div>
        {lista && (
          <a href={`https://wa.me/?text=${wa}`} target="_blank" className="gr-btn gr-btn--sm gap-2">
            <Icon name="chat" size={18} strokeWidth={2} />Pedile su lista por WhatsApp
          </a>
        )}
      </section>
    </Seccion>
  )
}
