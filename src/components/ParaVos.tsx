import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  abrirAvisoAction, archivarAvisoAction, boughtAction, postponeGroupGiftReminderAction, releaseAction, vistoCodazosAction,
} from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { ContenidoAviso, IconoDeTipo } from '@/components/FilaAviso'
import { PreguntaInvitado } from '@/components/Identidad'
import { SolicitudRecibida } from '@/components/Amigos'
import { InvitacionesRegalo } from '@/components/Dividir'
import { JuegosEnInicio } from '@/components/AmigoInvisible'
import { IconoFecha } from '@/components/IconoFecha'
import { Icon, QuizasLink, SectionHeader, type IconName } from '@/components/ui'
import { paletaDe } from '@/lib/colores-fechas'
import { fechaLarga } from '@/lib/events'
import type { FechaEspecialVista } from '@/lib/fechas-especiales'
import { juntarNombres } from '@/lib/groups'
import { EN_INICIO, type CodazoSinVer, type Pendiente, type RegaloAbierto, type ReservaPorVencer } from '@/lib/para-vos'

// "Para vos" (ver lib/para-vos.ts): en Inicio, un solo bloque con los primeros, cada uno en una fila que lleva a donde se
// resuelve; en Avisos, todos enteros, con sus botones. Lo que se puede sacar de la vista (un codazo, un aviso ya leído) se
// saca siempre igual: con "Listo". Antes había cuatro maneras ("Listo", "Marcar como leídas", "Limpiar" y deslizar), y
// deslizar no se descubría: había que saber que se podía.

const primerNombre = (n: string) => n.split(' ')[0]
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

/**
 * "Listo": el único gesto para sacar algo de la vista, en toda la app. de: qué saca, para quien no ve la pantalla (con
 * varios en fila, "Listo" solo no dice cuál).
 */
