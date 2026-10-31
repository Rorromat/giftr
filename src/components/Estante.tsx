import Link from 'next/link'
import { AvatarStack, Icon } from '@/components/ui'
import { fechaLarga, type Evento } from '@/lib/events'

// Inicio: lo próximo es una tarjeta grande con el color de esa persona y lo que más quiere pegado como stickers; toda la
// tarjeta lleva a su lista. Server components puros.

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** Cómo va cada sticker (hasta tres): dónde y qué tan torcido, del de más atrás al de más adelante. */
const STICKERS = ['right-0 top-0 rotate-[8deg]', 'left-0 top-10 -rotate-[10deg]', 'right-7 top-[86px] rotate-[3deg]']

/**
 * La tarjeta grande del próximo cumple (o fecha de una lista en común): su color, quién es, lo que más quiere pegado como
 * stickers torcidos en la esquina, cuánto falta y cuándo cae, y "Ver su lista" con cuántos deseos tiene. Toda la tarjeta
 * lleva a su lista. deseos: cuántos tiene para regalar.
 */
export function Destacada({ e, color, hoy, deseos }: { e: Evento; color: string; hoy: Date; deseos: number }) {
  const cuando = e.dias === 0 ? 'es hoy' : e.dias === 1 ? 'es mañana' : `es en ${e.dias} días`
  const quien = e.tipo === 'cumple' ? e.personas[0] : e.titulo
  const verLista = e.tipo === 'cumple' ? 'Ver su lista' : 'Ver la lista'
  return (
    <Link href={e.href} aria-label={`${e.titulo}: ${cuando}. ${verLista}`}
          className="gr-destacada" style={{ '--c': color } as React.CSSProperties}>
      <div className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
        <AvatarStack nombres={e.personas.slice(0, 3)} fotos={e.caras.slice(0, 3)} size={30} className="[&>span]:border-white/40 [&>span]:!bg-white/25" />
        <span className="max-w-[45%] truncate">{quien}</span>
      </div>
      {/* lo que más quiere, como stickers pegados torcidos en la esquina */}
      {e.fotos.length > 0 && (
        <div aria-hidden className="pointer-events-none absolute right-3 top-3 h-[190px] w-[172px]">
          {e.fotos.slice(0, 3).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- fotos de los deseos, subidas o de tiendas
            <img key={src} src={src} alt="" loading="lazy" className={`gr-destacada__sticker ${STICKERS[i]}`} />
          ))}
        </div>
      )}
      <div className="relative flex flex-col gap-1">
        <span className="gr-label text-white/80">{e.tipo === 'cumple' ? 'Cumple' : 'Es'} {cuando.replace(/^es /, '')}</span>
        <h2 className="max-w-[8ch] text-[32px] leading-[0.95] font-black tracking-[-0.045em]">{conMayuscula(fechaLarga(e.fecha, hoy))}</h2>
      </div>
      <span className="gr-btn gr-btn--blanco relative w-full justify-between">
        <span>{verLista}</span>
        <span className="flex items-center gap-1 text-[#6C6C75]">
          {deseos > 0 && <span className="text-sm font-semibold">{deseos} {deseos === 1 ? 'deseo' : 'deseos'}</span>}
          <Icon name="chevron" size={18} strokeWidth={2.6} />
        </span>
      </span>
    </Link>
  )
}
