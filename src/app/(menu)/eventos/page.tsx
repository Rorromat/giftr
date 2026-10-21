import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { misCuentas, pesos } from '@/lib/regalos'
import { calendarioDelAnio, fechaCorta, fechaLarga, hoyLocal, miCumple, misEventos, type Evento } from '@/lib/events'
import { AvatarStack, Icon, ItemPhoto, Seccion, Starburst } from '@/components/ui'

function Fotos({ e }: { e: Evento }) {
  if (!e.fotos.length) return <ItemPhoto src={null} titulo={e.titulo} height={150} />
  return (
    <div className="grid h-[150px] border-b-[3px] border-gr-ink" style={{ gridTemplateColumns: `repeat(${e.fotos.length}, minmax(0, 1fr))` }}>
      {e.fotos.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- fotos de tiendas externas
        <img key={i} src={src} alt="" className={`size-full object-cover ${i ? 'border-l-[3px] border-gr-ink' : ''}`} />
      ))}
    </div>
  )
}

function Estado({ e }: { e: Evento }) {
  // Al dueño nunca se le dice nada de reservas: solo se le recuerda revisar su lista.
  if (e.propio) return <p className="text-[13px] font-semibold text-gr-muted">¿Tu lista está al día?</p>
  return (
    <>
      {e.misReservas
        ? <p className="text-[13px] font-semibold">Ya reservaste {e.misReservas} {e.misReservas === 1 ? 'regalo' : 'regalos'}</p>
        : <p className="self-start rounded-full bg-gr-accent px-2.5 py-0.5 text-[13px] font-bold">Todavía no reservaste nada</p>}
      {e.ultimo && <p className="text-[13px] font-medium text-gr-muted [overflow-wrap:anywhere]">El último lo compró {e.ultimo.encargado}: {e.ultimo.titulo}</p>}
    </>
  )
}

function Proximos({ eventos }: { eventos: Evento[] }) {
  return (
    <ul className="flex flex-col gap-5">
      {eventos.map((e, i) => (
        <li key={e.listId} style={{ transform: `rotate(${i % 2 ? 0.6 : -0.6}deg)` }}>
          <Link href={e.href} className="gr-sticker relative block overflow-visible rounded-3xl shadow-[6px_6px_0_var(--gr-ink)]">
            <div className="overflow-hidden rounded-t-[19px]"><Fotos e={e} /></div>
            <Starburst size={76} fontSize={e.dias > 99 ? 26 : 34} sub={e.dias === 0 ? undefined : e.dias === 1 ? 'día' : 'días'}
                       label={e.dias === 0 ? 'Es hoy' : `Faltan ${e.dias} ${e.dias === 1 ? 'día' : 'días'}`}
                       className="absolute -right-2 -top-3 rotate-12">
              {e.dias === 0 ? '¡Hoy!' : e.dias}
            </Starburst>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2 className="font-display text-[24px] leading-tight font-extrabold tracking-[-0.03em] [overflow-wrap:anywhere]">{e.titulo}</h2>
                <p className="text-sm font-medium">{[fechaLarga(e.fecha), e.contexto].filter(Boolean).join(' · ')}</p>
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

function TodoElAnio({ eventos, hoy }: { eventos: Evento[]; hoy: Date }) {
  const meses = calendarioDelAnio(eventos, hoy)
  return (
    <>
      <ul className="grid grid-cols-3 gap-2.5">
        {meses.map((m) => (
          <li key={m.nombre} className="flex flex-col gap-2 rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface p-2.5">
            <span className={`self-start font-display text-[15px] font-extrabold ${m.actual ? 'rounded-full border-2 border-gr-ink bg-gr-accent px-2' : ''}`}>{m.nombre}</span>
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
            <Link href={e.href} className="flex min-h-14 items-center gap-3 rounded-2xl border-[2.5px] border-gr-ink bg-gr-surface px-3 py-2">
              <span className="flex-none rounded-xl bg-gr-ink px-2.5 py-1 font-display text-[15px] font-extrabold text-gr-bg">{fechaCorta(e.fecha)}</span>
              <span className="min-w-0 font-display text-lg leading-tight font-extrabold [overflow-wrap:anywhere]">{e.titulo}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

export default async function Eventos({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const hoy = hoyLocal()
  const [{ vista }, eventos, cumple, cuentas] = await Promise.all([
    searchParams, misEventos(db, session.userId, hoy), miCumple(db, session.userId), misCuentas(db, session.userId),
  ])
  const anio = vista === 'anio'

  return (
    <Seccion className="flex flex-col gap-4 pb-32 pt-[52px]">
      <div className="flex flex-col gap-1">
        <h1 className="gr-title">Eventos</h1>
        <p className="text-[15px] font-medium">Los cumples y fechas de tu gente, con tiempo.</p>
      </div>

      {/* los totales son netos: con alguien pueden estar a mano y tener partes sin marcar */}
      {cuentas.personas.length > 0 && (
        <Link href="/cuentas" className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border-[2.5px] border-gr-ink bg-gr-ink px-3.5 py-2 text-sm font-semibold text-gr-bg">
          <span>
            Cuentas pendientes:{' '}
            {cuentas.debes || cuentas.teDeben
              ? [cuentas.debes && `debés ${pesos(cuentas.debes)}`, cuentas.teDeben && `te deben ${pesos(cuentas.teDeben)}`].filter(Boolean).join(' · ')
              : 'están a mano, falta marcarlo'}
          </span>
          <Icon name="chevron" size={18} strokeWidth={2.6} className="text-gr-accent" />
        </Link>
      )}

      <nav aria-label="Vista" className="gr-segmented">
        <Link href="/eventos" aria-current={anio ? undefined : 'page'}>Próximos</Link>
        <Link href="/eventos?vista=anio" aria-current={anio ? 'page' : undefined}>Todo el año</Link>
      </nav>

      {eventos.length === 0 ? (
        <div className="relative mt-4 flex flex-col gap-2 rounded-sticker border-[2.5px] border-dashed border-gr-ink px-5 py-7 text-center text-[15px] font-medium leading-snug">
          <Starburst size={52} fontSize={46} className="absolute -right-2 -top-6 rotate-12">!</Starburst>
          <p>Acá aparecen los cumples de la gente cuyas listas abrís y las fechas de tus grupos.</p>
          <p>Pediles el link de su lista y abrilo con tu cuenta.</p>
        </div>
      ) : anio ? <TodoElAnio eventos={eventos} hoy={hoy} /> : <Proximos eventos={eventos} />}

      {!cumple && (
        <Link href="/perfil#cumple" className="gr-sticker flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-[15px] font-semibold">Cargá tu cumple para que tu gente lo tenga en Eventos.</span>
          <span className="gr-btn-primary gr-btn--sm flex-none rounded-[14px]">Cargar</span>
        </Link>
      )}
    </Seccion>
  )
}
