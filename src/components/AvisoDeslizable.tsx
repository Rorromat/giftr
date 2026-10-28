'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { abrirAvisoAction, archivarAvisoAction } from '@/app/actions'
import { Icon } from '@/components/ui'

// Un aviso de "Para vos" (Inicio) que se desliza como un chat de WhatsApp: corriéndolo a la izquierda aparecen atrás "Ver" y
// "Archivar", y si lo seguís corriendo más allá de la mitad se archiva solo (el botón de archivar se estira y "Ver" se va).
// Tocarlo lo abre, como "Ver". Las dos cosas lo sacan de Para vos (ver marcarAvisoVisto). Para el teclado y los lectores de
// pantalla, los botones de atrás se pueden enfocar: al llegarles, la fila se abre. Uno abierto a la vez: abrir otro, tocar
// afuera o empezar a deslizar otro lo cierra.

/** Lo que miden los dos botones de atrás juntos. */
const BOTONES = 152
/** Soltarlo más allá de esta parte de la fila lo archiva sin tocar el botón. */
const HASTA_EL_FINAL = 0.55
/** Antes de moverse, cuánto hay que correr el dedo para saber si desliza (a los costados) o hace scroll (para arriba). */
const UMBRAL = 8
/** Lo avisa la fila que se abre, para que se cierre la que estaba abierta. */
const SE_ABRE = 'gr-aviso-se-abre'
/** Un tirón (un gesto corto y rápido: menos de esto en ms) la abre o la cierra aunque haya corrido poco, como en WhatsApp. */
const TIRON_MS = 250

/** desde: dónde estaba al empezar, y cuándo; dx: por dónde va (también en el estado, que al soltar rápido no se actualizó). */
type Gesto = { x: number; y: number; desde: number; horizontal: boolean | null; dx: number; t0: number }

/** La fila, que abre el aviso; mientras va al servidor, se apaga un poco. */
function Abrir({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-busy={pending || undefined}
            className="flex w-full items-start gap-3 px-4 py-3.5 text-left disabled:opacity-60">
      {children}
    </button>
  )
}

