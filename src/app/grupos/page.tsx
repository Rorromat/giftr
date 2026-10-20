import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { juntarNombres, misGrupos, type GrupoResumen } from '@/lib/groups'
import { diaMes, hoyLocal, proximaDeGrupo } from '@/lib/events'
import { AvatarStack, BottomNav, ItemPhoto, Starburst } from '@/components/ui'

/** Mosaico de fotos del grupo: una grande y, si hay más, una chica arriba y "+N" abajo. */
function Mosaico({ g }: { g: GrupoResumen }) {
  const [a, b] = g.fotos
  if (!a) return <ItemPhoto src={null} titulo={g.nombre} height={150} />
  if (!b) return <ItemPhoto src={a} titulo={g.nombre} height={150} />
  const resto = g.cantidad - 2
  return (
    <div className="grid h-[150px] grid-cols-[2fr_1fr] grid-rows-2 border-b-[3px] border-gr-ink">
      {/* eslint-disable-next-line @next/next/no-img-element -- fotos de tiendas externas */}
      <img src={a} alt="" className="row-span-2 size-full border-r-[3px] border-gr-ink object-cover" />
      {/* eslint-disable-next-line @next/next/no-img-element -- fotos de tiendas externas */}
      <img src={b} alt="" className="size-full border-b-[3px] border-gr-ink object-cover" />
      {resto > 0
        ? <span className="flex items-center justify-center bg-gr-ink font-display text-2xl font-extrabold text-gr-accent">+{resto}</span>
        : <span className="bg-gr-dot" />}
    </div>
  )
}

export default async function Grupos() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [grupos, hoy] = [await misGrupos(db, session.userId), hoyLocal()]

  return (
    <main className="flex flex-col gap-4 pb-32 pt-[52px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="gr-title">Grupos</h1>
          <p className="text-[15px] font-medium">Pidan juntos, que les regalen juntos.</p>
        </div>
        <Link href="/grupos/nuevo" className="gr-btn-primary gr-btn--sm mt-2 min-h-11 flex-none rotate-2 rounded-[14px]">+ Crear</Link>
      </div>

      {grupos.length === 0 && (
        <Link href="/grupos/nuevo" className="gr-sticker relative mt-4 flex flex-col items-center gap-2 px-5 py-8 text-center">
          <Starburst size={52} fontSize={50} className="absolute -right-2 -top-6 rotate-12">+</Starburst>
          <span className="font-display text-xl font-extrabold">Armá tu primer grupo</span>
          <span className="text-[15px] font-medium">“Nuestra casa”, “El cumple de los mellizos”… una lista para pedir de a dos o más.</span>
        </Link>
      )}

      <ul className="flex flex-col gap-5">
        {grupos.map((g, i) => {
          const otros = g.duenos.filter((d) => d.id !== session.userId).map((d) => d.nombre)
          const fecha = proximaDeGrupo(g.eventoFecha, g.eventoAnual, hoy)
          const detalle = [
            otros.length ? `Con ${juntarNombres(otros)}` : 'Solo vos por ahora',
            g.descripcion,
            fecha && `el ${diaMes(fecha)}`,
            `${g.cantidad} ${g.cantidad === 1 ? 'regalo' : 'regalos'}`,
          ].filter(Boolean).join(' · ')
          return (
            <li key={g.id} style={{ transform: `rotate(${i % 2 ? 0.6 : -0.6}deg)` }}>
              <Link href={`/grupos/${g.id}`} className="gr-sticker block rounded-3xl shadow-[6px_6px_0_var(--gr-ink)]">
                <Mosaico g={g} />
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <h2 className="font-display text-[24px] leading-tight font-extrabold tracking-[-0.03em] [overflow-wrap:anywhere]">{g.nombre}</h2>
                    <p className="text-sm font-medium leading-snug [overflow-wrap:anywhere]">{detalle}</p>
                  </div>
                  <AvatarStack nombres={g.duenos.map((d) => d.nombre)} />
                </div>
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="mt-1 rounded-sticker border-[2.5px] border-dashed border-gr-ink px-5 py-4 text-center text-[15px] font-medium leading-snug">
        Un grupo es una lista en común, como las cosas para la casa con tu pareja. Los que regalan la ven como una sola lista.
      </p>

      <BottomNav active="grupos" />
    </main>
  )
}
