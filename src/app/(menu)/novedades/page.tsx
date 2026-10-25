import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { misAmigos } from '@/lib/amigos'
import { hace, novedadesDeAmigos, PRIMEROS } from '@/lib/novedades'
import { IrAlDeseo, MasNovedades, TarjetaNovedad } from '@/components/Novedades'
import { Icon, PageHeader, Seccion } from '@/components/ui'

/**
 * Lo nuevo de tus amigos, como un feed de Instagram: sus últimos deseos uno abajo del otro, en grande, y al llegar al final
 * se cargan más. Desde el carrusel de Inicio se llega con #d-<id>, justo en el que tocaste. En cada uno: reservarlo o
 * robártelo para tu lista.
 */
export default async function Novedades() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [{ novedades, siguiente }, amigos] = await Promise.all([
    novedadesDeAmigos(db, session.userId, { limite: PRIMEROS }), misAmigos(db, session.userId),
  ])

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <PageHeader title="Lo nuevo de tus amigos" back="/inicio" backLabel="Volver a Inicio" />
      {novedades.length ? (
        <>
          {novedades.map((n) => <TarjetaNovedad key={n.item.id} n={{ ...n, hace: hace(n.creado) }} />)}
          <MasNovedades siguiente={siguiente} />
          <IrAlDeseo />
        </>
      ) : (
        <div className="gr-empty flex flex-col items-center gap-2 py-8 text-center">
          <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-gr-surface shadow-card"><Icon name="users" size={26} /></span>
          {amigos.size ? (
            <p>Tus amigos todavía no agregaron nada. Cuando lo hagan, aparece acá.</p>
          ) : (
            <>
              <p>Acá vas a ver lo que se van agregando tus amigos a sus listas.</p>
              <Link href="/gente/agregar" className="gr-btn-primary gr-btn--sm mt-2">Agregar amigos</Link>
            </>
          )}
        </div>
      )}
    </Seccion>
  )
}
