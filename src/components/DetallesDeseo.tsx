'use client'

import { useEffect, useRef, useState } from 'react'
import { CampoLink, CampoVideo } from '@/components/CamposDeseo'
import { Icon } from '@/components/ui'
import { CANTIDAD_MAXIMA, LARGO } from '@/lib/limites'
import type { OwnerItemView } from '@/lib/serialize'

const CATEGORIAS = ['Tecnología', 'Casa', 'Ropa', 'Libros', 'Experiencias', 'Hobbies']

export type Detalle = 'notas' | 'cantidad' | 'categoria' | 'link' | 'video'

const CHIPS: { detalle: Detalle; texto: string }[] = [
  { detalle: 'notas', texto: 'Talle o color' },
  { detalle: 'cantidad', texto: 'Cantidad' },
  { detalle: 'categoria', texto: 'Categoría' },
  { detalle: 'link', texto: 'Link de la tienda' },
  { detalle: 'video', texto: 'Video' },
]

/**
 * Los detalles del deseo, de a uno: cada chip abre solo lo suyo. Lo cargado (al editar, o lo que llegó compartido) arranca
 * abierto. Cerrado no se borra: los campos siguen en el formulario (con hidden), así un chip que se cierra no pierde lo
 * escrito, y "Link de la tienda" lo llena la lectura del link aunque no se vea (ver CompletarDesdeLink).
 */
export function DetallesDeseo({ deseo, notas, solo, textoNotas = 'Talle o color' }: {
  deseo?: OwnerItemView
  notas?: string | null
  /** cuáles (una sorpresa no tiene cantidad ni categoría); si no, todos */
  solo?: Detalle[]
  textoNotas?: string
}) {
  const hay = (d: Detalle) => !solo || solo.includes(d)
  const [abiertos, setAbiertos] = useState<Set<Detalle>>(() => new Set([
    ...(deseo?.notas || notas ? ['notas' as const] : []),
    ...((deseo?.cantidad ?? 1) > 1 ? ['cantidad' as const] : []),
    ...(deseo?.categoria ? ['categoria' as const] : []),
    ...(deseo?.linkTienda ? ['link' as const] : []),
    ...(deseo?.videoUrl ? ['video' as const] : []),
  ]))
  const cambiar = (d: Detalle) => setAbiertos((a) => {
    const n = new Set(a)
    if (n.has(d)) n.delete(d)
    else n.add(d)
    return n
  })
  const ver = (d: Detalle) => !abiertos.has(d)
  // un campo con un aviso (un link que no es link) en un detalle cerrado: al tocar Agregar se abre, así se ve qué pasa
  const raiz = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const form = raiz.current?.closest('form')
    if (!form) return
    const alFallar = (e: Event) => {
      const id = e.target instanceof Element ? e.target.closest('[id^="detalle-"]')?.id.slice('detalle-'.length) : null
      if (id) setAbiertos((a) => (a.has(id as Detalle) ? a : new Set([...a, id as Detalle])))
    }
    form.addEventListener('invalid', alFallar, true)
    return () => form.removeEventListener('invalid', alFallar, true)
  }, [])

  return (
    <div ref={raiz} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {CHIPS.filter(({ detalle }) => hay(detalle)).map(({ detalle, texto }) => {
          const abierto = abiertos.has(detalle)
          return (
            <button key={detalle} type="button" aria-expanded={abierto} aria-controls={`detalle-${detalle}`} onClick={() => cambiar(detalle)}
                    className={`flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold ${abierto ? 'border-gr-ink bg-gr-surface' : 'border-dashed border-gr-line-strong bg-transparent'}`}>
              <Icon name={abierto ? 'check' : 'plus'} size={15} strokeWidth={2.4} />{detalle === 'notas' ? textoNotas : texto}
            </button>
          )
        })}
      </div>

      {hay('notas') && <div id="detalle-notas" hidden={ver('notas')}>
        <textarea name="notas" maxLength={LARGO.notas} placeholder="Talle, color, modelo… lo que ayude a acertar" aria-label="Notas: talle, color"
                  defaultValue={deseo?.notas ?? notas ?? ''} className="gr-input min-h-24" />
      </div>}
      {hay('cantidad') && <div id="detalle-cantidad" hidden={ver('cantidad')} className="flex items-center gap-3">
        <label htmlFor="cantidad" className="text-sm font-semibold">¿Cuántos?</label>
        {/* uno de antes del tope con más se sigue pudiendo editar (si no se toca, queda como estaba) */}
        <input id="cantidad" name="cantidad" type="number" inputMode="numeric" min="1" max={Math.max(CANTIDAD_MAXIMA, deseo?.cantidad ?? 0)}
               defaultValue={deseo?.cantidad ?? 1} className="gr-input w-28" />
      </div>}
      {hay('categoria') && <div id="detalle-categoria" hidden={ver('categoria')} role="radiogroup" aria-label="Categoría" className="flex flex-wrap gap-2">
        {CATEGORIAS.map((c) => (
          <label key={c} className="gr-chip">
            <input type="radio" name="categoria" value={c} defaultChecked={deseo?.categoria === c} className="sr-only" />{c}
          </label>
        ))}
        {/* se puede volver a "sin categoría" */}
        <label className="gr-chip">
          <input type="radio" name="categoria" value="" defaultChecked={!deseo?.categoria} className="sr-only" />Sin categoría
        </label>
      </div>}
      {/* el link siempre está, aunque no se vea: ahí deja el suyo la lectura del link (ver CompletarDesdeLink) */}
      <div id="detalle-link" hidden={ver('link')}>
        {/* sin https:// también vale (el servidor se lo agrega); lo que el servidor no tomaría como link avisa antes de mandar */}
        <CampoLink name="linkTienda" placeholder="Link a la tienda" defaultValue={deseo?.linkTienda ?? ''} className="gr-input"
                   aria-label="Link a la tienda" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </div>
      {/* un video del producto: el link de YouTube, TikTok, Instagram… (se ve adentro del deseo, ver VideoDeseo) */}
      {hay('video') && <div id="detalle-video" hidden={ver('video')} className="flex flex-col gap-1.5">
        <CampoVideo name="videoUrl" placeholder="Link del video" defaultValue={deseo?.videoUrl ?? ''} className="gr-input"
                   aria-label="Link del video" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <p className="text-xs leading-snug text-gr-muted">De YouTube, TikTok, Instagram o Vimeo se ve ahí mismo en el deseo.</p>
      </div>}
    </div>
  )
}
