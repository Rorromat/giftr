import { diasEntre, enAnio, fechaLarga } from '@/lib/events'
import type { MiJuego } from '@/lib/amigo-invisible'

// Fechas especiales: las que no son un cumple y en las que también se regala (las de Argentina). Aparecen en Próximos
// entre los cumples, por cercanía, distintas de ellos, con lo que se puede hacer: regalarle algo de su lista, una sorpresa
// o un amigo invisible (ver amigo-invisible.ts).

export const FECHAS_ESPECIALES = ['navidad', 'amigo', 'padre', 'madre', 'ninos'] as const
export type FechaEspecial = (typeof FECHAS_ESPECIALES)[number]

type Def = {
  nombre: string
  /** el día: fijo, o el n-ésimo domingo del mes */
  cae: { mes: number; dia: number } | { mes: number; domingo: number }
  /** a quién se le regala, para la pantalla de la fecha */
  aQuien: string
}

const DEFS: Record<FechaEspecial, Def> = {
  navidad: { nombre: 'Navidad', cae: { mes: 12, dia: 25 }, aQuien: '¿A quién le regalás?' },
  amigo: { nombre: 'Día del Amigo', cae: { mes: 7, dia: 20 }, aQuien: '¿A qué amigos les regalás?' },
  padre: { nombre: 'Día del Padre', cae: { mes: 6, domingo: 3 }, aQuien: 'Para tu papá, o para quien sea tu papá.' },
  madre: { nombre: 'Día de la Madre', cae: { mes: 10, domingo: 3 }, aQuien: 'Para tu mamá, o para quien sea tu mamá.' },
  ninos: { nombre: 'Día del Niño', cae: { mes: 8, domingo: 3 }, aQuien: 'Para los chicos de tu vida.' },
}

export const esFechaEspecial = (s: unknown): s is FechaEspecial => typeof s === 'string' && (FECHAS_ESPECIALES as readonly string[]).includes(s)

export const datosDe = (f: FechaEspecial) => DEFS[f]

/** El día de una fecha especial en un año (Date UTC a medianoche, como el resto de los eventos). */
export function diaEn(f: FechaEspecial, anio: number): Date {
  const c = DEFS[f].cae
  if ('dia' in c) return enAnio(c.dia, c.mes, anio)
  // el n-ésimo domingo: el primero del mes y n-1 semanas más
  const dia1 = new Date(Date.UTC(anio, c.mes - 1, 1)).getUTCDay()
  return new Date(Date.UTC(anio, c.mes - 1, 1 + ((7 - dia1) % 7) + (c.domingo - 1) * 7))
}

/** La próxima vez que cae (hoy incluido). */
export function proximaEspecial(f: FechaEspecial, hoy: Date): Date {
  const esta = diaEn(f, hoy.getUTCFullYear())
  return esta >= hoy ? esta : diaEn(f, hoy.getUTCFullYear() + 1)
}

export type FechaEspecialVista = {
  id: FechaEspecial
  nombre: string
  aQuien: string
  fecha: Date
  dias: number
  /** "Jueves 25 de diciembre" */
  cuando: string
}

export function vistaDe(f: FechaEspecial, hoy: Date): FechaEspecialVista {
  const fecha = proximaEspecial(f, hoy)
  const d = DEFS[f]
  return { id: f, nombre: d.nombre, aQuien: d.aQuien, fecha, dias: diasEntre(hoy, fecha), cuando: fechaLarga(fecha, hoy) }
}

/** Todas, con su próxima vez (para Todo el año). */
export function todasLasFechas(hoy: Date): FechaEspecialVista[] {
  return FECHAS_ESPECIALES.map((f) => vistaDe(f, hoy)).sort((a, b) => a.dias - b.dias)
}

export type TarjetaEspecial =
  | { tipo: 'fecha'; fecha: FechaEspecialVista; juegos: MiJuego[]; dias: number }
  | { tipo: 'juego'; juego: MiJuego; dias: number }

/**
 * Lo que va en Próximos además de los cumples: todas las fechas especiales, con su próxima vez (falte lo que falte: van por
 * cercanía entre los cumples), cada una con tus juegos de esa fecha; y los amigos invisibles que no son de una fecha especial.
 */
export function especialesQueVienen(hoy: Date, juegos: MiJuego[]): TarjetaEspecial[] {
  const vienen = juegos.filter((j) => j.dias >= 0)
  const fechas = FECHAS_ESPECIALES.map((f) => {
    const fecha = vistaDe(f, hoy)
    return { tipo: 'fecha' as const, fecha, juegos: vienen.filter((j) => j.fechaEspecial === f), dias: fecha.dias }
  })
  const sueltos = vienen.filter((j) => !j.fechaEspecial).map((juego) => ({ tipo: 'juego' as const, juego, dias: juego.dias }))
  return [...fechas, ...sueltos].sort((a, b) => a.dias - b.dias)
}
