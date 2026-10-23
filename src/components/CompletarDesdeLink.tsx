'use client'

import { useEffect, useRef, useState } from 'react'
import { completarCampo } from '@/components/CamposDeseo'
import { aconsejarFoto, proponerFoto } from '@/components/FotoField'
import { completador, type Linea } from '@/lib/completar-deseo'

const CAMPOS = ['titulo', 'linkTienda', 'precio'] as const

function valor(form: HTMLFormElement, nombre: string) {
  const campo = form.elements.namedItem(nombre)
  return campo instanceof HTMLInputElement ? campo.value : ''
}

/** Solo el título y el link a la tienda (lo que escribe completarCampo no dispara input). */
const esCampoDelLink = (t: EventTarget | null) => t instanceof HTMLInputElement && (t.name === 'titulo' || t.name === 'linkTienda')

/**
 * Completa el deseo con el link del producto, pegado en "¿Qué querés?" o en "Link a la tienda": el nombre, el precio y la
 * foto (la trae FotoField), sin pisar lo que escribió el dueño (ver queCompletar). Se ve como una sola línea de estado, que
 * está siempre (un role="status" que aparece con el texto no siempre se lee) y con su lugar guardado: mientras busca no
 * corre nada. Nunca frena el envío: si manda antes de que vuelva, se guarda como sin esto (con el nombre que trae el link).
 * guardado: el link a la tienda del deseo que se edita, que no se busca.
 */
export function CompletarDesdeLink({ guardado }: { guardado: string | null }) {
  const linea = useRef<HTMLParagraphElement>(null)
  const [estado, setEstado] = useState<Linea>({ aviso: '' })

  useEffect(() => {
    const form = linea.current?.closest('form')
    if (!form) return
    const c = completador({
      guardado,
      leer: () => ({ titulo: valor(form, 'titulo'), linkTienda: valor(form, 'linkTienda'), precio: valor(form, 'precio') }),
      escribiendo: () => document.activeElement === form.elements.namedItem('titulo'),
      escribir: (campos, foto) => {
        for (const nombre of CAMPOS) {
          const v = campos[nombre]
          if (v !== undefined) completarCampo(form, nombre, v)
        }
        if (foto !== undefined) proponerFoto(form, foto)
      },
      mostrar: (l) => {
        setEstado(l)
        aconsejarFoto(form, l.consejoFoto ?? null)
      },
    })
    // Lo que trajo un pegado: casi todos los navegadores lo dan en el input (data); si no, lo tiene el paste de antes.
    let pegado: string | null = null
    const alPegar = (e: ClipboardEvent) => {
      pegado = esCampoDelLink(e.target) ? e.clipboardData?.getData('text/plain') ?? null : null
    }
    const alEscribir = (e: Event) => {
      const recien = pegado
      pegado = null
      if (!esCampoDelLink(e.target)) return
      c.alCambiar(e instanceof InputEvent && e.inputType === 'insertFromPaste' ? e.data || recien || '' : null)
    }
    const alDejar = (e: FocusEvent) => {
      if (esCampoDelLink(e.target)) c.alDejar()
    }
    // lo que vuelva después de mandar ya no va (proponía una foto que se importaba para un deseo ya guardado)
    const alMandar = () => c.cerrar()
    form.addEventListener('paste', alPegar)
    form.addEventListener('input', alEscribir)
    form.addEventListener('focusout', alDejar)
    form.addEventListener('submit', alMandar)
    return () => {
      form.removeEventListener('paste', alPegar)
      form.removeEventListener('input', alEscribir)
      form.removeEventListener('focusout', alDejar)
      form.removeEventListener('submit', alMandar)
      c.cerrar()
    }
  }, [guardado])

  // una línea siempre: "Buscando…" entra cortado si el sitio es largo; solo lo que vuelve puede ocupar más
  return (
    <p ref={linea} role="status" className={`-mt-1 min-h-4 text-xs font-semibold${estado.buscando ? ' truncate' : ''}`}>
      {estado.aviso || null}
    </p>
  )
}
