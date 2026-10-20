import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { getListForViewer } from '@/lib/lists'
import { getViewer } from '@/lib/viewer'
import { eventoDeLista, fechaLarga, seguirLista } from '@/lib/events'
import type { GiverItemView } from '@/lib/serialize'
import { GuestGate } from '@/components/GuestGate'
import { Banners } from '@/components/Banners'
import { AvatarStack, AvatarSticker, Icon, ItemPhoto, PriceSticker, PriorityTag } from '@/components/ui'

function estadoNoDisponible(item: GiverItemView) {
  const comprado = item.claims.some((c) => c.estado === 'comprado')
  return comprado ? '✓ Comprado' : `Reservado por ${item.claims[0]?.claimerNombre ?? 'alguien'}`
}

function YaLoReservaste() {
  return (
    <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-gr-ink px-3 text-[13px] font-bold text-gr-accent">
      <Icon name="lock" size={14} strokeWidth={2.6} />Ya lo reservaste
    </span>
  )
}

export default async function ListaAjena({
  params, searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ cat?: string; disp?: string }>
}) {
  const { token } = await params
  const { cat, disp } = await searchParams
  const viewer = await getViewer()
  const vista = await getListForViewer(db, token, viewer)
  if (!vista) notFound()
  if (vista.role === 'owner') redirect(vista.tipo === 'grupo' ? `/grupos/${vista.listId}` : '/mi-lista')

  // Abrirla con sesión la guarda entre las listas que seguís: su cumple o fecha aparece en tus Eventos.
  const [evento] = await Promise.all([
    eventoDeLista(db, vista.listId),
    viewer.userId ? seguirLista(db, viewer.userId, vista.listId) : null,
  ])
  const cuenta = evento && evento.dias <= 60
    ? `${evento.esCumple ? 'Cumple' : 'Es'} ${evento.dias === 0 ? 'hoy' : evento.dias === 1 ? 'mañana' : `en ${evento.dias} días`} · ${fechaLarga(evento.fecha)}`
    : null

  const identified = !!viewer.userId || !!viewer.guestId
  const categorias = [...new Set(vista.items.map((i) => i.categoria).filter(Boolean))] as string[]
  let mostrados = vista.items
  if (cat) mostrados = mostrados.filter((i) => i.categoria === cat)
  if (disp === '1') mostrados = mostrados.filter((i) => i.disponible)
  // disponibles primero, comprados al fondo
  mostrados = [...mostrados].sort((a, b) => Number(b.disponible) - Number(a.disponible))

  // Foto hero: el primer deseo de la lista tal como viene ordenada (solo si está disponible).
  const hero = mostrados[0]?.disponible ? mostrados[0] : undefined
  const resto = mostrados.filter((i) => i !== hero)

  return (
    <main className="flex flex-col gap-3 pb-32 pt-[52px]">
      <div className="flex items-center gap-3">
        {vista.grupoNombre ? <AvatarStack nombres={vista.duenos} size={48} /> : <AvatarSticker nombre={vista.ownerNombre} />}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="font-display text-[34px] leading-none font-extrabold tracking-[-0.04em] [overflow-wrap:anywhere]">
            {vista.grupoNombre ?? `Lista de ${vista.ownerNombre}`}
          </h1>
          <p className="text-sm font-medium">
            {vista.grupoNombre && `De ${vista.ownerNombre}. `}Elegí, reservá y no te duplicás con nadie.
          </p>
        </div>
      </div>

      {cuenta && (
        <p className="self-start -rotate-1 rounded-full border-[2.5px] border-gr-ink bg-gr-accent px-3.5 py-1.5 font-display text-[15px] font-extrabold">
          {cuenta}
        </p>
      )}

      <p className="flex items-center gap-2 self-start rounded-full bg-gr-ink px-3.5 py-2 text-[13px] font-semibold text-gr-bg">
        <Icon name="lock" size={16} strokeWidth={2.4} className="text-gr-accent" />
        {vista.ownerNombre} no {vista.duenos.length > 1 ? 'ven' : 've'} quién reserva qué
      </p>

      <Banners />

      <nav aria-label="Filtros" className="-mx-[18px] flex gap-2 overflow-x-auto px-[18px] py-1">
        <Link href={`/l/${token}`} aria-current={!cat && disp !== '1' ? 'page' : undefined} className="gr-chip">Todos</Link>
        <Link href={`/l/${token}?disp=1`} aria-current={disp === '1' ? 'page' : undefined} className="gr-chip">Disponibles</Link>
        {categorias.map((c) => (
          <Link key={c} href={`/l/${token}?cat=${encodeURIComponent(c)}`} aria-current={cat === c ? 'page' : undefined}
                className="gr-chip">
            {c}
          </Link>
        ))}
      </nav>

      {mostrados.length === 0 && (
        <p className="mt-8 rounded-sticker border-[2.5px] border-dashed border-gr-ink px-5 py-8 text-center text-[15px] font-medium">
          Todavía no cargó nada — mandale un codazo
        </p>
      )}

      {hero && (
        <article className="gr-sticker relative mt-1 rounded-3xl shadow-[6px_6px_0_var(--gr-ink)]">
          <div className="relative">
            <ItemPhoto src={hero.fotoUrl} titulo={hero.titulo} height={222} />
            <PriorityTag prioridad={hero.prioridad} className="absolute left-3 top-3 h-[30px]" />
            {(hero.precio ?? hero.rangoPrecio) && (
              <PriceSticker rotate={-5} className="right-3 rounded-xl px-2.5 py-1 text-lg">{hero.precio ?? hero.rangoPrecio}</PriceSticker>
            )}
          </div>
          <div className="flex flex-col gap-2.5 p-3.5">
            <div className="flex flex-col gap-1">
              <Link href={`/l/${token}/item/${hero.id}`} className="font-display text-[22px] leading-tight font-extrabold tracking-[-0.02em] [overflow-wrap:anywhere]">
                {hero.titulo}
              </Link>
              {hero.notas && <p className="text-sm leading-snug">{hero.notas}</p>}
              {hero.cantidad > 1 && <p className="text-xs font-semibold text-gr-muted">quedan {hero.quedan} de {hero.cantidad}</p>}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-[1.3]">
                {hero.claims.some((c) => c.esMia)
                  ? <YaLoReservaste />
                  : <GuestGate token={token} itemId={hero.id} identified={identified} variant="primary" />}
              </div>
              <Link href={`/l/${token}/item/${hero.id}`} className="gr-btn min-h-[50px] flex-1 font-sans text-sm font-bold">Ver más</Link>
            </div>
          </div>
        </article>
      )}

      {resto.length > 0 && (
        <ul className="mt-1.5 grid grid-cols-2 items-start gap-3.5 pr-[5px]">
          {resto.map((item, i) => {
            const yaEsMio = item.claims.some((c) => c.esMia)
            return (
              <li key={item.id} className="gr-sticker relative rounded-[20px] shadow-[4px_4px_0_var(--gr-ink)]"
                  style={{ transform: `rotate(${i % 2 ? 1 : -1}deg)` }}>
                <div className="relative">
                  <ItemPhoto src={item.fotoUrl} titulo={item.titulo} height={116} dimmed={!item.disponible} />
                  {item.disponible
                    ? <PriorityTag prioridad={item.prioridad} className="absolute left-2 top-2" />
                    : (
                      <span className="absolute left-2.5 top-10 max-w-[calc(100%-20px)] -rotate-8 rounded-[10px] bg-gr-ink px-2.5 py-1.5 font-display text-[15px] leading-tight font-extrabold text-gr-accent">
                        {estadoNoDisponible(item)}
                      </span>
                    )}
                </div>
                <div className="flex flex-col gap-1 px-2.5 pb-2.5 pt-2">
                  <Link href={`/l/${token}/item/${item.id}`} className="font-display text-[15px] leading-tight font-extrabold [overflow-wrap:anywhere]">
                    {item.titulo}
                  </Link>
                  {(item.precio ?? item.rangoPrecio) && <p className="text-xs font-semibold">{item.precio ?? item.rangoPrecio}</p>}
                  {item.cantidad > 1 && <p className="text-xs text-gr-muted">quedan {item.quedan} de {item.cantidad}</p>}
                  <div className="mt-1 flex flex-col items-start gap-0.5">
                    {item.disponible && (yaEsMio
                      ? <YaLoReservaste />
                      : <GuestGate token={token} itemId={item.id} identified={identified} />)}
                    <Link href={`/l/${token}/item/${item.id}`}
                          className="inline-flex min-h-11 items-center text-[13px] font-bold underline decoration-2 underline-offset-4">
                      Ver más
                    </Link>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 bg-gr-ink text-gr-bg">
        <div className="mx-auto flex h-[74px] max-w-md items-center justify-between px-[18px] pb-2.5">
          <p className="text-[13px] font-medium">¿Y vos qué querés?</p>
          <Link href="/" className="inline-flex h-11 items-center rounded-[14px] bg-gr-accent px-4 font-display text-[15px] font-extrabold text-gr-ink">
            Armá tu lista →
          </Link>
        </div>
      </div>
    </main>
  )
}
