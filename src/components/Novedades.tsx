'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import {
  masNovedadesAction, reservarNovedadAction, robarDeseoAction, type EstadoReservaNovedad, type EstadoRobo, type NovedadVista,
} from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { AvatarSticker, Icon, ItemPhoto, PriorityTag, Starburst } from '@/components/ui'

// Lo nuevo de tus amigos: el carrusel de Inicio (tarjetas grandes que pasan solas de a una, y se pueden deslizar con el
// dedo), la tarjeta del feed (/novedades, como una foto de Instagram) con el scroll infinito, y el botón "Me lo robo".

export type MiniNovedad = {
  id: string; titulo: string; foto: string | null; precio: string | null; hace: string; nombre: string; duenoFoto: string | null
}

/** Cada cuánto pasa sola a la tarjeta siguiente. */
const CADA_MS = 3500
/** Después de tocarlo (o de llegar con el teclado), cuánto espera para volver a pasar solo. */
const PAUSA_MS = 6000

/**
 * El carrusel de Inicio: los últimos deseos de tus amigos en tarjetas grandes, una al lado de la otra (como los Próximos).
 * Pasa solo de a una tarjeta y, al llegar a la última, vuelve a la primera; se frena mientras lo tocás y un rato después.
 * Con movimiento reducido no se mueve solo. Cada una abre el feed en ese deseo.
 */
