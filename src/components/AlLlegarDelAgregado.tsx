'use client'

import { useEffect, useRef } from 'react'
import { entregarFoto } from '@/components/FotoField'
import { ID_TITULO, ponerPegado } from '@/components/QueQueres'

// Lo que se eligió en el agregado (ver Agregado) y se lleva Agregar al llegar: queda en memoria, la navegación es del lado
// del cliente. Aparte de Agregado, así el formulario no carga las acciones del servidor que usa "¡Anotado!".

type Pendiente = { tipo: 'link'; texto: string } | { tipo: 'foto'; foto: Blob } | { tipo: 'escribir' }
let pendiente: Pendiente | null = null

export function dejarPendiente(p: Pendiente | null) {
  pendiente = p
}

/**
 * En el formulario de Agregar: lo que se eligió en el agregado. El link copiado entra como un pegado (trae nombre, foto y
 * precio), la foto se sube como una elegida con Foto, y "Escribirlo" deja el cursor en "¿Qué querés?". Va al final del
 * formulario, así los campos ya escuchan.
 */
export function AlLlegarDelAgregado() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const form = ref.current?.closest('form')
    const p = pendiente
    pendiente = null
    if (!form || !p) return
    if (p.tipo === 'link') ponerPegado(form, p.texto)
    else if (p.tipo === 'foto') entregarFoto(form, p.foto)
    else document.getElementById(ID_TITULO)?.focus()
  }, [])
  return <span ref={ref} hidden />
}
