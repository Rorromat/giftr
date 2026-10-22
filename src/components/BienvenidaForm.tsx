'use client'

import Link from 'next/link'
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { saveGustosAction } from '@/app/actions'
import { FotoPerfil } from '@/components/FotoPerfil'
import { CumpleCampos } from '@/components/CumpleCampos'
import { BotonEnviar } from '@/components/BotonEnviar'
import { Icon, type IconName } from '@/components/ui'
import {
  BEBIDAS, CLUBES, COLORES, DEPORTES, ESTILOS, HOBBIES, MARCAS, MASCOTAS, NO_FUTBOL, NO_REGALAR, SOLO_SELECCION, TALLES,
  TODAS_LAS_MARCAS, type Gustos,
} from '@/lib/gustos'

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

export function BienvenidaForm({ nombre, nombreCompleto, foto, inicial, cumple, editar, pasoInicial = 0, cumpleInvalido = false }: {
  nombre: string
  nombreCompleto: string
  foto: string | null
  inicial: Gustos
  cumple: { dia: number; mes: number } | null
  editar: boolean
  pasoInicial?: number
  /**
   * Volvió porque el cumple no se pudo guardar (falta el día o el mes, o no existe): se avisa en el primer paso. La
   * página le pone una key con esto, así se arma de nuevo en ese paso: cambiar solo la dirección no lo vuelve a montar.
   */
  cumpleInvalido?: boolean
}) {
  const [paso, setPaso] = useState(Math.min(Math.max(pasoInicial, 0), PASOS.length - 1))
  const [avisoCumple, setAvisoCumple] = useState(cumpleInvalido)
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
  // Un cumple a medias no se guardaría: en vez de mandar, vuelve a ese paso a avisar (el aviso estaba solo en el primer
  // paso, escondido, y el usuario se quedaba en el último sin saber por qué). "Más tarde" sale igual: el servidor guarda
  // lo demás y lo lleva a Perfil, con el aviso al lado del cumple.
  function alMandar(e: FormEvent<HTMLFormElement>) {
    if ((e.nativeEvent as SubmitEvent).submitter?.getAttribute('name') === 'corte') return
    const datos = new FormData(e.currentTarget)
    if (!datos.get('dia') !== !datos.get('mes')) {
      e.preventDefault()
      setAvisoCumple(true)
      ir(0)
    }
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
    <form action={saveGustosAction} onSubmit={alMandar} onKeyDown={alApretarEnter} className="flex min-h-[calc(100dvh-52px)] flex-col gap-4 pb-36">
      {editar && <input type="hidden" name="volver" value="perfil" />}

      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden>
          {PASOS.map((_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full border-2 border-gr-ink ${i <= paso ? 'bg-gr-ink' : 'bg-gr-surface'}`} />
          ))}
        </div>
        <span className="text-sm font-bold tabular-nums">{paso + 1} de {PASOS.length}</span>
        {/* Se puede cortar en cualquier momento: se guarda lo elegido hasta ahí (y no pasa por "¡Todo listo!"). */}
        <BotonEnviar name="corte" value="1" className="min-h-11 flex-none text-[13px] font-bold underline underline-offset-4">
          {editar ? 'Guardar' : 'Más tarde'}
        </BotonEnviar>
      </div>

      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex size-12 flex-none -rotate-6 items-center justify-center rounded-2xl border-[3px] border-gr-ink bg-gr-accent shadow-sticker-sm">
          <Icon name={PASOS[paso].icono} size={26} strokeWidth={2.4} />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[34px] leading-[0.95] font-extrabold tracking-[-0.04em]">
            {paso === 0 ? `¡Hola, ${nombre}!` : PASOS[paso].titulo}
          </h1>
          <p className="text-[15px] font-medium leading-snug">{PASOS[paso].sub}</p>
        </div>
      </div>

      {/* Todos los pasos están en el mismo formulario: los ocultos también se mandan al final. */}
      <section className={ver(0, 'flex flex-col gap-3')}>
        <div className="gr-sticker flex items-center gap-4 p-3.5">
          <FotoPerfil nombre={nombreCompleto} foto={foto} size={72} propia />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="font-display text-lg font-extrabold">Tu foto</p>
            <p className="text-[13px] font-medium leading-snug">Tocala para subir una. Así te reconocen en sus listas y grupos.</p>
          </div>
        </div>
        <div className="gr-sticker flex flex-col gap-2.5 p-3.5">
          <p className="font-display text-lg font-extrabold">¿Cuándo es tu cumple?</p>
          <div className="flex gap-2">
            <CumpleCampos dia={cumple?.dia} mes={cumple?.mes} claseDia="w-[34%]" />
          </div>
          {avisoCumple && (
            <p role="alert" className="text-[13px] font-semibold">Tu cumple no se guardó: elegí el día y el mes, o dejá los dos vacíos.</p>
          )}
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
              <span aria-hidden className="size-4 rounded-full border-2 border-current" style={{ background: c.hex }} />{c.nombre}
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
          {/* keys distintas: si React reusara el mismo <button>, el click en "Siguiente" del anteúltimo paso
              lo convertiría en submit durante ese mismo click y mandaría el formulario sin mostrar el último paso */}
          {ultimo
            ? <BotonEnviar key="listo" pendiente="Guardando…" className="gr-btn-primary gr-btn--sm flex-1">{editar ? 'Guardar' : '¡Listo!'}</BotonEnviar>
            : <button key="siguiente" type="button" onClick={() => ir(paso + 1)} className="gr-btn-primary gr-btn--sm flex-1">{paso === 0 && !editar ? 'Empezar' : 'Siguiente'}</button>}
        </div>
      </div>
    </form>
  )
}