export function CarruselNovedades({ items }: { items: MiniNovedad[] }) {
  const ref = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || items.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let quietoHasta = 0
    const frenar = () => { quietoHasta = Date.now() + PAUSA_MS }
    const t = setInterval(() => {
      if (Date.now() < quietoHasta || document.hidden) return
      const tarjetas = [...el.children] as HTMLElement[]
      // la que está en el medio ahora, y la que sigue (después de la última, la primera)
      const centro = el.scrollLeft + el.clientWidth / 2
      const ahora = tarjetas.findIndex((c) => c.offsetLeft + c.offsetWidth > centro)
      const alFinal = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
      const sig = tarjetas[alFinal || ahora < 0 ? 0 : (ahora + 1) % tarjetas.length]
      el.scrollTo({ left: sig.offsetLeft - (el.clientWidth - sig.offsetWidth) / 2, behavior: 'smooth' })
    }, CADA_MS)
    const eventos = ['pointerdown', 'touchstart', 'wheel', 'focusin'] as const
    for (const ev of eventos) el.addEventListener(ev, frenar, { passive: true })
    return () => {
      clearInterval(t)
      for (const ev of eventos) el.removeEventListener(ev, frenar)
    }
  }, [items.length])

  return (
    <ul ref={ref} aria-label="Lo nuevo de tus amigos"
        className="relative -mx-[18px] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-2 pt-1 [scroll-padding-inline:18px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((n) => (
        <li key={n.id} className="w-[min(280px,76vw)] flex-none snap-center">
          <Link href={`/novedades#d-${n.id}`} className="gr-card flex h-full flex-col gap-3 p-2.5 pb-4">
            <div className="overflow-hidden rounded-[18px]">
              <ItemPhoto src={n.foto} titulo={n.titulo} height={250} />
            </div>
            <div className="flex flex-col gap-1.5 px-1.5">
              <h3 className="line-clamp-2 text-[17px] leading-snug font-semibold [overflow-wrap:anywhere]">{n.titulo}</h3>
              {n.precio && <p className="text-[15px] font-semibold leading-tight">{n.precio}</p>}
              <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-gr-muted">
                <AvatarSticker nombre={n.nombre} foto={n.duenoFoto} size={20} />
                <span className="truncate">De {n.nombre}</span>
              </p>
              <p className="flex items-center gap-1.5 text-[13px] text-gr-muted">
                <Icon name="clock" size={15} className="flex-none" />Agregado {n.hace}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * "Me lo robo": suma a tu lista el deseo de otro. Contesta acá mismo con un cartelito abajo de la pantalla ("¡Robado!"), con
 * el link a tu copia. boton: el botón con texto; icono: el redondo arriba de la foto (las tarjetas chicas de una lista).
 */
export function BotonRobar({ token, itemId, variante = 'boton', className = '' }: {
  token: string; itemId: string; variante?: 'boton' | 'icono'; className?: string
}) {
  const [estado, robar] = useActionState<EstadoRobo, FormData>(robarDeseoAction, null)
  return (
    <>
      <form action={robar} className={className}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="itemId" value={itemId} />
        {variante === 'icono' ? (
          <BotonEnviar aria-label="Me lo robo: sumarlo a tu lista"
                       className="flex size-9 items-center justify-center rounded-full bg-white/95 shadow-[0_1px_4px_rgb(20_20_20/0.18)]">
            <Icon name="copiar" size={17} strokeWidth={2.2} />
          </BotonEnviar>
        ) : (
          <BotonEnviar pendiente="Robando…" className="gr-btn gr-btn--sm w-full gap-1.5">
            <Icon name="copiar" size={17} strokeWidth={2.2} />Me lo robo
          </BotonEnviar>
        )}
      </form>
      {estado && (
        <p key={estado.n} role="status" className="gr-toast">
          {estado.ok ? (
            <>
              <Icon name="check" size={18} strokeWidth={2.6} className="flex-none text-gr-accent" />
              <span className="min-w-0 flex-1">{estado.yaLoTenias ? 'Ya lo tenías en tu lista.' : '¡Robado! Ya está en tu lista.'}</span>
              <Link href={`/deseo/${estado.itemId}`} className="flex-none font-semibold text-gr-accent underline underline-offset-4">Ver</Link>
            </>
          ) : <span>{estado.texto}</span>}
        </p>
      )}
    </>
  )
}

function Reservar({ n }: { n: NovedadVista }) {
  const [estado, reservar] = useActionState<EstadoReservaNovedad, FormData>(reservarNovedadAction, null)
  const mia = n.item.claims.some((c) => c.esMia || c.grupal?.soyParte)
  const href = `/l/${n.token}/item/${n.item.id}`
  if (mia || estado?.ok) {
    return (
      <Link href={href} className="gr-btn gr-btn--sm w-full gap-1.5 border-gr-accent bg-gr-accent">
        <Icon name="check" size={17} strokeWidth={2.6} />{estado?.ok ? '¡Reservado!' : 'Lo reservaste'}
      </Link>
    )
  }
  if (!n.item.disponible) return <span className="gr-btn gr-btn--sm w-full cursor-default text-gr-muted">Ya lo reservaron</span>
  return (
    <form action={reservar} className="flex flex-col gap-1">
      <input type="hidden" name="token" value={n.token} />
      <input type="hidden" name="itemId" value={n.item.id} />
      <BotonEnviar pendiente="Reservando…" className="gr-btn-primary gr-btn--sm w-full">Reservar</BotonEnviar>
      {estado && !estado.ok && <p role="alert" className="text-xs font-semibold">{estado.texto}</p>}
    </form>
  )
}

/** Un deseo nuevo de un amigo, en su tarjeta, como una foto de Instagram: quién y cuándo, la foto, y reservar o robarlo. */
export function TarjetaNovedad({ n }: { n: NovedadVista }) {
  const precio = n.item.precio ?? n.item.rangoPrecio
  const href = `/l/${n.token}/item/${n.item.id}`
  return (
    <article id={`d-${n.item.id}`} className="gr-card flex scroll-mt-4 flex-col gap-3 p-3 pb-3.5">
      <Link href={`/l/${n.token}`} className="flex items-center gap-2.5 px-0.5">
        <AvatarSticker nombre={n.dueno.nombre} foto={n.dueno.foto} size={38} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[15px] font-semibold [overflow-wrap:anywhere]">{n.dueno.nombre}</span>
          <span className="text-xs font-medium text-gr-muted">agregó a su lista · {n.hace}</span>
        </span>
      </Link>
      <Link href={href} className="relative block overflow-hidden rounded-[18px]">
        <ItemPhoto src={n.item.fotoUrl} titulo={n.item.titulo} height={320} />
        <PriorityTag prioridad={n.item.prioridad} className="absolute left-3 top-3 h-[30px]" />
      </Link>
      <div className="flex flex-col gap-0.5 px-0.5">
        <Link href={href} className="text-lg leading-snug font-semibold [overflow-wrap:anywhere]">{n.item.titulo}</Link>
        {precio && <p className="text-[15px] font-semibold">{precio}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Reservar n={n} />
        <BotonRobar token={n.token} itemId={n.item.id} />
      </div>
    </article>
  )
}

/**
 * Llegando del carrusel (/novedades#d-<id>), ir a ese deseo. Next no lo hace solo cuando la pantalla llega después del
 * "cargando…": al navegar, el deseo todavía no estaba.
 */
export function IrAlDeseo() {
  useEffect(() => {
    if (location.hash.startsWith('#d-')) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [])
  return null
}

/** El scroll infinito: al acercarse al final trae la página siguiente; cuando no hay más, lo dice. */
export function MasNovedades({ siguiente }: { siguiente: string | null }) {
  const [mas, setMas] = useState<NovedadVista[]>([])
  const [cursor, setCursor] = useState(siguiente)
  const [cargando, startTransition] = useTransition()
  const fin = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = fin.current
    if (!el || !cursor) return
    const obs = new IntersectionObserver((entradas) => {
      if (!entradas[0].isIntersecting || cargando) return
      startTransition(async () => {
        const r = await masNovedadesAction(cursor)
        setMas((antes) => [...antes, ...r.novedades.filter((n) => !antes.some((a) => a.item.id === n.item.id))])
        setCursor(r.siguiente)
      })
    }, { rootMargin: '600px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [cursor, cargando])

  return (
    <>
      {mas.map((n) => <TarjetaNovedad key={n.item.id} n={n} />)}
      <div ref={fin} className="flex min-h-16 flex-col items-center justify-center gap-2 text-sm font-medium text-gr-muted">
        {cursor
          ? <Starburst size={28} className={cargando ? 'gr-refrescar__estrella motion-safe:animate-spin' : ''} />
          : <p>Eso es todo por ahora. Tirá para abajo arriba de todo para ver si hay algo nuevo.</p>}
      </div>
    </>
  )
}
