import { CumpleCampos } from '@/components/CumpleCampos'
import { AvatarStack } from '@/components/ui'
import { ANIO_MAXIMO, ANIO_MINIMO, OTRO_PARENTESCO, PARENTESCOS, diaYMes, type Dueno } from '@/lib/groups'
import { LARGO } from '@/lib/limites'

// Las piezas de una lista en común que van en más de una pantalla: su avatar (la foto de la lista con la de sus dueños)
// y los campos de "¿Qué es para vos?" y de la fecha (un cumple o no) de los formularios.

/**
 * El avatar de una lista en común: su foto (sin foto, su inicial en azul), con las de sus dueños chiquitas encima (hasta
 * dos). Así no se confunde con uno de ellos: la lista de la abuela de Sofi no lleva la cara de Sofi en grande.
 */
export function AvatarDeLista({ nombre, foto, duenos, size = 48 }: { nombre: string; foto: string | null; duenos: Dueno[]; size?: number }) {
  const chicos = duenos.slice(0, 2)
  const inicial = nombre.trim().charAt(0).toLocaleUpperCase('es')
  return (
    <div aria-hidden className="relative flex-none" style={{ width: size, height: size }}>
      <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-gr-comun font-semibold text-gr-comun-ink ring-2 ring-gr-comun-line"
            style={{ fontSize: size * 0.4 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- foto subida de la lista */}
        {foto ? <img src={foto} alt="" className="size-full object-cover" /> : inicial}
      </span>
      {chicos.length > 0 && (
        <AvatarStack nombres={chicos.map((d) => d.nombre)} fotos={chicos.map((d) => d.foto)} size={Math.round(size * 0.44)}
                     className="absolute -bottom-1 -right-1.5" />
      )}
    </div>
  )
}

/**
 * "¿Qué es para vos?": hijo, abuela, tío abuelo… u "Otro", que se escribe (el campo aparece al elegirlo; sin :has, está
 * siempre). Lo que valga lo decide parentescoDelForm.
 */
export function CampoParentesco({ actual, etiqueta = '¿Qué es para vos? (opcional)', id = 'parentesco' }: {
  actual?: string | null; etiqueta?: string; id?: string
}) {
  const esOtro = !!actual && !(PARENTESCOS as readonly string[]).includes(actual)
  return (
    <div className="group/parentesco flex flex-col gap-2">
      <label htmlFor={id} className="gr-label">{etiqueta}</label>
      <select id={id} name="parentesco" defaultValue={esOtro ? OTRO_PARENTESCO : actual ?? ''} className="gr-input">
        <option value="">Elegí…</option>
        {PARENTESCOS.map((p) => <option key={p} value={p}>{p}</option>)}
        <option value={OTRO_PARENTESCO}>Otro (lo escribís)</option>
      </select>
      <input name="parentescoOtro" maxLength={LARGO.parentesco} defaultValue={esOtro ? actual! : ''} aria-label="¿Qué es? Escribilo"
             placeholder="Ahijado, cuñada, la vecina…"
             className="gr-input group-has-[option:not([value=otro]):checked]/parentesco:hidden" />
    </div>
  )
}

/**
 * ¿Es un cumple? Sí: día y mes (todos los años, ver fechaDeCumple). No: una fecha del calendario y si se repite. Las dos
 * van siempre en el formulario y el servidor usa la que dice "cumple"; sin required, que en la parte escondida frenaría el
 * envío sin que se vea por qué.
 */
export function CamposFecha({ esCumple, eventoFecha = null, fechaEnCalendario = '', anual = true, opcional = true }: {
  esCumple: boolean; eventoFecha?: string | null; fechaEnCalendario?: string; anual?: boolean; opcional?: boolean
}) {
  const cumple = esCumple ? diaYMes(eventoFecha) : null
  return (
    <div className="group/fecha flex flex-col gap-3">
      <div className="gr-segmented" role="radiogroup" aria-label="¿Es un cumpleaños?">
        <label><input type="radio" name="cumple" value="1" defaultChecked={esCumple} className="sr-only" />Es un cumple</label>
        <label><input type="radio" name="cumple" value="0" defaultChecked={!esCumple} className="sr-only" />Otra cosa</label>
      </div>
      {/* sin :has se ven las dos partes, y vale la que diga el botón de arriba */}
      <div className="flex flex-col gap-2 group-has-[input[name=cumple][value='0']:checked]/fecha:hidden">
        <span className="gr-label">¿Cuándo cumple?{opcional && ' (opcional)'}</span>
        <div className="flex gap-2">
          <CumpleCampos dia={cumple?.dia} mes={cumple?.mes} claseDia="w-24 flex-none" />
        </div>
      </div>
      <div className="flex flex-col gap-2 group-has-[input[name=cumple][value='1']:checked]/fecha:hidden">
        <label htmlFor="fecha" className="gr-label">¿Hay una fecha?{opcional && ' (opcional)'}</label>
        <input id="fecha" name="fecha" type="date" min={`${ANIO_MINIMO}-01-01`} max={`${ANIO_MAXIMO}-12-31`} defaultValue={fechaEnCalendario}
               className="gr-input" />
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input type="checkbox" name="anual" defaultChecked={anual} className="size-[22px] accent-gr-ink" /> Se repite todos los años
        </label>
      </div>
    </div>
  )
}
