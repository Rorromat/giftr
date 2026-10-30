'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Fragment, useEffect, useRef, useState } from 'react'
import { AvatarSticker, BackLink, Icon } from '@/components/ui'
import { IconoFecha } from '@/components/IconoFecha'
import { paletaDe } from '@/lib/colores-fechas'
import { claveDelDia, urlDe, vistaDe, type Cara, type CosaDelCalendario, type DiaDelCalendario, type Vista } from '@/lib/calendario'
import type { MesCalendario } from '@/lib/events'

// Todo el año, para recorrerlo: de la grilla del año se entra a un mes (se agranda desde donde estaba) con la cara de quién
// cumple cada día; de un día, a lo que cae ese día, con lo que más quieren; y de ahí, a su lista. Todo el año ya vino del
// servidor (ver TodoElAnio): moverse no pide nada, solo cambia la dirección (?mes=10&dia=27, con pushState), así que es
// instantáneo, atrás vuelve un paso y al volver de una lista se está donde se estaba.

const nivel = (v: Vista) => (v.dia ? 2 : v.mes ? 1 : 0)

/** En el historial, la marca de una entrada a la que se llegó entrando desde la de arriba (un mes desde el año, un día desde su mes). */
const ADENTRO = 'adentro'

/**
 * El último cambio de vista que pidió un toque (ver ir), y si lleva arriba de todo. Uno que llega sin esto es un atrás o
 * adelante del navegador (ver Calendario). Se anota antes de cambiar la dirección: Next dibuja la vista nueva adentro de su
 * popstate, antes que cualquier otro que lo escuche.
 */
let pedido: { url: string; arriba: boolean } | null = null

/**
 * Ir a otra vista sin pedirle nada al servidor. Entrar apila (atrás vuelve); al de al lado, reemplaza (atrás sigue volviendo
 * a la de arriba, que es la misma: los meses son del año y los días, de su mes). Salir, si se había entrado desde la de
 * arriba, es volver atrás (si no, atrás volvería a entrar); si se llegó directo (un link, recargar), la reemplaza.
 * Sin __NA en el estado: así Next se entera y useSearchParams cambia (ver window.history.pushState en su app-router).
 */
function ir(v: Vista, como: 'entrar' | 'al lado' | 'salir') {
  const url = urlDe(v)
  const atras = como === 'salir' && history.state?.calendario === ADENTRO
  // volver con la flecha es un atrás: el navegador deja donde se estaba
  pedido = { url, arriba: !atras }
  if (como === 'entrar') history.pushState({ calendario: ADENTRO }, '', url)
  else if (como === 'al lado') history.replaceState({ calendario: history.state?.calendario }, '', url)
  else if (atras) history.back()
  else history.replaceState(null, '', url)
}

/** Un link a otra vista: un link común (otra pestaña, sin JavaScript), y con un toque, sin recargar. */
function enlace(v: Vista, como: 'entrar' | 'al lado' | 'salir') {
  return {
    href: urlDe(v),
    onClick: (e: React.MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      ir(v, como)
    },
  }
}

/**
 * Dónde está una vista en la de arriba, para agrandarla desde ahí (o achicarla hacia ahí al salir): un mes en la grilla del
 * año (3 columnas), un día en la del mes (7). El alto es aproximado, de lo que miden las grillas.
 */
function lugarEnLaDeArriba({ mes, dia }: Vista, meses: MesCalendario[]): string {
  if (!mes) return '50% 0'
  if (!dia) return `${(((mes - 1) % 3) * 2 + 1) * (100 / 6)}% ${95 + Math.floor((mes - 1) / 3) * 95}px`
  const lugar = meses[mes - 1].empiezaEn + dia - 1
  return `${((lugar % 7) + 0.5) * (100 / 7)}% ${116 + Math.floor(lugar / 7) * 64}px`
}

type Animacion = { clase: string; desde?: string }

