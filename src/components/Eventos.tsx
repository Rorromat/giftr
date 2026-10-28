import Link from 'next/link'
import type { Cuentas } from '@/lib/regalos'
import { plata } from '@/lib/pesos'
import { calendarioDelAnio, diaEnElAnio, diasEntre, fechaCorta, fechaLarga, MESES, repartirProximos, SEMANA, type Evento } from '@/lib/events'
import { diaEn, type FechaEspecialVista, type TarjetaEspecial } from '@/lib/fechas-especiales'
import { AvatarStack, Icon, Starburst } from '@/components/ui'
import { FotoConRespaldo } from '@/components/FotoConRespaldo'
import { CardEspecial } from '@/components/AmigoInvisible'
import { Calendario } from '@/components/Calendario'
import { claveDelDia, type Cara, type CosaDelCalendario, type DiaDelCalendario } from '@/lib/calendario'

// Los cumples y fechas de tu gente: los próximos (en Inicio) y todo el año (en Eventos, para recorrer mes por mes y día por
// día). Las fechas especiales (Navidad, Día del Amigo…) y los amigos invisibles van entre ellos, cada una con su color.

/**
 * Las fotos de lo que más quiere, una al lado de la otra. La fila mide los 170 px (minmax(0,1fr)): con la fila en auto,
 * una sola foto vertical la estiraba a su alto y tapaba el nombre y la fecha de la tarjeta.
 */
