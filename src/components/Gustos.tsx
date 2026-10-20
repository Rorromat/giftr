import type { SeccionGustos } from '@/lib/gustos'
import { Icon } from '@/components/ui'

/** Los gustos por sección, como etiquetas chicas (no se tocan). */
export function SeccionesGustos({ secciones }: { secciones: SeccionGustos[] }) {
  return (
    <dl className="flex flex-col gap-2.5">
      {secciones.map((s) => (
        <div key={s.titulo} className="flex flex-col gap-1.5">
          <dt className="text-xs font-bold uppercase tracking-wide text-gr-muted">{s.titulo}</dt>
          <dd className="flex flex-wrap gap-1.5">
            {s.items.map((i) => (
              <span key={i} className="rounded-full border-2 border-gr-ink bg-gr-surface px-2.5 py-0.5 text-[13px] font-semibold [overflow-wrap:anywhere]">{i}</span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Un adelanto de una línea: "River Plate · Pádel · Mate · Talle M". */
export const adelantoGustos = (secciones: SeccionGustos[]) =>
  secciones.filter((s) => !['Algo más', 'No le regales', 'No me regalen'].includes(s.titulo)).flatMap((s) => s.items).slice(0, 5).join(' · ')

/** Para quien regala: "Gustos de Euge", desplegable. */
export function GustosDe({ nombre, secciones }: { nombre: string; secciones: SeccionGustos[] }) {
  return (
    <details className="gr-sticker group">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="flex size-9 flex-none -rotate-6 items-center justify-center rounded-xl border-[2.5px] border-gr-ink bg-gr-accent font-display text-lg font-extrabold">♥</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-lg leading-tight font-extrabold">Gustos de {nombre}</span>
          <span className="truncate text-[13px] font-medium">{adelantoGustos(secciones)}</span>
        </span>
        <Icon name="chevron" size={18} strokeWidth={2.6} className="flex-none transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t-[2.5px] border-dashed border-gr-ink p-3.5">
        <SeccionesGustos secciones={secciones} />
      </div>
    </details>
  )
}
