import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { getListForViewer } from '@/lib/lists'
import { getViewer } from '@/lib/viewer'
import { eventoDeLista, fechaLarga, seguirLista } from '@/lib/events'
import { relacionCon } from '@/lib/amigos'
import { AmigoEnLista, AvisoAmigo } from '@/components/Amigos'
import { BotonRobar } from '@/components/Novedades'
import { avisoDeCupo, type ClaimView, type OwnerItemView } from '@/lib/serialize'
import { identificado } from '@/lib/types'
import { nombreDeViewer } from '@/lib/guest'
import { historialDeLista } from '@/lib/regalos'
import { listaParaCompartir } from '@/lib/compartir'
import { gustosDeLista } from '@/lib/bienvenida'
import { TarjetaPerfil } from '@/components/Gustos'
import { Codazo } from '@/components/Codazo'
import { CartelReserva, GuestGate } from '@/components/GuestGate'
import { Buscador } from '@/components/Buscador'
import { BUSCAR_DESDE, paraBuscar } from '@/lib/buscar'
import { QuienSeOcupo } from '@/components/QuienSeOcupo'
import { ConfirmarLista, ExDueno, NoSoyYo, OtraCuenta, QuienSos } from '@/components/Identidad'
import { Banners } from '@/components/Banners'
import { SorpresasEnLista } from '@/components/Sorpresas'
import { Sello, type TipoSello } from '@/components/Sello'
import { esSorpresa, sorpresasPara } from '@/lib/sorpresas'
import { Arte, AvatarStack, AvatarSticker, BackLink, Icon, PriorityTag, LogoSticker, Tapa } from '@/components/ui'
import { colorDe, tapaDe } from '@/lib/tapas'
import { AvatarDeLista } from '@/components/ListaEnComun'

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

/** Sobre la foto: el deseo tiene un video (se ve en el deseo, ver VideoDeseo). */
function ConVideo({ className }: { className: string }) {
  return (
    <span className={`pointer-events-none inline-flex items-center gap-1 rounded-full bg-gr-brand/90 px-2 py-1 text-xs font-semibold text-gr-on-brand ${className}`}>
      <Icon name="play" size={14} strokeWidth={2.2} />Video
    </span>
  )
}

/**
 * El sello chico de un deseo que te toca, el mismo que lleva grande en su página: lo reservaste, lo compraste o se compró
 * el regalo grupal en el que estás.
 */
function selloDe(item: Tarjeta): TipoSello | null {
  const mia = item.claims.find((c) => c.esMia && !c.grupal)
  if (mia) return mia.estado === 'comprado' ? 'listo' : 'tuyo'
  return item.claims.some((c) => c.grupal?.soyParte && c.estado === 'comprado') ? 'todos' : null
}

