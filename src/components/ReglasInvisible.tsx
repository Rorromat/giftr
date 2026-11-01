'use client'

import { useState } from 'react'
import { IlustracionRegla } from '@/components/IlustracionRegla'
import { GRUPOS_REGLAS, LARGO_REGLA_PROPIA, REGLAS, leerRegla, reglaDe, type LoQueTeToca, type Regla, type ReglaElegida } from '@/lib/reglas-invisible'

// Las reglas del amigo invisible en la pantalla (ver lib/reglas-invisible.ts): su dibujo, elegir una al armarlo (o
// escribir una propia), con cómo se juega, y en el juego cuál es y lo que te toca a vos.

/** El dibujo de una regla en su recuadro ('propia', o null: sin regla). */
export function IconoRegla({ id, size = 56, className = '' }: { id: string | null; size?: number; className?: string }) {
  return (
    <span aria-hidden className={`flex flex-none items-center justify-center rounded-[16px] bg-gr-soft ${className}`} style={{ width: size, height: size }}>
      <IlustracionRegla id={id ?? 'sin'} size={size * 0.86} />
    </span>
  )
}

/** Cómo se juega una regla: los pasos numerados y, si cambia algo, qué. */
export function ComoSeJuega({ regla }: { regla: Regla }) {
  const notas = [
    regla.sinPresupuesto && 'No lleva presupuesto',
    regla.personal === 'inicial' && 'GiftR le muestra a cada uno la letra',
    regla.personal === 'color' && 'GiftR le da a cada uno su color',
    regla.personal === 'palabra' && 'GiftR le da a cada uno su palabra',
    regla.personal === 'decada' && 'GiftR le da a cada uno su década',
    regla.id === 'robo' && 'GiftR sortea el orden de los turnos',
  ].filter(Boolean) as string[]
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2.5">
        {regla.como.map((paso, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[14px] leading-snug">
            <span aria-hidden className="flex size-6 flex-none items-center justify-center rounded-full bg-gr-acento text-[12px] font-bold text-gr-on-acento">
              {i + 1}
            </span>
            <span className="pt-0.5">{paso}</span>
          </li>
        ))}
      </ol>
      {notas.length > 0 && (
        <p className="flex flex-wrap gap-1.5">
          {notas.map((n) => <span key={n} className="rounded-full bg-gr-soft px-2.5 py-1 text-[12px] font-semibold">{n}</span>)}
        </p>
      )}
    </div>
  )
}

