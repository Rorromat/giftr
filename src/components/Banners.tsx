import { db } from '@/db'
import { getViewer, invitadoParaPreguntar } from '@/lib/viewer'
import { getUnreadNotifications, textoDeAviso } from '@/lib/notifications'
import { getMyClaimWarnings } from '@/lib/claims'
import { regalosParaCerrar } from '@/lib/regalos'
import { boughtAction, markNotifsReadAction, postponeGroupGiftReminderAction, releaseAction, vistoCodazosAction } from '@/app/actions'
import { codazosSinVer, tieneAvisos } from '@/lib/codazos'
import { juntarNombres } from '@/lib/groups'
import Link from 'next/link'
import { Icon, QuizasLink, Starburst } from '@/components/ui'
import { PreguntaInvitado } from '@/components/Identidad'
import { BotonEnviar } from '@/components/BotonEnviar'

/**
 * Los carteles llevan al deseo; si no hay link (cambiaron el de la lista y no lo tiene), el mismo cartel sin link (el de
 * una reserva, con sus botones ahí mismo).
 */
export async function Banners() {
  const viewer = await getViewer()
  const [todas, warnings, sinCerrar, codazos, avisos, invitado] = await Promise.all([
    getUnreadNotifications(db, viewer),
    getMyClaimWarnings(db, viewer),
    viewer.userId ? regalosParaCerrar(db, viewer.userId) : [],
    viewer.userId ? codazosSinVer(db, viewer.userId) : [],
    viewer.userId ? tieneAvisos(db, viewer.userId) : false,
    viewer.userId ? invitadoParaPreguntar(viewer.userId) : null,
  ])
  const notifs = todas.flatMap((n) => {
    const texto = textoDeAviso(n.tipo, n.itemTitulo)
    return texto ? [{ id: n.id, texto, href: n.href }] : []
  })
  if (!notifs.length && !warnings.length && !sinCerrar.length && !codazos.length && !invitado) return null
  // Codazos: quiénes (sin repetir) y, si todos son para el mismo grupo, agregar directo ahí.
  const quienes = [...new Set(codazos.map((c) => c.deNombre.split(' ')[0]))]
  const grupos = [...new Set(codazos.map((c) => (c.tipo === 'grupo' ? c.listId : null)))]
  const grupo = grupos.length === 1 && grupos[0] ? codazos[0] : null

  return (
    <div className="flex flex-col gap-2.5">
      {invitado && <PreguntaInvitado nombre={invitado} />}
      {codazos.length > 0 && (
        <div className="relative flex flex-col gap-2.5 rounded-2xl border-[2.5px] border-gr-ink bg-gr-accent py-3 pl-3.5 pr-12 shadow-sticker-sm">
          <Starburst size={40} fontSize={46} className="absolute -right-2 -top-3 rotate-12">!</Starburst>
          <p className="text-sm font-semibold leading-snug">
            <span className="font-extrabold">{juntarNombres(quienes)}</span> te {quienes.length > 1 ? 'dieron' : 'dio'} un codazo:
            {quienes.length > 1 ? ' quieren' : ' quiere'} saber qué regalarte{grupo ? ` en "${grupo.listaNombre ?? 'tu grupo'}"` : ''}.
          </p>
          <div className="flex items-center gap-3">
            <Link href={grupo ? `/agregar?lista=${grupo.listId}` : '/agregar'} className="gr-btn gr-btn--sm flex-none rounded-[14px] px-4 font-sans text-sm font-bold">
              Agregar algo
            </Link>
            <form action={vistoCodazosAction}>
              <BotonEnviar className="min-h-11 text-sm font-bold underline decoration-2 underline-offset-4">Listo</BotonEnviar>
            </form>
          </div>
          {!avisos && <p className="text-xs font-semibold">Activá los avisos en Perfil para enterarte al toque.</p>}
        </div>
      )}
      {notifs.map((n) => (
        <QuizasLink key={n.id} href={n.href}
                    className="flex items-center gap-2 rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface px-3.5 py-3 text-sm font-medium shadow-sticker-sm">
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{n.texto}</span>
          {n.href && <Icon name="chevron" size={18} strokeWidth={2.6} className="flex-none" />}
        </QuizasLink>
      ))}
      {warnings.map((w) => (
        <QuizasLink key={w.claimId} href={w.href}
                    className="relative block rounded-2xl border-[2.5px] border-gr-ink bg-gr-ink py-3 pl-3.5 pr-12 text-sm font-medium text-gr-bg">
          {`¿Conseguiste "${w.itemTitulo}"? Te quedan `}
          <span className="font-bold text-gr-accent">{w.diasRestantes} {w.diasRestantes === 1 ? 'día' : 'días'}</span>
          {' de reserva.'}
          {/* en el deseo se marca comprado o se libera */}
          {w.href && <span className="mt-0.5 block font-bold underline decoration-2 underline-offset-4">Marcalo o liberalo</span>}
          {/* Sin el link de ahora no llega al deseo: lo marca o lo libera desde acá, como un regalo grupal en Cuentas. Si
              no, vencía y el deseo volvía a quedar libre aunque ya lo hubiera comprado. Un invitado que solo tenía esa
              lista no ve este cartel en ningún lado (no abre otras): su reserva vence sola. */}
          {!w.href && (
            <div className="flex gap-4">
              <form action={boughtAction}>
                <input type="hidden" name="claimId" value={w.claimId} />
                <BotonEnviar className="min-h-11 font-bold text-gr-accent underline decoration-2 underline-offset-4">Ya lo compré</BotonEnviar>
              </form>
              <form action={releaseAction}>
                <input type="hidden" name="claimId" value={w.claimId} />
                <BotonEnviar className="min-h-11 font-bold underline decoration-2 underline-offset-4">Liberala</BotonEnviar>
              </form>
            </div>
          )}
          <Starburst size={40} fontSize={46} className="absolute -right-2 -top-3 rotate-12">!</Starburst>
        </QuizasLink>
      ))}
      {/* Un regalo grupal no vence solo (quizás ya lo compró, y con gente adentro se perdería la coordinación): al que lo
          organiza se le recuerda que lo cierre (ver cuandoRecordar). Si todavía no es momento, "Sigue en pie" lo saca por 2
          semanas. */}
      {sinCerrar.map((r) => (
        <div key={r.giftId} className="relative rounded-2xl border-[2.5px] border-gr-ink bg-gr-ink pb-1 pl-3.5 pr-12 pt-3 text-sm font-medium text-gr-bg">
          <Link href={r.href} className="block">
            {`El regalo grupal de "${r.itemTitulo}" que organizás sigue abierto.`}
            <span className="mt-0.5 block font-bold underline decoration-2 underline-offset-4">Si ya lo compraste, dividí lo que salió; si no va, cancelalo</span>
          </Link>
          <form action={postponeGroupGiftReminderAction}>
            <input type="hidden" name="giftId" value={r.giftId} />
            <BotonEnviar className="min-h-11 text-xs font-bold text-gr-accent underline decoration-2 underline-offset-4">Sigue en pie: recordámelo en 2 semanas</BotonEnviar>
          </form>
          <Starburst size={40} fontSize={46} className="absolute -right-2 -top-3 rotate-12">!</Starburst>
        </div>
      ))}
      {notifs.length > 0 && (
        <form action={markNotifsReadAction}>
          <BotonEnviar className="min-h-11 text-xs font-bold underline decoration-2 underline-offset-4">Marcar como leídas</BotonEnviar>
        </form>
      )}
    </div>
  )
}
