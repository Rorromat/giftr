import { BotonEnviar } from '@/components/BotonEnviar'
import { CampoPrecio } from '@/components/CamposDeseo'
import { CompletarDesdeLink } from '@/components/CompletarDesdeLink'
import { DetallesDeseo } from '@/components/DetallesDeseo'
import { FotoField } from '@/components/FotoField'
import { QueQueres } from '@/components/QueQueres'
import { RecibirCompartido, type CompartidoAlForm } from '@/components/RecibirCompartido'
import { Hearts, PRIORIDADES, PriorityTag, type Prioridad } from '@/components/ui'
import { LARGO } from '@/lib/limites'
import type { OwnerItemView } from '@/lib/serialize'

/** Las tres etiquetas de "¿Cuánto lo querés?" sobre la foto: se ve la elegida (con CSS, sin esperar a que cargue nada). */
const ETIQUETA_ELEGIDA: Record<Prioridad, string> = {
  mucho: 'group-has-[input[name=prioridad][value=mucho]:checked]/deseo:inline-flex',
  gustaria: 'group-has-[input[name=prioridad][value=gustaria]:checked]/deseo:inline-flex',
  suelta: 'group-has-[input[name=prioridad][value=suelta]:checked]/deseo:inline-flex',
}

/**
 * El formulario de un deseo, para agregar o editar (`deseo`). La tarjeta es el formulario: arriba se ve el deseo como lo van
 * a ver tus amigos (la foto, el nombre, el precio y cuánto lo querés) y se completa ahí mismo; pegar el link de la tienda
 * trae nombre, foto y precio. Abajo, cuánto lo querés, si sirve algo parecido y los detalles, de a uno.
 */
