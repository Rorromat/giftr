'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { saveGustosAction } from '@/app/actions'
import { FotoPerfil } from '@/components/FotoPerfil'
import { CumpleCampos } from '@/components/CumpleCampos'
import { BotonEnviar } from '@/components/BotonEnviar'
import { IlustracionGusto } from '@/components/IlustracionGusto'
import { Icon, PageHeader } from '@/components/ui'
import { paletaGusto } from '@/lib/colores-gustos'
import {
  BEBIDAS, CLUBES, CLUBES_SIN_BUSCAR, COLORES, DEPORTES, ESTILOS, HOBBIES, MARCAS, MASCOTAS, NO_FUTBOL, NO_REGALAR,
  PASOS_GUSTOS, POPULARES, SOLO_SELECCION, TALLES, TODAS_LAS_MARCAS, fotosDeEstilo, type Gustos, type PasoGustos,
} from '@/lib/gustos'

/** Uno por cada paso de PASOS_GUSTOS, en el mismo orden (cada uno con su color y su ilustración, ver IlustracionGusto). */
const PASOS: { titulo: string; sub: string }[] = [
  { titulo: 'Tu foto y tu cumple', sub: 'Así te reconocen y saben cuándo regalarte.' },
  { titulo: '¿Qué deportes hacés o mirás?', sub: 'Elegí todos los que quieras.' },
  { titulo: '¿De qué cuadro sos?', sub: 'Para la camiseta, el buzo, la taza…' },
  { titulo: '¿Qué te gusta hacer?', sub: 'Hobbies, planes, y si hay mascota en casa.' },
  { titulo: '¿Qué ropa te gusta?', sub: 'Tu estilo y tus marcas.' },
  { titulo: 'Colores y talles', sub: 'Así nadie tiene que ir a cambiar nada.' },
  { titulo: 'Bebidas y antojos', sub: 'Para el regalito de último momento.' },
  { titulo: 'Lo que NO querés', sub: 'Tan importante como lo que sí.' },
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

/**
 * A dónde vuelve un paso al guardarlo (o al cancelar): a Tus gustos; a "¡Todo listo!" si se completó desde ahí; o, si vino
 * de la tarjeta "Contá tus gustos" de Mi lista ('lista'), al próximo paso que falta (cancelar vuelve a Mi lista).
 */
export type VolverGustos = 'listo' | 'listo-perfil' | 'lista' | null

/**
 * Un paso de los gustos (los deportes, los talles…), para editarlo solo: con Guardar y Cancelar. Eran los ocho pasos de la
 * bienvenida, uno atrás del otro antes del primer deseo; ahora la bienvenida es una pantalla (ver /bienvenida) y estos se
 * cuentan de a uno, cuando quiere. Todos van en el mismo formulario (escondidos): guardar uno no borra los demás.
 */
export function BienvenidaForm({ nombreCompleto, foto, inicial, cumple, solo, volver = null, sigue = false, cumpleInvalido = false }: {
  nombreCompleto: string
  foto: string | null
  inicial: Gustos
  cumple: { dia: number; mes: number } | null
  /** El paso que se edita. */
  solo: PasoGustos
  volver?: VolverGustos
  /** Viniendo de Mi lista, si después de este falta otro: el botón dice "Guardar y seguir". */
  sigue?: boolean
  /**
   * Volvió porque el cumple no se pudo guardar (falta el día o el mes, o no existe): se avisa ahí. La página le pone una
   * key con esto, así se arma de nuevo con lo guardado: cambiar solo la dirección no lo vuelve a montar.
   */
  cumpleInvalido?: boolean
}) {
  const paso = PASOS_GUSTOS.indexOf(solo)
  const [avisoCumple, setAvisoCumple] = useState(cumpleInvalido)
  const [busqueda, setBusqueda] = useState('')
  const [buscaMarca, setBuscaMarca] = useState('')
  const clubPropio = inicial.club && ![...CLUBES, NO_FUTBOL, SOLO_SELECCION].includes(inicial.club) ? inicial.club : null
  const [club, setClub] = useState(clubPropio ? 'otro' : inicial.club ?? '')
  const marcasPropias = inicial.marcas.filter((m) => !TODAS_LAS_MARCAS.includes(m))
  const cancelar = volver === 'listo' ? '/bienvenida/listo' : volver === 'listo-perfil' ? '/bienvenida/listo?desde=perfil'
    : volver === 'lista' ? '/mi-lista' : '/perfil/gustos'
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

  // Un cumple a medias no se guardaría: en vez de mandar, avisa (si no, lo demás se guardaba y el cumple no, sin decir nada).
  function alMandar(e: FormEvent<HTMLFormElement>) {
    const datos = new FormData(e.currentTarget)
    if (!datos.get('dia') !== !datos.get('mes')) {
      e.preventDefault()
      setAvisoCumple(true)
    }
  }
  // Enter en una búsqueda no guarda (estaba buscando, no terminó).
  function alApretarEnter(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type === 'search') e.preventDefault()
  }

  // Sin buscar, los grandes (y el elegido, si es otro); buscando, los que coinciden.
  const clubes = busqueda.trim()
    ? CLUBES.filter((c) => normal(c).includes(normal(busqueda)))
    : CLUBES.filter((c, i) => i < CLUBES_SIN_BUSCAR || c === club)
  const hayMarca = (m: string) => normal(m).includes(normal(buscaMarca))

  return (
    <form action={saveGustosAction} onSubmit={alMandar} onKeyDown={alApretarEnter} className="flex min-h-dvh flex-col gap-5 pb-36 pt-2">
      <input type="hidden" name="solo" value={solo} />
      {volver && <input type="hidden" name="volver" value={volver} />}

      <PageHeader title="Tus gustos" titulo="p" back={cancelar} backLabel="Cancelar" />

      {/* el cartel del paso, con su color y su ilustración */}
      <div className="relative flex min-h-[148px] flex-col justify-center gap-1.5 overflow-hidden rounded-gr-xl py-5 pl-5 pr-[124px] text-white shadow-card"
           style={{ background: paletaGusto(PASOS_GUSTOS[paso]).fondo }}>
        <IlustracionGusto paso={PASOS_GUSTOS[paso]} size={140} className="absolute -right-3 top-1/2 -translate-y-1/2" />
        <h1 className="text-[26px] leading-[1.08] font-semibold tracking-[-0.02em]">{PASOS[paso].titulo}</h1>
        <p className="text-sm leading-snug text-white/85">{PASOS[paso].sub}</p>
      </div>

      {/* Todos los pasos están en el mismo formulario: los ocultos también se mandan (ver gustosDesdeForm). */}
      <section className={ver(0, 'flex flex-col gap-3')}>
        <div className="gr-card flex items-center gap-4 p-4">
          <FotoPerfil nombre={nombreCompleto} foto={foto} size={72} propia />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-base font-semibold">Tu foto</p>
            <p className="text-[13px] leading-snug text-gr-muted">Tocala para subir una. Así te reconocen en sus listas y en las listas en común.</p>
          </div>
        </div>
        <div className="gr-card flex flex-col gap-2.5 p-3.5">
          <p className="text-base font-semibold">¿Cuándo es tu cumple?</p>
          <div className="flex gap-2">
            <CumpleCampos dia={cumple?.dia} mes={cumple?.mes} claseDia="w-[34%]" error={avisoCumple ? 'cumple-error' : undefined} />
          </div>
          {avisoCumple && (
            <p id="cumple-error" role="alert" className="text-[13px] font-semibold">Tu cumple no se guardó: elegí el día y el mes, o dejá los dos vacíos.</p>
          )}
          <p className="text-[13px] text-gr-muted">Tu gente lo ve en Todo el año, con tiempo para elegir.</p>
        </div>
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
        {/* el estilo se elige mirando: fotos de ejemplo de cada uno, una de mujer y una de hombre que se van alternando (cada
            tarjeta a su tiempo, ver .gr-alternar) */}
        <Subtitulo>Tu estilo</Subtitulo>
        <div className="grid grid-cols-3 gap-2">
          {ESTILOS.map((e, i) => (
            <label key={e} className="group relative aspect-[3/4] cursor-pointer overflow-hidden rounded-gr-md bg-gr-soft has-[:checked]:ring-[3px] has-[:checked]:ring-gr-ink has-[:checked]:ring-offset-2 has-[:checked]:ring-offset-gr-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-gr-ink">
              <input type="checkbox" name="estilos" value={e} defaultChecked={inicial.estilos.includes(e)} className="sr-only" />
              {fotosDeEstilo(e).map((src, j) => (
                // eslint-disable-next-line @next/next/no-img-element -- fotos propias de public/, ya del tamaño justo
                <img key={src} src={src} alt="" width={360} height={480} style={j ? { animationDelay: `${-1.7 * i}s` } : undefined}
                     className={`size-full object-cover ${j ? 'gr-alternar absolute inset-0' : ''}`} />
              ))}
              <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 to-transparent px-2.5 pb-2 pt-8 text-sm font-semibold text-white">{e}</span>
              <span className="absolute right-1.5 top-1.5 hidden size-6 items-center justify-center rounded-full bg-gr-acento text-gr-on-acento group-has-[:checked]:flex">
                <Icon name="check" size={14} strokeWidth={3} />
              </span>
            </label>
          ))}
        </div>
        <Subtitulo>Tus marcas</Subtitulo>
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

      {/* el mismo marco y la misma columna que la página (ver tokens.css), al lado de la barra del costado si la hay */}
      <div className="fixed right-0 bottom-0 left-(--gr-lateral) z-10 bg-linear-to-t from-gr-bg from-70% to-transparent">
        <div className="gr-marco">
          <div className="gr-lectura flex items-center gap-2.5 pb-6 pt-5">
            <Link href={cancelar} className="gr-btn flex-none px-5">Cancelar</Link>
            <BotonEnviar pendiente="Guardando…" className="gr-btn-primary flex-1">{volver === 'lista' && sigue ? 'Guardar y seguir' : 'Guardar'}</BotonEnviar>
          </div>
        </div>
      </div>
    </form>
  )
}
