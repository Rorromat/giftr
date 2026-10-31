'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { flushSync } from 'react-dom'
import { updatePriorityAction } from '@/app/actions'
import { dejarPendiente } from '@/components/AlLlegarDelAgregado'
import { leerCopiado } from '@/components/QueQueres'
import { IlustracionAgregado } from '@/components/IlustracionAgregado'
import { ArmandoRegalo } from '@/components/ArmandoRegalo'
import { Arte, Hearts, PRIORIDADES, type Prioridad } from '@/components/ui'
import { linkEnTexto, linkHttp, sitioDeLaTienda } from '@/lib/links'

// El agregado: el + de la barra de abajo se abre en un círculo del acento que llena la pantalla, y las cuatro maneras de
// sumar un deseo caen como cartas. La elegida crece, las demás se caen y sale la tarjeta del deseo mientras se abre Agregar
// con eso ya puesto (el link copiado, la foto, o el título para escribir): el formulario es el de siempre. Al guardar, en la
// lista aparece "¡Anotado!" con su foto (ver RecienAgregado) y al cerrarlo el círculo vuelve al + y el deseo
// nuevo entra primero. La animación es CSS (.gr-agr en tokens.css); acá, en qué paso está.

type Paso = '' | 'abierto' | 'pegando' | 'listo'
type Tipo = 'link' | 'foto' | 'galeria' | 'escribir'

/** El deseo recién agregado, para "¡Anotado!". */
export type Anotado = { id: string; titulo: string; foto: string | null; prioridad: Prioridad; grupo: boolean }

type Estado = {
  paso: Paso
  /** Dónde nace el círculo: el centro del +. */
  x: number
  y: number
  /** Sin barrer: "¡Anotado!" al llegar ya está abierto, y al irse a Agregar se apaga en vez de cerrarse. */
  quieto: boolean
  saliendo: boolean
  tipo: Tipo | null
  /** Lo elegido, para la tarjeta mientras carga: el link, o la foto (un object URL). */
  link: string | null
  foto: string | null
  anotado: Anotado | null
}

const INICIAL: Estado = { paso: '', x: 0, y: 0, quieto: true, saliendo: false, tipo: null, link: null, foto: null, anotado: null }
let estado = INICIAL
const oyentes = new Set<() => void>()
function poner(cambio: Partial<Estado>) {
  estado = { ...estado, ...cambio }
  for (const o of oyentes) o()
}
const suscribir = (o: () => void) => {
  oyentes.add(o)
  return () => { oyentes.delete(o) }
}
export const useAgregado = () => useSyncExternalStore(suscribir, () => estado, () => INICIAL)

/** El centro del + (el botón de la barra), donde nace y adonde vuelve el círculo. */
function centroDelMas() {
  const r = document.querySelector('.gr-mas')?.getBoundingClientRect()
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth - 50, y: innerHeight - 53 }
}

const sinMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Pasado "¡Anotado!", el ?agregado= se saca de la dirección: al volver a entrar (o tirar para actualizar) ya no es el recién
 * agregado. Mientras se ve, queda: si cambia cuánto lo querés, la lista se vuelve a armar con él primero.
 */
function olvidarAgregado() {
  const url = new URL(location.href)
  if (!url.searchParams.has('agregado')) return
  url.searchParams.delete('agregado')
  history.replaceState(history.state, '', url)
}

export function abrirAgregado() {
  if (estado.foto) URL.revokeObjectURL(estado.foto)
  olvidarAgregado()
  // El círculo cerrado primero se para en el + (sin animar) y recién ahí se abre: si no, la primera vez (que todavía no
  // sabía dónde estaba el +) se abría viajando desde la esquina de arriba a la izquierda.
  flushSync(() => poner({ ...centroDelMas(), quieto: true }))
  const fondo = document.querySelector('.gr-agr__fondo')
  if (fondo) void getComputedStyle(fondo).clipPath
  poner({ paso: 'abierto', quieto: false, saliendo: false, tipo: null, link: null, foto: null })
}

/** Cierra: el círculo vuelve al +. Con el deseo recién anotado, entra primero en la lista. */
export function cerrarAgregado() {
  const nuevo = estado.paso === 'listo' ? estado.anotado : null
  olvidarAgregado()
  poner({ ...centroDelMas(), paso: '', quieto: false, saliendo: false })
  if (nuevo) {
    const el = document.getElementById(`d-${nuevo.id}`)
    el?.scrollIntoView({ block: 'center', behavior: sinMovimiento() ? 'auto' : 'smooth' })
    el?.classList.add('gr-nuevo')
  }
}

/** Cuándo empezó a verse la tarjeta mientras carga (ver PREVIA_MS). */
let pegandoDesde = 0

