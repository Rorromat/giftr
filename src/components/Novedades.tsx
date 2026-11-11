'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import {
  masNovedadesAction, robarDeseoAction, type EstadoRobo, type NovedadVista,
} from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { FotoAmpliable } from '@/components/FotoAmpliable'
import { TarjetaRegalo } from '@/components/TarjetaRegalo'
import { AvatarSticker, Icon, ItemPhoto, Mono, PriorityTag } from '@/components/ui'
import { siguienteDelCarrusel } from '@/lib/carrusel'

// Lo nuevo de tus amigos: el carrusel de Inicio (tarjetas que pasan solas de a una, dos segundos en cada una, una sola
// vuelta, y se pueden deslizar con el dedo), la tarjeta del feed (/novedades, como una foto de Instagram) con el scroll
// infinito, y el botón "Me lo robo".

export type MiniNovedad = {
  id: string; titulo: string; foto: string | null; precio: string | null; hace: string; nombre: string; duenoFoto: string | null
}

/** Cada cuánto pasa sola a la tarjeta siguiente: dos segundos quieta en cada una, más lo que tarda en deslizarse. */
const CADA_MS = 2700

/**
 * El estante de Inicio: los últimos deseos de tus amigos, cada uno en su cuadrado de color, uno al lado del otro.
 * Pasa solo de a una tarjeta, dos segundos en cada una, da una vuelta (al llegar a la última vuelve a la primera) y se
 * queda quieto: moviéndose para siempre no deja leer lo de al lado, y no había cómo pararlo. Apenas lo tocan (con el dedo,
 * la ruedita o el teclado) deja de pasar solo y no vuelve a arrancar: ya lo maneja quien lo tocó. Con movimiento reducido
 * no se mueve solo. Cada una abre el feed en ese deseo.
 */
export function CarruselNovedades({ items }: { items: MiniNovedad[] }) {
  const ref = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || items.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => {
      // con la pestaña en segundo plano espera: la vuelta la da cuando se ve
      if (document.hidden) return
      const sig = siguienteDelCarrusel(el)
      el.scrollTo({ left: sig.izquierda, behavior: 'smooth' })
      // volvió a la primera: ya dio la vuelta
      if (sig.volvio) parar()
    }, CADA_MS)
    // el foco solo cuenta si viene del teclado: el del toque ya lo frena pointerdown
    const conTeclado = (e: FocusEvent) => { if ((e.target as Element).matches(':focus-visible')) parar() }
    const toques = ['pointerdown', 'touchstart', 'wheel'] as const
    function parar() {
      clearInterval(t)
      for (const ev of toques) el!.removeEventListener(ev, parar)
      el!.removeEventListener('focusin', conTeclado)
    }
    for (const ev of toques) el.addEventListener(ev, parar, { passive: true })
    el.addEventListener('focusin', conTeclado)
    return parar
  }, [items.length])

  return (
    <ul ref={ref} aria-label="Lo nuevo de tus amigos" className="gr-estante relative">
      {items.map((n) => (
        <li key={n.id}>
          <TarjetaRegalo href={`/novedades#d-${n.id}`} foto={n.foto} titulo={n.titulo} precio={n.precio}
                         pie={
                           // div: la foto es un div, y adentro de un <p> el navegador corta el párrafo y React no puede hidratar
                           <div className="flex min-w-0 items-center gap-1.5 text-xs text-gr-muted">
                             <AvatarSticker nombre={n.nombre} foto={n.duenoFoto} size={18} />
                             <span className="truncate">{n.nombre.split(' ')[0]} · {n.hace}</span>
                           </div>
                         } />
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
  token: string; itemId: string
  /** boton: con su texto; icono: blanco, sobre la foto de una tarjeta; vidrio: arriba de la ficha del deseo */
  variante?: 'boton' | 'icono' | 'vidrio'
  className?: string
}) {
  const [estado, robar] = useActionState<EstadoRobo, FormData>(robarDeseoAction, null)
  return (
    <>
      <form action={robar} className={className}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="itemId" value={itemId} />
        {variante === 'vidrio' ? (
          <BotonEnviar aria-label="Me lo robo: sumarlo a tu lista" className="gr-icon-btn gr-vidrio-oscuro">
            <Icon name="copiar" size={19} strokeWidth={2.2} />
          </BotonEnviar>
        ) : variante === 'icono' ? (
          <BotonEnviar aria-label="Me lo robo: sumarlo a tu lista"
                       className="gr-toque flex size-9 items-center justify-center rounded-full bg-white/95 text-[#121216] shadow-[0_1px_4px_rgb(20_20_20/0.18)]">
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
              <Icon name="check" size={18} strokeWidth={2.6} className="flex-none text-gr-acento-sobre-tinta" />
              <span className="min-w-0 flex-1">{estado.yaLoTenias ? 'Ya lo tenías en tu lista.' : '¡Robado! Ya está en tu lista.'}</span>
              <Link href={`/deseo/${estado.itemId}`} className="flex-none font-semibold underline underline-offset-4">Ver</Link>
            </>
          ) : <span>{estado.texto}</span>}
        </p>
      )}
    </>
  )
}

/** Reservar desde el feed: lleva al deseo, que tiene "Reservar" en su barra, de un toque (ver ComoLoRegalas). */
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
  return <Link href={href} className="gr-btn-primary gr-btn--sm w-full">Reservar</Link>
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
        <AvatarSticker nombre={n.dueno.nombre} foto={n.dueno.foto} size={38} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[15px] font-semibold [overflow-wrap:anywhere]">{n.dueno.nombre}</span>
          <span className="text-xs font-medium text-gr-muted">agregó a su lista · {n.hace}</span>
        </span>
      </Link>
      <FotoAmpliable src={n.item.fotoUrl} titulo={n.item.titulo} className="overflow-hidden rounded-gr-md">
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
          ? <Mono className={`size-[30px] ${cargando ? 'gr-latiendo' : ''}`} />
          : <p>Eso es todo por ahora. Tirá para abajo arriba de todo para ver si hay algo nuevo.</p>}
      </div>
    </>
  )
}
