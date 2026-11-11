import Link from 'next/link'
import { agradecerAction, cerrarPostEventoAction, marcarRecibidosAction, restoreItemAction } from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { Icon, ItemPhoto } from '@/components/ui'
import { textoGracias, type Contado, type DeParte, type Recibido } from '@/lib/post-evento'

// Lo de después del cumple en la vista del dueño (ver post-evento.ts): la tarjeta "¿Cómo te fue en tu cumple?" y
// "Recibidos". Como todo lo del dueño, sin nada de reservas: de quien regaló solo aparece quien eligió contárselo.

/**
 * En Mi lista, desde el día siguiente al cumple y por un mes: lleva a marcar lo que le regalaron. "Ahora no" la saca y no
 * vuelve para ese cumple (lo puede marcar igual, desde abajo de la lista). Dice lo mismo haya o no reservas.
 */
export function TarjetaPostEvento() {
  return (
    <section aria-labelledby="post-evento" className="gr-card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex size-12 flex-none items-center justify-center rounded-2xl bg-gr-soft"><Icon name="gift" size={24} /></span>
        <div className="min-w-0 flex-1">
          <h2 id="post-evento" className="text-[17px] leading-snug font-bold tracking-[-0.01em]">¿Cómo te fue en tu cumple?</h2>
          <p className="text-sm leading-snug text-gr-muted">Marcá lo que te regalaron así tu lista queda al día.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/mi-lista/recibidos" className="gr-btn-primary gr-btn--sm flex-1">Marcar lo que me regalaron</Link>
        <form action={cerrarPostEventoAction}>
          <BotonEnviar className="gr-btn gr-btn--sm">Ahora no</BotonEnviar>
        </form>
      </div>
    </section>
  )
}

/** "Agradecer por WhatsApp": abre WhatsApp con el texto ya escrito y sin destinatario (la persona elige a quién). */
export function AgradecerPorWhatsApp({ className = '' }: { className?: string }) {
  return (
    <a href={`https://wa.me/?text=${encodeURIComponent(textoGracias())}`} target="_blank" className={`gr-btn gr-btn--sm gap-2 ${className}`}>
      <Icon name="chat" size={18} />Agradecer por WhatsApp
    </a>
  )
}

/**
 * "De parte de Rodri": alguien que eligió contarle que el regalo fue suyo (ver revelarRegalo), con "Mandarle gracias",
 * que le deja un aviso una sola vez (ver agradecer).
 */
export function DeParteDe({ d }: { d: DeParte }) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-2xl bg-gr-soft px-3 py-1.5">
      <span className="min-w-0 flex-1 text-[13px] leading-snug font-semibold [overflow-wrap:anywhere]">De parte de {d.nombre}</span>
      {d.agradecido ? (
        <span className="flex flex-none items-center gap-1 text-xs font-semibold text-gr-muted">
          <Icon name="check" size={14} strokeWidth={2.4} />Le diste las gracias
        </span>
      ) : (
        <form action={agradecerAction} className="flex-none">
          <input type="hidden" name="tipo" value={d.tipo} />
          <input type="hidden" name="id" value={d.id} />
          <input type="hidden" name="de" value={d.de} />
          <BotonEnviar pendiente="Mandando…" className="gr-btn min-h-11 px-3 text-[13px]">Mandarle gracias</BotonEnviar>
        </form>
      )}
    </div>
  )
}

function Foto({ src, titulo }: { src: string | null; titulo: string }) {
  return <div className="size-12 flex-none overflow-hidden rounded-xl"><ItemPhoto src={src} titulo={titulo} height={48} className="w-12" /></div>
}

/**
 * "Recibidos", abajo en Mi lista: lo que marcó que le regalaron, con el cumple para el que fue, quien le contó que fue
 * suyo (si alguien lo hizo) y cómo volver atrás: "Me equivoqué" en el mes, "Volver a pedir" después (ver restoreItem).
 * Arriba, lo que le contaron de deseos que todavía no marcó. abierto: desplegado (en el mes del cumple, o si hay algo
 * para agradecer); marcarMas: todavía se le ofrece el paso de marcar.
 */
export function Recibidos({ recibidos, contados, abierto, marcarMas }: {
  recibidos: Recibido[]; contados: Contado[]; abierto: boolean; marcarMas: boolean
}) {
  if (!recibidos.length && !contados.length) {
    // ya cerró la tarjeta, pero todavía está en el mes: que lo pueda marcar igual
    return marcarMas
      ? <Link href="/mi-lista/recibidos" className="flex min-h-11 items-center self-start text-sm font-semibold text-gr-muted underline underline-offset-4">¿Te regalaron algo de tu lista? Marcalo</Link>
      : null
  }
  return (
    <details id="recibidos" open={abierto} className="flex scroll-mt-24 flex-col">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 self-start text-sm font-semibold text-gr-muted [&::-webkit-details-marker]:hidden">
        Recibidos ({recibidos.length + contados.length})
      </summary>
      <div className="mt-1 flex flex-col gap-2.5">
        {contados.length > 0 && (
          <ul className="gr-card flex flex-col divide-y divide-gr-line px-3.5">
            {contados.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 py-2.5">
                <div className="flex items-center gap-3">
                  <Foto src={c.fotoUrl} titulo={c.titulo} />
                  <span className="min-w-0 flex-1 text-sm leading-snug">
                    <span className="font-semibold [overflow-wrap:anywhere]">{c.titulo}</span>
                    <span className="block text-xs font-medium text-gr-muted">Te contaron que te lo regalaron</span>
                  </span>
                  {c.activo && (
                    <form action={marcarRecibidosAction}>
                      <input type="hidden" name="itemId" value={c.id} />
                      <input type="hidden" name="aca" value="1" />
                      <BotonEnviar className="gr-btn min-h-11 px-2.5 text-[13px]">Lo recibí</BotonEnviar>
                    </form>
                  )}
                </div>
                {c.dePartede.map((d) => <DeParteDe key={`${d.tipo}-${d.id}-${d.de}`} d={d} />)}
              </li>
            ))}
          </ul>
        )}
        {recibidos.length > 0 && (
          <ul className="gr-card flex flex-col divide-y divide-gr-line px-3.5">
            {recibidos.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-2.5">
                <div className="flex items-center gap-3">
                  <Foto src={r.fotoUrl} titulo={r.titulo} />
                  <span className="min-w-0 flex-1 text-sm leading-snug">
                    <span className="font-semibold [overflow-wrap:anywhere]">{r.titulo}</span>
                    <span className="block text-xs font-medium text-gr-muted">{r.anio ? `Cumple ${r.anio}` : 'Te lo regalaron'}</span>
                  </span>
                  <form action={restoreItemAction}>
                    <input type="hidden" name="itemId" value={r.id} />
                    <BotonEnviar className="gr-btn min-h-11 px-2.5 text-[13px]">{r.seDeshace ? 'Me equivoqué' : 'Volver a pedir'}</BotonEnviar>
                  </form>
                </div>
                {r.dePartede.map((d) => <DeParteDe key={`${d.tipo}-${d.id}-${d.de}`} d={d} />)}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <AgradecerPorWhatsApp />
          {marcarMas && <Link href="/mi-lista/recibidos" className="flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Marcar más</Link>}
        </div>
      </div>
    </details>
  )
}
