import { Fragment } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { getListForViewer } from '@/lib/lists'
import { getViewer, invitadoParaPreguntar } from '@/lib/viewer'
import { eventoDeLista, fechaLarga, seguirLista } from '@/lib/events'
import { relacionCon } from '@/lib/amigos'
import { AmigoEnLista, AvisoAmigo } from '@/components/Amigos'
import { BotonRobar } from '@/components/Novedades'
import { avisoDeCupo, type ClaimView, type OwnerItemView } from '@/lib/serialize'
import { identificado } from '@/lib/types'
import { linkParaVolver, nombreDeViewer } from '@/lib/guest'
import { historialDeLista } from '@/lib/regalos'
import { listaParaCompartir } from '@/lib/compartir'
import { gustosDeLista } from '@/lib/bienvenida'
import { TarjetaPerfil } from '@/components/Gustos'
import { Codazo } from '@/components/Codazo'
import { CartelReserva, GuestGate } from '@/components/GuestGate'
import { Buscador } from '@/components/Buscador'
import { BUSCAR_DESDE, paraBuscar } from '@/lib/buscar'
import { QuienSeOcupo } from '@/components/QuienSeOcupo'
import { ConfirmarLista, ExDueno, NoSoyYo, OtraCuenta, PreguntaInvitado, QuienSos } from '@/components/Identidad'
import { ReservaConfirmada, ultimoDia } from '@/components/ReservaConfirmada'
import { SoloConCuenta } from '@/components/SoloConCuenta'
import { Banners } from '@/components/Banners'
import { SorpresasEnLista } from '@/components/Sorpresas'
import { Sello, type TipoSello } from '@/components/Sello'
import { esSorpresa, sorpresasPara } from '@/lib/sorpresas'
import { Arte, AvatarStack, AvatarSticker, BackLink, Icon, PriorityTag, LogoSticker, Tapa } from '@/components/ui'
import { TAPA_EN_COMUN, TAPA_PERSONA } from '@/lib/tapas'
import { AvatarDeLista } from '@/components/ListaEnComun'
import { iconoDeCategoria } from '@/components/FichaDeseo'

// Lo que se dibuja de cada deseo. Sin identificarse no hay estados: todos se ven igual y "Reservar" pide el nombre.
type Tarjeta = OwnerItemView & { claims: ClaimView[]; disponible: boolean; quedan: number | null }

