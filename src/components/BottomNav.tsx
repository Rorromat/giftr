'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import { Agregado, abrirAgregado, cerrarAgregado, useAgregado } from '@/components/Agregado'
import { Icon, type IconName } from '@/components/ui'
import { instalada } from '@/lib/app-instalable'

const DESTINOS: { href: string; label: string; nombre: string; icon: IconName }[] = [
  { href: '/inicio', label: 'Inicio', nombre: 'Inicio', icon: 'home' },
  { href: '/gente', label: 'Tu gente', nombre: 'Gente', icon: 'users' },
  { href: '/regalos', label: 'Tus regalos y cuentas', nombre: 'Regalos', icon: 'gift' },
  { href: '/mi-lista', label: 'Vos: tu lista y tu perfil', nombre: 'Vos', icon: 'user' },
]

/**
 * La sección del menú a la que pertenece una pantalla: todo el año, lo nuevo de tus amigos, las fechas especiales y Avisos
 * son de Inicio; un grupo, un deseo y el perfil, de Vos; la lista de alguien y agregar un amigo, de Gente; Cuentas, una sorpresa y
 * un amigo invisible, de Regalos.
 */
function seccionDe(path: string) {
  if (path === '/eventos' || path === '/novedades' || path === '/avisos' || path.startsWith('/fechas/')) return '/inicio'
  if (path === '/cuentas' || path.startsWith('/sorpresa/') || path.startsWith('/invisible/')) return '/regalos'
  if (path.startsWith('/l/') || path.startsWith('/gente/')) return '/gente'
  if (path.startsWith('/grupos/') || path.startsWith('/deseo/') || path === '/perfil' || path.startsWith('/perfil/')) return '/mi-lista'
  return path
}

/** Cuánto achica el teclado lo que se ve: con más que esto, está abierto. */
const TECLADO_PX = 150

/**
 * iOS 26 con GiftR instalado: después de usar el teclado, lo que se ve de la pantalla (el visual viewport) puede quedar
 * corrido de lo que usa position: fixed, y la barra flotaba por la mitad de la pantalla al scrollear (un bug de WebKit).
 * Solo en la app instalada, la barra se vuelve a pegar abajo de lo que se ve (--anclaje: cuánto se corre) y, con el
 * teclado abierto, se esconde. En los demás navegadores los dos coinciden y no cambia nada.
 */
function useAnclajeAbajo(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv || !instalada()) return
    let frame = 0
    const ajustar = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const nav = ref.current
        if (!nav) return
        const alto = document.documentElement.clientHeight
        const desfase = vv.scale > 1.01 ? 0 : vv.offsetTop + vv.height - alto
        nav.toggleAttribute('data-teclado', vv.scale <= 1.01 && alto - vv.height > TECLADO_PX)
        if (Math.abs(desfase) < 1) nav.style.removeProperty('--anclaje')
        else nav.style.setProperty('--anclaje', `${Math.round(desfase)}px`)
      })
    }
    ajustar()
    vv.addEventListener('resize', ajustar)
    vv.addEventListener('scroll', ajustar)
    window.addEventListener('scroll', ajustar, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      vv.removeEventListener('resize', ajustar)
      vv.removeEventListener('scroll', ajustar)
      window.removeEventListener('scroll', ajustar)
    }
  }, [ref])
}

/** Cuánto tiene que ir el dedo de costado para que deje de ser un toque y empiece a arrastrar el selector. */
const ARRASTRE_PX = 6
/** Lo que tarda el selector, al soltarlo, en llegar a la sección elegida (como su transición en tokens.css). */
const SOLTAR_MS = 300

/** Qué está haciendo el dedo en la barra: nada, arrastrando el selector (y sobre qué sección) o soltándolo. */
type Dedo = { fase: 'quieto' | 'arrastrando' | 'soltando'; bajo: number | null }

/**
 * Arrastrar el dedo por la barra, como en el iPhone: el selector (.gr-nav__dedo) sigue al dedo, un poco más grande, con el
 * ancho de la sección que tiene abajo (que además se estira), y al soltar va a esa sección y se entra ahí. Un toque sigue
 * siendo un toque: recién después de ARRASTRE_PX de costado empieza el arrastre, y el click que llega después de soltar no
 * cuenta. La posición va directo al estilo (--dedo-x, --dedo-w), sin pasar por React en cada movimiento.
 */
