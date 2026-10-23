'use client'

import { useEffect, useRef, useState } from 'react'
import { completarCampo } from '@/components/CamposDeseo'
import { proponerFoto } from '@/components/FotoField'
import { completador } from '@/lib/completar-deseo'

const CAMPOS = ['titulo', 'linkTienda', 'precio'] as const

function valor(form: HTMLFormElement, nombre: string) {
  const campo = form.elements.namedItem(nombre)
  return campo instanceof HTMLInputElement ? campo.value : ''
}

/**
 * Completa el deseo con el link del producto, pegado en "¿Qué querés?" o en "Link a la tienda": el nombre, el precio y la
 * foto (la trae FotoField), sin pisar lo que escribió el dueño (ver queCompletar). Se ve como una sola línea de estado, que
 * está siempre (un role="status" que aparece con el texto no siempre se lee) y vacía no ocupa lugar. Nunca frena el envío:
 * si manda antes de que vuelva, se guarda como sin esto (con el nombre que trae el link). guardado: el link a la tienda
 * del deseo que se edita, que no se busca.
 */
export function CompletarDesdeLink({ guardado }: { guardado: string | null }) {
  const linea = useRef<HTMLParagraphElement>(null)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    const form = linea.current?.closest('form')
    if (!form) return
    const c = completador({
      guardado,
      leer: () => ({ titulo: valor(form, 'titulo'), linkTienda: valor(form, 'linkTienda'), precio: valor(form, 'precio') }),
      escribir: (campos, foto) => {
        for (const nombre of CAMPOS) {
          const v = campos[nombre]
          if (v !== undefined) completarCampo(form, nombre, v)
        }
        if (foto !== undefined) proponerFoto(form, foto)
      },
      mostrar: setAviso,
    })
    // solo el título y el link a la tienda (lo que escribe completarCampo no dispara input)
    const alEscribir = (e: Event) => {
      const campo = e.target
      if (!(campo instanceof HTMLInputElement) || (campo.name !== 'titulo' && campo.name !== 'linkTienda')) return
      c.alCambiar(e instanceof InputEvent && e.inputType === 'insertFromPaste')
    }
    form.addEventListener('input', alEscribir)
    return () => {
      form.removeEventListener('input', alEscribir)
      c.cerrar()
    }
  }, [guardado])

  return <p ref={linea} role="status" className="text-xs font-semibold empty:-mt-3">{aviso || null}</p>
}
