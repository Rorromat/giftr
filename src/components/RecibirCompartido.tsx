'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { completarCampo } from '@/components/CamposDeseo'
import { inputSinBuscar } from '@/components/CompletarDesdeLink'
import { entregarFoto } from '@/components/FotoField'
import { borrarCompartido, leerCompartido } from '@/lib/buzon-compartido'
import { llegadaDeAfuera, queHacerConLoCompartido } from '@/lib/recibir-compartido'

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
 * Cómo entra un link que se busca solo en "¿Qué querés?": como un pegado, igual que con "Pegar link copiado" (QueQueres).
 * Así CompletarDesdeLink lo busca en el momento (ver loQueEntro) y "¿Qué querés?" deja de estar vacío.
 */
export const comoPegado = (texto: string) => ({ bubbles: true, inputType: 'insertFromPaste', data: texto }) satisfies InputEventInit

/** "Más detalles" abierto, para que se vean las notas que vinieron. */
function verNotas(notas: HTMLTextAreaElement) {
  const detalles = notas.closest('details')
  if (detalles) detalles.open = true
}

/** El tipo de la navegación que cargó el documento (ver cargaNueva); sin Navigation Timing, ninguno (cuenta como nueva). */
function tipoDeCarga(): string | undefined {
  try {
    return (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type
  } catch {
    return undefined
  }
}

/** Lo que el servidor no sabe de cómo se llegó (ver llegadaDeAfuera). */
const deAfuera = () => llegadaDeAfuera({ tipo: tipoDeCarga(), referrer: document.referrer, origen: location.origin })

/**
 * Si este documento ya atendió lo compartido por la URL. Al ir atrás dentro de GiftR (a /agregar?link=… desde /mi-lista,
 * después de agregar), Next vuelve a montar la página que guardó sin cargar el documento: el tipo de la navegación y el
 * referrer siguen siendo los de la llegada, y llegadaDeAfuera daría que sí otra vez (otra lectura del tope, la foto del link
 * otra vez y, con otro id, un deseo repetido si se toca Agregar). Vive lo que el documento: una carga nueva (otro
 * compartir, una recarga) empieza de cero, y esa la mira llegadaDeAfuera.
 */
let urlAtendida = false

/** true solo la primera vez que se pregunta en este documento (ver urlAtendida). */
export function primeraVezPorLaUrl() {
  const primera = !urlAtendida
  urlAtendida = true
  return primera
}

/**
 * Lo compartido a GiftR desde otra app, en el formulario de agregar (editar nunca lo usa). Corre una vez, al abrir.
 * - Sin buzon (/agregar?link=… o ?texto=…, desde el route o el atajo del iPhone): el servidor ya lo puso en los campos, y si
 *   es automático, la llegada es nueva y de afuera (ver llegadaDeAfuera) y es la primera vez en el documento (ver
 *   primeraVezPorLaUrl), el link se busca.
 * - Con buzon (lo dejó el service worker): el título, las notas, la foto y la búsqueda, en ese orden (la foto empieza a
 *   subir antes de que vuelva la lectura del link, así la que proponga el link no la reemplaza), y se borra del buzón: al
 *   volver atrás ya no hay nada. Lo que ya esté escrito no se pisa, y una recarga no corre sola (ver
 *   queHacerConLoCompartido). Lo que no se busca solo (un texto, o un link que no es automático) queda como el que llega por
 *   la URL: CompletarDesdeLink no lo mira (ver inputSinBuscar), y un link se busca recién si la persona lo cambia, como uno
 *   escrito.
 * Va después de CompletarDesdeLink y FotoField en el formulario: sus efectos, que escuchan, corren antes que el de acá.
 * Que la foto no llegó lo dice una línea propia (en el consejo de FotoField lo borraría CompletarDesdeLink al buscar),
 * mientras no haya foto: una elegida con Foto, o la que trajo el link.
 */
export function RecibirCompartido({ buzon, link, automatico, sinFoto }: CompartidoAlForm) {
  const linea = useRef<HTMLParagraphElement>(null)
  const [fotoNoLlego, setFotoNoLlego] = useState(false)
  const [hayFoto, setHayFoto] = useState(false)

  const recibir = useEffectEvent(async (form: HTMLFormElement, sigue: () => boolean) => {
    // siempre después de un await: en desarrollo el efecto corre dos veces seguidas, y lo de la primera no va (ni borra el
    // buzón, ni cuenta para primeraVezPorLaUrl)
    const r = await (buzon ? leerCompartido(buzon) : null)
    if (!sigue()) return
    const titulo = form.elements.namedItem('titulo')
    const notas = form.elements.namedItem('notas')
    if (!(titulo instanceof HTMLInputElement) || !(notas instanceof HTMLTextAreaElement)) return
    const pegar = (texto: string) => titulo.dispatchEvent(new InputEvent('input', comoPegado(texto)))
    if (!buzon) {
      if (notas.value.trim()) verNotas(notas)
      // primero lo de primeraVezPorLaUrl, que cuenta aunque no haya nada que buscar
      if (primeraVezPorLaUrl() && link && automatico && deAfuera()) pegar(link)
      return
    }
    if (!r) return
    const que = queHacerConLoCompartido(r, { automatico, tipo: tipoDeCarga(), titulo: titulo.value, notas: notas.value })
    if (que.titulo !== undefined) completarCampo(form, 'titulo', que.titulo)
    if (que.notas !== undefined) {
      notas.value = que.notas
      verNotas(notas)
    }
    if (que.foto) entregarFoto(form, que.foto)
    if (que.pegar !== undefined) pegar(que.pegar)
    else if (que.titulo !== undefined) titulo.dispatchEvent(inputSinBuscar())
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

  // Si hay foto, la del campo oculto fotoUrl de FotoField: React le cambia el value, que en un input hidden es el atributo
  // (no hay evento que escuchar).
  useEffect(() => {
    const foto = linea.current?.closest('form')?.elements.namedItem('fotoUrl')
    if (!(foto instanceof HTMLInputElement)) return
    const mirar = () => setHayFoto(!!foto.value)
    mirar()
    const cambios = new MutationObserver(mirar)
    cambios.observe(foto, { attributes: true, attributeFilter: ['value'] })
    return () => cambios.disconnect()
  }, [])

  // Está siempre (un role="status" que aparece con el texto no siempre se lee), y vacía no ocupa lugar: el margen se come
  // el espacio entre los campos.
  return (
    <p ref={linea} role="status" className="-mt-2 text-xs font-semibold empty:-mt-4">
      {(sinFoto || fotoNoLlego) && !hayFoto ? FOTO_NO_LLEGO : null}
    </p>
  )
}
