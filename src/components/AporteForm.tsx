import { BotonEnviar } from '@/components/BotonEnviar'
import { CampoAlias, CampoMeta } from '@/components/CamposDeseo'
import { Icon } from '@/components/ui'
import { AVISO_ALIAS } from '@/lib/alias-pago'
import { LARGO } from '@/lib/limites'
import { pesos } from '@/lib/pesos'
import type { OwnerItemView } from '@/lib/serialize'

/** Por qué volvió el formulario sin guardar (lo frena antes el navegador: esto es sin JS, o un pedido armado a mano). */
const ERRORES: Record<string, string> = {
  titulo: 'Poné para qué es el aporte.',
  alias: AVISO_ALIAS,
  meta: 'Poné la meta en pesos, por ejemplo $300.000. Si no querés poner una, dejala vacía.',
}

/**
 * El formulario de un aporte en plata, para agregarlo o editarlo (`deseo`): para qué es ("Luna de miel", "Cochecito"), una
 * descripción y una meta si quiere, y a qué alias o CVU le transfieren. No es el formulario de un deseo: no hay link de
 * tienda, precio, foto ni cantidad.
 * El alias del perfil es privado (solo lo ve quien le debe plata de un regalo grupal), así que acá no se usa solo: este
 * campo es del deseo, llega con el del perfil puesto si tiene uno (`alias`) y dice, sin vueltas, que lo va a ver cualquiera
 * con el link de la lista. Quien lo guarda lo decide sabiéndolo. En una lista en común es el que carga quien crea el deseo.
 */
export function AporteForm({ action, deseo, grupos = [], grupoElegido, boton, alias, titulo, error }: {
  action: (formData: FormData) => Promise<void>
  deseo?: OwnerItemView
  /** Solo al agregar, si tiene listas en común: en cuál va. */
  grupos?: { id: string; nombre: string }[]
  grupoElegido?: string
  boton: string
  /** Solo al agregar: su alias del perfil, para dejarlo puesto. */
  alias?: string | null
  /** Solo al agregar: el nombre que ya viene puesto (una de las ideas para empezar, o el que había escrito). */
  titulo?: string
  error?: string
}) {
  const aviso = error && Object.hasOwn(ERRORES, error) ? ERRORES[error] : null
  return (
    <form action={action} className="mt-1 flex flex-col gap-4">
      <input type="hidden" name="tipo" value="aporte" />
      {deseo && <input type="hidden" name="itemId" value={deseo.id} />}
      {grupos.length > 0 && (
        <label className="flex items-center gap-1.5 self-center rounded-full border border-gr-line bg-gr-surface py-1 pl-3.5 pr-2 text-base font-semibold">
          En
          <select name="listaId" defaultValue={grupoElegido ?? ''} aria-label="¿En qué lista?"
                  className="cursor-pointer rounded-lg bg-transparent py-1 pr-1 font-semibold underline underline-offset-4">
            <option value="">Mi lista</option>
            {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </label>
      )}

      {aviso && <p role="alert" className="rounded-2xl bg-gr-soft px-3.5 py-3 text-sm font-semibold">{aviso}</p>}

      <div className="gr-card flex flex-col gap-1.5 p-4">
        <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-gr-soft text-gr-acento-texto">
          <Icon name="wallet" size={22} strokeWidth={2.2} />
        </span>
        <label htmlFor="aporte-titulo" className="sr-only">¿Para qué es?</label>
        <input id="aporte-titulo" name="titulo" required maxLength={LARGO.titulo} placeholder="¿Para qué es? Luna de miel" defaultValue={deseo?.titulo ?? titulo}
               className="block min-h-12 w-full rounded-xl bg-transparent px-1.5 text-[22px] leading-tight font-semibold outline-none placeholder:font-medium placeholder:text-gr-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gr-ink" />
        <p className="px-1.5 text-[13px] leading-snug text-gr-muted">
          No se reserva: cada uno te transfiere lo que quiere, y pueden aportar todos.
        </p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="gr-label">Contá un poco más (opcional)</span>
        <textarea name="notas" rows={3} maxLength={LARGO.notas} defaultValue={deseo?.notas ?? ''} placeholder="Nos vamos diez días al sur"
                  className="gr-input" />
      </label>

      <div className="flex flex-col gap-2">
        <label htmlFor="aporte-alias" className="gr-label">Tu alias o CVU</label>
        <CampoAlias id="aporte-alias" name="aporteAlias" required autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    placeholder="tu.alias.mp" defaultValue={deseo?.aporteAlias ?? alias ?? ''} aria-describedby="aporte-alias-ayuda" className="gr-input" />
        <p id="aporte-alias-ayuda" className="flex items-start gap-2 text-[13px] leading-snug font-medium">
          <Icon name="eye" size={16} className="mt-px flex-none" />
          Este alias lo va a ver cualquiera que tenga el link de la lista.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="aporte-meta" className="gr-label">¿Cuánto querés juntar? (opcional)</label>
        <CampoMeta id="aporte-meta" name="aporteMeta" inputMode="numeric" placeholder="$ Meta"
                   defaultValue={deseo?.aporteMeta ? pesos(deseo.aporteMeta) : ''} aria-describedby="aporte-meta-ayuda" className="gr-input" />
        <p id="aporte-meta-ayuda" className="text-[13px] leading-snug text-gr-muted">
          Acá no vas a ver quién aportó ni cuánto: es una sorpresa, y la plata la ves en tu cuenta.
        </p>
      </div>

      <div className="sticky bottom-0 z-10 -mx-[18px] mt-1 bg-gradient-to-t from-gr-bg from-70% to-transparent px-[18px] pb-[max(18px,env(safe-area-inset-bottom))] pt-3">
        <BotonEnviar pendiente="Guardando…" className="gr-btn-primary h-14 w-full text-[17px]">{boton}</BotonEnviar>
      </div>
    </form>
  )
}