/** Lo elegido: las cartas se caen y sale la tarjeta del deseo mientras se abre Agregar. */
function pegar(tipo: Tipo, cambio: Partial<Estado>) {
  pegandoDesde = Date.now()
  poner({ ...cambio, paso: 'pegando', tipo })
}

/** "¡Anotado!": al volver a la lista con el deseo recién agregado (ver RecienAgregado). */
export function mostrarAnotado(anotado: Anotado) {
  poner({ ...centroDelMas(), paso: 'listo', quieto: true, saliendo: false, anotado })
}

/** Las cuatro maneras de sumar un deseo, cada una con su ilustración (ver IlustracionAgregado). */
const CARTAS: { tipo: Tipo; titulo: string; bajada: string; oscura?: boolean; r: string }[] = [
  { tipo: 'link', titulo: 'Pegar un link', bajada: 'De cualquier tienda', r: '-4deg' },
  { tipo: 'foto', titulo: 'Sacarle una foto', bajada: 'Lo viste en una vidriera', oscura: true, r: '3deg' },
  { tipo: 'galeria', titulo: 'Una foto del celu', bajada: 'Captura o galería', r: '2deg' },
  { tipo: 'escribir', titulo: 'Escribirlo', bajada: 'Una idea o experiencia', r: '-3deg' },
]

const MIENTRAS: Record<Tipo, string> = {
  link: 'Trayendo nombre, foto y precio…',
  foto: 'Mirando la foto…',
  galeria: 'Subiendo la foto…',
  escribir: 'Anotando tu idea…',
}

/** Lo que tarda en irse a Agregar: lo que tardan las cartas en caerse (sin movimiento, nada). */
const CAEN_MS = 450
/** Lo mínimo que se ve la tarjeta mientras carga: lo que tarda en armarse el regalo (ver ArmandoRegalo). */
const PREVIA_MS = 1800

