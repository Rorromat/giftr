import Link from 'next/link'
import type { Cuentas } from '@/lib/regalos'
import { plata } from '@/lib/pesos'
import { calendarioDelAnio, fechaCorta, fechaLarga, MESES, type Evento } from '@/lib/events'
import { AvatarStack, Icon, ItemPhoto, SectionHeader, Starburst } from '@/components/ui'
import { FotoConRespaldo } from '@/components/FotoConRespaldo'

// Los cumples y fechas de tu gente: los próximos (en Inicio) y todo el año (en Eventos).

function Fotos({ e }: { e: Evento }) {
  if (!e.fotos.length) return <ItemPhoto src={null} titulo={e.titulo} height={170} />
  return (
    <div className="grid h-[170px] gap-0.5 bg-gr-surface" style={{ gridTemplateColumns: `repeat(${e.fotos.length}, minmax(0, 1fr))` }}>
      {e.fotos.map((src, i) => (
        <FotoConRespaldo key={i} src={src} className="size-full object-cover"
                         respaldo={<span className="size-full bg-gr-soft" />} />
      ))}
    </div>
  )
}

/** "Ya reservaste 1 regalo · Estás en un regalo grupal": los sueltos y los grupales por separado (sumarse no es reservar). */
function TeOcupas({ e }: { e: Evento }) {
  const grupales = e.misGrupales ?? 0
  const sueltos = (e.misReservas ?? 0) - grupales
  const partes = [
    sueltos > 0 && `Ya reservaste ${sueltos} ${sueltos === 1 ? 'regalo' : 'regalos'}`,
    grupales > 0 && `Estás en ${grupales === 1 ? 'un regalo grupal' : `${grupales} regalos grupales`}`,
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

/** Los próximos, en un carrusel; los que vienen después, en filas por mes. */
export function Proximos({ eventos, hoy }: { eventos: Evento[]; hoy: Date }) {
  const primeros = eventos.slice(0, 6)
  const porMes = Object.entries(Object.groupBy(eventos.slice(6), (e) => `${e.fecha.getUTCFullYear()}-${String(e.fecha.getUTCMonth()).padStart(2, '0')}`))
  return (
    <>
      <ul className="-mx-[18px] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-2 pt-1 [scroll-padding-inline:18px] [scrollbar-width:none]">
        {primeros.map((e) => <CardProximo key={e.listId} e={e} hoy={hoy} />)}
      </ul>
      {porMes.length > 0 && (
        <>
          <SectionHeader title="Más adelante" />
          {porMes.map(([clave, delMes]) => (
            <section key={clave} className="flex flex-col gap-2.5">
              <h3 className="gr-label">{MESES[Number(clave.slice(5))]}</h3>
              <ul className="flex flex-col gap-2.5">{delMes!.map((e) => <FilaEvento key={e.listId} e={e} />)}</ul>
            </section>
          ))}
        </>
      )}
    </>
  )
}

export function TodoElAnio({ eventos, hoy }: { eventos: Evento[]; hoy: Date }) {
  const meses = calendarioDelAnio(eventos, hoy)
  return (
    <>
      <div className="gr-card flex flex-col gap-3 p-3.5">
        <ul className="grid grid-cols-3 gap-x-3 gap-y-4">
          {meses.map((m) => (
            <li key={m.nombre} className="flex flex-col gap-1.5">
              <span className={`self-start text-[13px] font-semibold ${m.actual ? 'rounded-full bg-gr-brand px-2 text-gr-on-brand' : ''}`}>{m.nombre}</span>
              <div aria-hidden className="grid grid-cols-7 gap-[3px]">
                {Array.from({ length: m.dias }, (_, d) => d + 1).map((d) => (
                  <span key={d} className={`aspect-square rounded-full ${
                    m.eventos.includes(d) ? 'bg-gr-accent ring-1 ring-gr-ink/30' : m.hoy === d ? 'bg-gr-ink' : 'bg-gr-dot'}`} />
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="flex gap-4 border-t border-gr-line pt-3 text-xs text-gr-muted">
          <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-gr-accent ring-1 ring-gr-ink/30" />Evento o cumple</span>
          <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-gr-ink" />Hoy</span>
        </p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {eventos.map((e) => (
          <li key={e.listId}>
            <Link href={e.href} className="gr-card flex min-h-14 items-center gap-3 px-3 py-2">
              <span className="flex-none rounded-full bg-gr-soft px-2.5 py-1 text-[13px] font-semibold">{fechaCorta(e.fecha, hoy)}</span>
              <span className="min-w-0 flex-1 text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">{e.titulo}</span>
              <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
            </Link>
          </li>
        ))}
      </ul>
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
