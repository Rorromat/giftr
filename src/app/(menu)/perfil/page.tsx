import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { getOwnList } from '@/lib/lists'
import { cambiarNombreAction, cambiarUsuarioAction, guardarAliasAction, newShareLinkAction, salirAction, saveBirthdayAction } from '@/app/actions'
import { asegurarUsuario } from '@/lib/amigos'
import { MESES, miCumple } from '@/lib/events'
import { misGustos } from '@/lib/bienvenida'
import { yo } from '@/lib/perfil'
import { miAliasPago, tipoDeAlias } from '@/lib/users'
import { NOMBRE_INVITADO_MAXIMO } from '@/lib/types'
import { FotoPerfil } from '@/components/FotoPerfil'
import { CumpleCampos } from '@/components/CumpleCampos'
import { BotonEnviar } from '@/components/BotonEnviar'
import { ActivarAvisos } from '@/components/ActivarAvisos'
import { AgregarDesdeApps } from '@/components/AgregarDesdeApps'
import { ATAJO_IPHONE, plataformaDe, TEXTOS_APPS } from '@/lib/agregar-desde-apps'
import { clavesVapid } from '@/lib/codazos'
import { bloquesDeGustos, seccionesDeGustos } from '@/lib/gustos'
import { adelantoGustos } from '@/components/Gustos'
import { Confirmar } from '@/components/Confirmar'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import { UnirInvitado } from '@/components/Identidad'
import { invitadoDeEsteNavegador } from '@/lib/viewer'
import { Icon, PageHeader, Row, Seccion } from '@/components/ui'


