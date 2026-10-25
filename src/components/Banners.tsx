import { db } from '@/db'
import { getViewer, invitadoParaPreguntar } from '@/lib/viewer'
import { getUnreadNotifications, textoDeAviso } from '@/lib/notifications'
import { getMyClaimWarnings } from '@/lib/claims'
import { regalosParaCerrar } from '@/lib/regalos'
import { boughtAction, markNotifsReadAction, postponeGroupGiftReminderAction, releaseAction, vistoCodazosAction } from '@/app/actions'
import { codazosSinVer, tieneAvisos } from '@/lib/codazos'
import { juntarNombres } from '@/lib/groups'
import Link from 'next/link'
import { Icon, QuizasLink } from '@/components/ui'
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
        <div className="flex flex-col gap-3 rounded-[22px] bg-gr-blue p-4 text-white shadow-card">
          <div className="flex items-start gap-3">
            <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-full bg-white/15 text-xl">👉</span>
            <p className="text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">
              <span className="font-semibold">{juntarNombres(quienes)}</span> te {quienes.length > 1 ? 'dieron' : 'dio'} un codazo:
              {quienes.length > 1 ? ' quieren' : ' quiere'} saber qué regalarte{grupo ? ` en "${grupo.listaNombre ?? 'tu grupo'}"` : ''}.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href={grupo ? `/agregar?lista=${grupo.listId}` : '/agregar'} className="gr-btn gr-btn--sm flex-none border-white">
              Agregar algo
            </Link>
            <form action={vistoCodazosAction}>
              <BotonEnviar className="min-h-11 px-2 text-sm font-semibold underline underline-offset-4">Listo</BotonEnviar>
            </form>
          </div>
          {!avisos && <p className="text-xs font-medium text-white/80">Activá los avisos en Perfil para enterarte al toque.</p>}
        </div>
      )}
      {notifs.map((n) => (
        <QuizasLink key={n.id} href={n.href}
                    className="gr-card flex items-center gap-3 px-4 py-3.5 text-sm font-medium">
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{n.texto}</span>
          {n.href && <Icon name="chevron" size={18} className="flex-none text-gr-muted" />}
        </QuizasLink>
      ))}
      {warnings.map((w) => (
        <QuizasLink key={w.claimId} href={w.href}
                    className="relative block rounded-[22px] bg-gr-brand px-4 py-3.5 text-sm font-medium text-gr-on-brand">
          {`¿Conseguiste "${w.itemTitulo}"? Te quedan `}
          <span className="font-semibold text-gr-accent">{w.diasRestantes} {w.diasRestantes === 1 ? 'día' : 'días'}</span>
          {' de reserva.'}
          {/* en el deseo se marca comprado o se libera */}
          {w.href && <span className="mt-0.5 block font-semibold underline underline-offset-4">Marcalo o liberalo</span>}
          {/* Sin el link de ahora no llega al deseo: lo marca o lo libera desde acá, como un regalo grupal en Cuentas. Si
              no, vencía y el deseo volvía a quedar libre aunque ya lo hubiera comprado. Un invitado que solo tenía esa
              lista no ve este cartel en ningún lado (no abre otras): su reserva vence sola.
              Costos aceptados, sin estados ni mensajes nuevos: "Ya lo compré" no hace nada si venció con la pantalla
              abierta (volver a reservarla pide el link de ahora) o si es un invitado al que hay que volver a preguntarle
              "¿Es tu lista?" (se sumó alguien al grupo después de que dijo que no); liberarla, sí. Y deshacer un "Ya lo
              compré" tocado de más pide el link de ahora, igual que reservar de nuevo. */}
          {!w.href && (
            <div className="flex gap-4">
              <form action={boughtAction}>
                <input type="hidden" name="claimId" value={w.claimId} />
                <BotonEnviar className="min-h-11 font-semibold text-gr-accent underline underline-offset-4">Ya lo compré</BotonEnviar>
              </form>
              <form action={releaseAction}>
                <input type="hidden" name="claimId" value={w.claimId} />
                <BotonEnviar className="min-h-11 font-semibold underline underline-offset-4">Liberala</BotonEnviar>
              </form>
            </div>
          )}
        </QuizasLink>
      ))}
      {/* Un regalo grupal no vence solo (quizás ya lo compró, y con gente adentro se perdería la coordinación): al que lo
          organiza se le recuerda que lo cierre (ver cuandoRecordar). Si todavía no es momento, "Sigue en pie" lo saca por 2
          semanas. */}
      {sinCerrar.map((r) => (
        <div key={r.giftId} className="relative rounded-[22px] bg-gr-brand px-4 pb-1.5 pt-3.5 text-sm font-medium text-gr-on-brand">
          <Link href={r.href} className="block">
            {`El regalo grupal de "${r.itemTitulo}" que organizás sigue abierto.`}
            <span className="mt-0.5 block font-semibold underline underline-offset-4">Si ya lo compraste, dividí lo que salió; si no va, cancelalo</span>
          </Link>
          <form action={postponeGroupGiftReminderAction}>
            <input type="hidden" name="giftId" value={r.giftId} />
            <BotonEnviar className="min-h-11 text-xs font-semibold text-gr-accent underline underline-offset-4">Sigue en pie: recordámelo en 2 semanas</BotonEnviar>
          </form>
        </div>
      ))}
      {notifs.length > 0 && (
        <form action={markNotifsReadAction}>
          <BotonEnviar className="min-h-11 text-xs font-semibold underline underline-offset-4">Marcar como leídas</BotonEnviar>
        </form>
      )}
    </div>
  )
}
