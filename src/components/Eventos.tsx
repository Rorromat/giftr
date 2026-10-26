import Link from 'next/link'
import type { Cuentas } from '@/lib/regalos'
import { plata } from '@/lib/pesos'
import { calendarioDelAnio, fechaCorta, fechaLarga, MESES, repartirProximos, type Evento } from '@/lib/events'
import { diaEn, type FechaEspecialVista, type TarjetaEspecial } from '@/lib/fechas-especiales'
import { AvatarStack, Icon, ItemPhoto, SectionHeader, Starburst } from '@/components/ui'
import { FotoConRespaldo } from '@/components/FotoConRespaldo'
import { CardEspecial } from '@/components/AmigoInvisible'
import { IconoFecha } from '@/components/IconoFecha'
import { paletaDe } from '@/lib/colores-fechas'

// Los cumples y fechas de tu gente: los próximos (en Inicio) y todo el año (en Eventos). Las fechas especiales (Navidad,
// Día del Amigo…) y los amigos invisibles van entre ellos, en azul.

/**
 * Las fotos de lo que más quiere, una al lado de la otra. La fila mide los 170 px (minmax(0,1fr)): con la fila en auto,
 * una sola foto vertical la estiraba a su alto y tapaba el nombre y la fecha de la tarjeta.
 */
function Fotos({ e }: { e: Evento }) {
  if (!e.fotos.length) return <ItemPhoto src={null} titulo={e.titulo} height={170} />
  return (
    <div className="grid h-[170px] grid-rows-[minmax(0,1fr)] gap-0.5 overflow-hidden bg-gr-surface"
         style={{ gridTemplateColumns: `repeat(${e.fotos.length}, minmax(0, 1fr))` }}>
      {e.fotos.map((src, i) => (
        <FotoConRespaldo key={i} src={src} className="size-full object-cover"
                         respaldo={<span className="size-full bg-gr-soft" />} />
      ))}
    </div>
  )
}

/**
 * "Ya reservaste 1 regalo · Estás en un regalo grupal · Estás en una sorpresa": los sueltos, los grupales y las sorpresas
 * por separado (sumarse no es reservar).
 */
function TeOcupas({ e }: { e: Evento }) {
  const grupales = e.misGrupales ?? 0
  const sorpresas = e.misSorpresas ?? 0
  const sueltos = (e.misReservas ?? 0) - grupales - sorpresas
  const partes = [
    sueltos > 0 && `Ya reservaste ${sueltos} ${sueltos === 1 ? 'regalo' : 'regalos'}`,
    grupales > 0 && `Estás en ${grupales === 1 ? 'un regalo grupal' : `${grupales} regalos grupales`}`,
    sorpresas > 0 && `Estás en ${sorpresas === 1 ? 'una sorpresa' : `${sorpresas} sorpresas`}`,
  ].filter(Boolean)
  return <p className="text-[13px] font-medium">{partes.join(' · ')}</p>
}

function Estado({ e }: { e: Evento }) {
  // Al dueño nunca se le dice nada de reservas: solo se le recuerda revisar su lista.
  if (e.propio) return <p className="text-[13px] text-gr-muted">¿Tu lista está al día?</p>
  return (
    <>
      {e.misReservas
        ? <TeOcupas e={e} />
        : <p className="self-start rounded-full bg-gr-accent px-2.5 py-0.5 text-xs font-semibold">Todavía no reservaste nada</p>}
      {e.ultimo && <p className="line-clamp-2 text-xs text-gr-muted [overflow-wrap:anywhere]">El último lo compró {e.ultimo.encargado}: {e.ultimo.titulo}</p>}
    </>
  )
}

/** Tarjeta alta del carrusel: las fotos de lo que más quiere, la cuenta regresiva en la estrella y quién es. */
function CardProximo({ e, hoy }: { e: Evento; hoy: Date }) {
  return (
    <li className="w-[252px] flex-none snap-start">
      <Link href={e.href} className="gr-card relative flex h-full flex-col">
        <div className="relative">
          <Fotos e={e} />
          <Starburst size={64} fontSize={e.dias > 99 ? 26 : 32} sub={e.dias === 0 ? undefined : e.dias === 1 ? 'día' : 'días'}
                     label={e.dias === 0 ? 'Es hoy' : `Faltan ${e.dias} ${e.dias === 1 ? 'día' : 'días'}`}
                     className="absolute right-2 top-2 drop-shadow-sm">
            {e.dias === 0 ? '¡Hoy!' : e.dias}
          </Starburst>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3.5">
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-[17px] leading-snug font-semibold [overflow-wrap:anywhere]">{e.titulo}</h2>
            <AvatarStack nombres={e.personas.slice(0, 3)} size={30} />
          </div>
          <p className="flex items-center gap-1.5 text-[13px] text-gr-muted">
            <Icon name="calendar" size={15} className="flex-none" />{fechaLarga(e.fecha, hoy)}
          </p>
          {e.contexto && <p className="line-clamp-1 text-[13px] text-gr-muted">{e.contexto}</p>}
          <Estado e={e} />
        </div>
      </Link>
    </li>
  )
}

