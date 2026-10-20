'use client'

import Link from 'next/link'
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { saveGustosAction } from '@/app/actions'
import {
  BEBIDAS, CLUBES, COLORES, DEPORTES, ESTILOS, HOBBIES, MARCAS, MASCOTAS, NO_FUTBOL, NO_REGALAR, SOLO_SELECCION, TALLES,
  TODAS_LAS_MARCAS, type Gustos,
} from '@/lib/gustos'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const PASOS = [
  { titulo: '', sub: 'Contanos un poco de vos así tu gente acierta. Son dos minutos y lo podés cambiar cuando quieras.' },
  { titulo: '¿Qué deportes hacés o mirás?', sub: 'Elegí todos los que quieras.' },
  { titulo: '¿De qué cuadro sos?', sub: 'Para la camiseta, el buzo, la taza…' },
  { titulo: '¿Qué te gusta hacer?', sub: 'Hobbies, planes, y si hay mascota en casa.' },
  { titulo: '¿Qué ropa te gusta?', sub: 'Tus marcas y tu estilo.' },
  { titulo: 'Colores y talles', sub: 'Así nadie tiene que ir a cambiar nada.' },
  { titulo: 'Bebidas y antojos', sub: 'Para el regalito de último momento.' },
  { titulo: 'Lo que NO querés', sub: 'Tan importante como lo que sí.' },
]

function Chip({ name, value, checked, type = 'checkbox', children }: {
  name: string; value: string; checked: boolean; type?: 'checkbox' | 'radio'; children?: ReactNode
}) {
  return (
    <label className="gr-chip gap-1.5 has-[:checked]:-rotate-2">
      <input type={type} name={name} value={value} defaultChecked={checked} className="sr-only" />
      {children ?? value}
    </label>
  )
}

function Chips({ name, opciones, elegidos }: { name: string; opciones: readonly string[]; elegidos: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((o) => <Chip key={o} name={name} value={o} checked={elegidos.includes(o)} />)}
    </div>
  )
}

function Subtitulo({ children }: { children: ReactNode }) {
  return <p className="gr-label mt-2">{children}</p>
}

