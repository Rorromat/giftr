'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import {
  masNovedadesAction, reservarNovedadAction, robarDeseoAction, type EstadoReservaNovedad, type EstadoRobo, type NovedadVista,
} from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { AvatarSticker, Icon, ItemPhoto, PriorityTag, Starburst } from '@/components/ui'

// Lo nuevo de tus amigos: el carrusel de Inicio (pasa solo, despacito, y se puede deslizar con el dedo), la tarjeta grande
// del feed (/novedades, como una foto de Instagram) con el scroll infinito, y el botón "Me lo robo".

export type MiniNovedad = { id: string; titulo: string; foto: string | null; nombre: string; duenoFoto: string | null }

/** px por segundo del carrusel: lento, para que se lea mientras pasa. */
const VELOCIDAD = 28
/** Después de tocarlo, cuánto espera para volver a moverse solo. */
const PAUSA_MS = 4000

/**
 * El carrusel de Inicio: los últimos deseos de tus amigos pasando solos, en una vuelta sin fin (la lista va dos veces y al
 * llegar a la mitad vuelve al principio sin que se note). Se frena mientras lo tocás y un rato después; con movimiento
 * reducido no se mueve solo. Cada uno abre el feed en ese deseo.
 */
export function CarruselNovedades({ items }: { items: MiniNovedad[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const quietoHasta = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el || items.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let anterior = performance.now()
    let resto = 0
    let frame = requestAnimationFrame(function paso(ahora) {
      const dt = Math.min(64, ahora - anterior)
      anterior = ahora
      if (ahora > quietoHasta.current && !document.hidden) {
        // scrollLeft se redondea: lo que no llega a un píxel se junta para el próximo cuadro
        resto += (VELOCIDAD * dt) / 1000
        const px = Math.floor(resto)
        resto -= px
        const mitad = el.scrollWidth / 2
        el.scrollLeft = el.scrollLeft + px >= mitad ? el.scrollLeft + px - mitad : el.scrollLeft + px
      }
      frame = requestAnimationFrame(paso)
    })
    const frenar = () => { quietoHasta.current = performance.now() + PAUSA_MS }
    el.addEventListener('pointerdown', frenar)
    el.addEventListener('touchstart', frenar, { passive: true })
    el.addEventListener('wheel', frenar, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('pointerdown', frenar)
      el.removeEventListener('touchstart', frenar)
      el.removeEventListener('wheel', frenar)
    }
  }, [items.length])

  const vuelta = items.length > 1 ? [...items, ...items] : items
  return (
    <div ref={ref} className="-mx-[18px] flex gap-3 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
         aria-label="Lo nuevo de tus amigos" role="region">
      {vuelta.map((n, i) => (
        <Link key={`${n.id}-${i}`} href={`/novedades#d-${n.id}`} aria-hidden={i >= items.length || undefined}
              tabIndex={i >= items.length ? -1 : undefined}
              className="flex w-[148px] flex-none flex-col gap-2">
          <div className="relative overflow-hidden rounded-[20px] shadow-card">
            <ItemPhoto src={n.foto} titulo={n.titulo} height={148} />
            <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-white/95 py-0.5 pl-0.5 pr-2.5 text-xs font-semibold shadow-[0_1px_4px_rgb(20_20_20/0.14)]">
              <AvatarSticker nombre={n.nombre} foto={n.duenoFoto} size={22} />{n.nombre.split(' ')[0]}
            </span>
          </div>
          <p className="line-clamp-2 px-0.5 text-[13px] leading-snug font-semibold [overflow-wrap:anywhere]">{n.titulo}</p>
        </Link>
      ))}
    </div>
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

/** Un deseo nuevo de un amigo, grande, como una foto de Instagram: quién y cuándo, la foto, y reservar o robarlo. */
export function TarjetaNovedad({ n }: { n: NovedadVista }) {
  const precio = n.item.precio ?? n.item.rangoPrecio
  const href = `/l/${n.token}/item/${n.item.id}`
  return (
    <article id={`d-${n.item.id}`} className="flex scroll-mt-4 flex-col gap-3">
      <Link href={`/l/${n.token}`} className="flex items-center gap-2.5">
        <AvatarSticker nombre={n.dueno.nombre} foto={n.dueno.foto} size={38} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[15px] font-semibold [overflow-wrap:anywhere]">{n.dueno.nombre}</span>
          <span className="text-xs font-medium text-gr-muted">agregó a su lista · {n.hace}</span>
        </span>
      </Link>
      <Link href={href} className="relative block overflow-hidden rounded-[24px] shadow-card">
        <ItemPhoto src={n.item.fotoUrl} titulo={n.item.titulo} height={340} />
        <PriorityTag prioridad={n.item.prioridad} className="absolute left-3 top-3 h-[30px]" />
      </Link>
      <div className="flex flex-col gap-0.5">
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
