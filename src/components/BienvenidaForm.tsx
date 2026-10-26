'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { saveGustosAction } from '@/app/actions'
import { FotoPerfil } from '@/components/FotoPerfil'
import { CumpleCampos } from '@/components/CumpleCampos'
import { BotonEnviar } from '@/components/BotonEnviar'
import { Icon, PageHeader, type IconName } from '@/components/ui'
import {
  BEBIDAS, CLUBES, CLUBES_SIN_BUSCAR, COLORES, DEPORTES, ESTILOS, HOBBIES, MARCAS, MASCOTAS, NO_FUTBOL, NO_REGALAR,
  PASOS_GUSTOS, POPULARES, SOLO_SELECCION, TALLES, TODAS_LAS_MARCAS, type Gustos, type PasoGustos,
} from '@/lib/gustos'

/** Uno por cada paso de PASOS_GUSTOS, en el mismo orden. */
const PASOS: { titulo: string; sub: string; icono: IconName }[] = [
  { titulo: '', sub: 'Contanos un poco de vos así tu gente acierta. Son dos minutos y lo podés cambiar cuando quieras.', icono: 'cake' },
  { titulo: '¿Qué deportes hacés o mirás?', sub: 'Elegí todos los que quieras.', icono: 'ball' },
  { titulo: '¿De qué cuadro sos?', sub: 'Para la camiseta, el buzo, la taza…', icono: 'shield' },
  { titulo: '¿Qué te gusta hacer?', sub: 'Hobbies, planes, y si hay mascota en casa.', icono: 'star' },
  { titulo: '¿Qué ropa te gusta?', sub: 'Tus marcas y tu estilo.', icono: 'bag' },
  { titulo: 'Colores y talles', sub: 'Así nadie tiene que ir a cambiar nada.', icono: 'shirt' },
  { titulo: 'Bebidas y antojos', sub: 'Para el regalito de último momento.', icono: 'cup' },
  { titulo: 'Lo que NO querés', sub: 'Tan importante como lo que sí.', icono: 'ban' },
]

function Chip({ name, value, checked, type = 'checkbox', className = '', alCambiar, children }: {
  name: string; value: string; checked: boolean; type?: 'checkbox' | 'radio'; className?: string
  alCambiar?: (marcado: boolean) => void; children?: ReactNode
}) {
  return (
    <label className={`gr-chip gap-1.5 ${className}`}>
      <input type={type} name={name} value={value} defaultChecked={checked} onChange={alCambiar && ((e) => alCambiar(e.target.checked))}
             className="sr-only" />
      {children ?? value}
    </label>
  )
}

/** Para buscar sin que importen mayúsculas ni tildes. */
const normal = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim()

/**
 * Las opciones como chips. Con `max`, las que siguen quedan detrás de "Ver N más" (lo elegido se ve siempre); con
 * `filtro`, solo las que coinciden. Las que no se ven siguen en el formulario, escondidas con una clase: desmontadas,
 * una elegida que la búsqueda tapó no se mandaría.
 */
function Chips({ name, opciones, elegidos, max, filtro = '' }: {
  name: string; opciones: readonly string[]; elegidos: string[]; max?: number; filtro?: string
}) {
  const [todas, setTodas] = useState(false)
  const [marcadas, setMarcadas] = useState(() => new Set(elegidos))
  const buscar = normal(filtro)
  const ve = (o: string, i: number) => (buscar ? normal(o).includes(buscar) : todas || max === undefined || i < max || marcadas.has(o))
  const escondidas = buscar ? 0 : opciones.filter((o, i) => !ve(o, i)).length
  const marcar = (o: string) => (si: boolean) => setMarcadas((m) => {
    const n = new Set(m)
    if (si) n.add(o)
    else n.delete(o)
    return n
  })
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((o, i) => (
        <Chip key={o} name={name} value={o} checked={elegidos.includes(o)} alCambiar={marcar(o)} className={ve(o, i) ? '' : 'hidden'} />
      ))}
      {escondidas > 0 && (
        <button type="button" onClick={() => setTodas(true)} className="gr-chip border-dashed border-gr-ink/40 font-semibold">
          <Icon name="plus" size={16} strokeWidth={2.4} />Ver {escondidas} más
        </button>
      )}
    </div>
  )
}

