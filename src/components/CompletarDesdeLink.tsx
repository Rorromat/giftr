'use client'

import { useEffect, useRef, useState } from 'react'
import { completarCampo } from '@/components/CamposDeseo'
import { aconsejarFoto, proponerFoto } from '@/components/FotoField'
import { completador, loQueEntro, ultimoToque, type Campo, type Destino, type Linea } from '@/lib/completar-deseo'

const CAMPOS = ['titulo', 'linkTienda', 'precio'] as const satisfies readonly Campo[]

function valor(form: HTMLFormElement, nombre: string) {
  const campo = form.elements.namedItem(nombre)
  return campo instanceof HTMLInputElement ? campo.value : ''
}

/** Uno de los campos que se completan, de ese formulario. */
const campoDe = (form: HTMLFormElement, t: EventTarget | null): Campo | null =>
  t instanceof HTMLInputElement && t.form === form ? CAMPOS.find((c) => c === t.name) ?? null : null

/** El botón que manda ese formulario. */
const esEnviar = (form: HTMLFormElement, t: EventTarget | null) => t instanceof HTMLButtonElement && t.type === 'submit' && t.form === form

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
    const c = completador({
      guardado,
      tituloGuardado,
      leer: () => ({ titulo: valor(form, 'titulo'), linkTienda: valor(form, 'linkTienda'), precio: valor(form, 'precio') }),
      enfocado: () => campoDe(form, document.activeElement),
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
    // Lo que trajo un pegado: casi todos los navegadores lo dan en el input (data); si no, lo tiene el paste de antes. Solo
    // en el título y el link a la tienda (lo que escribe completarCampo no dispara input).
    const delLink = (t: EventTarget | null) => {
      const campo = campoDe(form, t)
      return campo === 'titulo' || campo === 'linkTienda'
    }
    let pegado: string | null = null
    const alPegar = (e: ClipboardEvent) => {
      pegado = delLink(e.target) ? e.clipboardData?.getData('text/plain') ?? null : null
    }
    const alEscribir = (e: Event) => {
      const recien = pegado
      pegado = null
      if (!delLink(e.target)) return
      c.alCambiar(e instanceof InputEvent ? loQueEntro(e, recien) : null)
    }
    // Adónde va el foco: el relatedTarget del focusout. Tocar la etiqueta "¿Qué querés?" (no toma el foco) lo saca con
    // relatedTarget null y lo pasa al título recién en el click, y en Safari un botón no toma el foco: ahí vale lo que se
    // tocó, solo mientras dura ese toque (ver ultimoToque). Se olvida después del click, que es cuando la etiqueta pasa el
    // foco (el setTimeout deja que corran antes los focusout que trae).
    const toque = ultimoToque<Element>()
    const alTocar = (e: PointerEvent) => toque.tocar(e.target instanceof Element ? e.target : null)
    const olvidarToque = () => toque.olvidar()
    const alTerminarToque = () => {
      setTimeout(toque.terminar(), 0)
    }
    const adonde = (e: FocusEvent): Destino => {
      const tocado = e.target instanceof Element ? toque.alDejar(e.target) : null
      const a = e.relatedTarget ?? tocado?.closest('label')?.control ?? tocado?.closest('button') ?? null
      return esEnviar(form, a) ? 'enviar' : campoDe(form, a)
    }
    // Lo escrito a mano se busca al dejar el campo, y lo que no se escribió mientras el dueño estaba ahí va al dejarlo.
    // Irse a otra app (a copiar algo) también saca el foco, pero el campo sigue siendo el activo: eso no es dejarlo.
    const alDejar = (e: FocusEvent) => {
      const campo = campoDe(form, e.target)
      if (!campo || document.activeElement === e.target) return
      c.alDejar(campo, adonde(e))
    }
    // "Agregar" (también Enter, que lo toca), antes de que el navegador revise los campos: el título no queda vacío.
    const alTocarBoton = (e: MouseEvent) => {
      if (e.target instanceof Element && esEnviar(form, e.target.closest('button'))) c.antesDeMandar()
    }
    // Antes de que se arme lo que se manda (este listener corre antes que el de React): lo del producto anterior afuera.
    // Lo que vuelva después ya no va (proponía una foto que se importaba para un deseo ya guardado).
    const alMandar = () => c.alMandar()
    document.addEventListener('pointerdown', alTocar, true)
    document.addEventListener('pointercancel', olvidarToque, true)
    document.addEventListener('click', alTerminarToque, true)
    document.addEventListener('focusin', olvidarToque)
    form.addEventListener('paste', alPegar)
    form.addEventListener('input', alEscribir)
    form.addEventListener('focusout', alDejar)
    form.addEventListener('click', alTocarBoton)
    form.addEventListener('submit', alMandar)
    return () => {
      document.removeEventListener('pointerdown', alTocar, true)
      document.removeEventListener('pointercancel', olvidarToque, true)
      document.removeEventListener('click', alTerminarToque, true)
      document.removeEventListener('focusin', olvidarToque)
      form.removeEventListener('paste', alPegar)
      form.removeEventListener('input', alEscribir)
      form.removeEventListener('focusout', alDejar)
      form.removeEventListener('click', alTocarBoton)
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
