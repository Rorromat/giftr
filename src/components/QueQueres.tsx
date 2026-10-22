'use client'

import { useRef, useState } from 'react'
import { CampoTitulo } from '@/components/CamposDeseo'

/** Para arrancar sin link: el título de la idea y la categoría que le va. */
const IDEAS = [
  ['Algo de cocina', 'Casa'], ['Un libro', 'Libros'], ['Ropa', 'Ropa'],
  ['Una experiencia', 'Experiencias'], ['Para la casa', 'Casa'], ['Tecnología', 'Tecnología'],
] as const

function marcar(form: HTMLFormElement, nombre: string, valor: string) {
  const r = form.querySelector(`input[name="${nombre}"][value="${valor}"]`)
  if (r instanceof HTMLInputElement) r.checked = true
}

/**
 * "¿Qué querés?": se escribe, se pega un link (pasa a "Link a la tienda" al mandar, ver deseoDesdeForm) o, al agregar,
 * se arranca por una idea: el título, "Algo así" y su categoría, para seguir escribiendo ("Un libro" → "Un libro de
 * cocina").
 */
export function QueQueres({ defaultValue, agregando }: { defaultValue?: string; agregando: boolean }) {
  const campo = useRef<HTMLInputElement>(null)
  const [vacio, setVacio] = useState(!defaultValue)

  function idea(titulo: string, categoria: string) {
    const input = campo.current
    if (!input?.form) return
    input.value = titulo
    input.setCustomValidity('')
    marcar(input.form, 'tipo', 'idea')
    marcar(input.form, 'categoria', categoria)
    setVacio(false)
    input.focus()
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1">
        <span className="gr-label">¿Qué querés?</span>
        {/* entra un link entero (pasa a "Link a la tienda", ver deseoDesdeForm); si el texto se pasa, avisa antes de mandar */}
        <CampoTitulo ref={campo} name="titulo" required placeholder="Pegá un link o escribí" defaultValue={defaultValue}
                     className="bg-transparent font-display text-xl font-bold outline-none placeholder:text-gr-muted"
                     onInput={(e) => setVacio(!e.currentTarget.value.trim())} />
      </label>
      {agregando && vacio && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">¿Sin link? Arrancá por una idea:</span>
          <div className="flex flex-wrap gap-2">
            {IDEAS.map(([titulo, categoria]) => (
              <button key={titulo} type="button" onClick={() => idea(titulo, categoria)} className="gr-chip h-9 text-[13px]">{titulo}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
