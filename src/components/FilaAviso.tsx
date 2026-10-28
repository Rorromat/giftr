import type { CSSProperties, ReactNode } from 'react'
import type { EntradaBandeja, TipoEnBandeja } from '@/lib/bandeja'
import { hace } from '@/lib/novedades'
import { AvatarSticker, QuizasLink } from '@/components/ui'

// Cada tipo de aviso con su ícono: un cuadradito de color con un dibujo que se mueve como lo que pasó (la moneda cae, el
// ticket se imprime, el regalo se sacude, el codazo empuja), mientras es nuevo; las animaciones están en tokens.css
// (.gr-aviso-icono). La plata en lima (te pagaron) o en negro (te toca pagar, como "Debés" en Cuentas); el amigo invisible
// y los codazos en azul, como sus tarjetas; la gente en lima o en gris. Las personas van en círculo y las cosas en
// cuadradito: la foto de quien lo mandó queda chiquita, en la esquina.

const AZUL = 'bg-gr-blue text-gr-on-blue'
const LIMA = 'bg-gr-accent text-gr-ink'
const GRIS = 'bg-gr-soft text-gr-ink'

const DIBUJO = {
  moneda: <><circle cx="12" cy="12" r="8.5" /><path d="M14.6 9.3c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2c1.6.3 2.8.9 2.8 2.2 0 1.3-1.2 2.1-2.8 2.1-1.2 0-2.3-.5-2.8-1.5" /><path d="M12 6.3v1.5M12 16.2v1.5" /></>,
  ticket: <><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" /><path d="M9 8h6M9 11.5h6M9 15h3.5" /></>,
  regalo: <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13" /><path d="M3 12h18" /><path d="M12 8c-2-4-6-4-6-1.5S9 8 12 8c3 0 6-.5 6-1.5S14 4 12 8z" /></>,
  pregunta: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.4" /><path d="M12 17h.01" strokeWidth="2.6" /></>,
  // los tres puntos de "escribiendo…" se prenden de a uno (ver .gr-aviso__punto)
  charla: <><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" /><circle className="gr-aviso__punto" cx="8.5" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle className="gr-aviso__punto" cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle className="gr-aviso__punto" cx="15.5" cy="12" r="1.1" fill="currentColor" stroke="none" /></>,
  antifaz: <><path d="M2.5 11c0-3.2 4.6-4.4 9.5-1.9 4.9-2.5 9.5-1.3 9.5 1.9 0 3.9-4.6 5.2-7.3 2.7-1.2-1.1-3.2-1.1-4.4 0C7.1 16.2 2.5 14.9 2.5 11z" /><ellipse cx="7.6" cy="11.3" rx="1.9" ry="1.3" /><ellipse cx="16.4" cy="11.3" rx="1.9" ry="1.3" /></>,
  // un empujón: la flecha que pega, con las rayitas del golpe
  codazo: <><path d="M3 12h10" /><path d="M9.5 8l4 4-4 4" /><path d="M17.5 8.2l2.6-1.6M18 12h3M17.5 15.8l2.6 1.6" /></>,
  sumar: <><circle cx="10" cy="8" r="3.5" /><path d="M3.5 20c.8-3.6 3.3-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.4" /><path d="M18.5 13.5v6M15.5 16.5h6" /></>,
  gente: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14.5c2.4 0 4 1.6 4.5 4.5" /></>,
}

/** Cómo se mueve (ver .gr-aviso-icono[data-mueve] en tokens.css). */
type Mueve = 'cae' | 'imprime' | 'sacude' | 'duda' | 'escribe' | 'parpadea' | 'empuja' | 'saluda' | 'late'