/** sinNombres: al que mira no le toca saber quién (ver sinNombresPara): "Reservado" a secas; lo suyo, sí. */
function estadoNoDisponible(item: Tarjeta, sinNombres: boolean) {
  // comprado solo si ya se compró todo; si no, quién se ocupa (sin esconder a los demás detrás del primero)
  if (item.claims.length && item.claims.every((c) => c.estado === 'comprado')) return '✓ Comprado'
  const grupal = item.claims.find((c) => c.grupal && c.estado === 'reservado')?.grupal
  if (grupal && item.claims.length === 1) {
    if (grupal.soyParte) return 'Estás en el regalo grupal'
    // al que sacó el encargado no se lo invita: no se puede sumar (ver sumarseARegalo); sin cuenta, tampoco
    return `Regalo grupal de ${grupal.cuantos}${grupal.meSacaron || sinNombres ? '' : ' · sumate'}`
  }
  const primero = item.claims.find((c) => c.esMia) ?? item.claims[0]
  const otros = item.claims.length - 1
  if (sinNombres) {
    if (primero?.esMia) return `Lo reservaste vos${otros > 0 ? ` y ${otros} más` : ''}`
    return otros > 0 ? `Reservado por ${otros + 1} personas` : 'Reservado'
  }
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
  searchParams: Promise<{ cat?: string; disp?: string; codazo?: string; reserva?: string; reservado?: string; amigo?: string }>
}) {
  const { token } = await params
  const { cat, disp, codazo, reserva, reservado, amigo } = await searchParams
  const viewer = await getViewer()
  const vista = await getListForViewer(db, token, viewer)
  if (!vista) {
    // el link de una sorpresa (un aviso, Cuentas de antes): a la suya, que decide quién la ve
    if (await esSorpresa(db, token)) redirect(`/sorpresa/${token}`)
    notFound()
  }
  if (vista.role === 'owner') redirect(vista.tipo === 'grupo' ? `/grupos/${vista.listId}` : '/mi-lista')

  // Abrirla con sesión la guarda entre las listas que seguís: su cumple o fecha aparece en Todo el año.
  // veTodo: ve la coordinación. identified: tiene nombre (sesión o invitado), aunque en esta lista todavía no la vea.
  const veTodo = vista.role === 'giver'
  // ve qué está ocupado pero no por quién: sin cuenta, en una lista que lo muestra solo con cuenta (ver sinNombresPara)
  const sinNombres = vista.role === 'giver' && vista.sinNombres
  const identified = identificado(viewer)
  // con tu cuenta, en la lista personal de alguien: sumarlo como amigo (ver AmigoEnLista). En la de una persona y en una
  // en común: regalarle algo que no está en la lista (las sorpresas, solo para los que ven la coordinación con sesión)
  const dueno = !vista.grupoNombre && vista.perfiles.length === 1 ? vista.perfiles[0] : null
  const [evento, historial, gustos, quien, sorpresas, invitado] = await Promise.all([
    eventoDeLista(db, vista.listId),
    // el historial de quién compró qué es para los que regalan con nombre, no para cualquiera con el link
    veTodo && !sinNombres ? historialDeLista(db, vista.listId, viewer) : null,
    gustosDeLista(db, vista.listId),
    identified ? nombreDeViewer(db, viewer) : null,
    veTodo && viewer.userId && (dueno || vista.grupoNombre)
      ? sorpresasPara(db, dueno ? { userId: dueno.id } : { listId: vista.listId }, viewer.userId) : null,
    // volviendo de "Entrá con Google y te avisamos antes de que venza": lo que reservó con su nombre sigue siendo del
    // invitado hasta que diga que es él (nunca se une solo, ver PreguntaInvitado)
    viewer.userId ? invitadoParaPreguntar(viewer.userId) : null,
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
  // Todos iguales, en la grilla. Agrupados por categoría (en el orden en que aparecen, y lo que no tiene, al final) solo
  // si alguna junta 3 o más: con uno o dos por categoría, cada título quedaba con una tarjeta sola al lado de un hueco, y
  // para ir a una categoría ya están los chips. Con una categoría elegida, o si ninguno tiene, sin títulos.
  const porCategoria = Object.entries(Object.groupBy(mostrados, (i) => i.categoria ?? ''))
    .sort(([a], [b]) => Number(a === '') - Number(b === '')) as [string, Tarjeta[]][]
  const conTitulos = !cat && porCategoria.some(([c, deseos]) => c !== '' && deseos.length >= 3)
  const grupos: [string, Tarjeta[]][] = conTitulos ? porCategoria : mostrados.length ? [['', mostrados]] : []

  // Si una reserva no sale, se vuelve acá con los mismos filtros (y sin el cartel cuando la próxima sale bien).
  const filtros = new URLSearchParams({ ...(cat && { cat }), ...(disp === '1' && { disp }) }).toString()
  const aqui = `/l/${token}${filtros ? `?${filtros}` : ''}`
  const plural = vista.duenos.length > 1
  // "Reservar" reserva acá mismo, para él, de un toque: es lo que vino a hacer (el regalo grupal se arma desde el deseo).
  // Sin nombre, se lo pide ahí (ver GuestGate). Un invitado que todavía no dijo que esta lista no es suya, primero lo dice
  // (así ve qué está libre de verdad); en un navegador donde entró con su cuenta alguien de la lista, no (ver accesoALista).
  const reservar = (itemId: string) => vista.role === 'anonimo' && vista.motivo !== 'sin_identidad'
    ? null
    : <GuestGate token={token} itemId={itemId} identified={veTodo} variant="tarjeta" volver={aqui} avisar para={vista.ownerNombre} plural={plural} />

  // Recién reservó (?reservado=, ver reserveAction): hasta cuándo es suyo y qué sigue, abajo de ese deseo. Solo si la
  // reserva es suya y sigue en pie: el link con ?reservado= lo puede abrir cualquiera. Si el filtro elegido lo esconde
  // ("Disponibles": ya no lo está), arriba de la grilla.
  const miReserva = (item?: Tarjeta) => item?.claims.find((c) => c.esMia && !c.grupal && c.estado === 'reservado')
  const recien = reservado ? tarjetas.find((i) => i.id === reservado) : undefined
  const confirmacion = recien && miReserva(recien) && (
    <ReservaConfirmada cartel vence={miReserva(recien)!.vence} deseo={`/l/${token}/item/${recien.id}`} entrar={viewer.userId ? undefined : aqui}
                       recuperar={linkParaVolver(viewer, vista.listId, token)} />
  )
  // Sin cuenta, "¿Y vos qué querés?" flota abajo recién cuando ya reservó algo; antes va al final, quieto (ver abajo)
  const yaReservo = tarjetas.some((i) => i.claims.some((c) => c.esMia || c.grupal?.soyParte))

  // su tapa: la de las personas (el verde, igual para todos) o la de las listas en común (ver lib/tapas.ts)
  const color = vista.grupoNombre ? TAPA_EN_COMUN : TAPA_PERSONA
  // En una lista en común, arriba todo es de la lista (Bauti, sus regalos); el perfil y los gustos de cada uno de los que
  // la arman van al final, abajo del historial. En la de una persona, su perfil va arriba: la lista es suya.
  const enComun = !!vista.grupoNombre
  const perfilDe = (id: string) => `/l/${token}/perfil${vista.perfiles[0]?.id === id ? '' : `?quien=${id}`}`

  /**
   * Un deseo en la grilla: la foto (con su sello si te toca, y "Me lo robo"), qué es, cuánto sale y reservarlo. La tarjeta
   * entera abre el deseo: el link del título se estira sobre toda la tarjeta, y los botones (reservar, robar) van arriba.
   */
  const tarjeta = (item: Tarjeta) => {
    const yaEsMio = item.claims.some((c) => c.esMia || c.grupal?.soyParte)
    const cuantas = cupo(item)
    const sello = selloDe(item)
    const vence = miReserva(item)?.vence
    const boton = item.disponible && !yaEsMio && reservar(item.id)
    return (
      <Fragment key={item.id}>
        <li id={`deseo-${item.id}`} data-buscar={paraBuscar(`${item.titulo} ${item.categoria ?? ''} ${item.notas ?? ''}`)}
            className="relative flex scroll-mt-4 flex-col gap-2">
          <div className="relative">
            <Arte src={item.fotoUrl} titulo={item.titulo} apagado={!item.disponible} />
            {sello && <Sello chico tipo={sello} clave={item.id} size={44} className="absolute left-1.5 top-1.5" />}
            {item.videoUrl && <ConVideo className={`absolute top-2 ${sello ? 'left-12' : 'left-2'}`} />}
            {/* "Me lo robo": con tu cuenta, sumarlo a tu lista */}
            {viewer.userId && <BotonRobar token={token} itemId={item.id} variante="icono" className="absolute right-2 top-2 z-[2]" />}
          </div>
          <div className="flex flex-1 flex-col gap-1 px-0.5">
            <Link href={`/l/${token}/item/${item.id}`}
                  className="block text-[15px] leading-tight font-bold tracking-[-0.01em] after:absolute after:inset-0 after:z-[1] after:content-['']">
              <span className="line-clamp-2 [overflow-wrap:anywhere]">{item.titulo}</span>
            </Link>
            <div className="flex items-center gap-1.5">
              {(item.precio ?? item.rangoPrecio) && <p className="text-[13px] text-gr-muted tabular-nums">{item.precio ?? item.rangoPrecio}</p>}
              {item.disponible && <PriorityTag prioridad={item.prioridad} className="h-6 px-2" />}
            </div>
            {/* lo que ya no está libre, con el puntito del acento */}
            {!item.disponible && (
              <p className="flex items-start gap-1.5 text-xs leading-snug font-bold [overflow-wrap:anywhere]">
                <i aria-hidden className="mt-[5px] size-[7px] flex-none rounded-full bg-gr-acento" />{estadoNoDisponible(item, sinNombres)}
              </p>
            )}
            {cuantas && <p className="text-xs text-gr-muted">{cuantas}</p>}
            {/* su reserva vence: que se vea sin tener que entrar al deseo */}
            {vence && <p className="text-xs text-gr-muted">Tuyo hasta el {ultimoDia(vence)}</p>}
            {item.disponible && yaEsMio && <div className="mt-auto flex flex-col pt-1.5"><YaLoReservaste item={item} /></div>}
            {/* un control aparte, arriba del link que cubre la tarjeta */}
            {boton && <div className="relative z-[2] mt-auto pt-1.5">{boton}</div>}
          </div>
        </li>
        {confirmacion && recien?.id === item.id && <li className="col-span-2">{confirmacion}</li>}
      </Fragment>
    )
  }

  return (
    <main className={`flex flex-col ${viewer.userId || yaReservo ? 'pb-36' : 'pb-10'}`}>
      {/* Su tapa, compacta: de quién es y cuándo, en dos renglones. El que abre el link en el teléfono tiene que ver los
          primeros deseos (y "Reservar") sin scrollear; su perfil y sus gustos quedan a un toque, en un chip. */}
      <Tapa color={color}>
        <header className="grid min-h-11 grid-cols-[44px_1fr_44px] items-center">
          {/* con tu cuenta, abajo está la barra; volver lleva a donde estabas (Inicio, Todo el año…) y, si no se sabe, a tu gente */}
          <div>{viewer.userId && <BackLink href="/gente" label="Volver a tu gente" vidrio origen={{ pantalla: `/l/${token}` }} />}</div>
          <LogoSticker sobreTapa className="justify-self-center" />
        </header>
        <div className="mt-1 flex items-center gap-3">
          {/* la de una persona: su foto lleva a su perfil. La de una lista en común, no: es de la lista, no de uno de ellos */}
          {enComun ? (
            vista.grupoFoto
              ? <AvatarDeLista nombre={vista.grupoNombre ?? ''} foto={vista.grupoFoto} duenos={vista.perfiles} size={56} />
              : <AvatarStack nombres={vista.duenos} fotos={vista.perfiles.map((d) => d.foto)} size={44} />
          ) : (
            <Link href={`/l/${token}/perfil`} aria-label={`Ver el perfil de ${vista.ownerNombre}`} className="flex-none rounded-full">
              <AvatarSticker nombre={vista.ownerNombre} foto={vista.perfiles[0]?.foto} size={56} className="bg-gr-surface" />
            </Link>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="gr-title text-[26px] [overflow-wrap:anywhere]">
              {vista.grupoNombre ?? <><span className="sr-only">Lista de </span>{vista.ownerNombre}</>}
            </h1>
            <p className="gr-tapa__sub text-[13px] leading-snug">
              {cuenta ?? <>{vista.grupoNombre && `${vista.relacion ?? `De ${vista.ownerNombre}`}. `}Elegí, reservá y no te duplicás con nadie.</>}
            </p>
          </div>
        </div>
        {(!enComun || veTodo) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {/* el chip mide 36, pero se toca en 44 */}
            {!enComun && (
              <Link href={`/l/${token}/perfil`}
                    className="gr-btn gr-btn--vidrio relative min-h-9 gap-1 pr-2.5 pl-3.5 text-[13px] after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']">
                Su perfil y sus gustos<Icon name="chevron" size={14} strokeWidth={2.4} />
              </Link>
            )}
            {veTodo && (
              <p className="gr-tapa__sub flex items-center gap-1.5 text-[12.5px]">
                <Icon name="lock" size={13} className="flex-none" />
                {vista.ownerNombre} no {plural ? 'ven' : 've'} quién reserva qué
              </p>
            )}
          </div>
        )}
      </Tapa>

      {/* Lo que sigue se monta sobre el fundido de la tapa (sus últimos 84 px, donde el color se va al fondo): cada pieza
          trae su propia superficie, y así la tapa no deja una franja vacía antes de los deseos */}
      <div className="relative -mt-14 flex flex-col gap-4">
        <AvisoAmigo amigo={amigo} />
        {invitado && <PreguntaInvitado nombre={invitado} />}

        {/* sin nombre, "¿Quién sos?" es una franja de un renglón: el nombre se le pide de verdad al tocar "Reservar" */}
        {!veTodo && (vista.motivo === 'ex_dueno' ? <ExDueno />
          : vista.motivo === 'otra_cuenta' ? <OtraCuenta volver={aqui} />
            : vista.motivo === 'confirmar' && quien ? <ConfirmarLista token={token} nombre={quien} volver={aqui} />
              : <QuienSos token={token} volver={aqui} />)}

        {/* por qué ve "Reservado" a secas, y cómo ver quién */}
        {sinNombres && <SoloConCuenta volver={aqui} />}

        <CartelReserva motivo={reserva} veTodo={veTodo} conNombre={identified} />

        {/* los avisos van en Inicio (y en la campanita); quien entró sin cuenta no tiene Inicio: los suyos (una reserva que
            vence, lo que reservó y ya no está) los ve acá */}
        {!viewer.userId && <Banners />}

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

        {/* lo que acaba de reservar no está entre lo que se ve con este filtro: el cartel, igual */}
        {confirmacion && !mostrados.includes(recien!) && confirmacion}

        {mostrados.length === 0 && (
          <p className="gr-empty mt-4 py-8 text-center">
            {tarjetas.length ? 'No hay nada con ese filtro.' : `Todavía no ${plural ? 'cargaron' : 'cargó'} nada.`}
          </p>
        )}

        {/* una lista larga: buscar algo puntual (en lo que se ve con el filtro elegido) */}
        {mostrados.length >= BUSCAR_DESDE && <Buscador ambito="su-lista" placeholder="Buscar en la lista" vacio="No hay nada con «%s» en esta lista." />}

        <div id="su-lista" className="flex flex-col gap-7">
          {grupos.map(([categoria, deseos]) => (
            <section key={categoria} data-buscar-grupo aria-label={conTitulos ? undefined : 'Sus deseos'} className="flex flex-col gap-3">
              {conTitulos && (
                <h2 className="flex items-center gap-2.5 text-[18px] font-extrabold tracking-[-0.02em]">
                  <span aria-hidden className="flex size-9 flex-none items-center justify-center rounded-full bg-gr-soft text-gr-acento-texto">
                    <Icon name={categoria ? iconoDeCategoria(categoria) : 'gift'} size={18} strokeWidth={2.2} />
                  </span>
                  {categoria || 'Sin categoría'}
                  <span className="font-semibold text-gr-muted tabular-nums">{deseos.length}</span>
                </h2>
              )}
              {/* dense: el cartel de lo recién reservado ocupa las dos columnas y no deja un hueco al lado de su tarjeta */}
              <ul className="grid grid-flow-row-dense grid-cols-2 items-stretch gap-x-3 gap-y-[18px]">
                {deseos.map(tarjeta)}
              </ul>
            </section>
          ))}
        </div>

        {/* sumarlo como amigo, su perfil y sus gustos: después de los deseos (arriba ya está el chip de la tapa). "Sumar",
            en verde y arriba de todo, le ganaba a "Reservar" y lo empujaba abajo de la barra */}
        {dueno && relacion && <AmigoEnLista dueno={{ ...dueno, usuario: null }} relacion={relacion} volver={`/l/${token}`} />}
        {!enComun && gustos.map((g) => (
          <TarjetaPerfil key={g.id} nombre={g.nombre} foto={vista.perfiles.find((d) => d.id === g.id)?.foto ?? null} secciones={g.secciones}
                         href={perfilDe(g.id)} />
        ))}

        {sorpresas && (
          <SorpresasEnLista token={token} nombre={dueno?.nombre ?? vista.grupoNombre ?? vista.ownerNombre} enComun={!dueno} sorpresas={sorpresas} />
        )}

        <div className="mt-2">
          <Codazo token={token} para={vista.grupoNombre ? vista.ownerNombre : vista.ownerNombre.split(' ')[0]} plural={plural}
                  identified={identified} conGoogle={vista.role === 'anonimo' && vista.motivo === 'otra_cuenta'} resultado={codazo} />
        </div>

        {/* lo que le regalaron: a la persona, o en una lista en común, a Bauti (no a los que la arman) */}
        {historial && <QuienSeOcupo historial={historial} para={vista.grupoNombre ?? vista.ownerNombre} />}

        {/* en una lista en común, al final: cada uno de los que la arman, con su perfil y sus gustos (aunque no los haya cargado) */}
        {enComun && (
          <section aria-labelledby="quienes-la-arman" className="mt-6 flex flex-col gap-3">
            <h2 id="quienes-la-arman" className="gr-heading">{vista.perfiles.length > 1 ? 'Quiénes la arman' : 'Quién la arma'}</h2>
            {vista.perfiles.map((d) => (
              <TarjetaPerfil key={d.id} nombre={d.nombre} foto={d.foto} secciones={gustos.find((g) => g.id === d.id)?.secciones ?? []}
                             href={perfilDe(d.id)} />
            ))}
          </section>
        )}

        {/* un invitado: el nombre con el que reserva solo sale acá (con "¿Es tu lista?" arriba, el link ya va ahí). Con cuenta,
            no: la sesión se cierra desde Perfil */}
        {quien && !viewer.userId && !(vista.role === 'anonimo' && vista.motivo === 'confirmar') && (
          <div className="mt-2"><NoSoyYo nombre={quien} volver={`/l/${token}`} /></div>
        )}

        {/* Con cuenta ya tiene su lista, y abajo va la barra (ver el layout). Sin cuenta, "¿Y vos qué querés?" es una invitación,
            no lo que vino a hacer: va neutra (el verde es de "Reservar") y al final de la página, sin tapar nada. Flota abajo
            recién cuando ya reservó algo: ahí sí es el momento de ofrecerle armar la suya. */}
        {!viewer.userId && (
          <div className={yaReservo
            ? 'gr-floatbar border border-gr-line bg-gr-surface text-gr-ink'
            : 'mt-2 flex min-h-16 items-center justify-between gap-2.5 rounded-full border border-gr-line bg-gr-surface py-2 pr-2 pl-5'}>
            <p className="text-sm font-medium">¿Y vos qué querés?</p>
            <Link href="/" className="gr-btn gr-btn--sm flex-none">Armá tu lista →</Link>
          </div>
        )}
      </div>
    </main>
  )
}
