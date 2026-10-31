import Link from 'next/link'
import { Arte, AvatarStack, Icon } from '@/components/ui'
import { fechaLarga, MESES, type Evento } from '@/lib/events'
import type { GiverItemView, OwnerItemView } from '@/lib/serialize'

// Inicio: lo próximo es una tarjeta grande con la foto de lo que más quiere esa persona y, abajo, un estante con sus
// deseos, que se desliza de costado. Server components puros.

/** Cuántos deseos van en el estante (los demás, en su lista). */
const EN_EL_ESTANTE = 10

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/**
 * La tarjeta grande del próximo cumple (o fecha de una lista en común): la foto de lo que más quiere, a sangre (sin foto, su
 * color), quién es arriba, el día en un recuadro blanco y cuánto falta abajo. Toda la tarjeta lleva a su lista.
 */
export function Destacada({ e, color }: { e: Evento; color: string }) {
  const cuando = e.dias === 0 ? 'es hoy' : e.dias === 1 ? 'es mañana' : `es en ${e.dias} días`
  const quien = e.tipo === 'cumple' ? e.personas[0] : e.titulo
  return (
    <Link href={e.href} aria-label={`${e.titulo}: ${cuando}. Ver ${e.tipo === 'cumple' ? 'su lista' : 'la lista'}`}
          className="gr-destacada" style={{ '--c': color } as React.CSSProperties}>
      {e.fotos[0] && (
        // eslint-disable-next-line @next/next/no-img-element -- la foto de un deseo, subida o de una tienda
        <img src={e.fotos[0]} alt="" className="gr-destacada__foto" />
      )}
      <div className="flex items-start justify-between gap-3">
        <AvatarStack nombres={e.personas.slice(0, 3)} fotos={e.caras.slice(0, 3)} size={44} className="[&>span]:border-white" />
        <span aria-hidden className="flex w-14 flex-none flex-col items-center rounded-2xl bg-white py-1.5 text-[#121216]">
          <span className="text-[26px] leading-none font-bold tabular-nums">{e.fecha.getUTCDate()}</span>
          <span className="text-[13px] text-[#6C6C75]">{conMayuscula(MESES[e.fecha.getUTCMonth()].slice(0, 3))}</span>
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-medium text-white/90 [overflow-wrap:anywhere]">{quien}</p>
        <h2 className="text-[30px] leading-[1.05] font-bold tracking-[-0.03em]">
          {e.tipo === 'cumple' ? 'Cumple' : 'Es'} {cuando.replace(/^es /, '')}
        </h2>
        <p className="mt-1 text-sm text-white/80">{fechaLarga(e.fecha)} · {e.tipo === 'cumple' ? 'Ver su lista' : 'Ver la lista'}</p>
      </div>
    </Link>
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
                <Arte src={i.fotoUrl} titulo={i.titulo} apagado={'disponible' in i && !i.disponible} />
                <span className="mt-0.5 line-clamp-2 text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">{i.titulo}</span>
                {precio && <span className="text-sm text-gr-muted tabular-nums">{precio}</span>}
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