export function BienvenidaForm({ nombre, inicial, cumple, editar }: {
  nombre: string
  inicial: Gustos
  cumple: { dia: number; mes: number } | null
  editar: boolean
}) {
  const [paso, setPaso] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const clubPropio = inicial.club && ![...CLUBES, NO_FUTBOL, SOLO_SELECCION].includes(inicial.club) ? inicial.club : null
  const [club, setClub] = useState(clubPropio ? 'otro' : inicial.club ?? '')
  const ultimo = paso === PASOS.length - 1
  const marcasPropias = inicial.marcas.filter((m) => !TODAS_LAS_MARCAS.includes(m))

  // Solo se ve el paso actual (con clase y no con el atributo hidden, que un display de Tailwind pisaría).
  const ver = (i: number, clases = '') => (paso === i ? clases : 'hidden')

  function ir(n: number) {
    setPaso(n)
    window.scrollTo({ top: 0 })
  }
  // Enter en un campo de texto pasa al paso siguiente en vez de mandar todo el formulario.
  function alApretarEnter(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && !ultimo) {
      e.preventDefault()
      ir(paso + 1)
    }
  }

  const clubes = CLUBES.filter((c) => c.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .includes(busqueda.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')))

  return (
    <form action={saveGustosAction} onKeyDown={alApretarEnter} className="flex min-h-[calc(100dvh-52px)] flex-col gap-4 pb-36">
      {editar && <input type="hidden" name="volver" value="perfil" />}

      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden>
          {PASOS.map((_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full border-2 border-gr-ink ${i <= paso ? 'bg-gr-ink' : 'bg-gr-surface'}`} />
          ))}
        </div>
        <span className="text-sm font-bold tabular-nums">{paso + 1} de {PASOS.length}</span>
        {/* Se puede cortar en cualquier momento: se guarda lo elegido hasta ahí. */}
        <button className="min-h-11 flex-none text-[13px] font-bold underline underline-offset-4">
          {editar ? 'Guardar' : 'Más tarde'}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[34px] leading-[0.95] font-extrabold tracking-[-0.04em]">
          {paso === 0 ? `¡Hola, ${nombre}!` : PASOS[paso].titulo}
        </h1>
        <p className="text-[15px] font-medium leading-snug">{PASOS[paso].sub}</p>
      </div>

      {/* Todos los pasos están en el mismo formulario: los ocultos también se mandan al final. */}
      <section className={ver(0, 'flex flex-col gap-3')}>
        <div className="gr-sticker flex flex-col gap-2.5 p-3.5">
          <p className="font-display text-lg font-extrabold">¿Cuándo es tu cumple?</p>
          <div className="flex gap-2">
            <select name="dia" aria-label="Día" defaultValue={cumple?.dia ?? ''} className="gr-input w-[34%] min-w-0">
              <option value="">Día</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select name="mes" aria-label="Mes" defaultValue={cumple?.mes ?? ''} className="gr-input min-w-0 flex-1">
              <option value="">Mes</option>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <p className="text-[13px] font-medium text-gr-muted">Tu gente lo ve en Eventos, con tiempo para elegir.</p>
        </div>
        <ul className="flex flex-col gap-2 text-[15px] font-medium">
          {['Qué deportes y qué cuadro', 'Tus hobbies y tus marcas', 'Colores y talles', 'Lo que no querés ni regalado'].map((t) => (
            <li key={t} className="flex items-center gap-2.5">
              <span className="size-2.5 flex-none rotate-45 bg-gr-ink" />{t}
            </li>
          ))}
        </ul>
      </section>

      <section className={ver(1)}>
        <Chips name="deportes" opciones={DEPORTES} elegidos={inicial.deportes} />
      </section>

      <section className={ver(2, 'flex flex-col gap-3')}>
        {/* El club elegido va en un solo campo: la búsqueda puede ocultar el radio marcado. */}
        <input type="hidden" name="club" value={club} />
        <div role="radiogroup" aria-label="Fútbol" className="flex flex-wrap gap-2">
          {[NO_FUTBOL, SOLO_SELECCION].map((o) => (
            <label key={o} className="gr-chip has-[:checked]:-rotate-2">
              <input type="radio" name="club-ui" value={o} checked={club === o} onChange={() => setClub(o)} className="sr-only" />{o}
            </label>
          ))}
        </div>
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscá tu cuadro"
               aria-label="Buscar club" className="gr-input" />
        <div role="radiogroup" aria-label="Club" className="flex flex-wrap gap-2">
          {clubes.map((c) => (
            <label key={c} className="gr-chip has-[:checked]:-rotate-2">
              <input type="radio" name="club-ui" value={c} checked={club === c} onChange={() => setClub(c)} className="sr-only" />{c}
            </label>
          ))}
          <label className="gr-chip has-[:checked]:-rotate-2">
            <input type="radio" name="club-ui" value="otro" checked={club === 'otro'} onChange={() => setClub('otro')} className="sr-only" />Otro
          </label>
        </div>
        {club === 'otro' && (
          <input name="clubOtro" defaultValue={clubPropio ?? busqueda} maxLength={40} placeholder="¿Cuál?" aria-label="Otro club" className="gr-input" />
        )}
      </section>

      <section className={ver(3, 'flex flex-col gap-2')}>
        <Chips name="hobbies" opciones={HOBBIES} elegidos={inicial.hobbies} />
        <Subtitulo>¿Hay mascota?</Subtitulo>
        <Chips name="mascotas" opciones={MASCOTAS} elegidos={inicial.mascotas} />
      </section>

      <section className={ver(4, 'flex flex-col gap-2')}>
        {MARCAS.map((g) => (
          <div key={g.grupo} className="flex flex-col gap-2">
            <Subtitulo>{g.grupo}</Subtitulo>
            <Chips name="marcas" opciones={g.marcas} elegidos={inicial.marcas} />
          </div>
        ))}
        <input name="marcasOtras" defaultValue={marcasPropias.join(', ')} maxLength={100}
               placeholder="¿Otra? Escribila (separadas por coma)" aria-label="Otras marcas" className="gr-input mt-1" />
        <Subtitulo>Tu estilo</Subtitulo>
        <Chips name="estilos" opciones={ESTILOS} elegidos={inicial.estilos} />
      </section>

      <section className={ver(5, 'flex flex-col gap-2')}>
        <div className="flex flex-wrap gap-2">
          {COLORES.map((c) => (
            <Chip key={c.nombre} name="colores" value={c.nombre} checked={inicial.colores.includes(c.nombre)}>
              <span aria-hidden className="size-4 rounded-full border-2 border-gr-ink" style={{ background: c.hex }} />{c.nombre}
            </Chip>
          ))}
        </div>
        {(['remera', 'pantalon', 'calzado'] as const).map((k) => (
          <div key={k} className="flex flex-col gap-2">
            <Subtitulo>{k === 'remera' ? 'Talle de remera' : k === 'pantalon' ? 'Talle de pantalón' : 'Talle de calzado'}</Subtitulo>
            <div role="radiogroup" aria-label={`Talle de ${k === 'pantalon' ? 'pantalón' : k}`} className="flex flex-wrap gap-2">
              <Chip type="radio" name={k} value="" checked={!inicial.talles[k]}>—</Chip>
              {TALLES[k].map((t) => <Chip key={t} type="radio" name={k} value={t} checked={inicial.talles[k] === t} />)}
            </div>
          </div>
        ))}
      </section>

      <section className={ver(6)}>
        <Chips name="bebidas" opciones={BEBIDAS} elegidos={inicial.bebidas} />
      </section>

      <section className={ver(7, 'flex flex-col gap-2')}>
        <Chips name="noRegalar" opciones={NO_REGALAR} elegidos={inicial.noRegalar} />
        <Subtitulo>¿Algo más que convenga saber?</Subtitulo>
        <textarea name="nota" defaultValue={inicial.nota ?? ''} maxLength={200} rows={3}
                  placeholder="Soy alérgica a la lana, ya tengo mil tazas…" className="gr-input py-3" />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t-[3px] border-gr-ink bg-gr-bg">
        <div className="mx-auto flex max-w-md items-center gap-2.5 px-[18px] pb-6 pt-3">
          {paso > 0
            ? <button type="button" onClick={() => ir(paso - 1)} className="gr-btn gr-btn--sm flex-none px-4 font-sans font-bold">Atrás</button>
            : editar && <Link href="/perfil" className="gr-btn gr-btn--sm flex-none px-4 font-sans font-bold">Cancelar</Link>}
          {ultimo
            ? <button className="gr-btn-primary gr-btn--sm flex-1">{editar ? 'Guardar' : '¡Listo!'}</button>
            : <button type="button" onClick={() => ir(paso + 1)} className="gr-btn-primary gr-btn--sm flex-1">{paso === 0 && !editar ? 'Empezar' : 'Siguiente'}</button>}
        </div>
      </div>
    </form>
  )
}
