import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { getOwnList } from '@/lib/lists'
import { newShareLinkAction, salirAction, saveBirthdayAction } from '@/app/actions'
import { MESES, miCumple } from '@/lib/events'
import { misGustos } from '@/lib/bienvenida'
import { miFoto } from '@/lib/perfil'
import { FotoPerfil } from '@/components/FotoPerfil'
import { CumpleCampos } from '@/components/CumpleCampos'
import { BotonEnviar } from '@/components/BotonEnviar'
import { ActivarAvisos } from '@/components/ActivarAvisos'
import { AgregarDesdeApps } from '@/components/AgregarDesdeApps'
import { ATAJO_IPHONE, plataformaDe, TEXTOS_APPS } from '@/lib/agregar-desde-apps'
import { clavesVapid } from '@/lib/codazos'
import { seccionesDeGustos } from '@/lib/gustos'
import { adelantoGustos } from '@/components/Gustos'
import { Confirmar } from '@/components/Confirmar'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import { UnirInvitado } from '@/components/Identidad'
import { invitadoDeEsteNavegador } from '@/lib/viewer'
import { Icon, PageHeader, Row, Seccion } from '@/components/ui'


export default async function Perfil({ searchParams }: { searchParams: Promise<{ nuevo?: string; cumple?: string }> }) {
  const { nuevo, cumple: avisoCumple } = await searchParams
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [lista, cumple, gustos] = await Promise.all([
    getOwnList(db, session.userId), miCumple(db, session.userId), misGustos(db, session.userId),
  ])
  const [foto, vapid, invitado, pedido] = await Promise.all([miFoto(db, session.userId), clavesVapid(db), invitadoDeEsteNavegador(), headers()])
  const secciones = seccionesDeGustos(gustos, true)
  if (!lista) redirect('/')

  const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${lista.shareToken}`
  const email = session.user?.email ?? ''
  const nombre = session.user?.name ?? email
  const plataforma = plataformaDe(pedido.get('user-agent') ?? '')

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <PageHeader title="Tu perfil" back="/mi-lista" backLabel="Volver a tu lista" />

      <div className="gr-card flex items-center gap-4 p-4">
        <FotoPerfil nombre={nombre} foto={foto} size={72} propia />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-xl leading-tight font-semibold [overflow-wrap:anywhere]">{nombre}</h2>
          {email && <p className="truncate text-sm text-gr-muted">{email}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <section className="gr-hero flex items-center gap-3 p-4 pl-5">
          <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-full bg-gr-on-hero/10 text-gr-hero-detail"><Icon name="link" size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">Compartir mi lista</p>
            <p className="truncate text-[13px] text-gr-on-hero/60">{shareUrl.replace(/^https?:\/\//, '')}</p>
          </div>
          <CopyLinkButton url={shareUrl} />
        </section>
        {nuevo === 'regalar' && (
          <p role="status" className="rounded-2xl bg-gr-accent px-3.5 py-3 text-sm font-medium">
            Listo: tu link es nuevo. El de antes ya no anda: volvé a compartirlo.
          </p>
        )}
        {/* por si el link llegó a quien no tenía que llegar */}
        <Confirmar resumen="Cambiar el link para regalar" boton="Sí, cambiar el link" action={newShareLinkAction} ocultos={{}}
                   className="items-end">
          El link de ahora deja de andar: los que lo tienen no van a poder abrir tu lista hasta que les mandes el nuevo, y
          tu lista sale de su gente y de sus eventos. Lo que ya reservaron no se pierde.
        </Confirmar>
      </div>

      <section className="flex flex-col gap-2.5">
        <h2 className="gr-heading">Lo que ve tu gente</h2>
        <div className="gr-card gr-rows">
          {/* Tus gustos: los ve tu gente arriba de tu lista */}
          <Row href="/bienvenida?editar=1" icon="heart" title="Tus gustos"
               sub={secciones.length ? adelantoGustos(secciones) : 'Contale a tu gente qué te gusta: club, talles, marcas…'}>
            <span className="flex-none text-sm font-semibold">{secciones.length ? 'Editar' : 'Completar'}</span>
          </Row>
          <Row href={`/l/${lista.shareToken}/perfil`} icon="eye" title="Ver cómo me ven los demás" />
        </div>
      </section>

      {/* Avisos push: así llegan los codazos */}
      <section className="flex flex-col gap-2.5">
        <h2 className="gr-heading">Avisos</h2>
        <div className="gr-card flex flex-col gap-3 p-4">
          <p className="flex items-start gap-3 text-[13px] leading-snug text-gr-muted">
            <span className="gr-row__icon text-gr-ink"><Icon name="bell" size={20} /></span>
            <span className="pt-0.5">Cuando alguien te da un codazo para que cargues tu lista, te llega una notificación.</span>
          </p>
          <ActivarAvisos vapidPublica={vapid.publica} />
        </div>
      </section>

      {/* Compartir a GiftR un link o una foto desde otra app. En la compu no va: no hay hoja de compartir con GiftR. */}
      {plataforma && (
        <section className="flex flex-col gap-2.5">
          <h2 className="gr-heading">{TEXTOS_APPS.titulo}</h2>
          <div className="gr-card flex flex-col gap-3 p-4">
            <AgregarDesdeApps plataforma={plataforma} base={process.env.NEXT_PUBLIC_BASE_URL ?? ''} atajo={ATAJO_IPHONE} />
          </div>
        </section>
      )}


      {/* Tu cumple: tu gente lo ve en Eventos y en la cuenta regresiva de tu lista. La key lo vuelve a armar con lo
          guardado: React deja el formulario como estaba al montarse y un <select> volvía al valor viejo. */}
      <section className="flex flex-col gap-2.5">
        <h2 className="gr-heading">Tu cumple</h2>
        <form key={`${cumple?.dia ?? ''}-${cumple?.mes ?? ''}-${avisoCumple ?? ''}`} id="cumple" action={saveBirthdayAction}
              className="gr-card flex scroll-mt-6 flex-col gap-3 p-4">
          <p className="flex items-start gap-3 text-[13px] leading-snug text-gr-muted">
            <span className="gr-row__icon text-gr-ink"><Icon name="cake" size={20} /></span>
            <span className="pt-0.5">
              {cumple && <span className="block text-[15px] font-semibold text-gr-ink">El {cumple.dia} de {MESES[cumple.mes - 1]}.</span>}
              Tu gente lo ve en Eventos, con tiempo para elegir.
            </span>
          </p>
          {avisoCumple === 'invalido' && (
            <>
              <input type="hidden" name="conAviso" value="1" />
              <p role="alert" className="text-[13px] font-semibold">No se guardó: elegí un día y un mes que existan.</p>
            </>
          )}
          <div className="flex gap-2">
            <CumpleCampos dia={cumple?.dia} mes={cumple?.mes} exigir claseDia="w-[30%]" />
            <BotonEnviar className="gr-btn-primary gr-btn--sm min-h-[50px] flex-none">Guardar</BotonEnviar>
          </div>
          {cumple && (
            <BotonEnviar name="quitar" value="1" formNoValidate className="gr-link self-start">
              Quitar mi cumple
            </BotonEnviar>
          )}
        </form>
      </section>

      {invitado && <UnirInvitado nombre={invitado} />}

      {/* Para dejar este dispositivo (el de la familia, la tablet) o entrar con otra cuenta */}
      <form action={salirAction} className="self-center">
        <input type="hidden" name="volver" value="/" />
        <button className="min-h-11 px-3 text-sm font-semibold text-red-700">Cerrar sesión</button>
      </form>
    </Seccion>
  )
}
