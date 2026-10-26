import Link from 'next/link'
import { crearSorpresaAction, editarSorpresaAction } from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { Buscador } from '@/components/Buscador'
import { CampoPrecio } from '@/components/CamposDeseo'
import { CompletarDesdeLink } from '@/components/CompletarDesdeLink'
import { DetallesDeseo } from '@/components/DetallesDeseo'
import { ElegirAmigos } from '@/components/Dividir'
import { FotoField } from '@/components/FotoField'
import { QueQueres } from '@/components/QueQueres'
import { AvatarSticker, Icon, ItemPhoto } from '@/components/ui'
import type { Persona } from '@/lib/amigos'
import { BUSCAR_DESDE, paraBuscar } from '@/lib/buscar'
import { LARGO } from '@/lib/limites'
import type { SorpresaEnLista } from '@/lib/sorpresas'
import type { OwnerItemView } from '@/lib/serialize'

// Sorpresas: un regalo para alguien que no está en su lista, dividido entre varios (ver sorpresas.ts). Acá, lo que se ve
// en la lista de esa persona, elegir para quién y el formulario para armarla.

const primerNombre = (n: string) => n.split(' ')[0]

/** La etiqueta de una sorpresa, sobre su foto. */
export function EtiquetaSorpresa({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-gr-brand px-2.5 py-1 text-xs font-semibold text-gr-accent ${className}`}>
      <span aria-hidden>🤫</span>Sorpresa
    </span>
  )
}

/**
 * En la lista de alguien, para los que le regalan con su cuenta: regalarle algo que no está en su lista y las sorpresas que
 * ya le armaron (con quién y si estás). Él no ve nada de esto.
 */
export function SorpresasEnLista({ token, nombre, sorpresas }: { token: string; nombre: string; sorpresas: SorpresaEnLista[] }) {
  const quien = primerNombre(nombre)
  return (
    <section aria-labelledby="sorpresas-titulo" className="flex flex-col gap-3">
      <Link href={`/sorpresa/nueva?para=${token}`}
            className="flex items-center gap-3.5 rounded-[22px] border-2 border-dashed border-gr-line-strong px-4 py-3.5">
        <span aria-hidden className="flex size-12 flex-none items-center justify-center rounded-full bg-gr-accent">
          <Icon name="gift" size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-snug font-semibold">Regalarle algo que no está en su lista</span>
          <span className="block text-[13px] leading-snug text-gr-muted">Una sorpresa: {quien} no la ve. Si querés, la dividís con amigos.</span>
        </span>
        <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
      </Link>

      {sorpresas.length > 0 && (
        <>
          <h2 id="sorpresas-titulo" className="gr-label">Sorpresas para {quien} · solo las ven los que le regalan</h2>
          <ul className="grid grid-cols-2 items-stretch gap-3">
            {sorpresas.map((s) => (
              <li key={s.token} className="gr-card relative flex flex-col">
                <Link href={`/sorpresa/${s.token}`} aria-hidden tabIndex={-1} className="relative block">
                  <ItemPhoto src={s.foto} titulo={s.titulo} height={150} />
                  <EtiquetaSorpresa className="absolute left-2 top-2" />
                </Link>
                <div className="flex flex-1 flex-col gap-1 px-3 pb-3 pt-2.5">
                  <Link href={`/sorpresa/${s.token}`} className="line-clamp-2 text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">
                    {s.titulo}
                  </Link>
                  <p className="text-xs leading-snug text-gr-muted">
                    Lo propuso {primerNombre(s.encargado)}
                    {s.personas.length > 1 && ` · son ${s.personas.length}`}
                    {s.precio && ` · ${s.precio}`}
                  </p>
                  <div className="mt-auto pt-1.5">
                    {s.comprada ? (
                      <p className="flex min-h-10 items-center gap-1.5 text-[13px] font-semibold"><Icon name="check" size={15} strokeWidth={2.6} />Ya la compraron</p>
                    ) : (
                      <Link href={`/sorpresa/${s.token}#regalo`} className={s.soyParte ? 'gr-btn gr-btn--sm w-full' : 'gr-btn-primary gr-btn--sm w-full'}>
                        {s.soyParte ? 'Estás adentro' : 'Me sumo'}
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** "Armar una sorpresa" (en Tu gente y en Regalos): para un amigo o para alguien sin GiftR. */
export function ArmarSorpresa() {
  return (
    <Link href="/sorpresa/nueva" className="flex items-center gap-3.5 rounded-[22px] border-2 border-dashed border-gr-line-strong px-4 py-3.5">
      <span aria-hidden className="flex size-11 flex-none items-center justify-center rounded-full bg-gr-accent"><Icon name="gift" size={22} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug font-semibold">Armar una sorpresa</span>
        <span className="block text-[13px] leading-snug text-gr-muted">
          Un regalo que no está en su lista, para dividir con amigos. También para alguien que no usa GiftR.
        </span>
      </span>
      <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
    </Link>
  )
}

/** Sin para quién: elegirlo entre sus amigos, o alguien que no usa GiftR. */
export function ElegirParaQuien({ amigos }: { amigos: Persona[] }) {
  return (
    <div className="flex flex-col gap-3">
      <Link href="/sorpresa/nueva?sin=1" className="gr-card flex items-center gap-3 px-4 py-3.5">
        <span aria-hidden className="flex size-11 flex-none items-center justify-center rounded-full bg-gr-accent"><Icon name="gift" size={22} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Alguien que no usa GiftR</span>
          <span className="block text-[13px] leading-snug text-gr-muted">La abuela, un compañero de trabajo…</span>
        </span>
        <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
      </Link>
      {amigos.length > 0 && (
        <>
          <p className="gr-label mt-2">O uno de tus amigos</p>
          {amigos.length >= BUSCAR_DESDE && <Buscador ambito="para-quien" placeholder="Buscar un amigo" vacio="No tenés un amigo con «%s»." />}
          <ul id="para-quien" className="flex flex-col divide-y divide-gr-line rounded-2xl border border-gr-line bg-gr-surface px-3">
            {amigos.map((a) => (
              <li key={a.id} data-buscar={paraBuscar(`${a.nombre} ${a.usuario ?? ''}`)}>
                <Link href={`/sorpresa/nueva?amigo=${a.id}`} className="flex min-h-14 items-center gap-3 py-2">
                  <AvatarSticker nombre={a.nombre} foto={a.foto} size={36} />
                  <span className="min-w-0 flex-1 text-[15px] leading-tight font-semibold [overflow-wrap:anywhere]">{a.nombre}</span>
                  <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export type ParaDelForm =
  | { tipo: 'lista'; token: string; nombre: string }
  | { tipo: 'amigo'; id: string; nombre: string }
  | { tipo: 'sin' }

/**
 * Armar la sorpresa: para quién (ya elegido, o el nombre de alguien sin GiftR y para cuándo), qué (la tarjeta, como en
 * Agregar: pegar el link trae nombre, foto y precio) y con qué amigos dividirla. Se arma aunque no elija a nadie: se suman
 * con el link o, si es de alguien de GiftR, desde su lista.
 * editar: la que ya armó, con lo que tiene (sin elegir amigos: a más se les propone desde el regalo).
 */
export function FormSorpresa({ para, amigos, hoy, error, editar }: {
  para: ParaDelForm
  amigos: Persona[]
  hoy: string
  error: boolean
  editar?: { token: string; deseo: OwnerItemView; nombre: string | null; fecha: string | null }
}) {
  const quien = para.tipo === 'sin' ? null : primerNombre(para.nombre)
  const deseo = editar?.deseo
  return (
    <form action={editar ? editarSorpresaAction : crearSorpresaAction} className="group/deseo mt-1 flex flex-col gap-4">
      {editar && <input type="hidden" name="token" value={editar.token} />}
      {!editar && para.tipo === 'lista' && <input type="hidden" name="paraLista" value={para.token} />}
      {!editar && para.tipo === 'amigo' && <input type="hidden" name="paraAmigo" value={para.id} />}

      {error && (
        <p role="alert" className="rounded-[18px] bg-gr-soft px-4 py-3 text-sm font-medium">
          {editar ? 'No la pudimos guardar. Fijate que tenga nombre (y para quién) y probá de nuevo.'
            : 'No la pudimos armar. Fijate que tenga nombre (y para quién) y probá de nuevo.'}
        </p>
      )}

      <p className="flex items-start gap-2.5 rounded-[18px] bg-gr-brand px-4 py-3 text-sm font-medium text-gr-on-brand">
        <span aria-hidden>🤫</span>
        {quien ? `${quien} no la ve nunca: solo los que le regalan.` : 'Como no usa GiftR, la ven solo los que la arman con vos.'}
      </p>

      {para.tipo === 'sin' && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="gr-label">¿Para quién?</span>
            <input name="paraNombre" required maxLength={LARGO.paraSorpresa} placeholder="La abuela Marta" autoComplete="off" className="gr-input"
                   defaultValue={editar?.nombre ?? ''} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="gr-label">¿Cuándo se la dan? (si saben)</span>
            <input name="paraFecha" type="date" min={hoy} className="gr-input" defaultValue={editar?.fecha ?? ''} />
          </label>
        </div>
      )}

      <div className="gr-card flex flex-col gap-1.5 overflow-visible p-2.5 pb-2">
        <FotoField inicial={deseo?.fotoUrl} />
        <CompletarDesdeLink guardado={deseo?.linkTienda ?? null} tituloGuardado={deseo?.titulo ?? null} />
        <QueQueres placeholder="¿Qué le regalan?" defaultValue={deseo?.titulo} />
        <CampoPrecio name="precio" maxLength={LARGO.precio} inputMode="decimal" placeholder="$ Precio" aria-label="Precio" defaultValue={deseo?.precio ?? ''}
                     className="min-h-11 w-full rounded-xl bg-transparent px-1.5 text-lg font-semibold outline-none placeholder:font-medium placeholder:text-gr-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gr-ink" />
      </div>
      <DetallesDeseo deseo={deseo} solo={['notas', 'link', 'video']} textoNotas="Detalles" />

      {!editar && <div className="flex flex-col gap-2.5">
        <p className="gr-label">¿Con quién la dividís?</p>
        {amigos.length > 0 ? (
          <>
            <ElegirAmigos amigos={amigos} ambito="amigos-sorpresa" />
            <p className="text-xs leading-snug text-gr-muted">
              A cada uno le llega la propuesta y elige si se suma. Se divide en partes iguales entre los que se sumen
              {quien ? `; también se pueden sumar los que le regalan a ${quien}.` : '; también le podés pasar el link a quien quieras.'}
            </p>
          </>
        ) : (
          <p className="text-xs leading-snug text-gr-muted">
            Todavía no tenés amigos en GiftR para proponérsela: armala igual y pasá el link, o{' '}
            <Link href="/gente/agregar" className="font-semibold underline underline-offset-2">sumá amigos</Link>.
          </p>
        )}
      </div>}

      <div className="sticky bottom-0 z-10 -mx-[18px] mt-1 bg-gradient-to-t from-gr-bg from-70% to-transparent px-[18px] pb-[max(18px,env(safe-area-inset-bottom))] pt-3">
        {/* #que-queres: el título (ID_TITULO), escrito tal cual para que Tailwind arme la clase */}
        <BotonEnviar pendiente={editar ? 'Guardando…' : 'Armando…'}
                     className="gr-btn-primary h-14 w-full text-[17px] group-has-[#que-queres:placeholder-shown]/deseo:border-gr-dot group-has-[#que-queres:placeholder-shown]/deseo:bg-gr-dot group-has-[#que-queres:placeholder-shown]/deseo:text-gr-muted">
          {editar ? 'Guardar cambios' : amigos.length ? 'Proponerles la sorpresa' : 'Armar la sorpresa'}
        </BotonEnviar>
        <p className="mt-1.5 hidden text-center text-xs font-medium text-gr-muted group-has-[#que-queres:placeholder-shown]/deseo:block">
          Escribí qué le regalan o pegá un link
        </p>
      </div>
    </form>
  )
}
