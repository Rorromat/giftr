import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { addItemAction } from '@/app/actions'
import { nombresDeMisGrupos } from '@/lib/groups'
import { FotoField } from '@/components/FotoField'
import { BackLink, Hearts, PRIORIDADES } from '@/components/ui'

const CATEGORIAS = ['Tecnología', 'Casa', 'Ropa', 'Libros', 'Experiencias', 'Hobbies']

export default async function Agregar({ searchParams }: { searchParams: Promise<{ lista?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  // Con grupos se elige la lista; ?lista=<id> llega preseleccionada desde la pantalla del grupo.
  const [{ lista }, grupos] = await Promise.all([searchParams, nombresDeMisGrupos(db, session.userId)])
  const desdeGrupo = grupos.find((g) => g.id === lista)

  return (
    <main className="gr-hoja pb-8 pt-[52px]">
      <div className="flex items-center gap-3.5">
        <BackLink href={desdeGrupo ? `/grupos/${desdeGrupo.id}` : '/mi-lista'} label={`Volver a ${desdeGrupo?.nombre ?? 'Mi lista'}`} />
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-[30px] leading-none font-extrabold tracking-[-0.04em]">Agregar deseo</h1>
          <p className="text-sm font-medium">Menos de 30 segundos, prometido.</p>
        </div>
      </div>

      <form action={addItemAction} className="mt-3.5 flex flex-col gap-4">
        {grupos.length > 0 && (
          <div className="flex flex-col gap-2">
            <span id="lista-label" className="gr-label">¿En qué lista?</span>
            <div role="radiogroup" aria-labelledby="lista-label" className="flex flex-wrap gap-2">
              <label className="gr-chip has-[:checked]:-rotate-2">
                <input type="radio" name="listaId" value="" defaultChecked={!desdeGrupo} className="sr-only" />Mi lista
              </label>
              {grupos.map((g) => (
                <label key={g.id} className="gr-chip has-[:checked]:-rotate-2">
                  <input type="radio" name="listaId" value={g.id} defaultChecked={desdeGrupo?.id === g.id} className="sr-only" />{g.nombre}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="gr-sticker flex flex-col gap-3 p-3.5">
          <label className="flex flex-col gap-1">
            <span className="gr-label">¿Qué querés?</span>
            <input name="titulo" required placeholder="Pegá un link o escribí"
                   className="bg-transparent font-display text-xl font-bold outline-none placeholder:text-gr-muted" />
          </label>
          <FotoField />
        </div>

        <div role="radiogroup" aria-label="Tipo de deseo" className="gr-segmented">
          <label><input type="radio" name="tipo" value="exacto" defaultChecked className="sr-only" />Quiero ESTO</label>
          <label><input type="radio" name="tipo" value="idea" className="sr-only" />Algo así</label>
        </div>

        <input name="linkTienda" placeholder="Link a la tienda (opcional)" className="gr-input" />
        <div className="flex gap-3">
          <input name="precio" placeholder="Precio (ej. $45.000)" className="gr-input w-1/2" />
          <input name="cantidad" type="number" min="1" defaultValue="1" aria-label="Cantidad" className="gr-input w-1/2" />
        </div>
        <input name="rangoPrecio" placeholder="Rango si es idea (ej. $10–30k)" className="gr-input" />

        <div className="flex flex-col gap-2">
          <span id="categoria-label" className="gr-label">Categoría</span>
          <div role="radiogroup" aria-labelledby="categoria-label" className="flex flex-wrap gap-2">
            {CATEGORIAS.map((c) => (
              <label key={c} className="gr-chip has-[:checked]:-rotate-2">
                <input type="radio" name="categoria" value={c} className="sr-only" />{c}
              </label>
            ))}
            {/* Equivale a la opción vacía del select original: se puede volver a "sin categoría". */}
            <label className="gr-chip has-[:checked]:-rotate-2">
              <input type="radio" name="categoria" value="" defaultChecked className="sr-only" />Sin categoría
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span id="prioridad-label" className="gr-label">¿Cuánto lo querés?</span>
          <div role="radiogroup" aria-labelledby="prioridad-label" className="flex gap-2">
            {Object.entries(PRIORIDADES).map(([value, { label, corazones }]) => (
              <label key={value} className="gr-chip group h-10 gap-1.5 px-3.5 text-xs has-[:checked]:px-3">
                <input type="radio" name="prioridad" value={value} defaultChecked={value === 'gustaria'} className="sr-only" />
                <Hearts n={corazones} className="group-has-[:checked]:text-gr-accent" />
                <span className="sr-only group-has-[:checked]:not-sr-only">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <textarea name="notas" placeholder="Notas (talle, color…)" className="gr-input min-h-24" />
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input type="checkbox" name="repetible" className="size-[22px] accent-gr-ink" /> Se puede repetir (para ideas)
        </label>

        <div className="sticky bottom-[26px] z-10 mt-2">
          <button className="gr-btn-primary h-[60px] w-full rounded-[20px] border-[3px] text-[21px]">Agregar a mi lista</button>
        </div>
      </form>
    </main>
  )
}
