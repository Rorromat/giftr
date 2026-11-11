import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { avisosSinLeer } from '@/lib/bandeja'
import { getOwnList, nombresSoloConCuenta } from '@/lib/lists'
import { nombresDeMisGrupos } from '@/lib/groups'
import { gustosPorContar, misGustos, necesitaBienvenida } from '@/lib/bienvenida'
import { textoMiLista } from '@/lib/compartir'
import { paletaGusto } from '@/lib/colores-gustos'
import { yo } from '@/lib/perfil'
import { diasEntre, fechaLarga, hoyLocal, miCumple, proximaFecha } from '@/lib/events'
import { postEvento, recibidosDe } from '@/lib/post-evento'
import { Archivados, OwnerItemsGrid } from '@/components/OwnerItemsGrid'
import { Recibidos, TarjetaPostEvento } from '@/components/PostEvento'
import { ListaHero } from '@/components/ListaHero'
import { IlustracionGusto } from '@/components/IlustracionGusto'
import { DeseoEliminado, RecienAgregado } from '@/components/RecienAgregado'
import { Buscador } from '@/components/Buscador'
import { AjusteSoloConCuenta } from '@/components/SoloConCuenta'
import { BUSCAR_DESDE } from '@/lib/buscar'
import { TAPA_PERSONA } from '@/lib/tapas'
import { AppHeader, Icon, Seccion, SectionHeader } from '@/components/ui'

/**
 * "Contá tus gustos": lo que eran ocho pasos obligatorios antes del primer deseo, ahora una tarjeta que lleva al primero que
 * falta (y de ahí sigue por los demás, ver saveGustosAction). Sin ninguno contado va entera, con para qué sirve; con
 * algunos, en una fila; con todos, no va (se editan desde Perfil).
 */
function ContaTusGustos({ cargados, total, siguiente }: ReturnType<typeof gustosPorContar>) {
  if (!siguiente) return null
  const chica = cargados > 0
  return (
    <Link href={`/perfil/gustos/${siguiente}?volver=lista`} className={`gr-card flex items-center gap-3 ${chica ? 'px-3.5 py-2.5' : 'p-3.5'}`}>
      <span aria-hidden className={`flex flex-none items-center justify-center overflow-hidden ${chica ? 'size-9 rounded-gr-sm' : 'size-12 rounded-gr-md'}`}
            style={{ background: paletaGusto(siguiente).fondo }}>
        <IlustracionGusto paso={siguiente} size={chica ? 44 : 58} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug font-semibold">
          Contá tus gustos <span className="font-medium text-gr-muted tabular-nums">· {cargados} de {total}</span>
        </span>
        <span className="block text-[13px] leading-snug text-gr-muted">
          {chica ? 'Así tu gente acierta.' : 'Talles, colores, lo que no querés: así tu gente acierta.'}
        </span>
      </span>
      <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
    </Link>
  )
}

