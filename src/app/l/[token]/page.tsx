import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { getListForViewer } from '@/lib/lists'
import { getViewer } from '@/lib/viewer'
import { eventoDeLista, fechaLarga, seguirLista } from '@/lib/events'
import { avisoDeCupo, type ClaimView, type OwnerItemView } from '@/lib/serialize'
import { identificado } from '@/lib/types'
import { nombreDeViewer } from '@/lib/guest'
import { historialDeLista } from '@/lib/regalos'
import { listaParaCompartir } from '@/lib/compartir'
import { gustosDeLista } from '@/lib/bienvenida'
import { TarjetaPerfil } from '@/components/Gustos'
import { Codazo } from '@/components/Codazo'
import { CartelReserva, GuestGate } from '@/components/GuestGate'
import { QuienSeOcupo } from '@/components/QuienSeOcupo'
import { ConfirmarLista, ExDueno, NoSoyYo, OtraCuenta, QuienSos } from '@/components/Identidad'
import { Banners } from '@/components/Banners'
import { AvatarStack, AvatarSticker, Icon, ItemPhoto, PriorityTag, LogoSticker } from '@/components/ui'

// Lo que se dibuja de cada deseo. Sin identificarse no hay estados: todos se ven igual y "Reservar" pide el nombre.
type Tarjeta = OwnerItemView & { claims: ClaimView[]; disponible: boolean; quedan: number | null }

function estadoNoDisponible(item: Tarjeta) {
  // comprado solo si ya se compró todo; si no, quién se ocupa (sin esconder a los demás detrás del primero)
  if (item.claims.length && item.claims.every((c) => c.estado === 'comprado')) return '✓ Comprado'
  const grupal = item.claims.find((c) => c.grupal && c.estado === 'reservado')?.grupal
  if (grupal && item.claims.length === 1) {
    if (grupal.soyParte) return 'Estás en el regalo grupal'
    // al que sacó el encargado no se lo invita: no se puede sumar (ver sumarseARegalo)
    return `Regalo grupal de ${grupal.personas.length}${grupal.meSacaron ? '' : ' · sumate'}`
  }
  const primero = item.claims.find((c) => c.esMia) ?? item.claims[0]
  const otros = item.claims.length - 1
  return `Reservado por ${primero ? (primero.esMia ? 'vos' : primero.claimerNombre) : 'alguien'}${otros > 0 ? ` y ${otros} más` : ''}`
}

/** Cuántas quedan de un deseo de varias unidades, o cuántas reservas hay de más (ver avisoDeCupo). */
function cupo(item: Tarjeta) {
  const c = avisoDeCupo(item, item.claims.length)
  if (!c) return null
  return c.deMas ? `Pide ${item.cantidad} y hay ${c.reservas} reservas: arréglenlo en el deseo` : `quedan ${c.quedan} de ${item.cantidad}`
}

function YaLoReservaste({ item }: { item: Tarjeta }) {
  const grupal = item.claims.some((c) => c.grupal?.soyParte)
  const compraste = item.claims.some((c) => c.esMia && !c.grupal && c.estado === 'comprado')
  return (
    <span className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-gr-brand px-3.5 text-[13px] font-semibold text-gr-on-brand">
      <Icon name={grupal ? 'users' : compraste ? 'check' : 'lock'} size={14} strokeWidth={2.2} className="text-gr-accent" />
      {grupal ? 'En el regalo grupal' : compraste ? 'Ya lo compraste' : 'Ya lo reservaste'}
    </span>
  )
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const l = await listaParaCompartir(db, token)
  if (!l) return {}
  const titulo = l.grupoNombre ?? `Lista de ${l.para.split(' ')[0]}`
  const descripcion = `${l.cantidad} ${l.cantidad === 1 ? 'deseo' : 'deseos'}. Elegí, reservá y no te duplicás con nadie.`
  return { title: titulo, description: descripcion, openGraph: { title: titulo, description: descripcion, url: `/l/${token}` } }
}