function Fotos({ e }: { e: Evento }) {
  // sin deseos con foto, un regalo: la inicial del título ("C" de "Cumple de…") se confundía con la de la persona
  if (!e.fotos.length) {
    return <div className="flex h-[170px] items-center justify-center bg-gr-soft text-gr-muted"><Icon name="gift" size={48} strokeWidth={1.6} /></div>
  }
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

/**
 * Tarjeta alta del carrusel: las fotos de lo que más quiere, la cuenta regresiva en la estrella y quién es. También la de un
 * día de Todo el año, a lo ancho.
 */
function CardProximo({ e, hoy, className = 'w-[252px] flex-none snap-start' }: { e: Evento; hoy: Date; className?: string }) {
  return (
    <li className={className}>
      <Link href={e.href} className="gr-card relative flex h-full flex-col">
        <div className="relative">
          <Fotos e={e} />
          <Starburst size={64} fontSize={e.dias > 99 ? 26 : 32} sub={e.dias === 0 ? undefined : e.dias === 1 ? 'día' : 'días'}
                     label={e.dias === 0 ? 'Es hoy' : `Faltan ${e.dias} ${e.dias === 1 ? 'día' : 'días'}`}
                     className="absolute right-2 top-2 drop-shadow-sm">
            {e.dias === 0 ? '¡Hoy!' : e.dias}
          </Starburst>
          {/* de quién es: su foto (en un grupo, la de cada uno), montada sobre el borde de las fotos de los deseos */}
          <AvatarStack nombres={e.personas.slice(0, 3)} fotos={e.caras.slice(0, 3)} size={52} className="absolute -bottom-6 left-3 drop-shadow-sm" />
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3.5 pt-8">
          <h2 className="text-[17px] leading-snug font-semibold [overflow-wrap:anywhere]">{e.titulo}</h2>
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

/**
 * Los próximos 5 (eventos y fechas especiales, por cercanía) en un carrusel; si hay más, la última tarjeta lleva a Todo el
 * año. Ver repartirProximos.
 */
export function Proximos({ eventos, hoy, especiales = [] }: { eventos: Evento[]; hoy: Date; especiales?: TarjetaEspecial[] }) {
  const { primeros, quedan } = repartirProximos([
    ...eventos.map((e) => ({ dias: e.dias, tarjeta: <CardProximo key={e.listId} e={e} hoy={hoy} /> })),
    ...especiales.map((t) => ({
      dias: t.dias, tarjeta: <CardEspecial key={t.tipo === 'fecha' ? t.fecha.id : t.juego.id} t={t} hoy={hoy} />,
    })),
  ].sort((a, b) => a.dias - b.dias))
  if (!primeros.length) {
    return (
      <p className="gr-empty px-4 py-4 text-center text-sm">
        Nada en los próximos tres meses. <Link href="/eventos" className="font-semibold underline underline-offset-2">Ver todo el año</Link>
      </p>
    )
  }
  return (
    <ul className="-mx-[18px] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-2 pt-1 [scroll-padding-inline:18px] [scrollbar-width:none]">
      {primeros.map((p) => p.tarjeta)}
      {quedan > 0 && (
        <li className="w-[160px] flex-none snap-start">
          <Link href="/eventos" className="gr-card flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <span aria-hidden className="flex size-14 items-center justify-center rounded-full bg-gr-accent"><Icon name="calendar" size={26} /></span>
            <span className="text-[17px] leading-tight font-semibold">{quedan === 1 ? '1 más' : `${quedan} más`}</span>
            <span className="text-[13px] font-semibold underline underline-offset-4">Todo el año</span>
          </Link>
        </li>
      )}
    </ul>
  )
}

const caraDe = (e: Evento): Cara => (e.tipo === 'grupo' ? { tipo: 'grupo' } : { tipo: 'persona', nombre: e.personas[0], foto: e.caras[0] })

/**
 * Todo el año, para recorrerlo (ver Calendario): lo que cae cada día de este año (los eventos, ver diaEnElAnio, y las fechas
 * especiales), con su fila y la tarjeta del día (la de Próximos, a lo ancho), y todo por cercanía para la lista.
 */
export function TodoElAnio({ eventos, hoy, especiales = [] }: { eventos: Evento[]; hoy: Date; especiales?: FechaEspecialVista[] }) {
  const anio = hoy.getUTCFullYear()
  const todas = [
    ...eventos.map((e) => ({
      clave: e.listId, proxima: e.dias, cae: diaEnElAnio(e.cae, anio),
      cosa: { href: e.href, titulo: e.titulo, cuando: fechaCorta(e.fecha, hoy), cara: caraDe(e), tarjeta: <CardProximo e={e} hoy={hoy} className="w-full" /> },
    })),
    ...especiales.map((f) => ({
      clave: f.id, proxima: f.dias, cae: diaEn(f.id, anio),
      cosa: {
        href: `/fechas/${f.id}`, titulo: f.nombre, cuando: fechaCorta(f.fecha, hoy), cara: { tipo: 'especial', fecha: f.id } as const,
        tarjeta: <CardEspecial t={{ tipo: 'fecha', fecha: f, juegos: [], dias: f.dias }} hoy={hoy} className="w-full" />,
      },
    })),
  ].sort((a, b) => a.proxima - b.proxima)
  const cosas: Record<string, CosaDelCalendario> = {}
  const dias: Record<string, DiaDelCalendario> = {}
  for (const { clave, proxima, cae, cosa } of todas) {
    cosas[clave] = cosa
    if (!cae) continue
    const delDia = claveDelDia(cae.getUTCMonth() + 1, cae.getUTCDate())
    if (dias[delDia]) {
      dias[delDia].cosas.push(clave)
      continue
    }
    // la primera es la más cercana: si este año ya pasó, cuándo es la próxima
    const faltan = diasEntre(hoy, cae)
    dias[delDia] = {
      titulo: `${cae.getUTCDate()} de ${MESES[cae.getUTCMonth()]}`, semana: SEMANA[cae.getUTCDay()], cosas: [clave],
      cuando: faltan === 0 ? '¡es hoy!' : faltan === 1 ? 'mañana' : faltan > 1 ? `en ${faltan} días` : `este año ya pasó (el próximo, en ${proxima} días)`,
    }
  }
  return <Calendario meses={calendarioDelAnio(eventos, hoy)} dias={dias} cosas={cosas} orden={todas.map((t) => t.clave)} vacio={!eventos.length} />
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
