'use client'

import { useEffect, useRef } from 'react'
import { avisarSinLink, entregarFoto } from '@/components/FotoField'
import { ID_TITULO, ponerPegado } from '@/components/QueQueres'
import { linkEnTexto, linkHttp } from '@/lib/links'

// Lo que se eligió en el agregado (ver Agregado) y se lleva Agregar al llegar: queda en memoria, la navegación es del lado
// del cliente. Aparte de Agregado, así el formulario no carga la capa del agregado.

export type Pendiente = { tipo: 'link'; texto: string } | { tipo: 'sin-link' } | { tipo: 'foto'; foto: Blob } | { tipo: 'escribir' }
let pendiente: Pendiente | null = null

/**
 * "Pegar un link" en el agregado, según lo que había copiado: el link que hay que traer (si hay uno) y lo que se lleva
 * Agregar. Sin nada copiado (o sin permiso para leerlo) no hay link y el formulario lo dice; con un texto que no es un link
 * (el nombre de algo), va a "¿Qué querés?" como siempre, y tampoco hay nada que traer.
 */
export function loCopiadoParaAgregar(copiado: string): { link: string | null; pendiente: Pendiente } {
  if (!copiado) return { link: null, pendiente: { tipo: 'sin-link' } }
  return { link: linkHttp(copiado) ?? linkEnTexto(copiado)?.link ?? null, pendiente: { tipo: 'link', texto: copiado } }
}

export function dejarPendiente(p: Pendiente | null) {
  pendiente = p
}

/**
 * En el formulario de Agregar: lo que se eligió en el agregado. El link copiado entra como un pegado (trae nombre, foto y
 * precio), la foto se sube como una elegida con Foto, y "Escribirlo" deja el cursor en "¿Qué querés?". "Pegar un link" sin
 * nada copiado avisa cómo copiarlo, igual que el botón "Pegar link" del formulario. Va al final del formulario, así los
 * campos ya escuchan.
 */
export function AlLlegarDelAgregado() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const form = ref.current?.closest('form')
    const p = pendiente
    pendiente = null
    if (!form || !p) return
    if (p.tipo === 'link') ponerPegado(form, p.texto)
    else if (p.tipo === 'sin-link') avisarSinLink(form)
    else if (p.tipo === 'foto') entregarFoto(form, p.foto)
    else document.getElementById(ID_TITULO)?.focus()
  }, [])
  return <span ref={ref} hidden />
}