function useDedoEnLaBarra(tabs: RefObject<HTMLDivElement | null>, alSoltar: (i: number) => void): Dedo {
  const [dedo, setDedo] = useState<Dedo>({ fase: 'quieto', bajo: null })
  const elegir = useEffectEvent(alSoltar)
  useEffect(() => {
    const el = tabs.current
    if (!el) return
    let inicio: { x: number; y: number; id: number } | null = null
    let arrastrando = false
    let bajo = -1
    let reloj: ReturnType<typeof setTimeout> | undefined
    const secciones = () => [...el.querySelectorAll<HTMLElement>(':scope > a')]
    /** El selector a la sección i, entera (al soltar). */
    const enSeccion = (i: number) => {
      const caja = el.getBoundingClientRect(), r = secciones()[i].getBoundingClientRect()
      el.style.setProperty('--dedo-x', `${r.left - caja.left}px`)
      el.style.setProperty('--dedo-w', `${r.width}px`)
    }
    /** El selector centrado en el dedo (sin salirse de la barra), con el ancho de la sección de abajo. */
    const seguir = (x: number) => {
      const caja = el.getBoundingClientRect()
      const ss = secciones()
      // la primera que termina a la derecha del dedo; pasado el final, la última
      const debajo = ss.findIndex((a) => x < a.getBoundingClientRect().right)
      const i = debajo < 0 ? ss.length - 1 : debajo
      const w = ss[i].getBoundingClientRect().width
      el.style.setProperty('--dedo-x', `${Math.min(Math.max(x - caja.left - w / 2, 6), caja.width - 6 - w)}px`)
      el.style.setProperty('--dedo-w', `${w}px`)
      if (i === bajo) return
      bajo = i
      // un golpecito al pasar de una a otra, donde hay vibración (no en el iPhone)
      navigator.vibrate?.(6)
      setDedo({ fase: 'arrastrando', bajo: i })
    }
    const apoya = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
      inicio = { x: e.clientX, y: e.clientY, id: e.pointerId }
      arrastrando = false
    }
    const mueve = (e: PointerEvent) => {
      if (!inicio || e.pointerId !== inicio.id) return
      if (!arrastrando) {
        const dx = e.clientX - inicio.x, dy = e.clientY - inicio.y
        if (Math.abs(dx) < ARRASTRE_PX || Math.abs(dx) < Math.abs(dy)) return
        arrastrando = true
        clearTimeout(reloj)
        el.setPointerCapture(e.pointerId)
      }
      seguir(e.clientX)
    }
    const suelta = (e: PointerEvent, entrar: boolean) => {
      if (!inicio || e.pointerId !== inicio.id) return
      inicio = null
      if (!arrastrando || bajo < 0) return
      const i = bajo
      bajo = -1
      enSeccion(i)
      setDedo({ fase: 'soltando', bajo: i })
      if (entrar) elegir(i)
      reloj = setTimeout(() => setDedo({ fase: 'quieto', bajo: null }), SOLTAR_MS)
    }
    const arriba = (e: PointerEvent) => suelta(e, true)
    const cancela = (e: PointerEvent) => suelta(e, false)
    // el click que llega después de arrastrar no es un toque en la sección donde se soltó (ya se eligió al soltar)
    const click = (e: MouseEvent) => {
      if (!arrastrando) return
      e.preventDefault()
      e.stopPropagation()
    }
    el.addEventListener('pointerdown', apoya)
    el.addEventListener('pointermove', mueve)
    el.addEventListener('pointerup', arriba)
    el.addEventListener('pointercancel', cancela)
    el.addEventListener('click', click, true)
    return () => {
      clearTimeout(reloj)
      el.removeEventListener('pointerdown', apoya)
      el.removeEventListener('pointermove', mueve)
      el.removeEventListener('pointerup', arriba)
      el.removeEventListener('pointercancel', cancela)
      el.removeEventListener('click', click, true)
    }
  }, [tabs])
  return dedo
}