function animacionEntre(antes: Vista, ahora: Vista, meses: MesCalendario[]): Animacion {
  if (nivel(ahora) > nivel(antes)) return { clase: 'gr-cal-entra', desde: lugarEnLaDeArriba(ahora, meses) }
  if (nivel(ahora) < nivel(antes)) return { clase: 'gr-cal-sale', desde: lugarEnLaDeArriba(antes, meses) }
  const orden = (v: Vista) => (v.mes ?? 0) * 100 + (v.dia ?? 0)
  return { clase: orden(ahora) > orden(antes) ? 'gr-cal-siguiente' : 'gr-cal-anterior' }
}

/** La cara de algo del calendario (ver Cara). */
export function CaraDe({ cara, size }: { cara: Cara; size: number }) {
  if (cara.tipo === 'persona') return <AvatarSticker nombre={cara.nombre} foto={cara.foto} size={size} />
  const especial = cara.tipo === 'especial' ? paletaDe(cara.fecha) : null
  return (
    <span aria-hidden style={{ width: size, height: size, background: especial?.fondo }}
          className={`flex flex-none items-center justify-center rounded-full ${especial ? 'text-white' : 'bg-gr-brand text-gr-on-brand'}`}>
      {cara.tipo === 'especial'
        ? <IconoFecha fecha={cara.fecha} size={Math.round(size * 0.62)} acento={especial!.acento} />
        : <Icon name="users" size={Math.round(size * 0.55)} />}
    </span>
  )
}

/** Si un día de este año es hoy o ya pasó. */
function respectoDeHoy(mes: number, dia: number, meses: MesCalendario[]) {
  const mesDeHoy = meses.findIndex((m) => m.actual) + 1
  const diaDeHoy = meses[mesDeHoy - 1].hoy ?? 0
  return { hoy: mes === mesDeHoy && dia === diaDeHoy, pasado: mes < mesDeHoy || (mes === mesDeHoy && dia < diaDeHoy) }
}

/**
 * La fila de las listas: cuándo, de quién y qué; lleva directo a su lista. En todo el año, cuándo es la próxima vez; en un
 * mes, el día de ese mes (como en la grilla), apagada si ya pasó.
 */
function Fila({ c, cuando = c.cuando, pasada = false }: { c: CosaDelCalendario; cuando?: string; pasada?: boolean }) {
  const especial = c.cara.tipo === 'especial' ? c.cara.fecha : null
  const color = especial && paletaDe(especial).fondo
  return (
    <li>
      <Link href={c.href} className={`gr-card flex min-h-14 items-center gap-3 px-3 py-2 ${pasada ? 'opacity-60' : ''}`}>
        <span style={color ? { background: color } : undefined}
              className={`flex-none rounded-full px-2.5 py-1 text-[13px] font-semibold ${color ? 'text-white' : 'bg-gr-soft'}`}>{cuando}</span>
        {!especial && <CaraDe cara={c.cara} size={32} />}
        <span className="min-w-0 flex-1 text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">{c.titulo}</span>
        {especial && <span style={{ color: color! }}><IconoFecha fecha={especial} size={22} acento="currentColor" className="flex-none" /></span>}
        <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
      </Link>
    </li>
  )
}

type Datos = {
  meses: MesCalendario[]
  dias: Record<string, DiaDelCalendario>
  cosas: Record<string, CosaDelCalendario>
}

