'use client'

import { useRef, useState } from 'react'
import { completarCampo } from '@/components/CamposDeseo'
import { AVISO_SIN_LINK, LEER_LINK_MS, pedirLectura, precioTraido, type Contestado } from '@/lib/completar-deseo'
import { linkHttp } from '@/lib/links'

function valor(form: HTMLFormElement, nombre: string) {
  const campo = form.elements.namedItem(nombre)
  return campo instanceof HTMLInputElement ? campo.value : ''
}

/**
 * Al editar un deseo, abajo del precio: ponerlo al día. Con inflación, el de hace cuatro meses ya no es el de hoy, y el
 * que regala lo ve con su fecha (ver antiguedadDelPrecio).
 * - viejo ("hace 4 meses"): un casillero "Sigue costando lo mismo". Tildado, al guardar la fecha del precio pasa a hoy
 *   aunque el texto no cambie (precioVisto, ver cambiarDeseo). Si cambia el precio, la fecha cambia sola.
 * - conLink (el deseo tiene link a la tienda): "Traer el precio de la tienda" lo vuelve a leer del link, a mano, y lo
 *   pone en el campo (ver precioTraido). El link guardado no se lee solo al abrir la pantalla (ver CompletarDesdeLink).
 * El casillero es un campo común (anda sin JS); sin precio viejo está igual, escondido, para que lo tilde la lectura.
 */
export function PrecioAlDia({ conLink, viejo }: { conLink: boolean; viejo: string | null }) {
  const casilla = useRef<HTMLInputElement>(null)
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState('')

  async function traer() {
    const form = casilla.current?.form
    if (!form || buscando) return
    const link = linkHttp(valor(form, 'linkTienda').trim())
    if (!link) return setAviso(AVISO_SIN_LINK)
    setBuscando(true)
    setAviso('Buscando el precio…')
    const corte = new AbortController()
    const reloj = setTimeout(() => corte.abort(), LEER_LINK_MS)
    let r: Contestado | undefined
    try {
      r = await pedirLectura(link, corte.signal)
    } catch {
      r = null
    } finally {
      clearTimeout(reloj)
    }
    const traido = precioTraido(r, valor(form, 'precio'))
    if (traido.precio) completarCampo(form, 'precio', traido.precio)
    if (traido.visto && casilla.current) casilla.current.checked = true
    setAviso(traido.aviso)
    setBuscando(false)
  }

  return (
    <div className="flex flex-col gap-1 px-1.5">
      <label hidden={!viejo} className={viejo ? 'flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] font-semibold' : undefined}>
        <input ref={casilla} type="checkbox" name="precioVisto" value="1" className="size-[22px] flex-none accent-gr-ink" />
        <span>Sigue costando lo mismo <span className="font-medium text-gr-muted">(es de {viejo})</span></span>
      </label>
      {conLink && (
        <>
          <button type="button" onClick={traer} disabled={buscando} className="gr-btn gr-btn--sm self-start disabled:opacity-60">
            Traer el precio de la tienda
          </button>
          {/* una línea siempre, también vacía: lo que aparece no corre lo de abajo */}
          <p role="status" className="min-h-4 text-xs font-semibold text-gr-muted">{aviso || null}</p>
        </>
      )}
    </div>
  )
}
