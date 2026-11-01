'use client'

import { useState } from 'react'
import { GRUPOS_REGLAS, REGLAS, reglaDe, type LoQueTeToca, type Regla } from '@/lib/reglas-invisible'

// Las reglas del amigo invisible en la pantalla (ver lib/reglas-invisible.ts): su ícono, elegir una al armarlo (con cómo
// se juega) y, en el juego, cuál es y lo que te toca a vos.

/** Los íconos de las reglas, con el trazo de los de la app (ver Icon): 24 × 24, línea redondeada. */
const ICONOS: Record<string, React.ReactNode> = {
  'de-tu-casa': <><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /></>,
  'segunda-mano': <><path d="M10 5.5a2 2 0 1 1 2 2v1.5" /><path d="M12 9L3.5 15.5c-.8.6-.4 1.9.6 1.9h15.8c1 0 1.4-1.3.6-1.9z" /></>,
  bazar: <><path d="M3.5 10h17l-1.8 9.2a1 1 0 0 1-1 .8H6.3a1 1 0 0 1-1-.8z" /><path d="M8 10l3-6M16 10l-3-6M9.5 13.5v3M14.5 13.5v3" /></>,
  inicial: <><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M9 16l3-8 3 8M10.1 13.2h3.8" /></>,
  color: <><path d="M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z" /><path d="M9.3 14.5a2.8 2.8 0 0 0 2.2 2.6" /></>,
  palabra: <><path d="M4.5 5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5V16h-1a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><path d="M8 9h8M8 12h5" /></>,
  epoca: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="8.5" cy="11" r="1.7" /><circle cx="15.5" cy="11" r="1.7" /><path d="M10.2 11h3.6M7.5 18l1.2-2.5h6.6L16.5 18" /></>,
  bizarro: <><circle cx="10" cy="8" r="3.3" /><path d="M13.2 8.4h3.3l-2.1 1.7" /><path d="M4 13c0 3.6 3.2 6 8 6s8-2.5 8-5.6c0-1.5-1-2.4-2.4-2.4H12" /></>,
  peor: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 5.5H5.5a3 3 0 0 0 2.8 4M16 5.5h2.5a3 3 0 0 1-2.8 4" /><path d="M12 13v3M9 20h6M10.5 16h3l.5 4h-4z" /><path d="M10.4 7.8l1.6 1 1.6-1" /></>,
  envoltorio: <><rect x="3" y="3" width="18" height="18" rx="3" /><rect x="7" y="7" width="10" height="10" rx="2" /><rect x="10.5" y="10.5" width="3" height="3" rx="1" /></>,
  robo: <><path d="M4 8.5h13.5l-3-3M20 15.5H6.5l3 3" /></>,
  adivina: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5l4.5 4.5" /><path d="M8.6 9a2 2 0 1 1 2.6 1.9c-.5.2-.7.6-.7 1.1v.3" /><path d="M10.5 14.4v.1" /></>,
  tesoro: <><path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" /><path d="M10.5 10.5l3.5 3.5M14 10.5l-3.5 3.5" /></>,
  rima: <><path d="M19.5 4.5c-7.5.5-12 5.2-13 12.5L5 20" /><path d="M7 16.5c4-.8 8-3.7 10.5-9" /></>,
  'hecho-a-mano': <><circle cx="6.5" cy="17" r="2.5" /><circle cx="6.5" cy="7" r="2.5" /><path d="M8.6 8.4L20 18M8.6 15.6L20 6" /></>,
  experiencia: <><path d="M3.5 9V7a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v2a3 3 0 0 0 0 6v2a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-2a3 3 0 0 0 0-6z" /><path d="M13.5 7v1.5M13.5 11.2v1.6M13.5 15.5V17" /></>,
  cuatro: <><rect x="4" y="4" width="7" height="7" rx="1.8" /><rect x="13" y="4" width="7" height="7" rx="1.8" /><rect x="4" y="13" width="7" height="7" rx="1.8" /><rect x="13" y="13" width="7" height="7" rx="1.8" /></>,
}

