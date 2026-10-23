'use client'

import { useRef, useState } from 'react'
import { CampoTitulo } from '@/components/CamposDeseo'
import { ID_ELEGIR_FOTO } from '@/components/FotoField'
import { Icon } from '@/components/ui'
import { avisoDelTitulo } from '@/lib/deseo-form'
import { linkEnTexto, linkHttp } from '@/lib/links'

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
 * "¿Qué querés?": se escribe, se pega lo copiado (un link pasa a "Link a la tienda" al mandar, ver deseoDesdeForm), se
 * elige la foto ("Foto" abre el mismo campo que FotoField) o, al agregar, se arranca por una idea: el título, "Algo así" y
 * su categoría, para seguir escribiendo ("Un libro" → "Un libro de cocina").
 */
export function QueQueres({ defaultValue, agregando }: { defaultValue?: string; agregando: boolean }) {
  const campo = useRef<HTMLInputElement>(null)
  const [vacio, setVacio] = useState(!defaultValue)
  const [sinCopiar, setSinCopiar] = useState(false)

  function poner(titulo: string, enfocar = true) {
    const input = campo.current!
    input.value = titulo
    input.setCustomValidity(avisoDelTitulo(titulo, null))
    setVacio(!titulo.trim())
    if (enfocar) input.focus()
  }

  async function pegar() {
    let copiado = ''
    try {
      copiado = (await navigator.clipboard.readText()).trim()
    } catch {
      // sin permiso o sin soporte: el mismo aviso que sin nada copiado
    }
    setSinCopiar(!copiado)
    if (!copiado) return
    // Con un link no se enfoca: el autocompletado no escribe el título mientras el dueño está ahí, y el nombre del producto
    // quedaba esperando a que lo dejara (además de abrir el teclado sin que haga falta).
    const conLink = !!(linkHttp(copiado) ?? linkEnTexto(copiado))
    poner(copiado, !conLink)
    // como un pegado: el autocompletado busca el link en el momento (ver CompletarDesdeLink)
    campo.current!.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: copiado }))
  }

  function idea(titulo: string, categoria: string) {
    const form = campo.current?.form
    if (!form) return
    poner(titulo)
    marcar(form, 'tipo', 'idea')
    marcar(form, 'categoria', categoria)
  }

  const accion = 'flex h-[52px] cursor-pointer items-center justify-center gap-2 text-[15px] font-bold'
  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor="que-queres" className="gr-label">¿Qué querés?</label>
      <div className="gr-sticker focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gr-ink">
        {/* entra un link entero (pasa a "Link a la tienda", ver deseoDesdeForm); si el texto se pasa, avisa antes de mandar */}
        <CampoTitulo ref={campo} id="que-queres" name="titulo" required placeholder="Pegá un link o escribí una idea" defaultValue={defaultValue}
                     className="block h-16 w-full bg-transparent px-4 font-display text-xl font-bold outline-none placeholder:text-gr-muted"
                     onInput={(e) => {
                       setVacio(!e.currentTarget.value.trim())
                       setSinCopiar(false)
                     }} />
        <div className="grid grid-cols-2 border-t border-gr-line">
          <button type="button" onClick={pegar} className={`${accion} bg-gr-accent`}>
            <Icon name="paste" size={18} strokeWidth={2.4} />Pegar link copiado
          </button>
          {/* abre el campo de la foto (ver FotoField) */}
          <label htmlFor={ID_ELEGIR_FOTO} className={`${accion} border-l border-gr-line`}>
            <Icon name="camera" size={18} strokeWidth={2.4} />Foto
          </label>
        </div>
      </div>
      {sinCopiar && (
        <p role="alert" className="text-[13px] font-semibold">No hay nada copiado. En la tienda tocá Compartir y Copiar link, y volvé a tocar Pegar.</p>
      )}
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
