import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { getOwnList } from '@/lib/lists'
import { newShareLinkAction, salirAction, saveBirthdayAction } from '@/app/actions'
import { MESES, miCumple } from '@/lib/events'
import { misCuentas, pesos } from '@/lib/regalos'
import { misGustos } from '@/lib/bienvenida'
import { miFoto } from '@/lib/perfil'
import { FotoPerfil } from '@/components/FotoPerfil'
import { ActivarAvisos } from '@/components/ActivarAvisos'
import { clavesVapid } from '@/lib/codazos'
import { seccionesDeGustos } from '@/lib/gustos'
import { adelantoGustos } from '@/components/Gustos'
import { Confirmar } from '@/components/Confirmar'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import { UnirInvitado } from '@/components/Identidad'
import { invitadoDeEsteNavegador } from '@/lib/viewer'
import { Icon, Seccion, Starburst } from '@/components/ui'

const GIROS_FOTOS = [-8, 3, 9]

export default async function Perfil({ searchParams }: { searchParams: Promise<{ nuevo?: string }> }) {
  const { nuevo } = await searchParams
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [lista, cumple, cuentas, gustos] = await Promise.all([
    getOwnList(db, session.userId), miCumple(db, session.userId), misCuentas(db, session.userId), misGustos(db, session.userId),
  ])
  const [foto, vapid, invitado] = await Promise.all([miFoto(db, session.userId), clavesVapid(db), invitadoDeEsteNavegador()])
  const secciones = seccionesDeGustos(gustos, true)
  if (!lista) redirect('/')

  const activos = lista.items.filter((i) => i.estadoDueno === 'activo')
  const fotos = activos.flatMap((i) => (i.fotoUrl ? [{ id: i.id, src: i.fotoUrl }] : [])).slice(0, 3)
  const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${lista.shareToken}`
  const email = session.user?.email ?? ''
  const nombre = session.user?.name ?? email

  return (
    <Seccion className="flex flex-col gap-3.5 pb-32 pt-[60px]">
      <div className="flex items-center gap-4">
        <FotoPerfil nombre={nombre} foto={foto} size={84} propia />
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
      {nuevo === 'regalar' && (
        <p role="status" className="rounded-2xl border-[2.5px] border-gr-ink bg-gr-accent px-3.5 py-3 text-sm font-semibold shadow-sticker-sm">
          Listo: tu link es nuevo. El de antes ya no anda: volvé a compartirlo.
        </p>
      )}
      {/* por si el link llegó a quien no tenía que llegar */}
      <Confirmar resumen="Cambiar el link para regalar" boton="Sí, cambiar el link" action={newShareLinkAction} ocultos={{}}
                 className="-mt-1.5 items-end">
        El link de ahora deja de andar: los que lo tienen no van a poder abrir tu lista hasta que les mandes el nuevo, y
        tu lista sale de su gente y de sus eventos. Lo que ya reservaron no se pierde.
      </Confirmar>

      {/* Tus gustos: los ve tu gente arriba de tu lista */}
      <Link href="/bienvenida?editar=1" className="gr-sticker flex items-center gap-3.5 px-3.5 py-3">
        <span aria-hidden className="flex size-[46px] flex-none -rotate-6 items-center justify-center rounded-xl border-[2.5px] border-gr-ink bg-gr-accent font-display text-2xl font-extrabold">♥</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-extrabold">Tus gustos</p>
          <p className="truncate text-[13px] font-medium">{secciones.length ? adelantoGustos(secciones) : 'Contale a tu gente qué te gusta: club, talles, marcas…'}</p>
        </div>
        <span className="text-sm font-bold underline decoration-2 underline-offset-4">{secciones.length ? 'Editar' : 'Completar'}</span>
      </Link>
      <Link href={`/l/${lista.shareToken}/perfil`} className="-mt-1.5 self-end text-sm font-bold underline decoration-2 underline-offset-4">
        Ver cómo me ven los demás
      </Link>

      {/* Avisos push: así llegan los codazos */}
      <section className="gr-sticker flex flex-col gap-2.5 p-3.5">
        <div>
          <p className="font-display text-lg font-extrabold">Avisos</p>
          <p className="text-[13px] font-medium leading-snug">Cuando alguien te da un codazo para que cargues tu lista, te llega una notificación.</p>
        </div>
        <ActivarAvisos vapidPublica={vapid.publica} />
      </section>

      {/* Cuentas de los regalos grupales: a quién le debés y quién te debe */}
      <Link href="/cuentas" className="gr-sticker flex items-center gap-3.5 px-3.5 py-3">
        <span className="flex size-[46px] flex-none items-center justify-center rounded-xl border-[2.5px] border-gr-ink bg-gr-accent font-display text-2xl font-extrabold">$</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-extrabold">Cuentas</p>
          <p className="text-[13px] font-medium">
            {cuentas.debes || cuentas.teDeben
              ? [cuentas.debes && `Debés ${pesos(cuentas.debes)}`, cuentas.teDeben && `Te deben ${pesos(cuentas.teDeben)}`].filter(Boolean).join(' · ')
              : cuentas.enCurso.length ? `${cuentas.enCurso.length} ${cuentas.enCurso.length === 1 ? 'regalo grupal' : 'regalos grupales'} en curso` : 'Regalos entre varios, a lo Splitwise'}
          </p>
        </div>
        <Icon name="chevron" size={20} strokeWidth={2.6} />
      </Link>

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

      {invitado && <UnirInvitado nombre={invitado} />}

      {/* Para dejar este dispositivo (el de la familia, la tablet) o entrar con otra cuenta */}
      <form action={salirAction} className="self-center">
        <input type="hidden" name="volver" value="/" />
        <button className="min-h-11 text-sm font-bold underline decoration-2 underline-offset-4">Cerrar sesión</button>
      </form>
    </Seccion>
  )
}