/** Fila de la lista por mes: la fecha en una cajita, el nombre y cuánto falta. */
function FilaEvento({ e }: { e: Evento }) {
  return (
    <li>
      <Link href={e.href} className="gr-card flex min-h-[72px] items-center gap-3 p-2.5 pr-4">
        <span className="flex size-14 flex-none flex-col items-center justify-center rounded-2xl bg-gr-soft leading-none">
          <span className="text-xl font-semibold">{e.fecha.getUTCDate()}</span>
          <span className="text-[11px] font-medium text-gr-muted uppercase">{MESES[e.fecha.getUTCMonth()].slice(0, 3)}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">{e.titulo}</span>
          <span className="flex items-center gap-1.5 text-[13px] text-gr-muted">
            <Icon name="clock" size={14} className="flex-none" />{e.dias === 0 ? 'Hoy' : e.dias === 1 ? 'Mañana' : `En ${e.dias} días`}
            {e.contexto && <span className="truncate">· {e.contexto}</span>}
          </span>
        </span>
        <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
      </Link>
    </li>
  )
}

/**
 * Los de los próximos tres meses, en un carrusel (con las fechas especiales, por cercanía); los que vienen después, en filas
 * por mes (con el año, si no es este). Ver repartirProximos.
 */
export function Proximos({ eventos, hoy, especiales = [] }: { eventos: Evento[]; hoy: Date; especiales?: TarjetaEspecial[] }) {
  const { cerca, despues } = repartirProximos(eventos)
  const primeros = [
    ...cerca.map((e) => ({ dias: e.dias, tarjeta: <CardProximo key={e.listId} e={e} hoy={hoy} /> })),
    ...especiales.map((t) => ({
      dias: t.dias, tarjeta: <CardEspecial key={t.tipo === 'fecha' ? t.fecha.id : t.juego.id} t={t} hoy={hoy} />,
    })),
  ].sort((a, b) => a.dias - b.dias)
  const porMes = Object.entries(Object.groupBy(despues, (e) => `${e.fecha.getUTCFullYear()}-${String(e.fecha.getUTCMonth()).padStart(2, '0')}`))
  return (
    <>
      {primeros.length > 0 ? (
        <ul className="-mx-[18px] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-2 pt-1 [scroll-padding-inline:18px] [scrollbar-width:none]">
          {primeros.map((p) => p.tarjeta)}
        </ul>
      ) : (
        <p className="gr-empty px-4 py-4 text-center text-sm">Nada en los próximos tres meses.</p>
      )}
      {porMes.length > 0 && (
        <>
          <SectionHeader title="Más adelante" />
          {porMes.map(([clave, delMes]) => (
            <section key={clave} className="flex flex-col gap-2.5">
              <h3 className="gr-label">{MESES[Number(clave.slice(5))]}{Number(clave.slice(0, 4)) !== hoy.getUTCFullYear() && ` ${clave.slice(0, 4)}`}</h3>
              <ul className="flex flex-col gap-2.5">{delMes!.map((e) => <FilaEvento key={e.listId} e={e} />)}</ul>
            </section>
          ))}
        </>
      )}
    </>
  )
}

