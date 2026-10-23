import Link from 'next/link'
import { pesos, type Cuentas } from '@/lib/regalos'
import { calendarioDelAnio, fechaCorta, fechaLarga, type Evento } from '@/lib/events'
import { AvatarStack, Icon, ItemPhoto, Starburst } from '@/components/ui'
import { FotoConRespaldo } from '@/components/FotoConRespaldo'

// Los cumples y fechas de tu gente: los próximos (en Inicio) y todo el año (en Eventos).

function Fotos({ e }: { e: Evento }) {
  if (!e.fotos.length) return <ItemPhoto src={null} titulo={e.titulo} height={150} />
  return (
    <div className="grid h-[150px] border-b border-gr-line" style={{ gridTemplateColumns: `repeat(${e.fotos.length}, minmax(0, 1fr))` }}>
      {e.fotos.map((src, i) => (
        <FotoConRespaldo key={i} src={src} className={`size-full object-cover ${i ? 'border-l border-gr-line' : ''}`}
                         respaldo={<span className={`size-full bg-gr-bg ${i ? 'border-l border-gr-line' : ''}`} />} />
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
  return <p className="text-[13px] font-semibold">{partes.join(' · ')}</p>
}

function Estado({ e }: { e: Evento }) {
  // Al dueño nunca se le dice nada de reservas: solo se le recuerda revisar su lista.
  if (e.propio) return <p className="text-[13px] font-semibold text-gr-muted">¿Tu lista está al día?</p>
  return (
    <>
      {e.misReservas
        ? <TeOcupas e={e} />
        : <p className="self-start rounded-full bg-gr-accent px-2.5 py-0.5 text-[13px] font-bold">Todavía no reservaste nada</p>}
      {e.ultimo && <p className="text-[13px] font-medium text-gr-muted [overflow-wrap:anywhere]">El último lo compró {e.ultimo.encargado}: {e.ultimo.titulo}</p>}
    </>
  )
}

export function Proximos({ eventos, hoy }: { eventos: Evento[]; hoy: Date }) {
  return (
    <ul className="flex flex-col gap-5">
      {eventos.map((e) => (
        <li key={e.listId}>
          <Link href={e.href} className="gr-sticker relative block overflow-visible rounded-3xl">
            <div className="overflow-hidden rounded-t-[19px]"><Fotos e={e} /></div>
            <Starburst size={76} fontSize={e.dias > 99 ? 26 : 34} sub={e.dias === 0 ? undefined : e.dias === 1 ? 'día' : 'días'}
                       label={e.dias === 0 ? 'Es hoy' : `Faltan ${e.dias} ${e.dias === 1 ? 'día' : 'días'}`}
                       className="absolute -right-2 -top-3">
              {e.dias === 0 ? '¡Hoy!' : e.dias}
            </Starburst>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2 className="font-display text-[24px] leading-tight font-extrabold tracking-[-0.03em] [overflow-wrap:anywhere]">{e.titulo}</h2>
                <p className="text-sm font-medium">{[fechaLarga(e.fecha, hoy), e.contexto].filter(Boolean).join(' · ')}</p>
                <Estado e={e} />
              </div>
              <AvatarStack nombres={e.personas.slice(0, 3)} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function TodoElAnio({ eventos, hoy }: { eventos: Evento[]; hoy: Date }) {
  const meses = calendarioDelAnio(eventos, hoy)
  return (
    <>
      <ul className="grid grid-cols-3 gap-2.5">
        {meses.map((m) => (
          <li key={m.nombre} className="flex flex-col gap-2 rounded-2xl border border-gr-line bg-gr-surface p-2.5">
            <span className={`self-start font-display text-[15px] font-extrabold ${m.actual ? 'rounded-full bg-gr-accent px-2' : ''}`}>{m.nombre}</span>
            <div aria-hidden className="grid grid-cols-7 gap-[3px]">
              {Array.from({ length: m.dias }, (_, d) => d + 1).map((d) => (
                <span key={d} className={`aspect-square rounded-full ${
                  m.eventos.includes(d) ? 'border-[1.5px] border-gr-ink bg-gr-accent' : m.hoy === d ? 'bg-gr-ink' : 'bg-gr-dot'}`} />
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="flex gap-4 text-sm font-medium">
        <span className="flex items-center gap-1.5"><span className="size-3.5 rounded-full border-[1.5px] border-gr-ink bg-gr-accent" />Evento o cumple</span>
        <span className="flex items-center gap-1.5"><span className="size-3.5 rounded-full bg-gr-ink" />Hoy</span>
      </p>
      <ul className="flex flex-col gap-2.5">
        {eventos.map((e) => (
          <li key={e.listId}>
            <Link href={e.href} className="flex min-h-14 items-center gap-3 rounded-2xl border border-gr-line bg-gr-surface px-3 py-2">
              <span className="flex-none rounded-xl bg-gr-ink px-2.5 py-1 font-display text-[15px] font-extrabold text-gr-bg">{fechaCorta(e.fecha, hoy)}</span>
              <span className="min-w-0 font-display text-lg leading-tight font-extrabold [overflow-wrap:anywhere]">{e.titulo}</span>
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
    <Link href="/cuentas" className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-gr-ink px-3.5 py-2 text-sm font-semibold text-gr-bg">
      <span>
        Cuentas pendientes:{' '}
        {cuentas.debes || cuentas.teDeben
          ? [cuentas.debes && `debés ${pesos(cuentas.debes)}`, cuentas.teDeben && `te deben ${pesos(cuentas.teDeben)}`].filter(Boolean).join(' · ')
          : 'están a mano, falta marcarlo'}
      </span>
      <Icon name="chevron" size={18} strokeWidth={2.6} className="text-gr-accent" />
    </Link>
  )
}

/** Si no cargó su cumple: para que su gente lo tenga con tiempo. */
export function CargaTuCumple() {
  return (
    <Link href="/perfil#cumple" className="gr-sticker flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-[15px] font-semibold">Cargá tu cumple para que tu gente lo tenga con tiempo.</span>
      <span className="gr-btn-primary gr-btn--sm flex-none rounded-[14px]">Cargar</span>
    </Link>
  )
}