/** La capa del agregado. Va con la barra de abajo (ver BottomNav), que tiene el +. */
export function Agregado() {
  const e = useAgregado()
  const router = useRouter()
  const path = usePathname()
  const [, empezar] = useTransition()
  // cuánto lo querés, marcado en "¡Anotado!" (de ese deseo: el próximo arranca con lo que se eligió en el formulario)
  const [prioridad, setPrioridad] = useState<{ id: string; p: Prioridad } | null>(null)
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const relojes = useRef<ReturnType<typeof setTimeout>[]>([])
  const despues = (ms: number, f: () => void) => { relojes.current.push(setTimeout(f, ms)) }
  useEffect(() => () => relojes.current.forEach(clearTimeout), [])

  // Lo elegido ya está en Agregar: el círculo se apaga (la barra, con el +, está escondida ahí) y después se resetea
  const alCambiarDePantalla = useEffectEvent((ahora: string) => {
    if (estado.paso === 'pegando' && ahora === '/agregar') {
      despues(Math.max(0, PREVIA_MS - (Date.now() - pegandoDesde)), () => {
        poner({ paso: '', saliendo: true, quieto: true })
        despues(400, () => poner({ saliendo: false }))
      })
    } else if (estado.paso === 'abierto') {
      poner({ paso: '', quieto: true })
    }
  })
  useEffect(() => { alCambiarDePantalla(path) }, [path])

  const alTeclear = useEffectEvent((ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && (estado.paso === 'abierto' || estado.paso === 'listo')) cerrarAgregado()
  })
  useEffect(() => {
    const f = (ev: KeyboardEvent) => alTeclear(ev)
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [])

  // abierto: el foco va a la primera carta, cuando ya entraron
  useEffect(() => {
    if (e.paso !== 'abierto') return
    const t = setTimeout(() => raiz.current?.querySelector<HTMLElement>('.gr-carta')?.focus({ preventScroll: true }), sinMovimiento() ? 0 : 320)
    return () => clearTimeout(t)
  }, [e.paso])

  function irA(tipo: Tipo, cambio: Partial<Estado>, ruta: string) {
    pegar(tipo, cambio)
    despues(sinMovimiento() ? 0 : CAEN_MS, () => router.push(ruta))
  }

  async function elegir(tipo: Tipo) {
    if (estado.paso !== 'abierto') return
    if (tipo === 'foto') return camara.current?.click()
    if (tipo === 'galeria') return galeria.current?.click()
    if (tipo === 'escribir') {
      dejarPendiente({ tipo: 'escribir' })
      return irA('escribir', { link: null, foto: null }, '/agregar')
    }
    // el link copiado se lee acá, con el toque (después de navegar, el navegador ya no deja)
    const copiado = await leerCopiado()
    const link = linkHttp(copiado) ?? linkEnTexto(copiado)?.link ?? null
    dejarPendiente(copiado ? { tipo: 'link', texto: copiado } : null)
    irA('link', { link, foto: null }, '/agregar')
  }

  function conFoto(tipo: 'foto' | 'galeria', archivo: File | undefined) {
    if (!archivo || estado.paso !== 'abierto') return
    dejarPendiente({ tipo: 'foto', foto: archivo })
    irA(tipo, { link: null, foto: URL.createObjectURL(archivo) }, '/agregar')
  }

  function cuanto(p: Prioridad) {
    const a = estado.anotado
    if (!a) return
    setPrioridad({ id: a.id, p })
    const fd = new FormData()
    fd.set('itemId', a.id)
    fd.set('prioridad', p)
    empezar(() => updatePriorityAction(fd))
  }

  const abierto = e.paso !== ''
  const a = e.anotado
  const elegida = (prioridad && prioridad.id === a?.id ? prioridad.p : a?.prioridad) ?? 'gustaria'
  const tienda = e.link ? sitioDeLaTienda(e.link) : null
  const previa = e.tipo && (
    <div className="gr-previa">
      {/* el regalo que se arma, según cómo lo sumaste */}
      <div className="gr-arte" style={{ aspectRatio: '1' }}><ArmandoRegalo tipo={e.tipo} foto={e.foto} /></div>
      <b>{tienda ? `De ${tienda}` : e.tipo === 'escribir' ? 'Tu idea' : e.foto ? 'Tu foto' : 'Tu deseo'}</b>
      <small>{MIENTRAS[e.tipo]}</small>
      <div className="gr-barrita"><i /></div>
    </div>
  )

  return (
    <div ref={raiz} className="gr-agr touch-none" data-paso={e.paso} data-quieto={e.quieto || undefined} data-saliendo={e.saliendo || undefined}
         role="dialog" aria-modal={abierto} aria-label="Agregar un deseo" inert={!abierto}
         style={{ '--x': `${e.x}px`, '--y': `${e.y}px` } as React.CSSProperties}>
      <div className="gr-agr__fondo">
        <div className="gr-agr__marco">
          <div className="gr-agr__elegir">
            <h2>¿Qué se te antojó?</h2>
            <div className="gr-cartas">
              {CARTAS.map((c, i) => (
                <button key={c.tipo} type="button" onClick={() => elegir(c.tipo)} data-elegida={e.tipo === c.tipo || undefined}
                        className={`gr-carta${c.oscura ? ' gr-carta--oscura' : ''}`} style={{ '--i': i, '--r': c.r } as React.CSSProperties}>
                  <IlustracionAgregado dibujo={c.tipo} oscura={c.oscura} className="gr-carta__dibujo" />
                  <b>{c.titulo}<small>{c.bajada}</small></b>
                </button>
              ))}
            </div>
            <p className="gr-agr__pie">Lo más rápido: desde la tienda, Compartir → GiftR.</p>
          </div>
          <div className="gr-agr__pegando" aria-live="polite">{e.paso === 'pegando' && previa}</div>
        </div>

        <div className="gr-agr__listo">
          {a && (
            <div className="gr-listo" role="status">
              <Arte src={a.foto} titulo={a.titulo} style={{ '--i': 0 } as React.CSSProperties} />
              <h2 style={{ '--i': 1 } as React.CSSProperties}>¡Anotado!</h2>
              <p className="text-base opacity-85 [overflow-wrap:anywhere]" style={{ '--i': 2 } as React.CSSProperties}>
                {a.titulo} ya está en {a.grupo ? 'la lista' : 'tu lista'}.
              </p>
              <div className="gr-cuanto" role="group" aria-label="Cuánto lo querés" style={{ '--i': 3 } as React.CSSProperties}>
                {(['suelta', 'gustaria', 'mucho'] as const).map((p) => (
                  <button key={p} type="button" aria-pressed={elegida === p} onClick={() => cuanto(p)} className="inline-flex items-center gap-1.5">
                    <Hearts n={PRIORIDADES[p].corazones} />{PRIORIDADES[p].label}
                  </button>
                ))}
              </div>
              <div className="flex w-full max-w-[280px] gap-2" style={{ '--i': 4 } as React.CSSProperties}>
                <button type="button" onClick={cerrarAgregado} className="gr-btn gr-btn--blanco flex-[1.4]">
                  Ver en {a.grupo ? 'la lista' : 'mi lista'}
                </button>
                <button type="button" onClick={abrirAgregado} className="gr-btn gr-btn--vidrio flex-1">Otro</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <input ref={camara} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden
             onChange={(ev) => { conFoto('foto', ev.target.files?.[0]); ev.target.value = '' }} />
      <input ref={galeria} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden
             onChange={(ev) => { conFoto('galeria', ev.target.files?.[0]); ev.target.value = '' }} />
    </div>
  )
}
