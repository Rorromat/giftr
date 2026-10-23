'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { completarCampo } from '@/components/CamposDeseo'
import { entregarFoto } from '@/components/FotoField'
import { borrarCompartido, leerCompartido } from '@/lib/buzon-compartido'
import { queHacerConLoCompartido } from '@/lib/recibir-compartido'

/** Lo compartido a GiftR desde otra app, para el formulario de agregar (lo arma /agregar). */
export type CompartidoAlForm = {
  /** El id de lo que guardó el service worker (public/sw.js). */
  buzon?: string
  /** Lo que llegó en la URL, ya revisado y dentro de los topes (ver loCompartido): va de defaultValue. */
  link?: string
  titulo?: string
  notas?: string | null
  /** Se llegó desde GiftR o desde otra app (ver compartidoAutomatico): la búsqueda del link y la foto corren solas. */
  automatico: boolean
  /** Vino una foto que el servidor no tomó (?foto=no). */
  sinFoto: boolean
}

export const FOTO_NO_LLEGO = 'La foto no llegó: tocá Foto y elegila de nuevo.'

/**
 * Cómo entra lo compartido en "¿Qué querés?": como un pegado, igual que con "Pegar link copiado" (QueQueres). Así
 * CompletarDesdeLink busca el link en el momento (ver loQueEntro) y "¿Qué querés?" deja de estar vacío.
 */
export const comoPegado = (texto: string) => ({ bubbles: true, inputType: 'insertFromPaste', data: texto }) satisfies InputEventInit

/** "Más detalles" abierto, para que se vean las notas que vinieron. */
function verNotas(notas: HTMLTextAreaElement) {
  const detalles = notas.closest('details')
  if (detalles) detalles.open = true
}

/**
 * Lo compartido a GiftR desde otra app, en el formulario de agregar (editar nunca lo usa). Corre una vez, al abrir.
 * - Sin buzon (/agregar?link=… o ?texto=…, desde el route o el atajo del iPhone): el servidor ya lo puso en los campos, y si
 *   es automático el link se busca.
 * - Con buzon (lo dejó el service worker): el título, las notas, la foto y la búsqueda, en ese orden (la foto empieza a
 *   subir antes de que vuelva la lectura del link, así la que proponga el link no la reemplaza), y se borra del buzón. Lo
 *   que ya esté escrito no se pisa (ver queHacerConLoCompartido).
 * Va después de CompletarDesdeLink y FotoField en el formulario: sus efectos, que escuchan, corren antes que el de acá.
 * Que la foto no llegó lo dice una línea propia: en el consejo de FotoField lo borraría CompletarDesdeLink al buscar.
 */
export function RecibirCompartido({ buzon, link, automatico, sinFoto }: CompartidoAlForm) {
  const linea = useRef<HTMLParagraphElement>(null)
  const [fotoNoLlego, setFotoNoLlego] = useState(false)

  const recibir = useEffectEvent(async (form: HTMLFormElement, sigue: () => boolean) => {
    // siempre después de un await: en desarrollo el efecto corre dos veces seguidas, y lo de la primera no va (ni borra el buzón)
    const r = await (buzon ? leerCompartido(buzon) : null)
    if (!sigue()) return
    const titulo = form.elements.namedItem('titulo')
    const notas = form.elements.namedItem('notas')
    if (!(titulo instanceof HTMLInputElement) || !(notas instanceof HTMLTextAreaElement)) return
    const pegar = (texto: string) => titulo.dispatchEvent(new InputEvent('input', comoPegado(texto)))
    if (!buzon) {
      if (notas.value.trim()) verNotas(notas)
      if (link && automatico) pegar(link)
      return
    }
    if (!r) return
    const que = queHacerConLoCompartido(r, { automatico, titulo: titulo.value, notas: notas.value })
    if (que.titulo !== undefined) completarCampo(form, 'titulo', que.titulo)
    if (que.notas !== undefined) {
      notas.value = que.notas
      verNotas(notas)
    }
    if (que.foto) entregarFoto(form, que.foto)
    if (que.pegar !== undefined) pegar(que.pegar)
    setFotoNoLlego(que.fotoNoLlego)
    void borrarCompartido(buzon)
  })

  useEffect(() => {
    const form = linea.current?.closest('form')
    if (!form) return
    let sigue = true
    void recibir(form, () => sigue)
    return () => {
      sigue = false
    }
  }, [])

  // Está siempre (un role="status" que aparece con el texto no siempre se lee), y vacía no ocupa lugar: el margen se come
  // el espacio entre los campos.
  return (
    <p ref={linea} role="status" className="-mt-2 text-xs font-semibold empty:-mt-4">
      {sinFoto || fotoNoLlego ? FOTO_NO_LLEGO : null}
    </p>
  )
}