export default async function ListaAjena({
  params, searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ cat?: string; disp?: string; codazo?: string; reserva?: string }>
}) {
  const { token } = await params
  const { cat, disp, codazo, reserva } = await searchParams
  const viewer = await getViewer()
  const vista = await getListForViewer(db, token, viewer)
  if (!vista) notFound()
  if (vista.role === 'owner') redirect(vista.tipo === 'grupo' ? `/grupos/${vista.listId}` : '/mi-lista')

  // Abrirla con sesión la guarda entre las listas que seguís: su cumple o fecha aparece en tus Eventos.
  // veTodo: ve la coordinación. identified: tiene nombre (sesión o invitado), aunque en esta lista todavía no la vea.
  const veTodo = vista.role === 'giver'
  const identified = identificado(viewer)
  const [evento, historial, gustos, quien] = await Promise.all([
    eventoDeLista(db, vista.listId),
    // el historial de quién compró qué es para los que regalan con nombre, no para cualquiera con el link
    veTodo ? historialDeLista(db, vista.listId, viewer) : null,
    gustosDeLista(db, vista.listId),
    identified ? nombreDeViewer(db, viewer) : null,
    viewer.userId ? seguirLista(db, viewer.userId, vista.listId, token) : null,
  ])
  const cuenta = evento && evento.dias <= 60
    ? `${evento.esCumple ? 'Cumple' : 'Es'} ${evento.dias === 0 ? 'hoy' : evento.dias === 1 ? 'mañana' : `en ${evento.dias} días`} · ${fechaLarga(evento.fecha)}`
    : null

  const tarjetas: Tarjeta[] = vista.role === 'giver'
    ? vista.items
    : vista.items.map((i) => ({ ...i, claims: [], disponible: true, quedan: null }))
  const categorias = [...new Set(tarjetas.map((i) => i.categoria).filter(Boolean))] as string[]
  let mostrados = tarjetas
  if (cat) mostrados = mostrados.filter((i) => i.categoria === cat)
  if (disp === '1' && veTodo) mostrados = mostrados.filter((i) => i.disponible)
  // disponibles primero, comprados al fondo
  mostrados = [...mostrados].sort((a, b) => Number(b.disponible) - Number(a.disponible))

  // Foto hero: el primer deseo de la lista tal como viene ordenada (solo si está disponible).
  const hero = mostrados[0]?.disponible ? mostrados[0] : undefined
  const resto = mostrados.filter((i) => i !== hero)

  // Si una reserva no sale, se vuelve acá con los mismos filtros (y sin el cartel cuando la próxima sale bien).
  const filtros = new URLSearchParams({ ...(cat && { cat }), ...(disp === '1' && { disp }) }).toString()
  const aqui = `/l/${token}${filtros ? `?${filtros}` : ''}`
  // Sin nombre, "Reservar" lo pide. Un invitado que todavía no dijo que esta lista no es suya, primero lo dice (así ve
  // qué está libre de verdad); en un navegador donde entró con su cuenta alguien de la lista, no (ver accesoALista).
  const reservar = (itemId: string, variant?: 'primary') => vista.role === 'anonimo' && vista.motivo !== 'sin_identidad'
    ? null
    : <GuestGate token={token} itemId={itemId} identified={identified} variant={variant} volver={aqui} conCartel={!!reserva} />

  const heroAccion = hero && (hero.claims.some((c) => c.esMia || c.grupal?.soyParte)
    ? <YaLoReservaste item={hero} />
    : reservar(hero.id, 'primary'))
  const heroCupo = hero && cupo(hero)

  return (
    <main className="flex flex-col gap-4 pb-36 pt-2">
      <header className="flex min-h-14 items-center justify-center"><LogoSticker /></header>

      <section className="gr-hero flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3.5">
          {/* la foto lleva al perfil (en un grupo, al del primero; desde ahí se pasa a los demás) */}
          <Link href={`/l/${token}/perfil`} aria-label={`Ver el perfil de ${vista.ownerNombre}`} className="flex-none">
            {vista.grupoNombre
              ? <AvatarStack nombres={vista.duenos} fotos={vista.perfiles.map((d) => d.foto)} size={52} />
              : <AvatarSticker nombre={vista.ownerNombre} foto={vista.perfiles[0]?.foto} size={64} className="ring-2 ring-gr-on-hero/20" />}
          </Link>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">
              {vista.grupoNombre ?? `Lista de ${vista.ownerNombre}`}
            </h1>
            <p className="text-sm text-gr-on-hero/70">
              {vista.grupoNombre && `De ${vista.ownerNombre}. `}Elegí, reservá y no te duplicás con nadie.
            </p>
          </div>
        </div>

        {cuenta && (
          <p className="flex items-center gap-2 self-start rounded-full bg-gr-accent py-1.5 pl-2.5 pr-3.5 text-sm font-semibold text-gr-ink">
            <Icon name="cake" size={16} className="flex-none" />{cuenta}
          </p>
        )}

        {veTodo && (
          <p className="flex items-center gap-2 border-t border-gr-on-hero/10 pt-3.5 text-[13px] text-gr-on-hero/80">
            <Icon name="lock" size={16} className="flex-none text-gr-hero-detail" />
            {vista.ownerNombre} no {vista.duenos.length > 1 ? 'ven' : 've'} quién reserva qué
          </p>
        )}
      </section>

      {!veTodo && (vista.motivo === 'ex_dueno' ? <ExDueno />
        : vista.motivo === 'otra_cuenta' ? <OtraCuenta volver={aqui} />
          : vista.motivo === 'confirmar' && quien ? <ConfirmarLista token={token} nombre={quien} volver={aqui} />
            : <QuienSos token={token} volver={aqui} />)}

      <CartelReserva motivo={reserva} veTodo={veTodo} conNombre={identified} />

      {gustos.map((g) => (
        <TarjetaPerfil key={g.id} nombre={g.nombre} foto={vista.perfiles.find((d) => d.id === g.id)?.foto ?? null} secciones={g.secciones}
                       href={`/l/${token}/perfil${vista.perfiles[0]?.id === g.id ? '' : `?quien=${g.id}`}`} />
      ))}

      <Banners />

      <nav aria-label="Filtros" className="-mx-[18px] flex gap-2 overflow-x-auto px-[18px] py-1 [scrollbar-width:none]">
        <Link href={`/l/${token}`} aria-current={!cat && disp !== '1' ? 'page' : undefined} className="gr-chip">Todos</Link>
        {veTodo && <Link href={`/l/${token}?disp=1`} aria-current={disp === '1' ? 'page' : undefined} className="gr-chip">Disponibles</Link>}
        {categorias.map((c) => (
          <Link key={c} href={`/l/${token}?cat=${encodeURIComponent(c)}`} aria-current={cat === c ? 'page' : undefined}
                className="gr-chip">
            {c}
          </Link>
        ))}
      </nav>

      {mostrados.length === 0 && (
        <p className="gr-empty mt-4 py-8 text-center">
          {tarjetas.length ? 'No hay nada con ese filtro.' : `Todavía no ${vista.duenos.length > 1 ? 'cargaron' : 'cargó'} nada.`}
        </p>
      )}

      {hero && (
        <article className="gr-card relative">
          <div className="relative">
            <ItemPhoto src={hero.fotoUrl} titulo={hero.titulo} height={240} />
            <PriorityTag prioridad={hero.prioridad} className="absolute left-3 top-3 h-[30px]" />
          </div>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-1">
              <Link href={`/l/${token}/item/${hero.id}`} className="text-xl leading-snug font-semibold [overflow-wrap:anywhere]">
                {hero.titulo}
              </Link>
              {(hero.precio ?? hero.rangoPrecio) && <p className="text-[17px] font-semibold">{hero.precio ?? hero.rangoPrecio}</p>}
              {hero.notas && <p className="text-sm leading-snug text-gr-muted [overflow-wrap:anywhere]">{hero.notas}</p>}
              {heroCupo && <p className="text-xs font-semibold text-gr-muted">{heroCupo}</p>}
            </div>
            <div className="flex items-center gap-2">
              {heroAccion && <div className="flex-[1.3]">{heroAccion}</div>}
              <Link href={`/l/${token}/item/${hero.id}`} className="gr-btn gr-btn--sm flex-1">Ver más</Link>
            </div>
          </div>
        </article>
      )}

      {resto.length > 0 && (
        <ul className="grid grid-cols-2 items-stretch gap-3">
          {resto.map((item) => {
            const yaEsMio = item.claims.some((c) => c.esMia || c.grupal?.soyParte)
            const cuantas = cupo(item)
            return (
              <li key={item.id} className="gr-card relative flex flex-col">
                <div className="relative">
                  <ItemPhoto src={item.fotoUrl} titulo={item.titulo} height={150} dimmed={!item.disponible} />
                  {!item.disponible && (
                    <span className="absolute inset-x-2 bottom-2 rounded-xl bg-gr-brand/90 px-2.5 py-1.5 text-[13px] leading-tight font-semibold text-gr-accent [overflow-wrap:anywhere]">
                      {estadoNoDisponible(item)}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 px-3 pb-3 pt-2.5">
                  <Link href={`/l/${token}/item/${item.id}`} className="line-clamp-2 text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">
                    {item.titulo}
                  </Link>
                  <div className="flex items-center gap-1.5">
                    {(item.precio ?? item.rangoPrecio) && <p className="text-[15px] font-semibold">{item.precio ?? item.rangoPrecio}</p>}
                    {item.disponible && <PriorityTag prioridad={item.prioridad} className="h-6 px-2" />}
                  </div>
                  {cuantas && <p className="text-xs text-gr-muted">{cuantas}</p>}
                  <div className="mt-auto flex flex-col items-stretch gap-0.5 pt-1.5">
                    {item.disponible && (yaEsMio ? <YaLoReservaste item={item} /> : reservar(item.id))}
                    <Link href={`/l/${token}/item/${item.id}`}
                          className="inline-flex min-h-11 items-center justify-center text-[13px] font-semibold">
                      Ver más
                    </Link>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-2">
        <Codazo token={token} para={vista.grupoNombre ? vista.ownerNombre : vista.ownerNombre.split(' ')[0]} plural={vista.duenos.length > 1}
                identified={identified} conGoogle={vista.role === 'anonimo' && vista.motivo === 'otra_cuenta'} resultado={codazo} />
      </div>

      {historial && <QuienSeOcupo historial={historial} para={vista.ownerNombre} />}

      {/* viendo la lista, el nombre con el que reserva solo sale acá; con "¿Es tu lista?" arriba, el link ya va ahí */}
      {quien && !(vista.role === 'anonimo' && vista.motivo === 'confirmar') && (
        <div className="mt-2"><NoSoyYo nombre={quien} volver={`/l/${token}`} conCuenta={!!viewer.userId} /></div>
      )}

      {/* con cuenta ya tiene su lista, y abajo va la barra (ver el layout) */}
      {!viewer.userId && (
        <div className="gr-floatbar">
          <p className="text-sm font-medium">¿Y vos qué querés?</p>
          <Link href="/" className="gr-btn gr-btn--accent gr-btn--sm">Armá tu lista →</Link>
        </div>
      )}
    </main>
  )
}