function Subtitulo({ children }: { children: ReactNode }) {
  return <p className="gr-label mt-2">{children}</p>
}

/** A dónde vuelve un paso editado solo: a Tus gustos, o a "¡Todo listo!" si se completó desde ahí. */
export type VolverGustos = 'listo' | 'listo-perfil' | null

export function BienvenidaForm({ nombre, nombreCompleto, foto, inicial, cumple, solo, volver = null, pasoInicial = 0, cumpleInvalido = false }: {
  nombre: string
  nombreCompleto: string
  foto: string | null
  inicial: Gustos
  cumple: { dia: number; mes: number } | null
  /** Un solo paso, para editarlo desde Tus gustos: sin barra de pasos, con Guardar y Cancelar. */
  solo?: PasoGustos
  volver?: VolverGustos
  pasoInicial?: number
  /**
   * Volvió porque el cumple no se pudo guardar (falta el día o el mes, o no existe): se avisa en el primer paso. La
   * página le pone una key con esto, así se arma de nuevo en ese paso: cambiar solo la dirección no lo vuelve a montar.
   */
  cumpleInvalido?: boolean
}) {
  const [paso, setPaso] = useState(solo ? PASOS_GUSTOS.indexOf(solo) : Math.min(Math.max(pasoInicial, 0), PASOS.length - 1))
  const [avisoCumple, setAvisoCumple] = useState(cumpleInvalido)
  const [busqueda, setBusqueda] = useState('')
  const [buscaMarca, setBuscaMarca] = useState('')
  const clubPropio = inicial.club && ![...CLUBES, NO_FUTBOL, SOLO_SELECCION].includes(inicial.club) ? inicial.club : null
  const [club, setClub] = useState(clubPropio ? 'otro' : inicial.club ?? '')
  const ultimo = paso === PASOS.length - 1
  const marcasPropias = inicial.marcas.filter((m) => !TODAS_LAS_MARCAS.includes(m))
  const cancelar = volver === 'listo' ? '/bienvenida/listo' : volver === 'listo-perfil' ? '/bienvenida/listo?desde=perfil' : '/perfil/gustos'
  const talles = useRef<HTMLElement>(null)

  // Solo se ve el paso actual (con clase y no con el atributo hidden, que un display de Tailwind pisaría).
  const ver = (i: number, clases = '') => (paso === i ? clases : 'hidden')

  // Las filas de talles se deslizan: al mostrarse, la que tiene un talle elegido lo deja a la vista, al medio.
  useEffect(() => {
    if (PASOS_GUSTOS[paso] !== 'colores') return
    talles.current?.querySelectorAll<HTMLElement>('[role=radiogroup]').forEach((fila) => {
      const elegido = fila.querySelector<HTMLElement>('label:has(:checked)')
      if (elegido) fila.scrollLeft = elegido.offsetLeft - (fila.clientWidth - elegido.offsetWidth) / 2
    })
  }, [paso])

  function ir(n: number) {
    setPaso(n)
    window.scrollTo({ top: 0 })
  }
  // Un cumple a medias no se guardaría: en vez de mandar, vuelve a ese paso a avisar (el aviso estaba solo en el primer
  // paso, escondido, y el usuario se quedaba en el último sin saber por qué). "Más tarde" sale igual: el servidor guarda
  // lo demás y lo lleva a Perfil, con el aviso al lado del cumple.
  function alMandar(e: FormEvent<HTMLFormElement>) {
    if ((e.nativeEvent as SubmitEvent).submitter?.getAttribute('name') === 'corte') return
    const datos = new FormData(e.currentTarget)
    if (!datos.get('dia') !== !datos.get('mes')) {
      e.preventDefault()
      setAvisoCumple(true)
      if (!solo) ir(0)
    }
  }
  // Enter en un campo de texto pasa al paso siguiente en vez de mandar todo el formulario. Editando un paso solo, Enter
  // en una búsqueda no guarda (estaba buscando, no terminó).
  function alApretarEnter(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return
    if (solo ? e.target.type === 'search' : !ultimo) {
      e.preventDefault()
      if (!solo) ir(paso + 1)
    }
  }

  // Sin buscar, los grandes (y el elegido, si es otro); buscando, los que coinciden.
  const clubes = busqueda.trim()
    ? CLUBES.filter((c) => normal(c).includes(normal(busqueda)))
    : CLUBES.filter((c, i) => i < CLUBES_SIN_BUSCAR || c === club)
  const hayMarca = (m: string) => normal(m).includes(normal(buscaMarca))

  return (
    <form action={saveGustosAction} onSubmit={alMandar} onKeyDown={alApretarEnter} className="flex min-h-dvh flex-col gap-5 pb-36 pt-2">
      {solo && <input type="hidden" name="solo" value={solo} />}
      {solo && volver && <input type="hidden" name="volver" value={volver} />}

      {solo ? <PageHeader title="Tus gustos" titulo="p" back={cancelar} backLabel="Cancelar" /> : (
        <div className="flex min-h-14 items-center gap-3">
          <div className="flex flex-1 gap-1" aria-hidden>
            {PASOS.map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= paso ? 'bg-gr-brand' : 'bg-gr-dot'}`} />
            ))}
          </div>
          <span className="text-sm font-medium text-gr-muted tabular-nums">{paso + 1} de {PASOS.length}</span>
          {/* Se puede cortar en cualquier momento: se guarda lo elegido hasta ahí (y no pasa por "¡Todo listo!"). */}
          <BotonEnviar name="corte" value="1" className="min-h-11 flex-none text-[13px] font-semibold">Más tarde</BotonEnviar>
        </div>
      )}

      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex size-12 flex-none items-center justify-center rounded-full bg-gr-accent">
          <Icon name={PASOS[paso].icono} size={24} />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">
            {paso === 0 ? (solo ? 'Tu foto y tu cumple' : `¡Hola, ${nombre}!`) : PASOS[paso].titulo}
          </h1>
          <p className="text-[15px] leading-snug text-gr-muted">{paso === 0 && solo ? 'Así te reconocen y saben cuándo regalarte.' : PASOS[paso].sub}</p>
        </div>
      </div>

      {/* Todos los pasos están en el mismo formulario: los ocultos también se mandan al final. */}
      <section className={ver(0, 'flex flex-col gap-3')}>
        <div className="gr-card flex items-center gap-4 p-4">
          <FotoPerfil nombre={nombreCompleto} foto={foto} size={72} propia />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-base font-semibold">Tu foto</p>
            <p className="text-[13px] leading-snug text-gr-muted">Tocala para subir una. Así te reconocen en sus listas y grupos.</p>
          </div>
        </div>
        <div className="gr-card flex flex-col gap-2.5 p-3.5">
          <p className="text-base font-semibold">¿Cuándo es tu cumple?</p>
          <div className="flex gap-2">
            <CumpleCampos dia={cumple?.dia} mes={cumple?.mes} claseDia="w-[34%]" />
          </div>
          {avisoCumple && (
            <p role="alert" className="text-[13px] font-semibold">Tu cumple no se guardó: elegí el día y el mes, o dejá los dos vacíos.</p>
          )}
          <p className="text-[13px] text-gr-muted">Tu gente lo ve en Eventos, con tiempo para elegir.</p>
        </div>
        {!solo && (
          <ul className="flex flex-col gap-2 px-1 text-[15px]">
            {['Qué deportes y qué cuadro', 'Tus hobbies y tus marcas', 'Colores y talles', 'Lo que no querés ni regalado'].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <Icon name="check" size={16} className="flex-none" />{t}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={ver(1)}>
        <Chips name="deportes" opciones={DEPORTES} elegidos={inicial.deportes} max={POPULARES.deportes} />
      </section>

      <section className={ver(2, 'flex flex-col gap-3')}>
        {/* El club elegido va en un solo campo: la búsqueda puede ocultar el radio marcado. */}
        <input type="hidden" name="club" value={club} />
        <div role="radiogroup" aria-label="Fútbol" className="flex flex-wrap gap-2">
          {[NO_FUTBOL, SOLO_SELECCION].map((o) => (
            <label key={o} className="gr-chip">
              <input type="radio" name="club-ui" value={o} checked={club === o} onChange={() => setClub(o)} className="sr-only" />{o}
            </label>
          ))}
        </div>
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscá tu cuadro"
               aria-label="Buscar club" className="gr-input" />
        <div role="radiogroup" aria-label="Club" className="flex flex-wrap gap-2">
          {clubes.map((c) => (
            <label key={c} className="gr-chip">
              <input type="radio" name="club-ui" value={c} checked={club === c} onChange={() => setClub(c)} className="sr-only" />{c}
            </label>
          ))}
          <label className="gr-chip">
            <input type="radio" name="club-ui" value="otro" checked={club === 'otro'} onChange={() => setClub('otro')} className="sr-only" />Otro
          </label>
        </div>
        {busqueda.trim() && !clubes.length && club !== 'otro' && (
          <p className="text-[13px] text-gr-muted">No lo encontramos: elegí «Otro» y escribilo.</p>
        )}
        {!busqueda.trim() && <p className="text-[13px] text-gr-muted">¿Es otro? Buscalo: están todos los de Primera y muchos más.</p>}
        {club === 'otro' && (
          <input name="clubOtro" defaultValue={clubPropio ?? busqueda} maxLength={40} placeholder="¿Cuál?" aria-label="Otro club" className="gr-input" />
        )}
      </section>

      <section className={ver(3, 'flex flex-col gap-2')}>
        <Chips name="hobbies" opciones={HOBBIES} elegidos={inicial.hobbies} max={POPULARES.hobbies} />
        <Subtitulo>¿Hay mascota?</Subtitulo>
        <Chips name="mascotas" opciones={MASCOTAS} elegidos={inicial.mascotas} />
      </section>

      <section className={ver(4, 'flex flex-col gap-2')}>
        <input type="search" value={buscaMarca} onChange={(e) => setBuscaMarca(e.target.value)} placeholder="Buscá una marca"
               aria-label="Buscar marca" className="gr-input" />
        {MARCAS.map((g) => (
          <div key={g.grupo} className={!buscaMarca.trim() || g.marcas.some(hayMarca) ? 'flex flex-col gap-2' : 'hidden'}>
            <Subtitulo>{g.grupo}</Subtitulo>
            <Chips name="marcas" opciones={g.marcas} elegidos={inicial.marcas} max={POPULARES.marcas} filtro={buscaMarca} />
          </div>
        ))}
        {buscaMarca.trim() && !TODAS_LAS_MARCAS.some(hayMarca) && (
          <p className="mt-1 text-[13px] text-gr-muted">No la tenemos en la lista: escribila acá abajo.</p>
        )}
        <input name="marcasOtras" defaultValue={marcasPropias.join(', ')} maxLength={100}
               placeholder="¿Otra? Escribila (separadas por coma)" aria-label="Otras marcas" className="gr-input mt-1" />
        <Subtitulo>Tu estilo</Subtitulo>
        <Chips name="estilos" opciones={ESTILOS} elegidos={inicial.estilos} />
      </section>

      <section ref={talles} className={ver(5, 'flex flex-col gap-2')}>
        {/* Las muestras grandes: el color se elige mirándolo, no leyendo el nombre */}
        <div className="grid grid-cols-5 gap-x-2 gap-y-3">
          {COLORES.map((c) => (
            <label key={c.nombre} className="group flex cursor-pointer flex-col items-center gap-1.5 text-center">
              <input type="checkbox" name="colores" value={c.nombre} defaultChecked={inicial.colores.includes(c.nombre)} className="sr-only" />
              <span aria-hidden style={{ background: c.hex }}
                    className="relative size-11 rounded-full border border-gr-ink/15 group-has-[:checked]:ring-[3px] group-has-[:checked]:ring-gr-ink group-has-[:checked]:ring-offset-2 group-has-[:checked]:ring-offset-gr-bg group-has-[:focus-visible]:outline-2 group-has-[:focus-visible]:outline-offset-4 group-has-[:focus-visible]:outline-gr-ink">
                <span className="absolute -right-1 -bottom-1 hidden size-5 items-center justify-center rounded-full bg-gr-ink text-gr-bg group-has-[:checked]:flex">
                  <Icon name="check" size={12} strokeWidth={3} />
                </span>
              </span>
              <span className="text-[11.5px] leading-tight font-medium group-has-[:checked]:font-bold">{c.nombre}</span>
            </label>
          ))}
        </div>
        {(['remera', 'pantalon', 'calzado'] as const).map((k) => (
          <div key={k} className="flex flex-col gap-2">
            <Subtitulo>{k === 'remera' ? 'Talle de remera' : k === 'pantalon' ? 'Talle de pantalón' : 'Talle de calzado'}</Subtitulo>
            {/* una fila que se desliza, de borde a borde: los números no ocupan media pantalla */}
            <div role="radiogroup" aria-label={`Talle de ${k === 'pantalon' ? 'pantalón' : k}`}
                 className="relative -mx-[18px] flex snap-x gap-2 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Chip type="radio" name={k} value="" checked={!inicial.talles[k]} className="flex-none snap-start">
                <span aria-label="Sin talle">—</span>
              </Chip>
              {TALLES[k].map((t) => <Chip key={t} type="radio" name={k} value={t} checked={inicial.talles[k] === t} className="min-w-12 flex-none snap-start justify-center" />)}
            </div>
          </div>
        ))}
      </section>

      <section className={ver(6)}>
        <Chips name="bebidas" opciones={BEBIDAS} elegidos={inicial.bebidas} max={POPULARES.bebidas} />
      </section>

      <section className={ver(7, 'flex flex-col gap-2')}>
        <Chips name="noRegalar" opciones={NO_REGALAR} elegidos={inicial.noRegalar} />
        <Subtitulo>¿Algo más que convenga saber?</Subtitulo>
        <textarea name="nota" defaultValue={inicial.nota ?? ''} maxLength={200} rows={3}
                  placeholder="Soy alérgica a la lana, ya tengo mil tazas…" className="gr-input py-3" />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 bg-linear-to-t from-gr-bg from-70% to-transparent">
        <div className="mx-auto flex max-w-md items-center gap-2.5 px-[18px] pb-6 pt-5">
          {solo ? (
            <>
              <Link href={cancelar} className="gr-btn flex-none px-5">Cancelar</Link>
              <BotonEnviar pendiente="Guardando…" className="gr-btn-primary flex-1">Guardar</BotonEnviar>
            </>
          ) : (
            <>
              {paso > 0 && <button type="button" onClick={() => ir(paso - 1)} className="gr-btn flex-none px-5">Atrás</button>}
              {/* keys distintas: si React reusara el mismo <button>, el click en "Siguiente" del anteúltimo paso
                  lo convertiría en submit durante ese mismo click y mandaría el formulario sin mostrar el último paso */}
              {ultimo
                ? <BotonEnviar key="listo" pendiente="Guardando…" className="gr-btn-primary flex-1">¡Listo!</BotonEnviar>
                : <button key="siguiente" type="button" onClick={() => ir(paso + 1)} className="gr-btn-primary flex-1">{paso === 0 ? 'Empezar' : 'Siguiente'}</button>}
            </>
          )}
        </div>
      </div>
    </form>
  )
}
