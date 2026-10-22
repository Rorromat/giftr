import { BotonEnviar } from '@/components/BotonEnviar'
import { CampoLink } from '@/components/CamposDeseo'
import { FotoField } from '@/components/FotoField'
import { QueQueres } from '@/components/QueQueres'
import { Hearts, Icon, PRIORIDADES } from '@/components/ui'
import { CANTIDAD_MAXIMA, LARGO } from '@/lib/limites'
import type { OwnerItemView } from '@/lib/serialize'

const CATEGORIAS = ['Tecnología', 'Casa', 'Ropa', 'Libros', 'Experiencias', 'Hobbies']

/**
 * El formulario de un deseo: vacío para agregar, o con lo cargado para editar (`deseo`). Arriba lo que más ayuda a
 * acertar (qué es, la foto, el precio); lo demás, en "Más detalles" (abierto al editar).
 */
export function DeseoForm({ action, deseo, grupos = [], grupoElegido, boton }: {
  action: (formData: FormData) => Promise<void>
  deseo?: OwnerItemView
  /** Solo al agregar, si tiene grupos: en qué lista va. */
  grupos?: { id: string; nombre: string }[]
  grupoElegido?: string
  boton: string
}) {
  return (
    <form action={action} className="group/deseo mt-3.5 flex flex-col gap-4">
      {deseo && <input type="hidden" name="itemId" value={deseo.id} />}
      {grupos.length > 0 && (
        <div className="flex flex-col gap-2">
          <span id="lista-label" className="gr-label">¿En qué lista?</span>
          <div role="radiogroup" aria-labelledby="lista-label" className="flex flex-wrap gap-2">
            <label className="gr-chip">
              <input type="radio" name="listaId" value="" defaultChecked={!grupoElegido} className="sr-only" />Mi lista
            </label>
            {grupos.map((g) => (
              <label key={g.id} className="gr-chip">
                <input type="radio" name="listaId" value={g.id} defaultChecked={grupoElegido === g.id} className="sr-only" />{g.nombre}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="gr-sticker flex flex-col gap-3.5 p-3.5">
        <QueQueres defaultValue={deseo?.titulo} agregando={!deseo} />
        <FotoField inicial={deseo?.fotoUrl} />
      </div>

      <div role="radiogroup" aria-label="Tipo de deseo" className="gr-segmented">
        <label><input type="radio" name="tipo" value="exacto" defaultChecked={deseo?.tipo !== 'idea'} className="sr-only" />Quiero ESTO</label>
        <label><input type="radio" name="tipo" value="idea" defaultChecked={deseo?.tipo === 'idea'} className="sr-only" />Algo así</label>
      </div>

      <input name="precio" maxLength={LARGO.precio} placeholder="Precio (ej. $45.000)" defaultValue={deseo?.precio ?? ''}
             aria-label="Precio" className="gr-input" />

      <details open={!!deseo} className="group/mas rounded-[18px] border border-gr-line bg-gr-surface">
        <summary className="flex min-h-[58px] cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-col">
            <span className="font-display text-[17px] font-extrabold">Más detalles</span>
            <span className="text-[13px] font-medium text-gr-muted">Cuánto lo querés, cantidad, categoría, notas, link</span>
          </span>
          <Icon name="chevron" size={20} strokeWidth={2.6} className="flex-none transition-transform group-open/mas:rotate-90" />
        </summary>
        <div className="flex flex-col gap-4 px-3.5 pb-4 pt-1">
          {/* sin https:// también vale (el servidor se lo agrega); lo que el servidor no tomaría como link avisa antes de mandar */}
          <CampoLink name="linkTienda" placeholder="Link a la tienda (opcional)" defaultValue={deseo?.linkTienda ?? ''} className="gr-input"
                     aria-label="Link a la tienda" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <div className="flex gap-3">
            {/* uno de antes del tope con más se sigue pudiendo editar (si no se toca, queda como estaba) */}
            <input name="cantidad" type="number" min="1" max={Math.max(CANTIDAD_MAXIMA, deseo?.cantidad ?? 0)} defaultValue={deseo?.cantidad ?? 1}
                   aria-label="Cantidad" className="gr-input w-1/3" />
            <input name="rangoPrecio" maxLength={LARGO.rangoPrecio} placeholder="Rango si es idea (ej. $10–30k)" defaultValue={deseo?.rangoPrecio ?? ''}
                   aria-label="Rango de precio" className="gr-input w-2/3" />
          </div>

          <div className="flex flex-col gap-2">
            <span id="categoria-label" className="gr-label">Categoría</span>
            <div role="radiogroup" aria-labelledby="categoria-label" className="flex flex-wrap gap-2">
              {CATEGORIAS.map((c) => (
                <label key={c} className="gr-chip">
                  <input type="radio" name="categoria" value={c} defaultChecked={deseo?.categoria === c} className="sr-only" />{c}
                </label>
              ))}
              {/* Equivale a la opción vacía del select original: se puede volver a "sin categoría". */}
              <label className="gr-chip">
                <input type="radio" name="categoria" value="" defaultChecked={!deseo?.categoria} className="sr-only" />Sin categoría
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span id="prioridad-label" className="gr-label">¿Cuánto lo querés?</span>
            <div role="radiogroup" aria-labelledby="prioridad-label" className="flex gap-2">
              {Object.entries(PRIORIDADES).map(([value, { label, corazones }]) => (
                <label key={value} className="gr-chip group h-10 gap-1.5 px-3.5 text-xs has-[:checked]:px-3">
                  <input type="radio" name="prioridad" value={value} defaultChecked={value === (deseo?.prioridad ?? 'gustaria')} className="sr-only" />
                  <Hearts n={corazones} className="group-has-[:checked]:text-gr-accent" />
                  <span className="sr-only group-has-[:checked]:not-sr-only">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <textarea name="notas" maxLength={LARGO.notas} placeholder="Notas (talle, color…)" defaultValue={deseo?.notas ?? ''} className="gr-input min-h-24" />
          {/* solo para "Algo así": un "Quiero ESTO" no se repite (el servidor lo guarda sin la marca aunque venga tildado) */}
          <label className="hidden min-h-11 items-center gap-3 text-sm font-semibold group-has-[input[name=tipo][value=idea]:checked]/deseo:flex">
            <input type="checkbox" name="repetible" defaultChecked={deseo?.repetible} className="size-[22px] accent-gr-ink" />
            Se puede repetir (varios pueden regalarte algo así)
          </label>
        </div>
      </details>

      <div className="sticky bottom-[26px] z-10 mt-2">
        <BotonEnviar pendiente="Guardando…" className="gr-btn-primary h-[60px] w-full rounded-[20px] text-[21px]">{boton}</BotonEnviar>
      </div>
    </form>
  )
}