export function AvisoDeslizable({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  /** Cuánto está corrida (negativo: a la izquierda); 0, cerrada; -BOTONES, abierta. */
  const [dx, setDx] = useState(0)
  const [arrastrando, setArrastrando] = useState(false)
  const [ancho, setAncho] = useState(360)
  const [archivado, setArchivado] = useState(false)
  const [, empezar] = useTransition()
  const fila = useRef<HTMLLIElement>(null)
  const frente = useRef<HTMLDivElement>(null)
  const gesto = useRef<Gesto | null>(null)
  // el toque que sigue a un deslizamiento no abre el aviso
  const deslizo = useRef(false)

  const seAbre = () => window.dispatchEvent(new CustomEvent(SE_ABRE, { detail: id }))

  useEffect(() => {
    const otra = (e: Event) => { if ((e as CustomEvent<string>).detail !== id) setDx(0) }
    window.addEventListener(SE_ABRE, otra)
    return () => window.removeEventListener(SE_ABRE, otra)
  }, [id])

  // abierta: tocar afuera la cierra
  useEffect(() => {
    if (dx === 0 || arrastrando) return
    const afuera = (e: PointerEvent) => { if (!fila.current?.contains(e.target as Node)) setDx(0) }
    document.addEventListener('pointerdown', afuera)
    return () => document.removeEventListener('pointerdown', afuera)
  }, [dx, arrastrando])

  function archivar() {
    setArchivado(true)
    const fd = new FormData()
    fd.set('id', id)
    empezar(() => archivarAvisoAction(fd))
  }

  /**
   * Al soltarla: más allá de la mitad, se archiva. Si no, con un tirón queda para donde iba (abierta o cerrada), y si no,
   * según dónde quedó.
   */
  function soltar(g: Gesto, t: number) {
    setArrastrando(false)
    if (g.dx <= -ancho * HASTA_EL_FINAL) return archivar()
    const tiron = t - g.t0 < TIRON_MS && g.dx !== g.desde
    setDx((tiron ? g.dx < g.desde : g.dx < -BOTONES / 2) ? -BOTONES : 0)
  }

  const pasado = arrastrando && dx <= -ancho * HASTA_EL_FINAL

  return (
    // archivado: se cierra el hueco mientras va al servidor, y ya no se puede enfocar ni tocar
    <li ref={fila} inert={archivado}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ${archivado ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]'}`}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDx(0) }}>
      {/* el gesto es de toda la fila, también de los botones de atrás: deslizar desde ahí la mueve y nunca los aprieta */}
      <div className="relative min-h-0 touch-pan-y overflow-hidden select-none"
           onPointerDown={(e) => {
             if (e.pointerType === 'mouse' && e.button !== 0) return
             deslizo.current = false
             gesto.current = { x: e.clientX, y: e.clientY, desde: dx, horizontal: null, dx, t0: e.timeStamp }
           }}
           onPointerMove={(e) => {
             const g = gesto.current
             if (!g) return
             const mx = e.clientX - g.x
             const my = e.clientY - g.y
             if (g.horizontal === null) {
               if (Math.abs(mx) < UMBRAL && Math.abs(my) < UMBRAL) return
               g.horizontal = Math.abs(mx) > Math.abs(my)
               // para arriba o para abajo: es scroll, no se desliza
               if (!g.horizontal) { gesto.current = null; return }
               e.currentTarget.setPointerCapture(e.pointerId)
               setAncho(e.currentTarget.offsetWidth)
               setArrastrando(true)
               seAbre()
             }
             g.dx = Math.min(0, Math.max(-e.currentTarget.offsetWidth, g.desde + mx))
             setDx(g.dx)
           }}
           onPointerUp={(e) => {
             const g = gesto.current
             gesto.current = null
             if (!g?.horizontal) return
             deslizo.current = true
             soltar(g, e.timeStamp)
           }}
           onPointerCancel={() => {
             const g = gesto.current
             gesto.current = null
             if (!g?.horizontal) return
             setArrastrando(false)
             setDx(g.desde)
           }}
           onClickCapture={(e) => {
             // el click con que termina un deslizamiento (con el mouse llega siempre) no hace nada; con la fila abierta,
             // tocarla la cierra en vez de abrir el aviso (los botones de atrás sí se aprietan)
             const enLaFila = frente.current?.contains(e.target as Node)
             if (!deslizo.current && !(dx !== 0 && enLaFila)) return
             e.preventDefault()
             e.stopPropagation()
             if (deslizo.current) deslizo.current = false
             else setDx(0)
           }}>
        <div ref={frente} style={{ transform: archivado ? 'translateX(-100%)' : `translateX(${dx}px)` }}
             className={`relative z-[1] bg-gr-surface ${arrastrando ? '' : 'transition-transform duration-200 ease-out'}`}>
          <form action={abrirAvisoAction}>
            <input type="hidden" name="id" value={id} />
            <Abrir>{children}</Abrir>
          </form>
        </div>

        {/* atrás, a la derecha: lo que aparece al deslizar (después en el orden del teclado: primero la fila) */}
        <div className="absolute inset-y-0 right-0 flex text-xs font-semibold" style={{ width: Math.max(BOTONES, -dx) }}
             onFocus={() => { seAbre(); setDx(-BOTONES) }}>
          <form action={abrirAvisoAction} className="flex flex-none overflow-hidden transition-[width] duration-150"
                style={{ width: pasado ? 0 : BOTONES / 2 }}>
            <input type="hidden" name="id" value={id} />
            <button aria-label={`Ver: ${titulo}`} className="flex flex-1 flex-col items-center justify-center gap-1 bg-gr-blue text-gr-on-blue">
              <Icon name="eye" size={20} /> Ver
            </button>
          </form>
          <button type="button" onClick={archivar} aria-label={`Archivar: ${titulo}`}
                  className="flex flex-1 flex-col items-center justify-center gap-1 bg-gr-brand text-gr-accent">
            <Icon name="archivar" size={20} /> Archivar
          </button>
        </div>
      </div>
    </li>
  )
}
