import Link from 'next/link'
import { Arte, AvatarStack, Icon } from '@/components/ui'
import { fechaLarga, type Evento } from '@/lib/events'
import type { GiverItemView, OwnerItemView } from '@/lib/serialize'

// Inicio: lo próximo es una tapa grande con el color de esa persona y, abajo, un estante con sus deseos, que se desliza de
// costado (como los de Podcasts). Server components puros.

/** Cuántos deseos van en el estante (los demás, en su lista). */
const EN_EL_ESTANTE = 10

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** La tarjeta grande del próximo cumple (o fecha de una lista en común): su color, quién es, cuánto falta y cuándo cae. */
export function Destacada({ e, color, hoy }: { e: Evento; color: string; hoy: Date }) {
  const cuando = e.dias === 0 ? 'hoy' : e.dias === 1 ? 'mañana' : `en ${e.dias} días`
  return (
    <section aria-label={e.titulo} className="gr-destacada" style={{ '--c': color } as React.CSSProperties}>
      <div className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
        <AvatarStack nombres={e.personas.slice(0, 3)} fotos={e.caras.slice(0, 3)} size={30} className="[&>span]:border-white/40 [&>span]:!bg-white/25" />
        <span className="truncate">{e.tipo === 'cumple' ? e.personas[0] : e.titulo}</span>
      </div>
      {/* lo que más quiere, como stickers pegados torcidos en la esquina */}
      {e.fotos.length > 0 && (
        <div aria-hidden className="pointer-events-none absolute right-3 top-12 h-[150px] w-[150px]">
          {e.fotos.slice(0, 2).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- fotos de los deseos, subidas o de tiendas
            <img key={src} src={src} alt="" loading="lazy"
                 className={`absolute size-[104px] rounded-[18px] border-4 border-white bg-white object-cover shadow-[0_14px_28px_-10px_rgb(0_0_0/0.5)] ${
                   i ? 'left-0 top-9 -rotate-[9deg]' : 'right-0 top-0 rotate-[7deg]'}`} />
          ))}
        </div>
      )}
      <div className="relative flex flex-col gap-1 self-end">
        <span className="gr-label text-white/80">{e.tipo === 'cumple' ? 'Cumple' : 'Es'} {cuando}</span>
        <h2 className="max-w-[8ch] text-[32px] leading-[0.95] font-black tracking-[-0.045em]">{conMayuscula(fechaLarga(e.fecha, hoy))}</h2>
      </div>
      <div className="relative flex gap-2">
        <Link href={e.href} className="gr-btn gr-btn--blanco flex-1">{e.tipo === 'cumple' ? 'Ver su lista' : 'Ver la lista'}</Link>
        <Link href="/eventos" className="gr-btn gr-btn--vidrio flex-none">Todo el año</Link>
      </div>
    </section>
  )
}

/** "Reservado por vos", "Comprado": lo que ya no está libre, con el puntito del acento. */
function estado(i: GiverItemView) {
  if (!i.claims.length) return null
  if (i.claims.every((c) => c.estado === 'comprado')) return 'Comprado'
  return i.claims.some((c) => c.esMia || c.grupal?.soyParte) ? 'Reservado por vos' : null
}

/** El estante con los deseos de una lista: los libres primero, cada uno en su cuadrado de color. */
export function EstanteDeLista({ titulo, href, token, items }: {
  titulo: string
  href: string
  token: string
  items: (GiverItemView | OwnerItemView)[]
}) {
  const libres = [...items].sort((a, b) => Number('disponible' in b ? b.disponible : true) - Number('disponible' in a ? a.disponible : true))
  if (!libres.length) return null
  return (
    <section aria-label={titulo} className="flex flex-col gap-3">
      <h2 className="gr-heading">
        <Link href={href} className="inline-flex items-center gap-1.5">{titulo}<Icon name="chevron" size={18} strokeWidth={2.6} className="text-gr-muted" /></Link>
      </h2>
      <ul className="gr-estante">
        {libres.slice(0, EN_EL_ESTANTE).map((i) => {
          const ya = 'claims' in i ? estado(i) : null
          const precio = i.precio ?? i.rangoPrecio
          return (
            <li key={i.id}>
              <Link href={`/l/${token}/item/${i.id}`} className="flex flex-col gap-1.5">
                <Arte id={i.id} src={i.fotoUrl} titulo={i.titulo} apagado={'disponible' in i && !i.disponible} />
                <span className="line-clamp-2 text-sm leading-tight font-bold tracking-[-0.01em] [overflow-wrap:anywhere]">{i.titulo}</span>
                {precio && <span className="text-[13px] text-gr-muted tabular-nums">{precio}</span>}
                {ya && (
                  <span className="flex items-center gap-1.5 text-xs font-bold">
                    <i aria-hidden className="size-[7px] rounded-full bg-gr-acento" />{ya}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
