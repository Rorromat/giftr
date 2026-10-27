import type { EntradaBandeja } from '@/lib/bandeja'
import { hace } from '@/lib/novedades'
import { AvatarSticker, QuizasLink } from '@/components/ui'

/**
 * Un aviso de la bandeja en una fila (va dentro de una lista `gr-card`): la foto de quien lo mandó con el emoji en una
 * esquina (o el emoji solo), qué pasó, el detalle y cuándo; lo nuevo, con un punto. En Avisos y en "Para vos" de Inicio.
 */
export function FilaAviso({ e }: { e: EntradaBandeja }) {
  return (
    <li>
      <QuizasLink href={e.href} className="flex items-start gap-3 px-4 py-3.5">
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
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={`text-[15px] leading-snug [overflow-wrap:anywhere] ${e.nuevo ? 'font-semibold' : 'font-medium'}`}>{e.titulo}</span>
          {e.cuerpo && <span className="line-clamp-2 text-[13px] leading-snug text-gr-muted [overflow-wrap:anywhere]">{e.cuerpo}</span>}
          <span className="text-xs font-medium text-gr-muted">{hace(e.createdAt)}</span>
        </span>
        {e.nuevo && <span className="mt-2 size-2.5 flex-none rounded-full bg-gr-blue"><span className="sr-only">Nuevo</span></span>}
      </QuizasLink>
    </li>
  )
}