/** Todo el año: la grilla de los meses (las fechas especiales, cada una con su color) y la lista, con todo por cercanía. */
export function TodoElAnio({ eventos, hoy, especiales = [] }: { eventos: Evento[]; hoy: Date; especiales?: FechaEspecialVista[] }) {
  const meses = calendarioDelAnio(eventos, hoy)
  // en la grilla, el día de este año (la próxima vez puede ser el año que viene)
  const esteAnio = especiales.map((f) => ({ dia: diaEn(f.id, hoy.getUTCFullYear()), color: paletaDe(f.id).fondo }))
  const colorDeEspecial = (m: number, d: number) => esteAnio.find((e) => e.dia.getUTCMonth() === m && e.dia.getUTCDate() === d)?.color
  const lista = [
    ...eventos.map((e) => ({ dias: e.dias, fila: (
      <li key={e.listId}>
        <Link href={e.href} className="gr-card flex min-h-14 items-center gap-3 px-3 py-2">
          <span className="flex-none rounded-full bg-gr-soft px-2.5 py-1 text-[13px] font-semibold">{fechaCorta(e.fecha, hoy)}</span>
          <span className="min-w-0 flex-1 text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">{e.titulo}</span>
          <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
        </Link>
      </li>
    ) })),
    ...especiales.map((f) => ({ dias: f.dias, fila: (
      <li key={f.id}>
        <Link href={`/fechas/${f.id}`} className="gr-card flex min-h-14 items-center gap-3 px-3 py-2">
          <span className="flex-none rounded-full px-2.5 py-1 text-[13px] font-semibold text-white" style={{ background: paletaDe(f.id).fondo }}>
            {fechaCorta(f.fecha, hoy)}
          </span>
          <span className="min-w-0 flex-1 text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">{f.nombre}</span>
          <span style={{ color: paletaDe(f.id).fondo }}><IconoFecha fecha={f.id} size={22} acento="currentColor" className="flex-none" /></span>
          <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
        </Link>
      </li>
    ) })),
  ].sort((a, b) => a.dias - b.dias)
  return (
    <>
      <div className="gr-card flex flex-col gap-3 p-3.5">
        <ul className="grid grid-cols-3 gap-x-3 gap-y-4">
          {meses.map((m, i) => (
            <li key={m.nombre} className="flex flex-col gap-1.5">
              <span className={`self-start text-[13px] font-semibold ${m.actual ? 'rounded-full bg-gr-brand px-2 text-gr-on-brand' : ''}`}>{m.nombre}</span>
              <div aria-hidden className="grid grid-cols-7 gap-[3px]">
                {Array.from({ length: m.dias }, (_, d) => d + 1).map((d) => {
                  const especial = colorDeEspecial(i, d)
                  return (
                    <span key={d} style={especial ? { background: especial } : undefined} className={`aspect-square rounded-full ${
                      especial ? '' : m.eventos.includes(d) ? 'bg-gr-accent ring-1 ring-gr-ink/30' : m.hoy === d ? 'bg-gr-ink' : 'bg-gr-dot'}`} />
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
        <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-gr-line pt-3 text-xs text-gr-muted">
          <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-gr-accent ring-1 ring-gr-ink/30" />Evento o cumple</span>
          {especiales.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full" style={{ background: `conic-gradient(${esteAnio.map((e) => e.color).join(', ')})` }} />Fecha especial
            </span>
          )}
          <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-gr-ink" />Hoy</span>
        </p>
      </div>
      <ul className="flex flex-col gap-2.5">{lista.map((l) => l.fila)}</ul>
    </>
  )
}

/** El cartel de las cuentas de regalos grupales (los totales son netos: con alguien pueden estar a mano y tener partes sin marcar). */
export function CuentasPendientes({ cuentas }: { cuentas: Cuentas }) {
  if (!cuentas.personas.length) return null
  return (
    <Link href="/cuentas" className="flex min-h-14 items-center gap-3 rounded-[22px] bg-gr-brand px-4 py-3 text-sm font-medium text-gr-on-brand">
      <span aria-hidden className="flex size-9 flex-none items-center justify-center rounded-full bg-gr-on-brand/10 text-gr-accent"><Icon name="wallet" size={18} /></span>
      <span className="min-w-0 flex-1">
        Cuentas pendientes:{' '}
        {cuentas.debes || cuentas.teDeben || cuentas.dolares?.debes || cuentas.dolares?.teDeben
          ? [
            cuentas.debes && `debés ${plata(cuentas.debes)}`, cuentas.dolares?.debes && `debés ${plata(cuentas.dolares.debes, 'USD')}`,
            cuentas.teDeben && `te deben ${plata(cuentas.teDeben)}`, cuentas.dolares?.teDeben && `te deben ${plata(cuentas.dolares.teDeben, 'USD')}`,
          ].filter(Boolean).join(' · ')
          : 'están a mano, falta marcarlo'}
      </span>
      <Icon name="chevron" size={18} className="flex-none text-gr-accent" />
    </Link>
  )
}

/** Si no cargó su cumple: para que su gente lo tenga con tiempo. */
export function CargaTuCumple() {
  return (
    <Link href="/perfil#cumple" className="gr-card flex items-center gap-3.5 p-4">
      <span aria-hidden className="flex size-12 flex-none items-center justify-center rounded-full bg-gr-accent"><Icon name="cake" size={24} /></span>
      <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug">Cargá tu cumple para que tu gente lo tenga con tiempo.</span>
      <span className="gr-btn-primary gr-btn--sm flex-none">Cargar</span>
    </Link>
  )
}
