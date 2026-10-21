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

/** Si "Link a la tienda" ya tiene un link: entonces uno pegado en el título se queda en el título (ver deseoDesdeForm). */
function hayLinkTienda(form: HTMLFormElement | null) {
  const campo = form?.elements.namedItem('linkTienda')
  return campo instanceof HTMLInputElement && !!linkHttp(campo.value)
}

const avisoTitulo: Aviso = (v, form) => avisoDelTitulo(v, hayLinkTienda(form))

/** Un campo del formulario de un deseo que frena el envío, con el motivo, si el servidor lo cortaría o no lo guardaría. */
function CampoConAviso({ aviso, alCambiar, ...props }: Props & { aviso: Aviso; alCambiar?: (campo: HTMLInputElement) => void }) {
  return <input {...props} onChange={(e) => { revisar(e.currentTarget, aviso); alCambiar?.(e.currentTarget) }} />
}

/** "¿Qué querés?": hasta 120 letras, sin contar un link pegado si no hay otro a la tienda (ver avisoDelTitulo). */
export const CampoTitulo = (props: Props) => <CampoConAviso {...props} aviso={avisoTitulo} />

/**
 * "Link a la tienda": sin maxLength, que cortaría en silencio un link pegado (y se guardaría roto). Al cambiarlo se vuelve
 * a mirar el título: con un link acá, el del título cuenta en su largo.
 */
export const CampoLink = (props: Props) => (
  <CampoConAviso {...props} aviso={avisoDelLink} alCambiar={(campo) => {
    const titulo = campo.form?.elements.namedItem('titulo')
    if (titulo instanceof HTMLInputElement) revisar(titulo, avisoTitulo)
  }} />
)
