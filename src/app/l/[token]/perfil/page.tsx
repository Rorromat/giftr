import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { getViewer } from '@/lib/viewer'
import { MESES, seguirLista } from '@/lib/events'
import { perfilPublico } from '@/lib/perfil'
import { IconoSeccion, paraResumen, ResumenGustos, SeccionesGustos } from '@/components/Gustos'
import { TallesIlustrados } from '@/components/TallesIlustrados'
import { AvatarSticker, Icon, PageHeader } from '@/components/ui'

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ quien?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ token }, { quien }] = await Promise.all([params, searchParams])
  const p = await perfilPublico(db, token, quien)
  return p ? { title: `${p.nombre.split(' ')[0]} en GiftR` } : {}
}

/** El perfil de un dueño de la lista: foto, cumple, gustos con íconos, talles ilustrados y lo que no. Nunca reservas. */
export default async function Perfil({ params, searchParams }: Props) {
  const [{ token }, { quien }, viewer] = await Promise.all([params, searchParams, getViewer()])
  const p = await perfilPublico(db, token, quien)
  if (!p) notFound()
  const primer = p.nombre.split(' ')[0]
  const propio = viewer.userId === p.id
  // un dueño de la lista (el de este perfil u otro del grupo): su lista no se ve "como la ven", es la suya
  const dueno = propio || p.otros.some((o) => o.id === viewer.userId)
  // como en la lista: abrir el perfil de alguien con sesión sigue su lista (la de un dueño, no: es suya)
  if (viewer.userId && !dueno) await seguirLista(db, viewer.userId, p.listId, token)
  const noRegalar = p.secciones.find((s) => s.clave === 'noRegalar')
  const nota = p.secciones.find((s) => s.clave === 'nota')
  // "Lo que le gusta" es el resumen; los talles, lo que no y la nota van aparte. Sin nada de nada, recién ahí "no cargó".
  const hayGustos = paraResumen(p.secciones).length > 0
  const nadaCargado = p.secciones.length === 0
  // Al dueño, "Ver mi lista como la ven" lo llevaba a su propia lista de siempre (no hay vista previa: la de quien
  // regala tiene las reservas). Vuelve a su lista o a su grupo, y la flecha a donde vino.
  const suLista = p.tipo === 'grupo' ? { href: `/grupos/${p.listId}`, texto: 'Volver al grupo' } : { href: '/mi-lista', texto: 'Volver a mi lista' }
  const atras = !dueno ? { href: `/l/${token}`, texto: 'Volver a la lista' }
    : p.tipo === 'grupo' ? suLista : { href: '/perfil', texto: 'Volver a Perfil' }

  return (
    <main className="flex flex-col gap-5 pb-36 pt-2">
      <PageHeader title={propio ? 'Tu perfil público' : `Perfil de ${p.nombre.split(' ')[0]}`} titulo="p" back={atras.href} backLabel={atras.texto} />

      <section className="gr-hero flex flex-col items-center gap-3 p-6 text-center">
        <AvatarSticker id={p.id} nombre={p.nombre} foto={p.foto} size={96} className="ring-4 ring-gr-on-hero/15" />
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">{p.nombre}</h1>
        {p.cumple && (
          <p className="flex items-center gap-1.5 rounded-full bg-gr-on-hero/10 py-1.5 pl-2.5 pr-3.5 text-sm font-semibold">
            <Icon name="cake" size={16} className="flex-none" />
            {p.cumple.dias === 0 ? '¡Hoy es su cumple!' : `${p.cumple.dia} de ${MESES[p.cumple.mes - 1]} · en ${p.cumple.dias} ${p.cumple.dias === 1 ? 'día' : 'días'}`}
          </p>
        )}
        {propio && (
          <div className="mt-1 flex flex-col items-center gap-2 border-t border-gr-on-hero/10 pt-3.5">
            <p className="text-[13px] text-gr-on-hero/70">Así te ven los que abren tu lista</p>
            <Link href="/perfil/gustos" className="gr-btn gr-btn--sm">Editar mis gustos</Link>
          </div>
        )}
      </section>

      {p.otros.length > 0 && (
        <nav aria-label="Otros dueños de la lista" className="flex flex-wrap gap-2">
          {p.otros.map((o) => (
            <Link key={o.id} href={`/l/${token}/perfil?quien=${o.id}`} className="gr-chip gap-2">
              <AvatarSticker id={o.id} nombre={o.nombre} foto={o.foto} size={24} />Ver a {o.nombre.split(' ')[0]}
            </Link>
          ))}
        </nav>
      )}

      {hayGustos ? (
        <section aria-labelledby="le-gusta" className="flex flex-col gap-3">
          <h2 id="le-gusta" className="gr-heading">{propio ? 'Lo que te gusta' : 'Lo que le gusta'}</h2>
          <ResumenGustos secciones={p.secciones} />
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold underline underline-offset-4 [&::-webkit-details-marker]:hidden">
              Ver todo <Icon name="chevron" size={16} strokeWidth={2.2} className="transition-transform group-open:rotate-90" />
            </summary>
            <div className="gr-card mt-2 p-3.5"><SeccionesGustos secciones={p.secciones} /></div>
          </details>
        </section>
      ) : nadaCargado ? (
        <div className="relative rounded-[22px] bg-gr-soft px-5 py-6 text-center text-[15px] font-medium leading-snug">
          {propio ? 'Todavía no cargaste tus gustos.' : `${primer} todavía no cargó sus gustos.`}
          {propio && <Link href="/perfil/gustos" className="mt-2 block font-semibold underline underline-offset-4">Cargarlos ahora</Link>}
        </div>
      ) : propio && (
        <Link href="/perfil/gustos" className="self-start text-sm font-semibold underline underline-offset-4">
          Sumá lo que te gusta: deportes, hobbies, marcas…
        </Link>
      )}

      {p.talles && (
        <section aria-labelledby="talles" className="flex flex-col gap-3">
          <h2 id="talles" className="gr-heading">{propio ? 'Tus talles' : 'Sus talles'}</h2>
          <div className="gr-card flex justify-center p-3"><TallesIlustrados talles={p.talles} nombre={primer} /></div>
        </section>
      )}

      {noRegalar && (
        <section className="flex gap-3 rounded-[22px] border border-gr-line bg-gr-brand p-3.5 text-gr-bg">
          <IconoSeccion s={noRegalar} size={34} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-lg leading-tight font-semibold text-gr-acento">{propio ? 'Lo que no querés' : 'No le regales'}</h2>
            <p className="text-sm font-semibold">{noRegalar.items.join(' · ')}</p>
          </div>
        </section>
      )}

      {nota && (
        <p className="rounded-2xl bg-gr-soft px-3.5 py-3 text-sm leading-snug">
          <span className="font-semibold">{propio ? 'Tu nota' : `${primer} dice`}:</span> {nota.items[0]}
        </p>
      )}

      <Link href={dueno ? suLista.href : `/l/${token}`}
            className="gr-btn gr-btn--dark fixed bottom-7 left-1/2 z-10 h-[54px] -translate-x-1/2 whitespace-nowrap rounded-[18px] px-[22px]">
        <Icon name="gift" size={20} strokeWidth={2} />
        {dueno ? suLista.texto : `Ver la lista de ${primer}`}
      </Link>
    </main>
  )
}