/** El recuadro de "Cómo se juega" de la elegida: su dibujo grande, el nombre y lo de adentro. */
function Explicacion({ id, nombre, children }: { id: string; nombre: string; children: React.ReactNode }) {
  return (
    <section aria-label={`Cómo se juega ${nombre}`} className="gr-card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <IconoRegla id={id} size={64} />
        <div className="min-w-0">
          <p className="gr-label">Cómo se juega</p>
          <p className="text-[18px] leading-tight font-extrabold">{nombre}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

/**
 * Elegir la regla al armar (o editar) el amigo invisible: opcional. Arriba, sin regla o una propia (que se escribe); abajo,
 * las de cada grupo, cada una en su tarjeta (dibujo, nombre y una línea) en una fila que se desliza. La elegida se marca y
 * abajo de su fila se explica cómo se juega. Con una que no lleva presupuesto, el formulario lo esconde
 * (data-sin-presupuesto, ver tokens.css). Va en el formulario como "regla" ('' sin regla, 'propia' con "reglaPropia").
 * inicial: la que tiene, como se guarda (ver leerRegla).
 */
export function ElegirRegla({ inicial }: { inicial: string | null }) {
  const guardada = leerRegla(inicial)
  const [elegida, setElegida] = useState<string>(guardada?.tipo === 'propia' ? 'propia' : guardada?.regla.id ?? '')
  const regla = reglaDe(elegida)
  const tarjeta = (id: string, nombre: string, corta: string) => {
    const marcada = elegida === id
    return (
      <button key={id || 'ninguna'} type="button" role="radio" aria-checked={marcada} onClick={() => setElegida(marcada && id ? '' : id)}
              className="gr-regla" data-marcada={marcada || undefined}>
        <IconoRegla id={id || null} />
        <span className="text-[14px] leading-tight font-bold">{nombre}</span>
        <span className="text-[12px] leading-snug text-gr-muted">{corta}</span>
      </button>
    )
  }
  return (
    // min-w-0: un fieldset se estira a lo que mide la fila de tarjetas (y lo de abajo se saldría de la pantalla)
    <fieldset className="flex min-w-0 flex-col gap-3" data-sin-presupuesto={regla?.sinPresupuesto || undefined}>
      <legend className="gr-label mb-1">¿Con alguna regla? (opcional)</legend>
      <input type="hidden" name="regla" value={elegida} />
      <p className="-mt-1 text-[13px] leading-snug text-gr-muted">Para jugarlo distinto. Tocá una para ver cómo se juega, o escribí la de ustedes.</p>
      <div role="radiogroup" aria-label="Regla del amigo invisible" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="gr-reglas">
            {tarjeta('', 'Sin regla', 'Cada uno regala lo que quiera, dentro del presupuesto.')}
            {tarjeta('propia', 'Una propia', 'Escribí la regla de ustedes y cómo se juega.')}
          </div>
          {elegida === 'propia' && (
            <Explicacion id="propia" nombre="Una regla propia">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">La regla y cómo se juega</span>
                <textarea name="reglaPropia" rows={4} maxLength={LARGO_REGLA_PROPIA} required
                          defaultValue={guardada?.tipo === 'propia' ? guardada.texto : ''} className="gr-input"
                          placeholder="Ej.: Todo tiene que ser verde. Se abren en ronda y cada uno adivina quién le regaló." />
              </label>
              <p className="text-[12px] leading-snug text-gr-muted">La ven todos los que juegan, en el amigo invisible.</p>
            </Explicacion>
          )}
        </div>
        {GRUPOS_REGLAS.map((g) => (
          <div key={g.id} className="flex flex-col gap-2">
            <p className="text-[13px] font-bold">{g.nombre}</p>
            <div className="gr-reglas">{REGLAS.filter((r) => r.grupo === g.id).map((r) => tarjeta(r.id, r.nombre, r.corta))}</div>
            {regla?.grupo === g.id && <Explicacion id={regla.id} nombre={regla.nombre}><ComoSeJuega regla={regla} /></Explicacion>}
          </div>
        ))}
      </div>
    </fieldset>
  )
}

/** En el juego: cuál es la regla (de las de acá o la propia), y cómo se juega al tocarla. */
export function ReglaDelJuego({ regla }: { regla: ReglaElegida }) {
  const [id, nombre, corta] = regla.tipo === 'propia' ? ['propia', 'Una regla propia', 'La que pusieron para este amigo invisible.']
    : [regla.regla.id, regla.regla.nombre, regla.regla.corta]
  return (
    <details className="group gr-card" open={regla.tipo === 'propia'}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-3.5 [&::-webkit-details-marker]:hidden">
        <IconoRegla id={id} size={56} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="gr-label">La regla</span>
          <span className="text-[17px] leading-tight font-extrabold">{nombre}</span>
          <span className="text-[13px] leading-snug text-gr-muted group-open:hidden">{corta} Tocá para ver cómo se juega.</span>
        </span>
      </summary>
      <div className="px-3.5 pb-4">
        {regla.tipo === 'propia'
          ? <p className="whitespace-pre-line text-[15px] leading-snug [overflow-wrap:anywhere]">{regla.texto}</p>
          : <ComoSeJuega regla={regla.regla} />}
      </div>
    </details>
  )
}

/**
 * Lo que te toca a vos con la regla, al ver a quién le regalás: la letra, el color (con cómo se ve), la palabra o la
 * década. nombre: el de a quién le regalás.
 */
export function LoQueTeTocaA({ toca, nombre, className = '' }: { toca: LoQueTeToca; nombre: string; className?: string }) {
  const [titulo, valor] = toca.tipo === 'inicial' ? [`Tu regalo empieza con la letra de ${nombre}`, `«${toca.letra}»`]
    : toca.tipo === 'color' ? ['Tu color: todo el regalo de este color', toca.nombre]
      : toca.tipo === 'palabra' ? ['Tu palabra: tu regalo la tiene que contar', `«${toca.palabra}»`]
        : ['Tu década: algo de esa época', toca.decada]
  return (
    <p className={`flex items-center gap-3 rounded-[18px] bg-gr-surface px-3.5 py-3 text-left text-gr-ink ${className}`}>
      {toca.tipo === 'color'
        ? <span aria-hidden className="size-11 flex-none rounded-full border-2 border-gr-line" style={{ background: toca.hex }} />
        : toca.tipo === 'inicial'
          ? <span aria-hidden className="flex size-11 flex-none items-center justify-center rounded-[12px] bg-gr-acento text-[24px] font-black text-gr-on-acento">{toca.letra}</span>
          : <IconoRegla id={toca.tipo === 'palabra' ? 'palabra' : 'epoca'} size={44} />}
      <span className="flex min-w-0 flex-col">
        <span className="text-[12px] leading-snug font-semibold text-gr-muted">{titulo}</span>
        <span className="text-[18px] leading-tight font-extrabold">{valor}</span>
      </span>
    </p>
  )
}

/** En "Robo de regalos": en qué turno abrís (o robás), de cuántos. */
export function TuTurno({ turno, de, className = '' }: { turno: number; de: number; className?: string }) {
  return (
    <p className={`flex items-center gap-3 rounded-[18px] bg-gr-surface px-3.5 py-3 text-left text-gr-ink ${className}`}>
      <span aria-hidden className="flex size-11 flex-none items-center justify-center rounded-full bg-gr-acento text-[20px] font-black text-gr-on-acento">{turno}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[12px] leading-snug font-semibold text-gr-muted">Robo de regalos: tu turno para abrir o robar</span>
        <span className="text-[18px] leading-tight font-extrabold">{turno === 1 ? 'Arrancás vos' : `${turno}º de ${de}`}{turno === 1 && ` · de ${de}`}</span>
      </span>
    </p>
  )
}