const ICONOS: Record<TipoEnBandeja, { fondo: string; dibujo: ReactNode; mueve: Mueve }> = {
  pago: { fondo: LIMA, dibujo: DIBUJO.moneda, mueve: 'cae' },
  regalo_comprado: { fondo: 'bg-gr-brand text-gr-accent', dibujo: DIBUJO.ticket, mueve: 'imprime' },
  invisible_sorteo: { fondo: AZUL, dibujo: DIBUJO.regalo, mueve: 'sacude' },
  invisible_pregunta: { fondo: AZUL, dibujo: DIBUJO.pregunta, mueve: 'duda' },
  invisible_respuesta: { fondo: AZUL, dibujo: DIBUJO.charla, mueve: 'escribe' },
  invisible_invitacion: { fondo: AZUL, dibujo: DIBUJO.antifaz, mueve: 'parpadea' },
  codazo: { fondo: AZUL, dibujo: DIBUJO.codazo, mueve: 'empuja' },
  propuesta_regalo: { fondo: LIMA, dibujo: DIBUJO.regalo, mueve: 'sacude' },
  respuesta_propuesta: { fondo: GRIS, dibujo: DIBUJO.gente, mueve: 'late' },
  amistad_pedida: { fondo: LIMA, dibujo: DIBUJO.sumar, mueve: 'saluda' },
  amistad_aceptada: { fondo: GRIS, dibujo: DIBUJO.gente, mueve: 'late' },
  // en el azul suave de las listas en común, como en Tu gente
  lista_en_comun: { fondo: 'bg-gr-comun text-gr-comun-ink', dibujo: DIBUJO.gente, mueve: 'saluda' },
}

/**
 * El ícono de un aviso según su tipo, con la foto de quien lo mandó en la esquina. animar: se mueve (lo nuevo); i: su
 * lugar en la lista, para que no se muevan todos a la vez. Sin tipo (los avisos sobre deseos y los de antes), el emoji.
 */
export function IconoAviso({ e, animar = false, i = 0 }: { e: EntradaBandeja; animar?: boolean; i?: number }) {
  const icono = e.tipo && ICONOS[e.tipo]
  if (!icono) {
    return (
      <span className="relative flex-none">
        {e.de
          ? <AvatarSticker nombre={e.de.nombre} foto={e.de.foto} size={44} />
          : <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-gr-soft text-xl">{e.emoji}</span>}
        {e.de && (
          <span aria-hidden className="absolute -bottom-1 -right-1.5 flex size-6 items-center justify-center rounded-full bg-gr-surface text-[13px] shadow-card">
            {e.emoji}
          </span>
        )}
      </span>
    )
  }
  return (
    <span className="relative flex-none">
      <span aria-hidden data-mueve={animar ? icono.mueve : undefined} style={{ '--i': i } as CSSProperties}
            className={`gr-aviso-icono flex size-11 items-center justify-center rounded-[14px] ${icono.fondo}`}>
        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          {icono.dibujo}
        </svg>
      </span>
      {e.de && <AvatarSticker nombre={e.de.nombre} foto={e.de.foto} size={22} className="absolute -bottom-1.5 -right-1.5 ring-2 ring-gr-surface" />}
    </span>
  )
}

/** Lo de adentro de la fila de un aviso: su ícono, qué pasó, el detalle y cuándo; lo nuevo, con un punto. */
export function ContenidoAviso({ e, animar = false, i = 0 }: { e: EntradaBandeja; animar?: boolean; i?: number }) {
  return (
    <>
      <IconoAviso e={e} animar={animar && e.nuevo} i={i} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[15px] leading-snug [overflow-wrap:anywhere] ${e.nuevo ? 'font-semibold' : 'font-medium'}`}>{e.titulo}</span>
        {e.cuerpo && <span className="line-clamp-2 text-[13px] leading-snug text-gr-muted [overflow-wrap:anywhere]">{e.cuerpo}</span>}
        <span className="text-xs font-medium text-gr-muted">{hace(e.createdAt)}</span>
      </span>
      {e.nuevo && <span className="mt-2 size-2.5 flex-none rounded-full bg-gr-blue"><span className="sr-only">Nuevo</span></span>}
    </>
  )
}

/**
 * Un aviso de la bandeja en una fila que lleva adonde dice (va dentro de una lista `gr-card`), en Avisos. En "Para vos" de
 * Inicio va en una que se desliza (ver AvisoDeslizable). animar e i: ver IconoAviso.
 */
export function FilaAviso({ e, animar = false, i = 0 }: { e: EntradaBandeja; animar?: boolean; i?: number }) {
  return (
    <li>
      <QuizasLink href={e.href} className="flex items-start gap-3 px-4 py-3.5">
        <ContenidoAviso e={e} animar={animar} i={i} />
      </QuizasLink>
    </li>
  )
}
