'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import {
  masNovedadesAction, robarDeseoAction, type EstadoRobo, type NovedadVista,
} from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { FotoAmpliable } from '@/components/FotoAmpliable'
import { Arte, AvatarSticker, Icon, ItemPhoto, PriorityTag, Starburst } from '@/components/ui'

// Lo nuevo de tus amigos: el carrusel de Inicio (tarjetas grandes que pasan solas de a una, un segundo en cada una, y se
// pueden deslizar con el dedo), la tarjeta del feed (/novedades, como una foto de Instagram) con el scroll infinito, y el
// botón "Me lo robo".

export type MiniNovedad = {
  id: string; titulo: string; foto: string | null; precio: string | null; hace: string; nombre: string; duenoFoto: string | null
}

/** Cada cuánto pasa sola a la tarjeta siguiente: un segundo quieta en cada una, más lo que tarda en deslizarse. */
const CADA_MS = 1700
/** Después de soltarlo (o de moverlo con la ruedita), cuánto espera para volver a pasar solo. */
const PAUSA_MS = 2500

/**
 * El estante de Inicio: los últimos deseos de tus amigos, cada uno en su cuadrado de color, uno al lado del otro.
 * Pasa solo de a una tarjeta, un segundo en cada una, y al llegar a la última vuelve a la primera. Mientras lo tenés
 * apretado (o recorrés las tarjetas con el teclado) no se mueve, y al soltarlo espera un poco. Con movimiento reducido no
 * se mueve solo. Cada una abre el feed en ese deseo.
 */
export function CarruselNovedades({ items }: { items: MiniNovedad[] }) {
  const ref = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || items.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let tocando = false
    let conTeclado = false
    let quietoHasta = 0
    const frenar = () => { quietoHasta = Date.now() + PAUSA_MS }
    const tocar = () => { tocando = true }
    // el dedo se puede soltar afuera del carrusel (o el navegador cancelarlo al hacer scroll): se escucha en toda la página
    const soltar = () => {
      if (!tocando) return
      tocando = false
      frenar()
    }
    const entra = (e: FocusEvent) => { conTeclado = (e.target as Element).matches(':focus-visible') }
    const sale = () => { conTeclado = false }
    const t = setInterval(() => {
      if (tocando || conTeclado || Date.now() < quietoHasta || document.hidden) return
      const tarjetas = [...el.children] as HTMLElement[]
      // la que está en el medio ahora, y la que sigue (después de la última, la primera)
      const centro = el.scrollLeft + el.clientWidth / 2
      const ahora = tarjetas.findIndex((c) => c.offsetLeft + c.offsetWidth > centro)
      const alFinal = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
      const sig = tarjetas[alFinal || ahora < 0 ? 0 : (ahora + 1) % tarjetas.length]
      el.scrollTo({ left: sig.offsetLeft - (el.clientWidth - sig.offsetWidth) / 2, behavior: 'smooth' })
    }, CADA_MS)
    el.addEventListener('pointerdown', tocar)
    el.addEventListener('touchstart', tocar, { passive: true })
    el.addEventListener('wheel', frenar, { passive: true })
    el.addEventListener('focusin', entra)
    el.addEventListener('focusout', sale)
    const finales = ['pointerup', 'pointercancel', 'touchend', 'touchcancel'] as const
    for (const ev of finales) window.addEventListener(ev, soltar)
    return () => {
      clearInterval(t)
      el.removeEventListener('pointerdown', tocar)
      el.removeEventListener('touchstart', tocar)
      el.removeEventListener('wheel', frenar)
      el.removeEventListener('focusin', entra)
      el.removeEventListener('focusout', sale)
      for (const ev of finales) window.removeEventListener(ev, soltar)
    }
  }, [items.length])

  return (
    <ul ref={ref} aria-label="Lo nuevo de tus amigos" className="gr-estante relative">
      {items.map((n) => (
        <li key={n.id}>
          <Link href={`/novedades#d-${n.id}`} className="flex flex-col gap-1.5">
            <Arte id={n.id} src={n.foto} titulo={n.titulo} />
            <h3 className="line-clamp-2 text-sm leading-tight font-bold tracking-[-0.01em] [overflow-wrap:anywhere]">{n.titulo}</h3>
            {n.precio && <p className="text-[13px] text-gr-muted tabular-nums">{n.precio}</p>}
            {/* div: la foto es un div, y adentro de un <p> el navegador corta el párrafo y React no puede hidratar */}
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-gr-muted">
              <AvatarSticker nombre={n.nombre} foto={n.duenoFoto} size={18} />
              <span className="truncate">{n.nombre.split(' ')[0]} · {n.hace}</span>
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
                       className="flex size-9 items-center justify-center rounded-full bg-white/95 text-[#121216] shadow-[0_1px_4px_rgb(20_20_20/0.18)]">
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
              <Icon name="check" size={18} strokeWidth={2.6} className="flex-none text-gr-acento" />
              <span className="min-w-0 flex-1">{estado.yaLoTenias ? 'Ya lo tenías en tu lista.' : '¡Robado! Ya está en tu lista.'}</span>
              <Link href={`/deseo/${estado.itemId}`} className="flex-none font-semibold underline underline-offset-4">Ver</Link>
            </>
          ) : <span>{estado.texto}</span>}
        </p>
      )}
    </>
  )
}

/** Reservar desde el feed: lleva al deseo, que pregunta cómo (lo comprás vos o lo dividen con amigos, ver ComoLoRegalas). */
function Reservar({ n }: { n: NovedadVista }) {
  const mia = n.item.claims.some((c) => c.esMia || c.grupal?.soyParte)
  const href = `/l/${n.token}/item/${n.item.id}`
  if (mia) {
    return (
      <Link href={href} className="gr-btn gr-btn--accent gr-btn--sm w-full gap-1.5">
        <Icon name="check" size={17} strokeWidth={2.6} />Lo reservaste
      </Link>
    )
  }
  if (!n.item.disponible) return <span className="gr-btn gr-btn--sm w-full cursor-default text-gr-muted">Ya lo reservaron</span>
  return <Link href={`${href}?reservar=1#reservar`} className="gr-btn-primary gr-btn--sm w-full">Reservar</Link>
}

/**
 * Un deseo nuevo de un amigo, en su tarjeta, como una foto de Instagram: quién y cuándo, la foto (tocándola se ve entera),
 * y reservar o robarlo. El nombre lleva al deseo.
 */
export function TarjetaNovedad({ n }: { n: NovedadVista }) {
  const precio = n.item.precio ?? n.item.rangoPrecio
  const href = `/l/${n.token}/item/${n.item.id}`
  return (
    <article id={`d-${n.item.id}`} className="gr-card flex scroll-mt-4 flex-col gap-3 p-3 pb-3.5">
      <Link href={`/l/${n.token}`} className="flex items-center gap-2.5 px-0.5">
        <AvatarSticker id={n.dueno.id} nombre={n.dueno.nombre} foto={n.dueno.foto} size={38} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[15px] font-semibold [overflow-wrap:anywhere]">{n.dueno.nombre}</span>
          <span className="text-xs font-medium text-gr-muted">agregó a su lista · {n.hace}</span>
        </span>
      </Link>
      <FotoAmpliable src={n.item.fotoUrl} titulo={n.item.titulo} className="overflow-hidden rounded-[18px]">
        <ItemPhoto src={n.item.fotoUrl} titulo={n.item.titulo} height={320} />
        <PriorityTag prioridad={n.item.prioridad} className="absolute left-3 top-3 h-[30px]" />
      </FotoAmpliable>
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
