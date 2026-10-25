'use client'

import { CampoTitulo } from '@/components/CamposDeseo'
import { avisoDelTitulo } from '@/lib/deseo-form'
import { linkEnTexto, linkHttp } from '@/lib/links'

/** El id del título del deseo: "Pegar link" lo llena y el botón de agregar mira si está vacío (ver DeseoForm). */
export const ID_TITULO = 'que-queres'

/**
 * "Pegar link" (en el lugar de la foto, ver FotoField): lo copiado va al título, como un pegado, y el autocompletado busca
 * el link en el momento (ver CompletarDesdeLink). Con un link no se enfoca: el autocompletado no escribe el título
 * mientras el dueño está ahí, y el nombre del producto quedaba esperando a que lo dejara (además de abrir el teclado sin
 * que haga falta). false si no había nada copiado (o no hay permiso para leerlo).
 */
export async function pegarLink(form: HTMLFormElement): Promise<boolean> {
  let copiado = ''
  try {
    copiado = (await navigator.clipboard.readText()).trim()
  } catch {
    // sin permiso o sin soporte: lo mismo que sin nada copiado
  }
  const input = form.elements.namedItem('titulo')
  if (!copiado || !(input instanceof HTMLInputElement)) return false
  input.value = copiado
  input.setCustomValidity(avisoDelTitulo(copiado, null))
  if (!(linkHttp(copiado) ?? linkEnTexto(copiado))) input.focus()
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: copiado }))
  return true
}

/**
 * "¿Qué querés?", adentro de la tarjeta del deseo: se escribe o se pega el link (pasa a "Link a la tienda" al mandar, ver
 * deseoDesdeForm). Grande, como el nombre del deseo en su tarjeta.
 */
export function QueQueres({ defaultValue }: { defaultValue?: string }) {
  return (
    <>
      <label htmlFor={ID_TITULO} className="sr-only">¿Qué querés?</label>
      {/* entra un link entero (pasa a "Link a la tienda", ver deseoDesdeForm); si el texto se pasa, avisa antes de mandar */}
      <CampoTitulo id={ID_TITULO} name="titulo" required placeholder="¿Qué querés?" defaultValue={defaultValue}
                   className="block min-h-12 w-full rounded-xl bg-transparent px-1.5 text-[22px] leading-tight font-semibold outline-none placeholder:font-medium placeholder:text-gr-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gr-ink" />
    </>
  )
}