function YaLoReservaste({ item }: { item: Tarjeta }) {
  const grupal = item.claims.some((c) => c.grupal?.soyParte)
  const compraste = item.claims.some((c) => c.esMia && !c.grupal && c.estado === 'comprado')
  return (
    <span className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-gr-brand px-3.5 text-[13px] font-semibold text-gr-on-brand">
      <Icon name={grupal ? 'users' : compraste ? 'check' : 'lock'} size={14} strokeWidth={2.2} className="text-gr-acento-sobre-tinta" />
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
  searchParams: Promise<{ cat?: string; disp?: string; codazo?: string; reserva?: string; amigo?: string }>
}) {
  const { token } = await params
  const { cat, disp, codazo, reserva, amigo } = await searchParams
  const viewer = await getViewer()
  const vista = await getListForViewer(db, token, viewer)
  if (!vista) {
    // el link de una sorpresa (un aviso, Cuentas de antes): a la suya, que decide quién la ve
    if (await esSorpresa(db, token)) redirect(`/sorpresa/${token}`)
    notFound()
  }
  if (vista.role === 'owner') redirect(vista.tipo === 'grupo' ? `/grupos/${vista.listId}` : '/mi-lista')

  // Abrirla con sesión la guarda entre las listas que seguís: su cumple o fecha aparece en tus Eventos.
  // veTodo: ve la coordinación. identified: tiene nombre (sesión o invitado), aunque en esta lista todavía no la vea.
  const veTodo = vista.role === 'giver'
  const identified = identificado(viewer)
  // con tu cuenta, en la lista personal de alguien: sumarlo como amigo (ver AmigoEnLista) y regalarle algo que no está en
  // su lista (las sorpresas, solo para los que ven la coordinación con sesión)
  const dueno = !vista.grupoNombre && vista.perfiles.length === 1 ? vista.perfiles[0] : null
  const [evento, historial, gustos, quien, sorpresas] = await Promise.all([
    eventoDeLista(db, vista.listId),
    // el historial de quién compró qué es para los que regalan con nombre, no para cualquiera con el link
    veTodo ? historialDeLista(db, vista.listId, viewer) : null,
    gustosDeLista(db, vista.listId),
    identified ? nombreDeViewer(db, viewer) : null,
    veTodo && viewer.userId && dueno ? sorpresasPara(db, dueno.id, viewer.userId) : null,
    viewer.userId ? seguirLista(db, viewer.userId, vista.listId, token) : null,
  ])
  const relacion = viewer.userId && dueno ? await relacionCon(db, viewer.userId, dueno.id) : null
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
  // Con cuenta o con su nombre, "Reservar" lleva al deseo, que pregunta cómo: lo compra él o lo dividen con amigos (ver
  // ComoLoRegalas). Un invitado sin nombre solo puede reservarlo: lo hace acá, como siempre.
  const reservar = (itemId: string, variant?: 'primary') => vista.role === 'anonimo' && vista.motivo !== 'sin_identidad'
    ? null
    : vista.role === 'giver'
      ? <Link href={`/l/${token}/item/${itemId}?reservar=1#reservar`} className={variant === 'primary' ? 'gr-btn-primary w-full min-h-12' : 'gr-btn gr-btn--sm w-full'}>Reservar</Link>
      : <GuestGate token={token} itemId={itemId} identified={identified} variant={variant} volver={aqui} conCartel={!!reserva} />

  // su tapa: la del dueño (la que eligió, o la que le toca), o la de la lista en común
  const color = dueno ? tapaDe(dueno.id) : colorDe(vista.listId)

  const heroAccion = hero && (hero.claims.some((c) => c.esMia || c.grupal?.soyParte)
    ? <YaLoReservaste item={hero} />
    : reservar(hero.id, 'primary'))
  const heroCupo = hero && cupo(hero)
  const heroSello = hero && selloDe(hero)

  return (
    <main className="flex flex-col gap-4 pb-36">
      {/* Su tapa: su color pinta media pantalla y se funde con el fondo, con su foto y su nombre enormes */}
      <Tapa color={color}>
        <header className="grid min-h-14 grid-cols-[44px_1fr_44px] items-center">
          {/* con tu cuenta, abajo está la barra; volver lleva a tu gente */}
          <div>{viewer.userId && <BackLink href="/gente" label="Volver a tu gente" />}</div>
          <LogoSticker className="justify-self-center" />
        </header>
        <div className="mt-1.5 flex flex-col items-center gap-3 text-center">
          {/* la foto lleva al perfil (en un grupo, al del primero; desde ahí se pasa a los demás) */}
          <Link href={`/l/${token}/perfil`} aria-label={`Ver el perfil de ${vista.ownerNombre}`} className="flex-none rounded-full">
            {vista.grupoFoto
              ? <AvatarDeLista nombre={vista.grupoNombre ?? ''} foto={vista.grupoFoto} duenos={vista.perfiles} size={104} />
              : vista.grupoNombre
                ? <AvatarStack nombres={vista.duenos} fotos={vista.perfiles.map((d) => d.foto)} size={72} />
                : <AvatarSticker nombre={vista.ownerNombre} foto={vista.perfiles[0]?.foto} size={104} className="bg-gr-surface" />}
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="gr-title text-[40px] [overflow-wrap:anywhere]">
              {vista.grupoNombre ?? <><span className="sr-only">Lista de </span>{vista.ownerNombre}</>}
            </h1>
            <p className="gr-tapa__sub text-sm">
              {cuenta ?? <>{vista.grupoNombre && `${vista.relacion ?? `De ${vista.ownerNombre}`}. `}Elegí, reservá y no te duplicás con nadie.</>}
            </p>
          </div>
          <Link href={`/l/${token}/perfil`} className="gr-btn w-full">
            {vista.duenos.length > 1 ? 'Sus perfiles y sus gustos' : 'Su perfil y sus gustos'}
          </Link>
          {veTodo && (
            <p className="gr-tapa__sub flex items-center gap-1.5 text-[12.5px]">
              <Icon name="lock" size={13} className="flex-none" />
              {vista.ownerNombre} no {vista.duenos.length > 1 ? 'ven' : 've'} quién reserva qué
            </p>
          )}
        </div>
      </Tapa>

      <AvisoAmigo amigo={amigo} />
      {dueno && relacion && <AmigoEnLista dueno={{ ...dueno, usuario: null }} relacion={relacion} volver={`/l/${token}`} />}

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

      {/* una lista larga: buscar algo puntual (en lo que se ve con el filtro elegido) */}
      {mostrados.length >= BUSCAR_DESDE && <Buscador ambito="su-lista" placeholder="Buscar en la lista" vacio="No hay nada con «%s» en esta lista." />}

      <div id="su-lista" className="flex flex-col gap-4">
        {hero && (
          <article data-buscar={paraBuscar(`${hero.titulo} ${hero.categoria ?? ''} ${hero.notas ?? ''}`)} className="gr-card relative">
            <div className="relative">
              {/* la foto lleva al deseo, como "Ver más" (que ya lo dice para los lectores de pantalla) */}
              <Link href={`/l/${token}/item/${hero.id}`} aria-hidden tabIndex={-1} className="block">
                <Arte src={hero.fotoUrl} titulo={hero.titulo} className="rounded-none" style={{ aspectRatio: '4 / 3' }} />
              </Link>
              <PriorityTag prioridad={hero.prioridad} className="pointer-events-none absolute left-3 top-3 h-[30px]" />
              {hero.videoUrl && <ConVideo className="absolute bottom-3 left-3" />}
              {heroSello && <Sello chico tipo={heroSello} clave={hero.id} size={52} className="absolute bottom-2 right-2" />}
              {/* "Me lo robo": con tu cuenta, sumarlo a tu lista */}
              {viewer.userId && <BotonRobar token={token} itemId={hero.id} variante="icono" className="absolute right-3 top-3 z-[2]" />}
            </div>
            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-1">
                <Link href={`/l/${token}/item/${hero.id}`} className="text-[22px] leading-tight font-extrabold tracking-[-0.03em] [overflow-wrap:anywhere]">
                  {hero.titulo}
                </Link>
                {(hero.precio ?? hero.rangoPrecio) && <p className="text-[17px] font-bold tabular-nums">{hero.precio ?? hero.rangoPrecio}</p>}
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
          <ul data-buscar-grupo className="grid grid-cols-2 items-stretch gap-x-3 gap-y-[18px]">
            {resto.map((item) => {
              const yaEsMio = item.claims.some((c) => c.esMia || c.grupal?.soyParte)
              const cuantas = cupo(item)
              const sello = selloDe(item)
              return (
                <li key={item.id} data-buscar={paraBuscar(`${item.titulo} ${item.categoria ?? ''} ${item.notas ?? ''}`)} className="relative flex flex-col gap-2">
                  <div className="relative">
                    <Link href={`/l/${token}/item/${item.id}`} aria-hidden tabIndex={-1} className="block">
                      <Arte src={item.fotoUrl} titulo={item.titulo} apagado={!item.disponible} />
                    </Link>
                    {sello && <Sello chico tipo={sello} clave={item.id} size={44} className="absolute left-1.5 top-1.5" />}
                    {item.videoUrl && <ConVideo className={`absolute top-2 ${sello ? 'left-12' : 'left-2'}`} />}
                    {viewer.userId && <BotonRobar token={token} itemId={item.id} variante="icono" className="absolute right-2 top-2 z-[2]" />}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 px-0.5">
                    <Link href={`/l/${token}/item/${item.id}`} className="line-clamp-2 text-[15px] leading-tight font-bold tracking-[-0.01em] [overflow-wrap:anywhere]">
                      {item.titulo}
                    </Link>
                    <div className="flex items-center gap-1.5">
                      {(item.precio ?? item.rangoPrecio) && <p className="text-[13px] text-gr-muted tabular-nums">{item.precio ?? item.rangoPrecio}</p>}
                      {item.disponible && <PriorityTag prioridad={item.prioridad} className="h-6 px-2" />}
                    </div>
                    {/* lo que ya no está libre, con el puntito del acento */}
                    {!item.disponible && (
                      <p className="flex items-start gap-1.5 text-xs leading-snug font-bold [overflow-wrap:anywhere]">
                        <i aria-hidden className="mt-[5px] size-[7px] flex-none rounded-full bg-gr-acento" />{estadoNoDisponible(item)}
                      </p>
                    )}
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
      </div>

      {sorpresas && dueno && <SorpresasEnLista token={token} nombre={dueno.nombre} sorpresas={sorpresas} />}

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
