import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { getViewer } from '@/lib/viewer'
import { MESES, seguirLista } from '@/lib/events'
import { perfilPublico } from '@/lib/perfil'
import { IconoSeccion, paraResumen, ResumenGustos, SeccionesGustos } from '@/components/Gustos'
import { TallesIlustrados } from '@/components/TallesIlustrados'
import { AvatarSticker, BackLink, Icon, Starburst } from '@/components/ui'

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
    <main className="flex flex-col gap-5 pb-32 pt-[52px]">
      <div className="flex items-center justify-between">
        <BackLink href={atras.href} label={atras.texto} />
        {propio && (
          <Link href="/bienvenida?editar=1" className="gr-btn gr-btn--sm rounded-[14px] px-4 font-sans text-sm font-bold">Editar mis gustos</Link>
        )}
      </div>

      {propio && (
        <p className="self-start rounded-full bg-gr-ink px-3.5 py-2 text-[13px] font-semibold text-gr-bg">Así te ven los que abren tu lista</p>
      )}

      <div className="relative flex items-center gap-4">
        <AvatarSticker nombre={p.nombre} foto={p.foto} size={96} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-display text-[34px] leading-none font-extrabold tracking-[-0.04em] [overflow-wrap:anywhere]">{p.nombre}</h1>
          {p.cumple && (
            <p className="flex items-center gap-1.5 self-start rounded-full border-[2.5px] border-gr-ink bg-gr-accent px-3 py-1 text-[13px] font-bold">
              <Icon name="cake" size={16} strokeWidth={2.4} />
              {p.cumple.dias === 0 ? '¡Hoy es su cumple!' : `${p.cumple.dia} de ${MESES[p.cumple.mes - 1]} · en ${p.cumple.dias} ${p.cumple.dias === 1 ? 'día' : 'días'}`}
            </p>
          )}
        </div>
      </div>

      {p.otros.length > 0 && (
        <nav aria-label="Otros dueños de la lista" className="flex flex-wrap gap-2">
          {p.otros.map((o) => (
            <Link key={o.id} href={`/l/${token}/perfil?quien=${o.id}`} className="gr-chip gap-2">
              <AvatarSticker nombre={o.nombre} foto={o.foto} size={24} className="rotate-0" />Ver a {o.nombre.split(' ')[0]}
            </Link>
          ))}
        </nav>
      )}

      {hayGustos ? (
        <section aria-labelledby="le-gusta" className="flex flex-col gap-3">
          <h2 id="le-gusta" className="font-display text-[24px] leading-none font-extrabold tracking-[-0.03em]">{propio ? 'Lo que te gusta' : 'Lo que le gusta'}</h2>
          <ResumenGustos secciones={p.secciones} />
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-bold underline decoration-2 underline-offset-4 [&::-webkit-details-marker]:hidden">
              Ver todo <Icon name="chevron" size={16} strokeWidth={2.6} className="transition-transform group-open:rotate-90" />
            </summary>
            <div className="gr-sticker mt-2 p-3.5"><SeccionesGustos secciones={p.secciones} /></div>
          </details>
        </section>
      ) : nadaCargado ? (
        <div className="relative rounded-sticker border-[2.5px] border-dashed border-gr-ink px-5 py-6 text-center text-[15px] font-medium leading-snug">
          <Starburst size={48} fontSize={42} className="absolute -right-2 -top-5 rotate-12">?</Starburst>
          {propio ? 'Todavía no cargaste tus gustos.' : `${primer} todavía no cargó sus gustos.`}
          {propio && <Link href="/bienvenida?editar=1" className="mt-2 block font-bold underline underline-offset-4">Cargarlos ahora</Link>}
        </div>
      ) : propio && (
        <Link href="/bienvenida?editar=1" className="self-start text-sm font-bold underline decoration-2 underline-offset-4">
          Sumá lo que te gusta: deportes, hobbies, marcas…
        </Link>
      )}

      {p.talles && (
        <section aria-labelledby="talles" className="flex flex-col gap-3">
          <h2 id="talles" className="font-display text-[24px] leading-none font-extrabold tracking-[-0.03em]">{propio ? 'Tus talles' : 'Sus talles'}</h2>
          <div className="gr-sticker flex justify-center p-3"><TallesIlustrados talles={p.talles} nombre={primer} /></div>
        </section>
      )}

      {noRegalar && (
        <section className="flex gap-3 rounded-sticker border-[3px] border-gr-ink bg-gr-ink p-3.5 text-gr-bg">
          <IconoSeccion s={noRegalar} size={34} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="font-display text-lg leading-tight font-extrabold text-gr-accent">{propio ? 'Lo que no querés' : 'No le regales'}</h2>
            <p className="text-sm font-semibold">{noRegalar.items.join(' · ')}</p>
          </div>
        </section>
      )}

      {nota && (
        <p className="rounded-2xl border-[2.5px] border-dashed border-gr-ink px-3.5 py-3 text-sm leading-snug">
          <span className="font-bold">{propio ? 'Tu nota' : `${primer} dice`}:</span> {nota.items[0]}
        </p>
      )}

      <Link href={dueno ? suLista.href : `/l/${token}`}
            className="gr-btn gr-btn--dark fixed bottom-7 left-1/2 z-10 h-[54px] -translate-x-1/2 -rotate-2 whitespace-nowrap rounded-[18px] border-[3px] px-[22px]">
        <Icon name="gift" size={20} strokeWidth={2.4} />
        {dueno ? suLista.texto : `Ver la lista de ${primer}`}
      </Link>
    </main>
  )
}