export default async function Perfil({ searchParams }: {
  searchParams: Promise<{ nuevo?: string; cumple?: string; usuario?: string; nombre?: string; alias?: string; volver?: string | string[] }>
}) {
  const { nuevo, cumple: avisoCumple, usuario: avisoUsuario, nombre: avisoNombre, alias: avisoAlias, volver } = await searchParams
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [lista, cumple, gustos, alias] = await Promise.all([
    getOwnList(db, session.userId), miCumple(db, session.userId), misGustos(db, session.userId), miAliasPago(db, session.userId),
  ])
  const [{ nombre: suNombre, foto }, vapid, invitado, pedido, usuario] = await Promise.all([
    yo(db, session.userId), clavesVapid(db), invitadoDeEsteNavegador(), headers(), asegurarUsuario(db, session.userId),
  ])
  const secciones = seccionesDeGustos(gustos, true)
  const bloques = bloquesDeGustos(gustos)
  const cargados = bloques.filter((b) => b.cargado).length
  if (!lista) redirect('/')

  const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${lista.shareToken}`
  const email = session.user?.email ?? ''
  const nombre = suNombre ?? session.user?.name ?? email
  const plataforma = plataformaDe(pedido.get('user-agent') ?? '')

  return (
    <Seccion className="flex flex-col gap-5 pb-48 pt-2">
      {/* se llega desde tu foto, que está en las cuatro secciones: vuelve a la que estaba (ver lib/volver.ts) */}
      <PageHeader title="Tu perfil" back="/mi-lista" backLabel="Volver a tu lista" origen={{ pantalla: '/perfil', volver }} />

      <div className="gr-card flex items-center gap-4 p-4">
        <FotoPerfil nombre={nombre} foto={foto} size={72} propia />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-xl leading-tight font-semibold [overflow-wrap:anywhere]">{nombre}</h2>
          {email && <p className="truncate text-sm text-gr-muted">{email}</p>}
        </div>
      </div>

      {/* el nombre que ven los demás (en su gente, las listas, los regalos): si no, el de Google (ver cambiarNombre) */}
      <form id="nombre" action={cambiarNombreAction} className="gr-card flex scroll-mt-6 flex-col gap-2 p-4">
        <label htmlFor="nombre-campo" className="text-base font-semibold">Tu nombre</label>
        <div className="flex gap-2">
          {/* el mensaje de abajo (la ayuda, o por qué no se guardó) se lee con el campo; con error, queda marcado */}
          <input id="nombre-campo" name="nombre" defaultValue={nombre} required maxLength={NOMBRE_INVITADO_MAXIMO} autoComplete="name"
                 aria-describedby="nombre-ayuda" aria-invalid={avisoNombre === 'vacio' || avisoNombre === 'largo' || undefined}
                 className="gr-input min-w-0 flex-1" />
          <BotonEnviar className="gr-btn gr-btn--sm flex-none">Guardar</BotonEnviar>
        </div>
        {avisoNombre === 'ok' ? <p id="nombre-ayuda" role="status" className="text-[13px] font-semibold">Listo, ahora te ven como {nombre}.</p>
          : avisoNombre === 'vacio' ? <p id="nombre-ayuda" role="alert" className="text-[13px] font-semibold text-red-700">Poné tu nombre así los demás saben quién sos.</p>
          : avisoNombre === 'largo' ? <p id="nombre-ayuda" role="alert" className="text-[13px] font-semibold text-red-700">Hasta {NOMBRE_INVITADO_MAXIMO} letras.</p>
          : <p id="nombre-ayuda" className="text-[13px] text-gr-muted">Así te ven tus amigos y los que abren tu lista.</p>}
      </form>

      {/* el @usuario: con esto te encuentran para sumarte como amigo (ver amigos.ts) */}
      <form id="usuario" action={cambiarUsuarioAction} className="gr-card flex scroll-mt-6 flex-col gap-2 p-4">
        <label htmlFor="usuario-campo" className="text-base font-semibold">Tu usuario</label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-gr-muted">@</span>
            <input id="usuario-campo" name="usuario" defaultValue={usuario ?? ''} required minLength={3} maxLength={21}
                   autoComplete="off" autoCapitalize="none" spellCheck={false}
                   aria-describedby="usuario-ayuda" aria-invalid={avisoUsuario === 'ocupado' || avisoUsuario === 'formato' || undefined}
                   className="gr-input w-full pl-8" />
          </div>
          <BotonEnviar className="gr-btn gr-btn--sm flex-none">Guardar</BotonEnviar>
        </div>
        {avisoUsuario === 'ok' ? <p id="usuario-ayuda" role="status" className="text-[13px] font-semibold">Listo, ahora sos @{usuario}.</p>
          : avisoUsuario === 'ocupado' ? <p id="usuario-ayuda" role="alert" className="text-[13px] font-semibold text-red-700">Ese usuario ya lo tiene alguien. Probá con otro.</p>
          : avisoUsuario === 'formato' ? <p id="usuario-ayuda" role="alert" className="text-[13px] font-semibold text-red-700">De 3 a 20 letras, números, punto o guión bajo, sin espacios.</p>
          : <p id="usuario-ayuda" className="text-[13px] text-gr-muted">Con esto te encuentran para sumarte como amigo.</p>}
      </form>

      <div id="link" className="flex scroll-mt-6 flex-col gap-1.5">
        <section className="gr-hero flex items-center gap-3 p-4 pl-5">
          <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-full bg-gr-on-hero/10 text-gr-hero-detail"><Icon name="link" size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">Compartir mi lista</p>
            <p className="truncate text-[13px] text-gr-on-hero/60">{shareUrl.replace(/^https?:\/\//, '')}</p>
          </div>
          <CopyLinkButton url={shareUrl} />
        </section>
        {nuevo === 'regalar' && (
          <p role="status" className="rounded-gr-md bg-gr-soft px-3.5 py-3 text-sm font-medium">
            Listo: tu link es nuevo. El de antes ya no anda: volvé a compartirlo.
          </p>
        )}
        {/* por si el link llegó a quien no tenía que llegar */}
        <Confirmar resumen="Cambiar el link para regalar" boton="Sí, cambiar el link" action={newShareLinkAction} ocultos={{}}
                   className="items-end">
          El link de ahora deja de andar: los que lo tienen no van a poder abrir tu lista hasta que les mandes el nuevo, y
          tu lista sale de su gente y de Todo el año (tus amigos la siguen viendo). Lo que ya reservaron no se pierde.
        </Confirmar>
      </div>

      <section className="flex flex-col gap-2.5">
        <h2 className="gr-heading">Lo que ve tu gente</h2>
        <div className="gr-card gr-rows">
          {/* Tus gustos: los ve tu gente arriba de tu lista; se ven y se editan en /perfil/gustos */}
          <Row href="/perfil/gustos" icon="heart" title="Tus gustos"
               sub={secciones.length ? adelantoGustos(secciones) : 'Contale a tu gente qué te gusta: club, talles, marcas…'}>
            <span className="flex flex-none items-center gap-1 text-sm font-semibold tabular-nums">
              {cargados ? `${cargados} de ${bloques.length}` : 'Completar'}
              <Icon name="chevron" size={18} className="text-gr-muted" />
            </span>
          </Row>
          <Row href={`/l/${lista.shareToken}/perfil`} icon="eye" title="Ver cómo me ven los demás" />
        </div>
      </section>

      {/* Avisos push: así llegan al celular los codazos, las solicitudes y lo demás de la bandeja (desde ahí se llega con #avisos) */}
      <section id="avisos" className="flex scroll-mt-6 flex-col gap-2.5">
        <h2 className="gr-heading">Avisos</h2>
        <div className="gr-card flex flex-col gap-3 p-4">
          <p className="flex items-start gap-3 text-[13px] leading-snug text-gr-muted">
            <span className="gr-row__icon text-gr-ink"><Icon name="bell" size={20} /></span>
            <span className="pt-0.5">Los codazos, las solicitudes de amistad y lo demás que ves en la campanita, también como notificación en el celular.</span>
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

      {/* Adónde le transfieren su parte de un regalo grupal que compró él. No va en "Lo que ve tu gente": lo ve solo quien
          le debe (ver CuentaPersona.alias). La key lo vuelve a armar con lo guardado, como el cumple. */}
      <section id="alias" className="flex scroll-mt-6 flex-col gap-2.5">
        <h2 className="gr-heading">Para que te transfieran</h2>
        <form key={`${alias ?? ''}-${avisoAlias ?? ''}`} action={guardarAliasAction} className="gr-card flex flex-col gap-2 p-4">
          <label htmlFor="alias-campo" className="text-base font-semibold">Tu alias o CVU</label>
          <div className="flex gap-2">
            <input id="alias-campo" name="alias" defaultValue={alias ?? ''} maxLength={40} placeholder="tu.alias.mp"
                   autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                   aria-describedby="alias-ayuda" className="gr-input min-w-0 flex-1" />
            <BotonEnviar className="gr-btn gr-btn--sm flex-none">Guardar</BotonEnviar>
          </div>
          {avisoAlias === 'formato' && (
            <p role="alert" className="text-[13px] font-semibold text-red-700">
              No se guardó: un alias tiene de 6 a 20 letras, números, puntos o guiones; un CVU o CBU, 22 números.
            </p>
          )}
          {avisoAlias === 'ok' && alias && <p role="status" className="text-[13px] font-semibold">Listo, te transfieren a tu {tipoDeAlias(alias)} {alias}.</p>}
          {avisoAlias === 'borrado' && !alias && <p role="status" className="text-[13px] font-semibold">Listo, lo borramos.</p>}
          <p id="alias-ayuda" className="text-[13px] text-gr-muted">
            Lo ve solo quien te debe su parte de un regalo grupal, en Cuentas y en el aviso de la compra. No aparece en tu
            lista ni en tu perfil. Para borrarlo, dejalo vacío y guardá.
          </p>
        </form>
      </section>

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
              Tu gente lo ve en Todo el año, con tiempo para elegir.
            </span>
          </p>
          {avisoCumple === 'invalido' && (
            <>
              <input type="hidden" name="conAviso" value="1" />
              <p id="cumple-error" role="alert" className="text-[13px] font-semibold">No se guardó: elegí un día y un mes que existan.</p>
            </>
          )}
          <div className="flex gap-2">
            <CumpleCampos dia={cumple?.dia} mes={cumple?.mes} exigir claseDia="w-[30%]" error={avisoCumple === 'invalido' ? 'cumple-error' : undefined} />
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

      <TuPrivacidad />

      {/* Para dejar este dispositivo (el de la familia, la tablet) o entrar con otra cuenta */}
      <form action={salirAction} className="self-center">
        <input type="hidden" name="volver" value="/" />
        <button className="min-h-11 px-3 text-sm font-semibold text-red-700">Cerrar sesión</button>
      </form>

      <ZonaBorrarCuenta />
    </Seccion>
  )
}

/**
 * Quién ve tu perfil y cómo cortarlo, llevarte tus datos y leer qué se guarda. El perfil (foto, cumple, gustos, talles) lo
 * ve cualquiera con el link de la lista (ver perfilPublico), y dejar de ser amigos no le saca el link a quien ya lo vio:
 * lo único que corta ese acceso es cambiar el link, y hay que decirlo donde se habla de privacidad.
 */
function TuPrivacidad() {
  return (
    <section id="privacidad" className="flex scroll-mt-6 flex-col gap-2.5">
      <h2 className="gr-heading">Tu privacidad</h2>
      <div className="gr-card gr-rows">
        <p className="flex items-start gap-3 p-4 text-[13px] leading-snug text-gr-muted">
          <span className="gr-row__icon text-gr-ink"><Icon name="eye" size={20} /></span>
          <span className="pt-0.5">
            Tu perfil (foto, cumple, gustos y talles) lo ve cualquiera que tenga el link de tu lista, sea o no tu amigo. Si
            el link llegó a quien no querías, o dejaste de ser amigo de alguien que ya lo tenía,{' '}
            <a href="#link" className="font-semibold text-gr-ink underline underline-offset-2">cambiá el link</a>: el de antes deja de andar.
          </span>
        </p>
        {/* un <a> con download y no un Link: baja un archivo (ver /api/perfil/datos), no es una pantalla */}
        <a href="/api/perfil/datos" download className="gr-row">
          <span className="gr-row__icon"><Icon name="note" size={20} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-semibold">Descargar mis datos</span>
            <span className="truncate text-[13px] text-gr-muted">Un archivo con todo lo tuyo en GiftR</span>
          </span>
          <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
        </a>
        <Row href="/privacidad" icon="shield" title="Qué guardamos y quién lo ve" sub="Tu privacidad en GiftR, cortito" />
      </div>
    </section>
  )
}

/** Al final de todo y aparte: borrar la cuenta no se deshace. Lo que pasa y la confirmación están en /perfil/borrar. */
function ZonaBorrarCuenta() {
  return (
    <section id="borrar" className="mt-6 flex scroll-mt-6 flex-col items-center gap-1 border-t border-gr-line pt-5 text-center">
      <p className="text-[13px] leading-snug text-gr-muted">¿No querés usar más GiftR? Podés borrar tu cuenta y todo lo tuyo.</p>
      <Link href="/perfil/borrar" className="flex min-h-11 items-center px-3 text-sm font-semibold text-red-700 underline underline-offset-4">Borrar mi cuenta</Link>
    </section>
  )
}
