'use client'

import { useEffect, useRef, useState } from 'react'
import { completarCampo } from '@/components/CamposDeseo'
import { aconsejarFoto, proponerFoto } from '@/components/FotoField'
import { completador, loQueEntro, type Linea } from '@/lib/completar-deseo'

const CAMPOS = ['titulo', 'linkTienda', 'precio'] as const

function valor(form: HTMLFormElement, nombre: string) {
  const campo = form.elements.namedItem(nombre)
  return campo instanceof HTMLInputElement ? campo.value : ''
}

/** Solo el título y el link a la tienda (lo que escribe completarCampo no dispara input). */
const esCampoDelLink = (t: EventTarget | null): t is HTMLInputElement =>
  t instanceof HTMLInputElement && (t.name === 'titulo' || t.name === 'linkTienda')

/**
 * Completa el deseo con el link del producto, pegado en "¿Qué querés?" o en "Link a la tienda": el nombre, el precio y la
 * foto (la trae FotoField), sin pisar lo que escribió el dueño (ver queCompletar). Se ve como una sola línea de estado, que
 * está siempre (un role="status" que aparece con el texto no siempre se lee) y con su lugar guardado: no corre nada, ni
 * mientras busca ni cuando vuelve. Nunca frena el envío: si manda antes de que vuelva, se guarda como sin esto (con el
 * nombre que trae el link).
 * guardado y tituloGuardado: el link a la tienda y el título del deseo que se edita; sus links no se buscan.
 */
export function CompletarDesdeLink({ guardado, tituloGuardado = null }: { guardado: string | null; tituloGuardado?: string | null }) {
  const linea = useRef<HTMLParagraphElement>(null)
  const [estado, setEstado] = useState<Linea>({ aviso: '' })

  useEffect(() => {
    const form = linea.current?.closest('form')
    if (!form) return
    const titulo = form.elements.namedItem('titulo')
    const c = completador({
      guardado,
      tituloGuardado,
      leer: () => ({ titulo: valor(form, 'titulo'), linkTienda: valor(form, 'linkTienda'), precio: valor(form, 'precio') }),
      escribiendo: () => document.activeElement === titulo,
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
      c.alCambiar(e instanceof InputEvent ? loQueEntro(e, recien) : null)
    }
    // Lo escrito a mano se busca al dejar el campo; si el foco va al título, no se le escribe nada mientras está ahí. Irse
    // a otra app (a copiar algo) también saca el foco, pero el campo sigue siendo el activo: eso no es dejarlo.
    const alDejar = (e: FocusEvent) => {
      if (!esCampoDelLink(e.target) || document.activeElement === e.target) return
      c.alDejar(e.target.name === 'titulo' ? 'titulo' : 'linkTienda', e.relatedTarget === titulo)
    }
    // Antes de que se arme lo que se manda (este listener corre antes que el de React): lo del producto anterior afuera.
    // Lo que vuelva después ya no va (proponía una foto que se importaba para un deseo ya guardado).
    const alMandar = () => c.alMandar()
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
  }, [guardado, tituloGuardado])

  // Una línea siempre, también vacía: lo que aparece no corre Foto ni Pegar. Los avisos son cortos para entrar en un
  // teléfono; "Buscando…" con un sitio largo (o con la letra agrandada) entra cortado, y el lector de pantalla lo lee entero.
  return (
    <p ref={linea} role="status" className="-mt-1 min-h-4 truncate text-xs font-semibold">
      {estado.aviso || null}
    </p>
  )
}
