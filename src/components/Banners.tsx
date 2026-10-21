import { db } from '@/db'
import { getViewer, invitadoParaPreguntar } from '@/lib/viewer'
import { getUnreadNotifications, textoDeAviso } from '@/lib/notifications'
import { getMyClaimWarnings } from '@/lib/claims'
import { markNotifsReadAction, vistoCodazosAction } from '@/app/actions'
import { codazosSinVer, tieneAvisos } from '@/lib/codazos'
import { juntarNombres } from '@/lib/groups'
import Link from 'next/link'
import { Starburst } from '@/components/ui'
import { PreguntaInvitado } from '@/components/Identidad'

export async function Banners() {
  const viewer = await getViewer()
  const [todas, warnings, codazos, avisos, invitado] = await Promise.all([
    getUnreadNotifications(db, viewer),
    getMyClaimWarnings(db, viewer),
    viewer.userId ? codazosSinVer(db, viewer.userId) : [],
    viewer.userId ? tieneAvisos(db, viewer.userId) : false,
    viewer.userId ? invitadoParaPreguntar(viewer.userId) : null,
  ])
  const notifs = todas.flatMap((n) => {
    const texto = textoDeAviso(n.tipo, n.itemTitulo)
    return texto ? [{ id: n.id, texto }] : []
  })
  if (!notifs.length && !warnings.length && !codazos.length && !invitado) return null
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
              <button className="min-h-11 text-sm font-bold underline decoration-2 underline-offset-4">Listo</button>
            </form>
          </div>
          {!avisos && <p className="text-xs font-semibold">Activá los avisos en Perfil para enterarte al toque.</p>}
        </div>
      )}
      {notifs.map((n) => (
        <div key={n.id} className="rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface px-3.5 py-3 text-sm font-medium shadow-sticker-sm">
          {n.texto}
        </div>
      ))}
      {warnings.map((w) => (
        <div key={w.claimId} className="relative rounded-2xl border-[2.5px] border-gr-ink bg-gr-ink py-3 pl-3.5 pr-12 text-sm font-medium text-gr-bg">
          {`¿Conseguiste "${w.itemTitulo}"? Te quedan `}
          <span className="font-bold text-gr-accent">{w.diasRestantes} {w.diasRestantes === 1 ? 'día' : 'días'}</span>
          {' de reserva.'}
          <Starburst size={40} fontSize={46} className="absolute -right-2 -top-3 rotate-12">!</Starburst>
        </div>
      ))}
      {notifs.length > 0 && (
        <form action={markNotifsReadAction}>
          <button className="min-h-11 text-xs font-bold underline decoration-2 underline-offset-4">Marcar como leídas</button>
        </form>
      )}
    </div>
  )
}
