import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { createGroupAction } from '@/app/actions'
import { misAmigos, personas } from '@/lib/amigos'
import { Icon, PageHeader } from '@/components/ui'
import { BotonEnviar } from '@/components/BotonEnviar'
import { ElegirAmigos } from '@/components/Dividir'
import { FotoDeLista } from '@/components/FotoDeLista'
import { CampoParentesco, CamposFechaDeOcasion } from '@/components/ListaEnComun'
import { LARGO } from '@/lib/limites'
import { datosDeOcasion, esOcasion, OCASIONES, type Ocasion } from '@/lib/ocasiones'

/** Las ocasiones en las que la lista es de una persona que no la arma (un hijo, la abuela): "¿Qué es para vos?" tiene sentido. */
const CON_PARENTESCO: Ocasion[] = ['cumple', 'otra']

/**
 * Armar una lista en común, en dos pasos livianos. Primero para qué es: un cumple, un casamiento, un baby shower, la casa
 * nueva u otra cosa. Después el formulario, ya con las palabras de esa ocasión: el nombre que se sugiere, cómo se pide la
 * fecha y, al crearla, la tapa, las ideas para empezar y lo que se manda por WhatsApp (ver ocasiones.ts). La ocasión va en
 * la dirección (?ocasion=): anda sin JS, y "Cambiar" es volver un paso.
 */
export default async function NuevoGrupo({ searchParams }: { searchParams: Promise<{ ocasion?: string | string[] }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const { ocasion: elegida } = await searchParams
  const ocasion = esOcasion(elegida) ? elegida : null

  if (!ocasion) {
    return (
      <main className="flex flex-col gap-1 pb-10 pt-2">
        <PageHeader title="Lista en común" back="/mi-lista" backLabel="Volver a Mi lista" />
        <p className="text-center text-sm text-gr-muted">Una lista para armar con otros: la de tu hijo, la del casamiento, la de la casa.</p>
        <h2 className="gr-heading mt-4">¿Para qué es?</h2>
        <ul className="mt-2 flex flex-col gap-2.5">
          {OCASIONES.map((o) => {
            const d = datosDeOcasion(o)
            return (
              <li key={o}>
                <Link href={`/grupos/nuevo?ocasion=${o}`} className="gr-card flex min-h-[72px] items-center gap-3.5 p-3.5">
                  <span aria-hidden className="flex size-12 flex-none items-center justify-center rounded-full text-white" style={{ background: d.tapa }}>
                    <Icon name={d.icono} size={22} strokeWidth={2.2} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[17px] leading-tight font-semibold">{d.nombre}</span>
                    <span className="text-[13px] leading-snug text-gr-muted">{d.paraQue}</span>
                  </span>
                  <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
                </Link>
              </li>
            )
          })}
        </ul>
      </main>
    )
  }

  const d = datosDeOcasion(ocasion)
  const amigos = (await personas(db, [...await misAmigos(db, session.userId)])).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return (
    <main className="flex flex-col gap-1 pb-10 pt-2">
      <PageHeader title="Lista en común" back="/grupos/nuevo" backLabel="Volver a elegir para qué es" />
      {/* lo que eligió, con la vuelta a mano: equivocarse de ocasión no es volver a empezar */}
      <p className="flex items-center justify-center gap-2 text-sm text-gr-muted">
        <span className="flex items-center gap-1.5 font-semibold text-gr-ink"><Icon name={d.icono} size={16} strokeWidth={2.2} />{d.nombre}</span>
        <Link href="/grupos/nuevo" className="gr-toque font-semibold underline underline-offset-4">Cambiar</Link>
      </p>

      <form action={createGroupAction} className="mt-3 flex flex-col gap-5">
        <input type="hidden" name="ocasion" value={ocasion} />
        <div className="flex flex-col gap-2">
          <div className="gr-card flex items-center gap-4 p-4">
            <FotoDeLista foto={null} size={72} />
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="gr-label">¿Cómo se llama?</span>
              <input name="nombre" required maxLength={LARGO.nombreGrupo} placeholder={d.ejemploDeNombre} aria-describedby="nombre-ayuda"
                     className="min-w-0 bg-transparent text-xl font-semibold outline-none placeholder:font-normal placeholder:text-gr-muted" />
            </label>
          </div>
          <p id="nombre-ayuda" className="px-1 text-xs leading-snug text-gr-muted">{d.ayudaDelNombre}</p>
        </div>

        <CamposFechaDeOcasion ocasion={ocasion} />

        {CON_PARENTESCO.includes(ocasion) && <CampoParentesco />}

        <label className="flex flex-col gap-2">
          <span className="gr-label">¿Para qué es? (opcional)</span>
          <input name="descripcion" maxLength={LARGO.descripcionGrupo} placeholder={d.ejemploDeDescripcion} className="gr-input" />
        </label>

        <div className="flex flex-col gap-2">
          <span className="gr-label">¿Con quién la armás?</span>
          {amigos.length > 0 ? (
            <>
              <ElegirAmigos amigos={amigos} ambito="amigos-lista" />
              <p className="text-xs leading-snug text-gr-muted">
                A cada uno le llega un aviso con el nombre de la lista y se suma con un toque. Como es suya también, no va a ver
                quién regala qué.
              </p>
            </>
          ) : (
            <p className="gr-empty text-sm text-gr-muted">
              Todavía no tenés amigos en GiftR: después de crearla, invitá a quien la arma con vos por WhatsApp, o{' '}
              <Link href="/gente/agregar" className="font-semibold underline underline-offset-2">sumá amigos</Link>.
            </p>
          )}
        </div>

        <p className="gr-empty text-sm text-gr-muted">
          Los que regalan la ven como una sola lista, y ninguno de ustedes ve quién reserva qué{d.sugerencias.some((s) => s.aporte) ? ' ni quién aporta' : ''}.
          Tus amigos la ven en su gente y, si la agregan, su fecha les aparece en Todo el año.
        </p>
        <BotonEnviar pendiente="Creando…" className="gr-btn-primary mt-1 h-14 w-full text-[17px]">Crear lista en común</BotonEnviar>
      </form>
    </main>
  )
}
