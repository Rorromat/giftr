import { commentAction } from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { AvatarSticker, Icon } from '@/components/ui'
import { ANCLA_DEL_HILO } from '@/lib/comments'
import type { CommentView } from '@/lib/lists'
import { LARGO } from '@/lib/limites'
import { hace } from '@/lib/novedades'

/** Cuántos mensajes se ven sin tocar nada; los de antes quedan plegados ("Ver los 3 anteriores"). */
export const A_LA_VISTA = 3

/**
 * El hilo para coordinar un regalo entre los que lo regalan: lo que no ve el dueño (privado: "Esto no lo ve Euge").
 * Con mensajes, la página lo pone arriba, apenas abajo del nombre del regalo, y va destacado: cada mensaje con la foto de
 * quien lo escribió, su nombre ("Vos", el propio) y cuándo, en letra para leer bien. Los últimos a la vista y los de antes
 * plegados, así un hilo largo no empuja todo lo demás para abajo. Sin mensajes, solo el campo para escribir (la página
 * lo deja al final).
 * Su id es ANCLA_DEL_HILO: el aviso de un comentario lleva directo acá (ver avisarComentario).
 */
export function Hilo({ token, itemId, comments, privado }: { token: string; itemId: string; comments: CommentView[]; privado: string }) {
  const hay = comments.length > 0
  const antes = comments.slice(0, -A_LA_VISTA)
  const ultimos = comments.slice(-A_LA_VISTA)
  const candado = (
    <>
      <Icon name="lock" size={16} strokeWidth={2} className="text-gr-acento-sobre-tinta" />
      {privado}
    </>
  )
  const pastilla = 'flex items-center gap-2 self-start rounded-full bg-gr-brand px-3.5 py-2 text-sm font-semibold text-gr-bg'
  return (
    <section id={ANCLA_DEL_HILO} aria-labelledby={`${ANCLA_DEL_HILO}-titulo`}
             className={`flex scroll-mt-4 flex-col gap-3 ${hay ? 'gr-card border-gr-acento/45 p-4' : 'mt-2'}`}>
      {hay ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={`${ANCLA_DEL_HILO}-titulo`} className="flex items-center gap-2 text-[19px] font-extrabold tracking-[-0.01em]">
            <Icon name="chat" size={22} strokeWidth={2.2} className="text-gr-acento-texto" />
            {comments.length === 1 ? 'Un mensaje' : `${comments.length} mensajes`}
          </h2>
          <p className={pastilla}>{candado}</p>
        </div>
      ) : (
        <h2 id={`${ANCLA_DEL_HILO}-titulo`} className={pastilla}>{candado}</h2>
      )}

      {hay && (
        <ol className="flex flex-col gap-4">
          {antes.length > 0 && (
            <li>
              <details className="group">
                <summary className="gr-toque flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-gr-muted [&::-webkit-details-marker]:hidden">
                  <Icon name="chevron" size={16} strokeWidth={2.4} className="transition-transform group-open:rotate-90" />
                  <span className="group-open:hidden">Ver {antes.length === 1 ? 'el mensaje anterior' : `los ${antes.length} anteriores`}</span>
                  <span className="hidden group-open:inline">Ocultar {antes.length === 1 ? 'el anterior' : 'los anteriores'}</span>
                </summary>
                <ol className="mt-3 flex flex-col gap-4">
                  {antes.map((c) => <Mensaje key={c.id} c={c} />)}
                </ol>
              </details>
            </li>
          )}
          {ultimos.map((c) => <Mensaje key={c.id} c={c} />)}
        </ol>
      )}

      <form action={commentAction} className="flex gap-2">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="itemId" value={itemId} />
        <input name="texto" required maxLength={LARGO.comentario} aria-label="Tu mensaje"
               placeholder={hay ? 'Contestá…' : 'Coordiná con los demás…'} className="gr-input min-w-0 flex-1 shadow-none" />
        <BotonEnviar className="gr-btn gr-btn--dark min-h-[50px] px-4 text-[15px]">Enviar</BotonEnviar>
      </form>
    </section>
  )
}

/** Un mensaje: la foto (o las iniciales) de quien lo escribió, su nombre y cuándo, y el texto en su globo. */
function Mensaje({ c }: { c: CommentView }) {
  return (
    <li className="flex items-start gap-3">
      <AvatarSticker nombre={c.autorNombre} foto={c.autorFoto} size={40} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 leading-tight">
          <span className="text-[15px] font-bold [overflow-wrap:anywhere]">{c.esMio ? 'Vos' : c.autorNombre}</span>
          <time dateTime={c.createdAt.toISOString()} className="text-xs font-medium text-gr-muted">{hace(c.createdAt)}</time>
        </p>
        <p className={`max-w-full whitespace-pre-line rounded-gr-md px-3.5 py-2.5 text-base leading-snug [overflow-wrap:anywhere] ${c.esMio ? 'bg-gr-acento/15' : 'bg-gr-soft'}`}>
          {c.texto}
        </p>
      </div>
    </li>
  )
}