/**
 * La barra de abajo: una píldora de vidrio esmerilado con las cuatro secciones y, al costado, el + en un círculo del mismo
 * vidrio. Vive en el layout de (menu), así que no se vuelve a montar al cambiar de sección: la sección tocada se marca
 * desde el toque mismo, y su columna se estira con un rebote (las columnas se animan con CSS). El + abre el agregado (ver Agregado): gira y queda como × mientras la píldora se esconde. En
 * Agregar la barra se esconde entera (al editar un deseo o tus gustos, armar una sorpresa o un amigo invisible también), y
 * en un deseo, que tiene una sola acción principal, tampoco va.
 */
export function BottomNav() {
  const path = usePathname()
  // El destino tocado, mientras la navegación todavía no cambió la URL. Apenas cambia se olvida: si no,
  // al volver atrás a la pantalla de origen el toque viejo revivía (la barra quedaba escondida).
  const [toque, setToque] = useState<{ href: string; desde: string } | null>(null)
  if (toque && toque.desde !== path) setToque(null)
  const actual = seccionDe(path)
  const marcado = toque && toque.desde === path ? toque.href : actual
  const oculta = marcado === '/agregar' || path.startsWith('/editar/') || path === '/sorpresa/nueva' || /^\/sorpresa\/[^/]+\/editar$/.test(path)
    || path === '/invisible/nuevo' || /^\/invisible\/[^/]+\/editar$/.test(path) || /^\/perfil\/gustos\/[^/]+$/.test(path)
    || path.startsWith('/deseo/') || /^\/l\/[^/]+\/item\//.test(path)
  const { paso } = useAgregado()
  const abierto = paso !== ''
  // La columna que se estira: la marcada. En Agregar (o un deseo) no hay marcada: queda la última mientras la barra baja.
  const columna = DESTINOS.findIndex((d) => d.href === marcado)
  const [ultima, setUltima] = useState(Math.max(columna, 0))
  if (columna >= 0 && columna !== ultima) setUltima(columna)

  const ref = useRef<HTMLElement>(null)
  useAnclajeAbajo(ref)
  // arrastrando el dedo, se estira la sección que tiene abajo; al soltar, se entra ahí (como tocarla)
  const router = useRouter()
  const tabs = useRef<HTMLDivElement>(null)
  const dedo = useDedoEnLaBarra(tabs, (i) => {
    const d = DESTINOS[i]
    if (d.href === path) return
    setToque({ href: d.href, desde: path })
    router.push(d.href)
  })
  const estirada = dedo.fase === 'arrastrando' && dedo.bajo !== null ? dedo.bajo : columna >= 0 ? columna : ultima

  return (
    <>
      <Agregado />
      <nav ref={ref} aria-label="Navegación principal" className="gr-nav" data-oculta={oculta || undefined} data-abierto={abierto || undefined}
           inert={oculta}>
        {/* prefetch: las secciones del menú se precargan completas (con datos) y el toque es instantáneo. */}
        <div ref={tabs} className="gr-nav__tabs" data-columna={estirada} data-dedo={dedo.fase === 'quieto' ? undefined : dedo.fase} inert={abierto}>
          {/* el selector que sigue al dedo (ver useDedoEnLaBarra) */}
          <span aria-hidden className="gr-nav__dedo" />
          {DESTINOS.map((d, i) => (
            <Destino key={d.href} d={d} actual={actual} marcado={marcado} bajo={dedo.bajo === i}
                     onNavigate={() => setToque({ href: d.href, desde: path })} />
          ))}
        </div>
        <button type="button" className="gr-mas" aria-label={abierto ? 'Cerrar' : 'Agregar un deseo'} aria-expanded={abierto}
                onClick={() => (abierto ? cerrarAgregado() : abrirAgregado())}>
          <Icon name="plus" size={24} strokeWidth={2.4} />
        </button>
      </nav>
    </>
  )
}

function Destino({ d, actual, marcado, bajo, onNavigate }: {
  d: (typeof DESTINOS)[number]; actual: string; marcado: string; bajo: boolean; onNavigate: () => void
}) {
  return (
    // draggable={false}: arrastrar el link (con el mouse) cancelaría el arrastre del selector
    <Link href={d.href} prefetch onNavigate={onNavigate} aria-label={d.label} draggable={false}
          aria-current={actual === d.href ? 'page' : undefined} data-marcado={marcado === d.href || undefined} data-bajo={bajo || undefined}>
      <Icon name={d.icon} size={22} strokeWidth={2} />
      <span aria-hidden>{d.nombre}</span>
    </Link>
  )
}