export function DeseoForm({ action, deseo, grupos = [], grupoElegido, boton, compartido }: {
  action: (formData: FormData) => Promise<void>
  deseo?: OwnerItemView
  /** Solo al agregar, si tiene grupos: en qué lista va. */
  grupos?: { id: string; nombre: string }[]
  grupoElegido?: string
  boton: string
  /** Solo al agregar: lo compartido a GiftR desde otra app (ver RecibirCompartido). */
  compartido?: CompartidoAlForm
}) {
  return (
    <form action={action} className="group/deseo mt-1 flex flex-col gap-4">
      {deseo && <input type="hidden" name="itemId" value={deseo.id} />}
      {grupos.length > 0 && (
        <label className="flex items-center gap-1.5 self-center rounded-full border border-gr-line bg-gr-surface py-1 pl-3.5 pr-2 text-sm font-semibold">
          En
          <select name="listaId" defaultValue={grupoElegido ?? ''} aria-label="¿En qué lista?"
                  className="cursor-pointer rounded-lg bg-transparent py-1 pr-1 font-semibold underline underline-offset-4">
            <option value="">Mi lista</option>
            {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </label>
      )}

      {/* La tarjeta del deseo, en vivo: la foto (con cuánto lo querés encima), lo que dice la lectura del link, el nombre y el precio */}
      <div className="gr-card flex flex-col gap-1.5 overflow-visible p-2.5 pb-2">
        <div className="relative">
          <FotoField inicial={deseo?.fotoUrl} />
          {/* sobre la foto, como en su tarjeta (sin foto, ahí están Pegar link y Foto) */}
          <span aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 hidden group-has-[img[data-vista-previa]]/deseo:block">
            {(Object.keys(PRIORIDADES) as Prioridad[]).map((p) => (
              <span key={p} className={`hidden ${ETIQUETA_ELEGIDA[p]}`}>
                <PriorityTag prioridad={p} className="h-[30px]">{PRIORIDADES[p].label}</PriorityTag>
              </span>
            ))}
          </span>
        </div>
        {/* con el link del producto (en "¿Qué querés?" o en "Link de la tienda") completa el nombre, el precio y la foto que estén vacíos */}
        <CompletarDesdeLink guardado={deseo?.linkTienda ?? null} tituloGuardado={deseo?.titulo ?? null} />
        <QueQueres defaultValue={deseo?.titulo ?? compartido?.link ?? compartido?.titulo} />
        {/* $45.000 o 45000 (al dejarlo, y en el servidor, queda $45.000) */}
        <CampoPrecio name="precio" maxLength={LARGO.precio} inputMode="decimal" placeholder="$ Precio" defaultValue={deseo?.precio ?? ''}
               aria-label="Precio" className="min-h-11 w-full rounded-xl bg-transparent px-1.5 text-lg font-semibold outline-none placeholder:font-medium placeholder:text-gr-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gr-ink" />
        {/* un rango de antes ("$10–30k") queda como estaba: ya no se carga aparte, alcanza con el precio */}
        <input type="hidden" name="rangoPrecio" value={deseo?.rangoPrecio ?? ''} />
      </div>
      {compartido && !deseo && <RecibirCompartido {...compartido} />}

      <div className="flex flex-col gap-2">
        <span id="prioridad-label" className="gr-label">¿Cuánto lo querés?</span>
        <div role="radiogroup" aria-labelledby="prioridad-label" className="flex gap-2">
          {Object.entries(PRIORIDADES).map(([value, { label, corazones }]) => (
            <label key={value} className="gr-chip group h-11 gap-1.5 px-3.5 text-[13px] has-[:checked]:px-3">
              <input type="radio" name="prioridad" value={value} defaultChecked={value === (deseo?.prioridad ?? 'gustaria')} className="sr-only" />
              <Hearts n={corazones} className="group-has-[:checked]:text-gr-accent" />
              <span className="sr-only group-has-[:checked]:not-sr-only">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* "Algo así" (una idea): sirve algo parecido. Tildado, tipo llega como idea antes que el exacto de abajo (vale el primero) */}
      <div className="flex flex-col rounded-[18px] border border-gr-line bg-gr-surface">
        <label className="flex min-h-[64px] cursor-pointer items-center gap-3 px-3.5 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Me sirve algo parecido</span>
            <span className="block text-[13px] leading-snug text-gr-muted">Si no, que sea exactamente este</span>
          </span>
          <input type="checkbox" name="tipo" value="idea" defaultChecked={deseo?.tipo === 'idea'} className="peer sr-only" />
          <span aria-hidden className="relative h-7 w-12 flex-none rounded-full bg-gr-dot transition-colors after:absolute after:left-[3px] after:top-[3px] after:size-[22px] after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-gr-ink peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gr-ink" />
        </label>
        <input type="hidden" name="tipo" value="exacto" />
        {/* solo para las ideas: un "este mismo" no se repite (el servidor lo guarda sin la marca aunque venga tildado) */}
        <label className="hidden min-h-11 items-center gap-3 border-t border-gr-line px-3.5 py-2 text-sm font-semibold group-has-[input[name=tipo][value=idea]:checked]/deseo:flex">
          <input type="checkbox" name="repetible" defaultChecked={deseo?.repetible} className="size-[22px] accent-gr-ink" />
          Se puede repetir (varios pueden regalarte algo así)
        </label>
      </div>

      <DetallesDeseo deseo={deseo} notas={compartido?.notas} />

      {/* Fijo abajo, sin tapar nada (lo de abajo deja su lugar). Sin nombre se ve apagado y dice por qué; igual se puede
          tocar: el navegador marca el campo que falta. */}
      <div className="sticky bottom-0 z-10 -mx-[18px] mt-1 bg-gradient-to-t from-gr-bg from-70% to-transparent px-[18px] pb-[max(18px,env(safe-area-inset-bottom))] pt-3">
        {/* #que-queres: el título (ID_TITULO), escrito tal cual para que Tailwind arme la clase */}
        <BotonEnviar pendiente="Guardando…"
                     className={`gr-btn-primary h-14 w-full text-[17px] group-has-[#que-queres:placeholder-shown]/deseo:border-gr-dot group-has-[#que-queres:placeholder-shown]/deseo:bg-gr-dot group-has-[#que-queres:placeholder-shown]/deseo:text-gr-muted`}>
          {boton}
        </BotonEnviar>
        <p className="mt-1.5 hidden text-center text-xs font-medium text-gr-muted group-has-[#que-queres:placeholder-shown]/deseo:block">
          Escribí qué querés o pegá un link para agregarlo
        </p>
      </div>
    </form>
  )
}
