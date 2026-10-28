import type { ReactNode } from 'react'
import type { FechaEspecial } from '@/lib/fechas-especiales'

// Todo el año, para recorrerlo (ver Calendario): lo que el servidor le pasa (ver TodoElAnio) y dónde se está según la
// dirección: todo el año (/eventos), un mes (?mes=10) o un día (?mes=10&dia=27). Aparte del componente, que es de cliente:
// esto lo usan los dos lados.

const RUTA = '/eventos'

/** De quién es: su foto o sus iniciales; un grupo, con el ícono; una fecha especial, con el suyo y su color. */
export type Cara =
  | { tipo: 'persona'; nombre: string; foto: string | null }
  | { tipo: 'grupo' }
  | { tipo: 'especial'; fecha: FechaEspecial }

/** Un cumple, la fecha de un grupo o una fecha especial. */
export type CosaDelCalendario = {
  /** su lista (o la pantalla de la fecha especial) */
  href: string
  titulo: string
  /** la próxima vez, en la fila: "22 ago" */
  cuando: string
  cara: Cara
  /** la tarjeta grande, la del día (un <li>) */
  tarjeta: ReactNode
}

/** Un día de este año en el que cae algo. */
export type DiaDelCalendario = {
  /** "27 de octubre" */
  titulo: string
  /** "Martes" */
  semana: string
  /** "en 5 días", "¡es hoy!", "este año ya pasó (el próximo, en 299 días)" */
  cuando: string
  /** lo que cae ese día (claves de las cosas), en el orden de la lista */
  cosas: string[]
}

/** Dónde se está: todo el año, un mes (1 a 12) o un día de ese mes. */
export type Vista = { mes?: number; dia?: number }

export const claveDelDia = (mes: number, dia: number) => `${mes}-${dia}`

/** La vista de la dirección. Un mes que no existe es todo el año; un día en el que no cae nada, su mes. */
export function vistaDe(params: { get(nombre: string): string | null } | null, dias: Record<string, DiaDelCalendario>): Vista {
  const mes = Number(params?.get('mes'))
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return {}
  const dia = Number(params?.get('dia'))
  return dias[claveDelDia(mes, dia)] ? { mes, dia } : { mes }
}

export const urlDe = ({ mes, dia }: Vista) => (mes ? `${RUTA}?mes=${mes}${dia ? `&dia=${dia}` : ''}` : RUTA)
