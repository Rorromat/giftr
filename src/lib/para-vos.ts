import type { Db } from '@/db/types'
import { getMyClaimWarnings } from '@/lib/claims'
import { regalosParaCerrar } from '@/lib/regalos'
import { codazosSinVer } from '@/lib/codazos'
import { solicitudesRecibidas, type Persona } from '@/lib/amigos'
import { invitacionesPendientes, type Invitacion } from '@/lib/invitaciones'
import { MIN_JUGADORES, misAmigosInvisibles, type MiJuego } from '@/lib/amigo-invisible'
import { paraVos, type EntradaBandeja } from '@/lib/bandeja'
import { vistaDe, type FechaEspecial, type FechaEspecialVista } from '@/lib/fechas-especiales'

// "Para vos": lo que espera que la persona haga algo, en un solo lugar y por urgencia. Antes cada cosa tenía su cartel en
// Inicio (seis tipos, más las propuestas, el amigo invisible y lo último de la campanita): con una reserva por vencer, dos
// solicitudes y un codazo, lo que vencía quedaba perdido entre lo que podía esperar. En Inicio van los primeros (ver
// EN_INICIO) y "Ver todos" lleva a Avisos, donde está cada uno entero, con sus botones. Lo que solo informa (cambió un
// deseo que regalás, aceptaron tu solicitud) vive en Avisos: la campanita ya lo cuenta.

/** Cuántos van en Inicio como mucho; los demás, en Avisos. */
export const EN_INICIO = 3

export type ReservaPorVencer = Awaited<ReturnType<typeof getMyClaimWarnings>>[number]
export type RegaloAbierto = Awaited<ReturnType<typeof regalosParaCerrar>>[number]
export type CodazoSinVer = Awaited<ReturnType<typeof codazosSinVer>>[number]
export type Solicitud = { id: string; de: Persona }

export type Pendiente =
  /** en este navegador había un invitado anotado: "¿Sos vos?" */
  | { tipo: 'invitado'; nombre: string }
  | { tipo: 'reserva'; reserva: ReservaPorVencer }
  /** un amigo invisible que organiza y ya se puede (o se tiene que) sortear */
  | { tipo: 'sortear'; juego: MiJuego }
  /** lo invitaron a un amigo invisible y no contestó */
  | { tipo: 'juego'; juego: MiJuego }
  | { tipo: 'propuesta'; invitacion: Invitacion }
  /** todas juntas: una fila en Inicio, una tarjeta por cada una en Avisos */
  | { tipo: 'solicitudes'; solicitudes: Solicitud[] }
  /** un regalo grupal que organiza y sigue abierto */
  | { tipo: 'regalo_abierto'; regalo: RegaloAbierto }
  /** todos juntos, como las solicitudes */
  | { tipo: 'codazos'; codazos: CodazoSinVer[] }
  /** lo nuevo de la campanita que pide algo (ver PARA_VOS en bandeja.ts) */
  | { tipo: 'aviso'; aviso: EntradaBandeja }
  /** un amigo invisible que ya pasó: puede pedir saber quién le regaló */
  | { tipo: 'quien_regalo'; juego: MiJuego }

/**
 * Lo que no tiene fecha se ordena como si le quedaran estos días: contestar si sos vos es lo primero (hasta entonces, lo
 * que reservó el invitado no está en la cuenta); una propuesta o una invitación tienen a alguien esperando; una solicitud
 * o un regalo abierto pueden esperar un poco más; lo último, lo que no vence nunca.
 */
const SIN_FECHA = { invitado: 0, propuesta: 4, juego: 5, solicitudes: 6, regalo_abierto: 7, codazos: 8, aviso: 9, quien_regalo: 30 } as const

/**
 * Cuántos días le quedan para hacerlo (menos es más urgente): los de la reserva, o los que faltan para que se den los
 * regalos de un amigo invisible. Sortear, como mucho como una propuesta (los que juegan esperan para comprar); y una
 * invitación a un juego que es pasado mañana va antes que su lugar de siempre: después del sorteo ya no entra.
 */
export function urgencia(p: Pendiente): number {
  if (p.tipo === 'reserva') return p.reserva.diasRestantes
  if (p.tipo === 'sortear') return Math.min(p.juego.dias, SIN_FECHA.propuesta)
  if (p.tipo === 'juego') return Math.min(p.juego.dias, SIN_FECHA.juego)
  return SIN_FECHA[p.tipo]
}

/** Cuándo se le dice al que organiza que sortee, aunque falte contestar alguno: a esta altura ya hay que comprar. */
const SORTEAR_YA_DIAS = 7

/**
 * Si al que organiza le toca sortear: cambió quiénes juegan después del sorteo, o no se sorteó y ya contestaron todos (o
 * la fecha está encima). Recién armado, con todos sin contestar, no: no hay nada que pueda hacer todavía.
 */