/** El ícono de una regla, en un círculo del acento suave (el de "Sin regla", un círculo vacío). */
export function IconoRegla({ id, size = 44, className = '' }: { id: string | null; size?: number; className?: string }) {
  return (
    <span aria-hidden className={`flex flex-none items-center justify-center rounded-full bg-gr-acento/15 text-gr-acento-texto ${className}`}
          style={{ width: size, height: size }}>
      <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
           strokeLinecap="round" strokeLinejoin="round">
        {id ? ICONOS[id] : <circle cx="12" cy="12" r="7" strokeDasharray="3 3" />}
      </svg>
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

/**
 * Elegir la regla al armar (o editar) el amigo invisible: opcional. Las reglas por grupo, cada una en su tarjeta (ícono,
 * nombre y una línea) en una fila que se desliza; la elegida se marca y abajo de su fila se explica cómo se juega. Con una
 * que no lleva presupuesto, el formulario lo esconde (data-sin-presupuesto, ver tokens.css). Va en el formulario como
 * "regla" ('' sin regla).
 */
export function ElegirRegla({ inicial }: { inicial: string | null }) {
  const [elegida, setElegida] = useState<string>(reglaDe(inicial)?.id ?? '')
  const regla = reglaDe(elegida)
  const tarjeta = (id: string, nombre: string, corta: string) => {
    const marcada = elegida === id
    return (
      <button key={id || 'ninguna'} type="button" role="radio" aria-checked={marcada} onClick={() => setElegida(marcada && id ? '' : id)}
              className="gr-regla" data-marcada={marcada || undefined}>
        <IconoRegla id={id || null} size={40} />
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
      <p className="-mt-1 text-[13px] leading-snug text-gr-muted">Para jugarlo distinto. Tocá una para ver cómo se juega.</p>
      <div role="radiogroup" aria-label="Regla del amigo invisible" className="flex flex-col gap-4">
        <div className="gr-reglas">{tarjeta('', 'Sin regla', 'Cada uno regala lo que quiera, dentro del presupuesto.')}</div>
        {GRUPOS_REGLAS.map((g) => (
          <div key={g.id} className="flex flex-col gap-2">
            <p className="text-[13px] font-bold">{g.nombre}</p>
            <div className="gr-reglas">{REGLAS.filter((r) => r.grupo === g.id).map((r) => tarjeta(r.id, r.nombre, r.corta))}</div>
            {regla?.grupo === g.id && (
              <section aria-label={`Cómo se juega ${regla.nombre}`} className="gr-card flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <IconoRegla id={regla.id} size={48} />
                  <div className="min-w-0">
                    <p className="gr-label">Cómo se juega</p>
                    <p className="text-[17px] leading-tight font-extrabold">{regla.nombre}</p>
                  </div>
                </div>
                <ComoSeJuega regla={regla} />
              </section>
            )}
          </div>
        ))}
      </div>
    </fieldset>
  )
}

/** En el juego: cuál es la regla, y cómo se juega al tocarla. */
export function ReglaDelJuego({ regla }: { regla: Regla }) {
  return (
    <details className="group gr-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-3.5 [&::-webkit-details-marker]:hidden">
        <IconoRegla id={regla.id} size={44} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="gr-label">La regla</span>
          <span className="text-[16px] leading-tight font-extrabold">{regla.nombre}</span>
          <span className="text-[13px] leading-snug text-gr-muted group-open:hidden">{regla.corta} Tocá para ver cómo se juega.</span>
        </span>
      </summary>
      <div className="px-3.5 pb-4"><ComoSeJuega regla={regla} /></div>
    </details>
  )
}

/** Lo que te toca a vos con la regla, al ver a quién le regalás: la letra, el color, la palabra o la década. */
export function LoQueTeTocaA({ toca, nombre }: { toca: LoQueTeToca; nombre: string }) {
  const [titulo, valor] = toca.tipo === 'inicial' ? [`Tu regalo empieza con la letra de ${nombre}`, toca.letra]
    : toca.tipo === 'color' ? ['Tu color', toca.nombre]
      : toca.tipo === 'palabra' ? ['Tu palabra', `«${toca.palabra}»`]
        : ['Tu década', toca.decada]
  return (
    <p className="flex items-center gap-3 rounded-[18px] bg-gr-soft px-4 py-3">
      {toca.tipo === 'color'
        ? <span aria-hidden className="size-9 flex-none rounded-full border border-gr-line" style={{ background: toca.hex }} />
        : toca.tipo === 'inicial'
          ? <span aria-hidden className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-gr-acento text-[20px] font-black text-gr-on-acento">{toca.letra}</span>
          : null}
      <span className="flex min-w-0 flex-col">
        <span className="text-[12px] font-semibold text-gr-muted">{titulo}</span>
        <span className="text-[17px] leading-tight font-extrabold">{valor}</span>
      </span>
    </p>
  )
}