export default async function MiLista({ searchParams }: { searchParams: Promise<{ agregado?: string; eliminado?: string }> }) {
  const { agregado, eliminado } = await searchParams
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [lista, bienvenida, grupos, { nombre: suNombre, foto }, cumple, avisos, gustos, despues, { recibidos, contados }] = await Promise.all([
    getOwnList(db, session.userId), necesitaBienvenida(db, session.userId), nombresDeMisGrupos(db, session.userId), yo(db, session.userId),
    miCumple(db, session.userId), avisosSinLeer(db, { userId: session.userId }), misGustos(db, session.userId),
    postEvento(db, session.userId), recibidosDe(db, session.userId),
  ])
  if (!lista) redirect('/')
  // La primera vez que entra: la bienvenida (una pantalla, su cumple), y de ahí a su primer deseo.
  if (bienvenida) redirect('/bienvenida')
  const soloConCuenta = await nombresSoloConCuenta(db, lista.id)

  const activos = lista.items.filter((i) => i.estadoDueno === 'activo')
  // lo que se puede marcar como recibido después del cumple: un aporte en plata no (ver post-evento.ts)
  const hayParaMarcar = activos.some((i) => i.tipo !== 'aporte')
  const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${lista.shareToken}`
  const waHref = `https://wa.me/?text=${encodeURIComponent(textoMiLista(shareUrl))}`
  const porContar = <ContaTusGustos {...gustosPorContar(gustos)} />
  const nombre = suNombre ?? session.user?.name ?? 'Vos'
  const hoy = hoyLocal()
  const fechaCumple = cumple ? proximaFecha(cumple.dia, cumple.mes, hoy) : null
  const dias = fechaCumple ? diasEntre(hoy, fechaCumple) : null
  const nuevo = agregado ? activos.find((i) => i.id === agregado) : undefined

  return (
    <Seccion className="gr-ancha flex flex-col gap-5 pb-48">
      {/* Vos: tu lista con la tapa de las personas (la misma que ven tus amigos) y, tocando tu foto, tu perfil */}
      <ListaHero
        color={TAPA_PERSONA}
        arriba={<AppHeader nombre={nombre} foto={foto} avisos={avisos} sobreTapa desde="/mi-lista" />}
        etiqueta={nombre.split(' ')[0]}
        titulo="Mi lista"
        cantidad={activos.length}
        waHref={waHref}
        fecha={fechaCumple
          ? <>tu cumple {dias === 0 ? 'es hoy' : dias === 1 ? 'es mañana' : `es en ${dias} días`}, el {fechaLarga(fechaCumple).toLowerCase()}</>
          : <Link href="/perfil#cumple" className="underline underline-offset-4">cargá tu cumple</Link>}
      >
        {/* Por la regla de la sorpresa acá nunca aparece una reserva, y sin decirlo se lee como "nadie reservó nada" */}
        <p className="gr-tapa__sub text-[13px] leading-snug">Acá no vas a ver quién reservó qué: tu gente se organiza sin que te enteres.</p>
      </ListaHero>

      {/* Tus listas: la tuya y las que armás con otros (grupos) */}
      <nav aria-label="Tus listas" className="-mx-[18px] -mt-3 flex gap-2 overflow-x-auto px-[18px] py-1 [scrollbar-width:none]">
        <Link href="/mi-lista" aria-current="page" className="gr-chip">Mi lista</Link>
        {grupos.map((g) => <Link key={g.id} href={`/grupos/${g.id}`} className="gr-chip">{g.nombre}</Link>)}
        <Link href="/grupos/nuevo" className="gr-chip">+ Lista en común</Link>
      </nav>

      {/* Después del cumple (ver post-evento.ts): marcar lo que le regalaron. Sale por la fecha, haya o no reservas */}
      {despues?.pendiente && hayParaMarcar && <TarjetaPostEvento />}

      {activos.length === 0 ? (
        <div className="gr-empty flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-gr-surface shadow-card"><Icon name="gift" size={26} /></span>
          <p>Agregá lo primero que se te venga a la cabeza.<br />¿Un link? Pegalo en “Agregar”.</p>
          <Link href="/agregar" className="gr-btn-primary gr-btn--sm">Agregar un deseo</Link>
        </div>
      ) : (
        <>
          {porContar}
          <SectionHeader title="Tus deseos" href="/agregar" linkLabel="+ Agregar" />
        </>
      )}
      {/* sin deseos, primero lo primero: la tarjeta de los gustos va después de "Agregar un deseo" */}
      {activos.length === 0 && porContar}

      {activos.length >= BUSCAR_DESDE && <Buscador ambito="mis-deseos" placeholder="Buscar en tu lista" vacio="No tenés ningún deseo con «%s»." />}
      <div id="mis-deseos" className="gr-categorias flex flex-col gap-5">
        <OwnerItemsGrid items={activos} shareToken={lista.shareToken} agregado={agregado} />
      </div>
      {/* Lo que le regalaron va aparte de lo que sacó: con quién le contó que fue suyo, y agradecer */}
      <Recibidos recibidos={recibidos} contados={contados} marcarMas={!!despues?.enVentana && hayParaMarcar}
                 abierto={!!despues?.enVentana || contados.length > 0 || recibidos.some((r) => r.dePartede.some((d) => !d.agradecido))} />
      <Archivados items={lista.items.filter((i) => i.estadoDueno !== 'activo' && i.estadoDueno !== 'me_lo_regalaron')} />
      {/* un ajuste de la lista: quién ve los nombres de los que reservan (nunca vos) */}
      <AjusteSoloConCuenta prendida={soloConCuenta} />
      {/* "¡Anotado!", con mandar la lista a mano (lo principal, si es el primero que anota: ver Agregado) */}
      {nuevo && (
        <RecienAgregado deseo={{ id: nuevo.id, titulo: nuevo.titulo, foto: nuevo.fotoUrl, grupo: false, waHref, primero: lista.items.length === 1 }} />
      )}
      {eliminado === '1' && <DeseoEliminado />}
    </Seccion>
  )
}