export function Listo({ action, ocultos = {}, de, className = '' }: {
  action: (fd: FormData) => void | Promise<void>
  ocultos?: Record<string, string>
  de: string
  className?: string
}) {
  return (
    <form action={action} className={`flex flex-none ${className}`}>
      {Object.entries(ocultos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <BotonEnviar aria-label={`Listo: ${de}`} className="min-h-11 px-2 text-sm font-semibold underline underline-offset-4">Listo</BotonEnviar>
    </form>
  )
}

/** Quiénes dieron los codazos (sin repetir) y, si todos son para la misma lista en común, cuál (para agregar directo ahí). */
function deCodazos(codazos: CodazoSinVer[]) {
  const quienes = [...new Set(codazos.map((c) => primerNombre(c.deNombre)))]
  const listas = [...new Set(codazos.map((c) => (c.tipo === 'grupo' ? c.listId : null)))]
  const enComun = listas.length === 1 && listas[0] ? codazos[0] : null
  const varios = quienes.length > 1
  return {
    titulo: `${juntarNombres(quienes)} te ${varios ? 'dieron' : 'dio'} un codazo`,
    detalle: `${varios ? 'Quieren' : 'Quiere'} saber qué regalarte${enComun ? ` en "${enComun.listaNombre ?? 'tu lista en común'}"` : ''}: agregá algo.`,
    href: enComun ? `/agregar?lista=${enComun.listId}` : '/agregar',
  }
}

const deReserva = (w: ReservaPorVencer) => ({
  titulo: `¿Conseguiste "${w.itemTitulo}"?`,
  detalle: `Te ${w.diasRestantes === 1 ? 'queda' : 'quedan'} ${dias(w.diasRestantes)} de reserva: marcalo comprado o liberalo.`,
})

const TINTA = 'bg-gr-brand text-gr-on-brand'
const GRIS = 'bg-gr-soft text-gr-ink'
const AZUL = 'bg-gr-blue text-gr-on-blue'

/** El cuadradito de lo que no llegó como aviso (una reserva por vencer, un regalo abierto), del tamaño de los demás. */
function Cuadradito({ icono, fondo }: { icono: IconName; fondo: string }) {
  return (
    <span aria-hidden className={`flex size-11 flex-none items-center justify-center rounded-[14px] ${fondo}`}><Icon name={icono} size={22} /></span>
  )
}

type Fila = { clave: string; icono: ReactNode; titulo: string; detalle: string; href: string }

/** Cómo se cuenta cada cosa en una fila y adónde lleva: al deseo, al juego o, si se contesta con botones, a Avisos. */
function filaDe(p: Exclude<Pendiente, { tipo: 'aviso' }>): Fila {
  switch (p.tipo) {
    case 'invitado':
      return {
        clave: 'invitado', icono: <Cuadradito icono="user" fondo={GRIS} />, href: '/avisos#para-vos',
        titulo: `En este navegador se anotó “${p.nombre}”. ¿Sos vos?`, detalle: 'Si sos vos, lo que reservó y comentó pasa a tu cuenta.',
      }
    case 'reserva':
      return { clave: `reserva-${p.reserva.claimId}`, icono: <Cuadradito icono="clock" fondo={TINTA} />, href: p.reserva.href ?? '/avisos#reservas', ...deReserva(p.reserva) }
    case 'sortear': {
      const j = p.juego
      return {
        clave: `sortear-${j.id}`, icono: <Cuadradito icono="antifaz" fondo={AZUL} />, href: `/invisible/${j.id}#sortear`,
        titulo: j.faltaSortearDeNuevo ? `Hay que sortear de nuevo «${j.nombre}»` : `Te falta sortear «${j.nombre}»`,
        detalle: j.faltaSortearDeNuevo
          ? 'Cambió quiénes juegan: hasta que sortees, alguno no tiene a quién regalarle.'
          : `${j.contestaron >= j.invitados ? 'Ya contestaron todos' : `Contestaron ${j.contestaron} de ${j.invitados}`}: hasta que sortees, nadie sabe a quién le regala.`,
      }
    }
    case 'juego':
      return {
        clave: `juego-${p.juego.id}`, icono: <IconoDeTipo tipo="invisible_invitacion" />, href: `/invisible/${p.juego.id}`,
        titulo: `${primerNombre(p.juego.organizador)} te invita a un amigo invisible`,
        detalle: `«${p.juego.nombre}», el ${fechaLarga(new Date(`${p.juego.fecha}T00:00:00Z`)).toLowerCase()}: ¿jugás?`,
      }
    case 'propuesta': {
      const i = p.invitacion
      return {
        clave: `propuesta-${i.id}`, icono: <IconoDeTipo tipo="propuesta_regalo" />, href: '/avisos#invitaciones',
        titulo: `${primerNombre(i.de.nombre)} te propone ${i.sorpresa ? 'una sorpresa 🤫' : 'un regalo grupal'}`,
        detalle: `"${i.titulo}" para ${i.para}: ¿te sumás?`,
      }
    }
    case 'solicitudes': {
      const n = p.solicitudes.length
      return {
        clave: 'solicitudes', icono: <IconoDeTipo tipo="amistad_pedida" />, href: '/avisos#solicitudes',
        titulo: n === 1 ? `${primerNombre(p.solicitudes[0].de.nombre)} te mandó una solicitud de amistad` : `Tenés ${n} solicitudes de amistad`,
        detalle: 'Si aceptás, se ven las listas y los cumples.',
      }
    }
    case 'regalo_abierto':
      return {
        clave: `regalo-${p.regalo.giftId}`, icono: <Cuadradito icono="gift" fondo={TINTA} />, href: p.regalo.href,
        titulo: `El regalo grupal de "${p.regalo.itemTitulo}" sigue abierto`,
        detalle: 'Lo organizás vos: si ya lo compraste, dividí lo que salió; si no va, cancelalo.',
      }
    case 'codazos':
      return { clave: 'codazos', icono: <IconoDeTipo tipo="codazo" />, ...deCodazos(p.codazos) }
    case 'quien_regalo':
      return {
        clave: `quien-${p.juego.id}`, icono: <Cuadradito icono="antifaz" fondo={AZUL} />, href: `/invisible/${p.juego.id}#me-regalo`,
        titulo: `¿Quién te regaló en «${p.juego.nombre}»?`, detalle: 'Si querés saberlo, entrá y pedilo. Si no, no se dice.',
      }
  }
}

function TextoDeFila({ f }: { f: Fila }) {
  return (
    <>
      {f.icono}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">{f.titulo}</span>
        <span className="text-[13px] leading-snug text-gr-muted [overflow-wrap:anywhere]">{f.detalle}</span>
      </span>
    </>
  )
}

/**
 * "Para vos", en Inicio: lo más urgente de lo que te espera (como mucho EN_INICIO), cada cosa en una fila que lleva a donde
 * se resuelve. Lo que se puede sacar de acá sin hacer nada (un codazo, un aviso de la campanita) lleva su "Listo"; lo que
 * espera una respuesta, no: se va cuando contestás. Con más de los que entran, "Ver todos (N)" lleva a Avisos.
 */
export function ParaVosEnInicio({ pendientes, total }: { pendientes: Pendiente[]; total: number }) {
  const primeros = pendientes.slice(0, EN_INICIO)
  if (!primeros.length) return null
  return (
    <section aria-labelledby="para-vos" className="flex flex-col gap-3">
      <SectionHeader id="para-vos" title={<>Para vos<span className="text-gr-muted"> · {total}</span></>} />
      <div className="gr-card">
        <ul className="divide-y divide-gr-line">
          {primeros.map((p, i) => {
            if (p.tipo === 'aviso') {
              return (
                <li key={p.aviso.id} className="flex items-center">
                  {/* tocarlo lo abre y deja de ser nuevo (ver marcarAvisoVisto) */}
                  <form action={abrirAvisoAction} className="flex min-w-0 flex-1">
                    <input type="hidden" name="id" value={p.aviso.id} />
                    <BotonEnviar className="flex min-w-0 flex-1 items-start gap-3 py-3.5 pl-4 pr-1 text-left">
                      <ContenidoAviso e={p.aviso} animar i={i} />
                    </BotonEnviar>
                  </form>
                  <Listo action={archivarAvisoAction} ocultos={{ id: p.aviso.id }} de={p.aviso.titulo} className="pr-2" />
                </li>
              )
            }
            const f = filaDe(p)
            return (
              <li key={f.clave} className="flex items-center">
                <Link href={f.href} className={`flex min-w-0 flex-1 items-start gap-3 py-3.5 pl-4 ${p.tipo === 'codazos' ? 'pr-1' : 'pr-3'}`}>
                  <TextoDeFila f={f} />
                  {p.tipo !== 'codazos' && <Icon name="chevron" size={18} className="mt-3 flex-none text-gr-muted" />}
                </Link>
                {p.tipo === 'codazos' && <Listo action={vistoCodazosAction} de={f.titulo} className="pr-2" />}
              </li>
            )
          })}
        </ul>
        {total > primeros.length && (
          <Link href="/avisos#para-vos" className="flex min-h-12 items-center justify-center gap-2 border-t border-gr-line text-sm font-semibold">
            <Icon name="bell" size={17} className="flex-none" /> Ver todos ({total})
          </Link>
        )}
      </div>
    </section>
  )
}

/**
 * Una reserva que está por vencer: lleva al deseo, donde se marca comprado o se libera. Si no hay link (cambiaron el de la
 * lista y no lo tiene), se marca o se libera desde acá, como un regalo grupal en Cuentas: si no, vencía y el deseo volvía a
 * quedar libre aunque ya lo hubiera comprado. Un invitado que solo tenía esa lista no ve este cartel en ningún lado (no abre
 * otras): su reserva vence sola.
 * Costos aceptados, sin estados ni mensajes nuevos: "Ya lo compré" no hace nada si venció con la pantalla abierta (volver a
 * reservarla pide el link de ahora) o si es un invitado al que hay que volver a preguntarle "¿Es tu lista?" (se sumó alguien
 * a la lista en común después de que dijo que no); liberarla, sí. Y deshacer un "Ya lo compré" tocado de más pide el link
 * de ahora, igual que reservar de nuevo.
 */
export function CartelReserva({ w }: { w: ReservaPorVencer }) {
  return (
    <QuizasLink href={w.href} className="relative block rounded-[22px] bg-gr-brand px-4 py-3.5 text-sm font-medium text-gr-on-brand">
      {`¿Conseguiste "${w.itemTitulo}"? Te ${w.diasRestantes === 1 ? 'queda ' : 'quedan '}`}
      <span className="font-semibold text-gr-acento-sobre-tinta">{dias(w.diasRestantes)}</span>
      {' de reserva.'}
      {/* en el deseo se marca comprado o se libera */}
      {w.href && <span className="mt-0.5 block font-semibold underline underline-offset-4">Marcalo o liberalo</span>}
      {!w.href && (
        <div className="flex gap-4">
          <form action={boughtAction}>
            <input type="hidden" name="claimId" value={w.claimId} />
            <BotonEnviar className="min-h-11 font-semibold text-gr-acento-sobre-tinta underline underline-offset-4">Ya lo compré</BotonEnviar>
          </form>
          <form action={releaseAction}>
            <input type="hidden" name="claimId" value={w.claimId} />
            <BotonEnviar className="min-h-11 font-semibold underline underline-offset-4">Liberala</BotonEnviar>
          </form>
        </div>
      )}
    </QuizasLink>
  )
}

/**
 * Un regalo grupal no vence solo (quizás ya lo compró, y con gente adentro se perdería la coordinación): al que lo organiza
 * se le recuerda que lo cierre (ver cuandoRecordar). Si todavía no es momento, "Sigue en pie" lo saca por 2 semanas.
 */
function CartelRegaloAbierto({ r }: { r: RegaloAbierto }) {
  return (
    <div className="relative rounded-[22px] bg-gr-brand px-4 pb-1.5 pt-3.5 text-sm font-medium text-gr-on-brand">
      <Link href={r.href} className="block">
        {`El regalo grupal de "${r.itemTitulo}" que organizás sigue abierto.`}
        <span className="mt-0.5 block font-semibold underline underline-offset-4">Si ya lo compraste, dividí lo que salió; si no va, cancelalo</span>
      </Link>
      <form action={postponeGroupGiftReminderAction}>
        <input type="hidden" name="giftId" value={r.giftId} />
        <BotonEnviar className="min-h-11 text-xs font-semibold text-gr-acento-sobre-tinta underline underline-offset-4">Sigue en pie: recordámelo en 2 semanas</BotonEnviar>
      </form>
    </div>
  )
}

/** Los codazos, enteros: quiénes quieren saber qué regalarte, agregar algo (directo a la lista en común, si son de una) y "Listo". */
function CartelCodazos({ codazos }: { codazos: CodazoSinVer[] }) {
  const c = deCodazos(codazos)
  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-gr-blue p-4 text-gr-on-blue shadow-card">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-full bg-gr-on-blue/15 text-xl">👉</span>
        <p className="text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">
          <span className="font-semibold">{c.titulo}.</span> {c.detalle}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link href={c.href} className="gr-btn gr-btn--blanco gr-btn--sm flex-none">Agregar algo</Link>
        <Listo action={vistoCodazosAction} de={c.titulo} />
      </div>
    </div>
  )
}

/** Un grupo de lo que espera, en Avisos, con su rótulo. */
function Grupo({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex scroll-mt-6 flex-col gap-2.5">
      <h2 id={`${id}-titulo`} className="gr-label">{titulo}</h2>
      {children}
    </section>
  )
}

type DeTipo<T extends Pendiente['tipo']> = Extract<Pendiente, { tipo: T }>
const deTipo = <T extends Pendiente['tipo']>(ps: Pendiente[], tipo: T) => ps.filter((p): p is DeTipo<T> => p.tipo === tipo)

/**
 * "Para vos", en Avisos: todo lo que te espera, cada cosa entera y con sus botones (aceptar la solicitud, sumarte al regalo,
 * jugar o no). Van por grupos, y los grupos en el orden de lo más urgente de cada uno. Los avisos de la campanita que piden
 * algo no se repiten acá: están abajo, entre los nuevos.
 * noSePudo: quiso sumarse a un regalo y ya no se podía (se dice arriba de las propuestas).
 */
export function ParaVosEntero({ pendientes, noSePudo }: { pendientes: Pendiente[]; noSePudo: boolean }) {
  const juegos = deTipo(pendientes, 'juego').map((p) => p.juego)
  const pasados = deTipo(pendientes, 'quien_regalo').map((p) => p.juego)
  const propuestas = deTipo(pendientes, 'propuesta').map((p) => p.invitacion)
  const grupos: Partial<Record<Pendiente['tipo'], ReactNode>> = {
    invitado: deTipo(pendientes, 'invitado').map((p) => <PreguntaInvitado key="invitado" nombre={p.nombre} />),
    reserva: (
      <Grupo key="reservas" id="reservas" titulo="Reservas por vencer">
        {deTipo(pendientes, 'reserva').map((p) => <CartelReserva key={p.reserva.claimId} w={p.reserva} />)}
      </Grupo>
    ),
    sortear: (
      <Grupo key="sortear" id="sortear" titulo="Te falta sortear">
        {deTipo(pendientes, 'sortear').map((p) => {
          const f = filaDe(p)
          return (
            <Link key={f.clave} href={f.href} className="gr-card flex items-start gap-3 p-3.5">
              <TextoDeFila f={f} />
              <Icon name="chevron" size={18} className="mt-3 flex-none text-gr-muted" />
            </Link>
          )
        })}
      </Grupo>
    ),
    propuesta: <InvitacionesRegalo key="propuestas" invitaciones={propuestas} noSePudo={noSePudo} volver="avisos" />,
    solicitudes: (
      <Grupo key="solicitudes" id="solicitudes" titulo="Solicitudes de amistad">
        <ul className="flex flex-col gap-2.5">
          {deTipo(pendientes, 'solicitudes').flatMap((p) => p.solicitudes).map((s) => <SolicitudRecibida key={s.id} id={s.id} de={s.de} volver="avisos" />)}
        </ul>
      </Grupo>
    ),
    regalo_abierto: (
      <Grupo key="regalos-abiertos" id="regalos-abiertos" titulo="Regalos grupales que organizás">
        {deTipo(pendientes, 'regalo_abierto').map((p) => <CartelRegaloAbierto key={p.regalo.giftId} r={p.regalo} />)}
      </Grupo>
    ),
    codazos: (
      <Grupo key="codazos" id="codazos" titulo="Codazos">
        {deTipo(pendientes, 'codazos').map((p) => <CartelCodazos key="codazos" codazos={p.codazos} />)}
      </Grupo>
    ),
  }
  // las invitaciones a un juego y los "¿Quién te regaló?" van juntos, donde cae el primero de los dos
  const juntos = <JuegosEnInicio key="juegos" invitaciones={juegos} pasados={pasados} />
  const orden = [...new Set(pendientes.map((p) => (p.tipo === 'quien_regalo' ? 'juego' : p.tipo)))].filter((t) => t !== 'aviso')
  if (!orden.length && !noSePudo) return null
  return (
    <div id="para-vos" className="flex scroll-mt-6 flex-col gap-5">
      {noSePudo && !propuestas.length && <InvitacionesRegalo invitaciones={[]} noSePudo volver="avisos" />}
      {orden.map((t) => (t === 'juego' ? juntos : grupos[t]))}
    </div>
  )
}

const DE_LA_FECHA: Partial<Record<FechaEspecialVista['id'], string>> = { navidad: 'de Navidad', amigo: 'del Día del Amigo' }

/**
 * En Inicio, cuando falta poco para una fecha en la que se juega (ver juegoParaProponer): armar el amigo invisible de esa
 * fecha, con su color. Lleva al formulario con la fecha ya puesta.
 */
export function ArmarJuegoDeFecha({ fecha }: { fecha: FechaEspecialVista }) {
  const p = paletaDe(fecha.id)
  return (
    <Link href={`/invisible/nuevo?fecha=${fecha.id}`} className="gr-card flex items-center gap-3.5 p-4">
      <span aria-hidden className="flex size-[52px] flex-none items-center justify-center rounded-2xl text-white" style={{ background: p.fondo }}>
        <IconoFecha fecha={fecha.id} size={28} acento={p.acento} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-snug font-semibold">Armá el amigo invisible {DE_LA_FECHA[fecha.id] ?? `de ${fecha.nombre}`}</span>
        <span className="block text-[13px] leading-snug text-gr-muted">
          Faltan {dias(fecha.dias)}. Mandás un link por WhatsApp, se sortea y cada uno ve solo a quién le regala.
        </span>
      </span>
      <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
    </Link>
  )
}
