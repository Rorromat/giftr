import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { misAmigosInvisibles, tambienTeToco } from '@/lib/amigo-invisible'
import { hoyLocal } from '@/lib/events'
import { datosDe, esFechaEspecial, vistaDe } from '@/lib/fechas-especiales'
import { miGente } from '@/lib/gente'
import { ArmarJuego, FilaJuego } from '@/components/AmigoInvisible'
import { IlustracionFecha } from '@/components/IlustracionFecha'
import { paletaDe } from '@/lib/colores-fechas'
import { AvatarSticker, Icon, PageHeader, Seccion } from '@/components/ui'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return { title: esFechaEspecial(slug) ? datosDe(slug).nombre : 'GiftR', robots: { index: false } }
}

/** Cuántos días después de la fecha sigue el juego acá (para "¿Quién me regaló?"). */
const PASADOS = 15

/**
 * Una fecha especial (Navidad, Día del Amigo…): qué se puede hacer. Un amigo invisible (los tuyos de esta fecha y armar
 * otro), o regalarle a tu gente: algo de su lista o una sorpresa; también a alguien que no usa GiftR.
 */
export default async function FechaEspecialPage({ params }: { params: Promise<{ slug: string }> }) {
  const [session, { slug }] = await Promise.all([auth(), params])
  if (!session?.userId) redirect('/')
  if (!esFechaEspecial(slug)) notFound()
  const hoy = hoyLocal()
  const v = vistaDe(slug, hoy)
  const [juegos, gente] = await Promise.all([misAmigosInvisibles(db, session.userId, hoy, PASADOS), miGente(db, session.userId, hoy)])
  const mios = juegos.filter((j) => j.fechaEspecial === slug)
  const tambien = tambienTeToco(juegos)
  const personales = gente.filter((c) => c.tipo === 'personal')

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <PageHeader title={v.nombre} back="/inicio" backLabel="Volver a Inicio" />

      <div className="relative flex min-h-[184px] flex-col gap-2.5 overflow-hidden rounded-[26px] p-[18px] pr-[132px] text-white shadow-card"
           style={{ background: paletaDe(slug).fondo }}>
        <IlustracionFecha fecha={slug} size={150} className="absolute -right-3 -bottom-3" />
        <span className="self-start whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-bold" style={{ color: paletaDe(slug).fondo }}>
          Fecha especial · {v.dias === 0 ? 'es hoy' : v.dias === 1 ? 'mañana' : `en ${v.dias} días`}
        </span>
        <h2 className="font-display text-[30px] leading-none font-bold tracking-tight">{v.nombre}</h2>
        <p className="text-sm opacity-90">{v.cuando}</p>
        <p className="text-sm leading-snug">{v.aQuien} Algo de su lista, una sorpresa o un amigo invisible.</p>
      </div>

      <section aria-labelledby="invisible-titulo" className="flex flex-col gap-2.5">
        <h2 id="invisible-titulo" className="gr-label">Amigo invisible</h2>
        {mios.map((j) => <FilaJuego key={j.id} j={j} tambien={tambien.get(j.id)} />)}
        <ArmarJuego fecha={slug} />
      </section>

      <section aria-labelledby="gente-titulo" className="flex flex-col gap-2.5">
        <h2 id="gente-titulo" className="gr-label">Regalale a tu gente</h2>
        {personales.length > 0 ? (
          <ul className="flex flex-col divide-y divide-gr-line rounded-2xl border border-gr-line bg-gr-surface px-3">
            {personales.map((c) => (
              <li key={c.listId} className="flex min-h-16 items-center gap-3 py-2">
                <AvatarSticker id={c.duenos[0]?.id} nombre={c.nombre} foto={c.duenos[0]?.foto} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{c.nombre}</span>
                  <span className="block text-[13px] text-gr-muted">{c.deseos === 1 ? '1 deseo' : `${c.deseos} deseos`}</span>
                </span>
                <Link href={c.href} className="gr-btn gr-btn--sm flex-none px-3">Su lista</Link>
                <Link href={`/sorpresa/nueva?para=${encodeURIComponent(c.href.slice('/l/'.length))}`} aria-label={`Armarle una sorpresa a ${c.nombre}`}
                      className="gr-btn gr-btn--sm flex-none px-3"><Icon name="gift" size={18} /></Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gr-empty">
            Acá aparece tu gente: abrí con tu cuenta el link de la lista de alguien, o{' '}
            <Link href="/gente/agregar" className="font-semibold underline underline-offset-2">sumá amigos</Link>.
          </p>
        )}
        <Link href="/sorpresa/nueva?sin=1" className="gr-card flex items-center gap-3 px-4 py-3.5">
          <span aria-hidden className="flex size-11 flex-none items-center justify-center rounded-full bg-gr-soft"><Icon name="gift" size={22} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Alguien que no usa GiftR</span>
            <span className="block text-[13px] leading-snug text-gr-muted">Una sorpresa para dividir con amigos.</span>
          </span>
          <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
        </Link>
      </section>
    </Seccion>
  )
}
