import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { getOwnList } from '@/lib/lists'
import { misGustos } from '@/lib/bienvenida'
import { bloquesDeGustos, esPasoGustos, GUSTOS_VACIOS } from '@/lib/gustos'
import { TarjetaBloque } from '@/components/Gustos'
import { GustosGuardados } from '@/components/RecienAgregado'
import { Icon, PageHeader, Seccion } from '@/components/ui'

/**
 * Tus gustos: todo lo que cargaste en la bienvenida, a la vista y por bloques. Cada uno se edita solo (ver
 * /perfil/gustos/[paso]); lo que falta, punteado. Arriba, cuánto completaste y cómo te ve tu gente.
 */
export default async function TusGustos({ searchParams }: { searchParams: Promise<{ guardado?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [{ guardado }, gustos, lista] = await Promise.all([searchParams, misGustos(db, session.userId), getOwnList(db, session.userId)])
  if (!lista) redirect('/')
  const bloques = bloquesDeGustos(gustos)
  const cargados = bloques.filter((b) => b.cargado).length
  const talles = (gustos ?? GUSTOS_VACIOS).talles

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <PageHeader title="Tus gustos" back="/perfil" backLabel="Volver a Perfil" />

      <section className="gr-hero flex flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">
            {cargados === bloques.length ? '¡Completaste todo!' : 'Así te conoce tu gente'}
          </h2>
          <span className="flex-none text-sm font-semibold text-gr-hero-detail tabular-nums">{cargados} de {bloques.length}</span>
        </div>
        <div aria-hidden className="flex gap-1">
          {bloques.map((b) => <span key={b.paso} className={`h-1.5 flex-1 rounded-full ${b.cargado ? 'bg-gr-hero-detail' : 'bg-gr-on-hero/15'}`} />)}
        </div>
        <p className="text-sm leading-snug text-gr-on-hero/75">
          Lo ven al abrir tu lista.{cargados < bloques.length && ' Cuanto más completes, más aciertan.'}
        </p>
        <Link href={`/l/${lista.shareToken}/perfil`} className="gr-btn gr-btn--sm self-start">
          <Icon name="eye" size={18} />Ver cómo te ven
        </Link>
      </section>

      <ul className="flex flex-col gap-3">
        {bloques.map((b) => <li key={b.paso} id={`g-${b.paso}`} className="scroll-mt-6"><TarjetaBloque b={b} talles={talles} /></li>)}
      </ul>

      {esPasoGustos(guardado) && <GustosGuardados paso={guardado} />}
    </Seccion>
  )
}
