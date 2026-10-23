'use client'

import type { ComponentProps } from 'react'
import { avisoDelLink, avisoDelTitulo } from '@/lib/deseo-form'
import { linkHttp } from '@/lib/links'

type Props = Omit<ComponentProps<'input'>, 'onChange' | 'maxLength'>
type Aviso = (v: string, form: HTMLFormElement | null) => string

/** Lo que vino cargado no se mira hasta que lo cambien: un deseo de antes de los topes se sigue pudiendo editar. */
function revisar(campo: HTMLInputElement, aviso: Aviso) {
  campo.setCustomValidity(campo.value === campo.defaultValue ? '' : aviso(campo.value, campo.form))
}

/**
 * "Link a la tienda" como lo toma el servidor (null vacío, undefined si no es un link): con otro link, o con uno de antes
 * que hoy no vale, el pegado en el título se queda en el título (ver deseoDesdeForm).
 */
function linkTienda(form: HTMLFormElement | null) {
  const campo = form?.elements.namedItem('linkTienda')
  const v = campo instanceof HTMLInputElement ? campo.value.trim() : ''
  return v ? linkHttp(v) ?? undefined : null
}

const avisoTitulo: Aviso = (v, form) => avisoDelTitulo(v, linkTienda(form))

/** Un campo del formulario de un deseo que frena el envío, con el motivo, si el servidor lo cortaría o no lo guardaría. */
function CampoConAviso({ aviso, alCambiar, ...props }: Props & { aviso: Aviso; alCambiar?: (campo: HTMLInputElement) => void }) {
  return <input {...props} onChange={(e) => { revisar(e.currentTarget, aviso); alCambiar?.(e.currentTarget) }} />
}

/** "¿Qué querés?": hasta 120 letras, sin contar un link pegado si no hay otro distinto a la tienda (ver avisoDelTitulo). */
export const CampoTitulo = (props: Props) => <CampoConAviso {...props} aviso={avisoTitulo} />

/**
 * "Link a la tienda": sin maxLength, que cortaría en silencio un link pegado (y se guardaría roto). Al cambiarlo se vuelve
 * a mirar el título: con otro link acá, el del título cuenta en su largo.
 */
export const CampoLink = (props: Props) => (
  <CampoConAviso {...props} aviso={avisoDelLink} alCambiar={(campo) => {
    const titulo = campo.form?.elements.namedItem('titulo')
    if (titulo instanceof HTMLInputElement) revisar(titulo, avisoTitulo)
  }} />
)

/**
 * Escribir un campo desde el código (lo que completó la lectura del link, ver CompletarDesdeLink). Los campos no son
 * controlados: un .value no dispara onChange, así que se vuelven a mirar el título y el link (si no, quedaba el aviso de
 * antes frenando el envío). Tampoco dispara input, así que no vuelve a buscar.
 */
export function completarCampo(form: HTMLFormElement, nombre: 'titulo' | 'linkTienda' | 'precio', valor: string) {
  const campo = form.elements.namedItem(nombre)
  if (!(campo instanceof HTMLInputElement)) return
  campo.value = valor
  const link = form.elements.namedItem('linkTienda')
  const titulo = form.elements.namedItem('titulo')
  if (link instanceof HTMLInputElement) revisar(link, avisoDelLink)
  if (titulo instanceof HTMLInputElement) revisar(titulo, avisoTitulo)
}