export function tocaSortear(j: Pick<MiJuego, 'soyOrganizador' | 'dias' | 'sorteado' | 'faltaSortearDeNuevo' | 'invitados' | 'contestaron'>): boolean {
  if (!j.soyOrganizador || j.dias < 0) return false
  if (j.faltaSortearDeNuevo) return true
  return !j.sorteado && j.contestaron >= MIN_JUGADORES && (j.contestaron >= j.invitados || j.dias <= SORTEAR_YA_DIAS)
}

export type Fuentes = {
  invitado: string | null
  reservas: ReservaPorVencer[]
  regalosAbiertos: RegaloAbierto[]
  codazos: CodazoSinVer[]
  solicitudes: Solicitud[]
  invitaciones: Invitacion[]
  /** los que vienen y los que pasaron hace poco (ver misAmigosInvisibles) */
  juegos: MiJuego[]
  avisos: EntradaBandeja[]
}

/** Todo lo que espera a la persona, lo más urgente primero (a igual urgencia, en el orden de SIN_FECHA). */
export function armarPendientes(f: Fuentes): Pendiente[] {
  const todos: Pendiente[] = [
    ...(f.invitado ? [{ tipo: 'invitado' as const, nombre: f.invitado }] : []),
    ...f.reservas.map((reserva) => ({ tipo: 'reserva' as const, reserva })),
    ...f.juegos.filter(tocaSortear).map((juego) => ({ tipo: 'sortear' as const, juego })),
    ...f.invitaciones.map((invitacion) => ({ tipo: 'propuesta' as const, invitacion })),
    ...f.juegos.filter((j) => j.miEstado === 'invitado' && j.dias >= 0).map((juego) => ({ tipo: 'juego' as const, juego })),
    ...(f.solicitudes.length ? [{ tipo: 'solicitudes' as const, solicitudes: f.solicitudes }] : []),
    ...f.regalosAbiertos.map((regalo) => ({ tipo: 'regalo_abierto' as const, regalo })),
    ...(f.codazos.length ? [{ tipo: 'codazos' as const, codazos: f.codazos }] : []),
    ...f.avisos.map((aviso) => ({ tipo: 'aviso' as const, aviso })),
    ...f.juegos.filter((j) => j.dias < 0 && j.miEstado === 'juega' && j.sorteado && !j.revelado).map((juego) => ({ tipo: 'quien_regalo' as const, juego })),
  ]
  // sort es estable: a igual urgencia queda el orden de arriba
  return todos.sort((a, b) => urgencia(a) - urgencia(b))
}

/** Cuántos días después de su fecha sigue un amigo invisible en "Para vos" (para "¿Quién te regaló?"). */
export const JUEGOS_PASADOS = 15

/**
 * Lo que le espera a la persona, por urgencia, y cuántos son en total (los avisos de la campanita que piden algo se cuentan
 * todos, aunque acá vengan solo los primeros). También sus amigos invisibles, que Inicio usa además para las fechas.
 * invitado: el nombre del invitado de este navegador por el que hay que preguntarle (lo sabe la pantalla, por la cookie).
 */
export async function pendientesDe(db: Db, userId: string, hoy: Date, invitado: string | null): Promise<{ pendientes: Pendiente[]; total: number; juegos: MiJuego[] }> {
  const [reservas, regalosAbiertos, codazos, solicitudes, invitaciones, juegos, avisos] = await Promise.all([
    getMyClaimWarnings(db, { userId }), regalosParaCerrar(db, userId), codazosSinVer(db, userId), solicitudesRecibidas(db, userId),
    invitacionesPendientes(db, userId), misAmigosInvisibles(db, userId, hoy, JUEGOS_PASADOS), paraVos(db, userId),
  ])
  const pendientes = armarPendientes({ invitado, reservas, regalosAbiertos, codazos, solicitudes, invitaciones, juegos, avisos: avisos.entradas })
  return { pendientes, total: pendientes.length - avisos.entradas.length + avisos.total, juegos }
}

// ---------------------------------------------------------------- armar el amigo invisible de una fecha

/** Las fechas en las que se juega al amigo invisible (el Día de la Madre no). */
const CON_JUEGO: FechaEspecial[] = ['navidad', 'amigo']
/** Desde cuántos días antes se propone armarlo, y hasta cuándo: con menos, ya no da el tiempo para invitar, sortear y comprar. */
export const PROPONER_DESDE = 45
export const PROPONER_HASTA = 3

/**
 * La fecha para la que conviene proponerle armar un amigo invisible: falta poco y todavía no está en ninguno de esa fecha
 * (ni invitado). En noviembre nadie se acuerda de entrar a Regalos a armar el de Navidad, y cuando se acuerdan ya es tarde.
 */
export function juegoParaProponer(hoy: Date, juegos: Pick<MiJuego, 'fechaEspecial' | 'dias'>[]): FechaEspecialVista | null {
  return CON_JUEGO.map((f) => vistaDe(f, hoy))
    .filter((f) => f.dias <= PROPONER_DESDE && f.dias >= PROPONER_HASTA && !juegos.some((j) => j.fechaEspecial === f.id && j.dias >= 0))
    .sort((a, b) => a.dias - b.dias)[0] ?? null
}