/** Todo el año: la grilla de los meses (cada uno lleva a su mes) y la lista, con todo por cercanía. */
function VistaAnio({ meses, dias, cosas, orden, vacio }: Datos & { orden: string[]; vacio: boolean }) {
  const colores = orden.flatMap((k) => (cosas[k].cara.tipo === 'especial' ? [paletaDe(cosas[k].cara.fecha).fondo] : []))
  // el color de un día en la grilla: el de su fecha especial, el de los cumples, hoy o nada
  const colorDe = (mes: number, dia: number, hoy: boolean): { style?: React.CSSProperties; className?: string } => {
    const caras = (dias[claveDelDia(mes, dia)]?.cosas ?? []).map((k) => cosas[k].cara)
    const especial = caras.find((c) => c.tipo === 'especial')
    if (especial) return { style: { background: paletaDe(especial.fecha).fondo } }
    return { className: caras.length ? 'bg-gr-acento' : hoy ? 'bg-gr-ink' : 'bg-gr-dot' }
  }
  return (
    <>
      <p className="-mt-3 text-center text-sm text-gr-muted">Los cumples y fechas de tu gente, y las fechas especiales. Tocá un mes para verlo día por día.</p>
      {vacio && <p className="gr-empty py-7 text-center">Acá aparecen los cumples de la gente cuyas listas abrís y las fechas de tus grupos.</p>}
      <div className="gr-card flex flex-col gap-3 p-2">
        <ul className="grid grid-cols-3 gap-y-1">
          {meses.map((m, i) => {
            const cuantas = Array.from({ length: m.dias }, (_, d) => dias[claveDelDia(i + 1, d + 1)]?.cosas.length ?? 0).reduce((a, b) => a + b, 0)
            return (
              <li key={m.nombre}>
                <a {...enlace({ mes: i + 1 }, 'entrar')} aria-label={`${m.largo}: ${cuantas ? `${cuantas} ${cuantas === 1 ? 'fecha' : 'fechas'}` : 'sin fechas'}`}
                   className="flex flex-col gap-1.5 rounded-xl p-1.5 transition-transform active:scale-95 active:bg-gr-soft">
                  <span className={`self-start text-[13px] font-semibold ${m.actual ? 'rounded-full bg-gr-brand px-2 text-gr-on-brand' : ''}`}>{m.nombre}</span>
                  <span aria-hidden className="grid grid-cols-7 gap-[3px]">
                    {Array.from({ length: m.dias }, (_, d) => d + 1).map((d) => {
                      const { style, className = '' } = colorDe(i + 1, d, m.hoy === d)
                      return <span key={d} style={style} className={`aspect-square rounded-full ${className}`} />
                    })}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
        <p className="mx-1.5 mb-1.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-gr-line pt-3 text-xs text-gr-muted">
          <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-gr-acento" />Evento o cumple</span>
          {colores.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full" style={{ background: `conic-gradient(${colores.join(', ')})` }} />Fecha especial
            </span>
          )}
          <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-gr-ink" />Hoy</span>
        </p>
      </div>
      <ul className="flex flex-col gap-2.5">{orden.map((k) => <Fila key={k} c={cosas[k]} />)}</ul>
    </>
  )
}

/** Un día de la grilla del mes: el número y, si cae algo, la cara de quién (apiladas, si son más) y lleva al día. */
function Celda({ mes, dia, meses, dias, cosas }: Datos & { mes: number; dia: number }) {
  const delDia = dias[claveDelDia(mes, dia)]
  const caras = (delDia?.cosas ?? []).map((k) => cosas[k].cara)
  const gente = caras.filter((c) => c.tipo !== 'especial')
  const especial = caras.find((c) => c.tipo === 'especial')
  const { hoy, pasado } = respectoDeHoy(mes, dia, meses)
  // el número: negro si es hoy; con el color de la fecha especial si además hay cumples (si no, ya lo dice su ícono)
  const fondo = !hoy && especial && gente.length ? paletaDe(especial.fecha).fondo : undefined
  const numero = (
    <span style={fondo ? { background: fondo } : undefined}
          className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[13px] leading-none font-semibold ${
            hoy ? 'bg-gr-brand text-gr-on-brand' : fondo ? 'text-white' : ''}`}>{dia}</span>
  )
  const forma = 'flex h-[62px] flex-col items-center gap-1 rounded-xl pt-1.5'
  if (!delDia) {
    return <li aria-current={hoy ? 'date' : undefined} className={`${forma} ${pasado ? 'text-gr-muted' : ''}`}>{numero}</li>
  }
  return (
    <li>
      <a {...enlace({ mes, dia }, 'entrar')} aria-current={hoy ? 'date' : undefined}
         aria-label={`${delDia.semana} ${delDia.titulo}: ${delDia.cosas.map((k) => cosas[k].titulo).join(', ')}`}
         className={`${forma} bg-gr-soft transition-transform active:scale-95 ${pasado ? 'opacity-60' : ''}`}>
        {numero}
        {gente.length > 1 ? (
          // más de uno, apiladas (con un aro para separarlas; dos entran en la celda de un teléfono angosto): con dos, las
          // dos caras, la primera arriba; con más, la primera y cuántos más son, arriba para que se lea
          <span className="flex">
            <span className={`flex rounded-full ring-2 ring-gr-soft ${gente.length === 2 ? 'z-10' : ''}`}>
              <CaraDe cara={gente[0]} size={24} />
            </span>
            {gente.length === 2 ? (
              <span className="-ml-2.5 flex rounded-full ring-2 ring-gr-soft">
                <CaraDe cara={gente[1]} size={24} />
              </span>
            ) : (
              <span aria-hidden className="-ml-2.5 flex size-6 items-center justify-center rounded-full bg-gr-brand text-[10px] leading-none font-bold text-gr-on-brand ring-2 ring-gr-soft">
                +{gente.length - 1}
              </span>
            )}
          </span>
        ) : <CaraDe cara={gente[0] ?? especial!} size={30} />}
      </a>
    </li>
  )
}

const SEMANA_CORTA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

/** Un mes: la grilla de los días con quién cumple cada uno, los meses de al lado, y abajo la lista del mes. */
function VistaMes({ mes, ...datos }: Datos & { mes: number }) {
  const { meses, dias, cosas } = datos
  const m = meses[mes - 1]
  const delMes = Array.from({ length: m.dias }, (_, d) => d + 1)
  const lista = delMes.flatMap((d) => (dias[claveDelDia(mes, d)]?.cosas ?? []).map((k) => ({ k, d })))
  const alLado = (otro: number, sentido: 'anterior' | 'siguiente') => (
    <a {...enlace({ mes: otro }, 'al lado')} aria-label={`Ir a ${meses[otro - 1].largo}`} className="gr-btn gr-btn--sm gap-1 px-3.5">
      {sentido === 'anterior' && <Icon name="back" size={16} strokeWidth={2.4} />}
      {meses[otro - 1].nombre}
      {sentido === 'siguiente' && <Icon name="chevron" size={16} strokeWidth={2.4} />}
    </a>
  )
  return (
    <>
      <div className="gr-card flex flex-col gap-2.5 p-3">
        <div className="flex items-center justify-between gap-2">
          {mes > 1 ? alLado(mes - 1, 'anterior') : <span />}
          {mes < 12 ? alLado(mes + 1, 'siguiente') : <span />}
        </div>
        <div aria-hidden className="grid grid-cols-7 text-center text-[11px] font-semibold text-gr-muted">
          {SEMANA_CORTA.map((d) => <span key={d}>{d}</span>)}
        </div>
        <ol className="grid grid-cols-7 gap-1">
          {Array.from({ length: m.empiezaEn }, (_, i) => <li key={`antes-${i}`} aria-hidden />)}
          {delMes.map((d) => <Celda key={d} mes={mes} dia={d} {...datos} />)}
        </ol>
      </div>
      <section aria-labelledby="en-el-mes" className="flex flex-col gap-2.5">
        <h2 id="en-el-mes" className="gr-label">En {m.largo.toLowerCase()}</h2>
        {lista.length
          ? (
            <ul className="flex flex-col gap-2.5">
              {lista.map(({ k, d }) => (
                <Fila key={k} c={cosas[k]} cuando={`${d} ${m.nombre.toLowerCase()}`} pasada={respectoDeHoy(mes, d, meses).pasado} />
              ))}
            </ul>
          )
          : <p className="gr-empty text-center">Este mes no cumple nadie de tu gente.</p>}
      </section>
    </>
  )
}

/** Un día: lo que cae, con lo que más quieren (cada tarjeta lleva a su lista), y los otros días de ese mes en que cae algo. */
function VistaDia({ mes, dia, meses, dias, cosas }: Datos & { mes: number; dia: number }) {
  const delDia = dias[claveDelDia(mes, dia)]
  const conAlgo = Array.from({ length: meses[mes - 1].dias }, (_, d) => d + 1).filter((d) => dias[claveDelDia(mes, d)])
  const anterior = conAlgo[conAlgo.indexOf(dia) - 1]
  const siguiente = conAlgo[conAlgo.indexOf(dia) + 1]
  const alLado = (otro: number, sentido: 'anterior' | 'siguiente') => (
    <a {...enlace({ mes, dia: otro }, 'al lado')} aria-label={`Ir al ${dias[claveDelDia(mes, otro)].titulo}`} className="gr-btn gr-btn--sm gap-1 px-3.5">
      {sentido === 'anterior' && <Icon name="back" size={16} strokeWidth={2.4} />}
      {otro} {meses[mes - 1].nombre.toLowerCase()}
      {sentido === 'siguiente' && <Icon name="chevron" size={16} strokeWidth={2.4} />}
    </a>
  )
  return (
    <>
      <p className="-mt-3 text-center text-sm text-gr-muted">{delDia.semana} · {delDia.cuando}</p>
      {(anterior || siguiente) && (
        <div className="flex items-center justify-between gap-2">
          {anterior ? alLado(anterior, 'anterior') : <span />}
          {siguiente ? alLado(siguiente, 'siguiente') : <span />}
        </div>
      )}
      <ul className="flex flex-col gap-3">{delDia.cosas.map((k) => <Fragment key={k}>{cosas[k].tarjeta}</Fragment>)}</ul>
    </>
  )
}

/**
 * Todo el año, para recorrerlo (ver arriba). Cambiar de vista con un toque agranda la nueva desde donde estaba en la de
 * arriba, la achica al salir o la desliza al pasar a la de al lado, y lleva arriba de todo (salvo la flecha de volver, que
 * es un atrás: el navegador deja donde se estaba). Con atrás o adelante del navegador (deslizar, en el celu), nada: el
 * gesto ya trae su animación y la nuestra encima era un zoom de más. Siempre, el foco al título (para que un lector de
 * pantalla diga dónde está).
 */
export function Calendario({ orden, vacio, ...datos }: Datos & {
  /** todo, por cercanía: la lista de todo el año */
  orden: string[]
  /** no hay ni un cumple ni una fecha de tu gente */
  vacio: boolean
}) {
  const vista = vistaDe(useSearchParams(), datos.dias)
  const clave = urlDe(vista)
  const [antes, setAntes] = useState(vista)
  const [cambio, setCambio] = useState<{ animacion: Animacion | null; arriba: boolean } | null>(null)
  if (urlDe(antes) !== clave) {
    const porToque = pedido?.url === clave ? pedido : null
    setAntes(vista)
    setCambio({ animacion: porToque && animacionEntre(antes, vista, datos.meses), arriba: !!porToque?.arriba })
  }
  const titulo = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!cambio) return
    pedido = null
    if (cambio.arriba) window.scrollTo({ top: 0 })
    titulo.current?.focus({ preventScroll: true })
  }, [cambio])
  const animacion = cambio?.animacion

  const { mes, dia } = vista
  const m = mes ? datos.meses[mes - 1] : null
  const volver = !m
    ? <BackLink href="/inicio" label="Volver a Inicio" />
    : <a {...enlace(dia ? { mes } : {}, 'salir')} aria-label={dia ? `Volver a ${m.largo}` : 'Volver a todo el año'} className="gr-icon-btn">
        <Icon name="back" size={20} strokeWidth={2.4} />
      </a>
  return (
    <>
      <header className="grid min-h-14 grid-cols-[48px_1fr_48px] items-center gap-2">
        <div>{volver}</div>
        <h1 ref={titulo} tabIndex={-1} className="truncate text-center text-lg font-semibold tracking-[-0.01em] outline-none">
          {!m ? 'Todo el año' : dia ? datos.dias[claveDelDia(mes!, dia)].titulo : m.largo}
        </h1>
      </header>
      <div key={clave} className={`flex flex-col gap-5 ${animacion?.clase ?? ''}`}
           style={animacion?.desde ? { '--desde': animacion.desde } as React.CSSProperties : undefined}>
        {mes && dia ? <VistaDia mes={mes} dia={dia} {...datos} />
          : mes ? <VistaMes mes={mes} {...datos} />
            : <VistaAnio orden={orden} vacio={vacio} {...datos} />}
      </div>
    </>
  )
}
