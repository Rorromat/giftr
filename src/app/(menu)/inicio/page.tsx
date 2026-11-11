import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { db } from '@/db'
import { necesitaBienvenida } from '@/lib/bienvenida'
import { hoyLocal, miCumple, misEventos } from '@/lib/events'
import { misCuentas } from '@/lib/regalos'
import { CargaTuCumple, Proximos } from '@/components/Eventos'
import { CuentasPendientes } from '@/components/ResumenCuentas'
import { yo } from '@/lib/perfil'
import { amigosEnComun, misAmigos, sugerenciasDeAmigos } from '@/lib/amigos'
import { NO_SUGERIR_COOKIE, noSugerir } from '@/lib/no-sugerir'
import { SugerenciaAmigo } from '@/components/Sugerencias'
import { avisosSinLeer } from '@/lib/bandeja'
import { juegoParaProponer, pendientesDe } from '@/lib/para-vos'
import { ArmarJuegoDeFecha, ParaVosEnInicio } from '@/components/ParaVos'
import { invitadoParaPreguntar } from '@/lib/viewer'
import { conVolver } from '@/lib/volver'
import { porComprar } from '@/lib/mis-regalos'
import { FilaRegalo } from '@/components/FilaRegalo'
import { hace, novedadesDeAmigos, PRIMEROS } from '@/lib/novedades'
import { CarruselNovedades } from '@/components/Novedades'
import { especialesQueVienen } from '@/lib/fechas-especiales'
import { AppHeader, Icon, Seccion, SectionHeader } from '@/components/ui'
import { Destacada } from '@/components/Estante'
import { getListForViewer } from '@/lib/lists'
import { TAPA_EN_COMUN, TAPA_PERSONA } from '@/lib/tapas'

// Inicio: lo que viene. Arriba, lo próximo en grande: la tapa de esa persona (su color) y un estante con sus deseos. Después
// "Para vos": lo que espera que hagas algo, en un solo bloque y por urgencia (ver lib/para-vos.ts; lo que solo informa
// está en la campanita), los próximos cumples y fechas de tu gente (con lo que ya hiciste para cada uno, y las fechas
// especiales con tus amigos invisibles), lo nuevo de tus amigos, lo que tenés por comprar, las cuentas pendientes y alguien
// que quizás conocés. Tu lista está en Vos: en ella, por la regla de la sorpresa, nunca pasa nada que puedas ver.

/** Esta pantalla, para el "Volver" de lo que se abre desde acá (ver lib/volver.ts). */
const ACA = '/inicio'
/** Cuántos regalos por comprar van en Inicio como mucho (los demás, en Regalos). */
const POR_COMPRAR = 3
export default async function Inicio() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const hoy = hoyLocal()
  const sacada = noSugerir((await cookies()).get(NO_SUGERIR_COOKIE)?.value, session.userId)
  const [
    bienvenida, eventos, cumple, cuentas, { nombre, foto }, { novedades }, amigos, avisos, sugerencias,
    { pendientes: paraVos, total: cuantosParaVos, juegos }, pendientes,
  ] = await Promise.all([
    necesitaBienvenida(db, session.userId), misEventos(db, session.userId, hoy), miCumple(db, session.userId), misCuentas(db, session.userId),
    yo(db, session.userId), novedadesDeAmigos(db, session.userId, { limite: PRIMEROS }), misAmigos(db, session.userId),
    avisosSinLeer(db, { userId: session.userId }),
    // la primera, y si hay otra (para "Ver más")
    sugerenciasDeAmigos(db, session.userId, 2, sacada),
    invitadoParaPreguntar(session.userId).then((invitado) => pendientesDe(db, session.userId!, hoy, invitado)), porComprar(db, session.userId),
  ])
  // La primera vez que entra: la bienvenida (una pantalla, su cumple), y de ahí a su primer deseo.
  if (bienvenida) redirect('/bienvenida')
  const especiales = especialesQueVienen(hoy, juegos)
  // falta poco para Navidad (o el Día del Amigo) y no está en ningún amigo invisible de esa fecha: que lo arme
  const paraArmar = juegoParaProponer(hoy, juegos)
  // las listas que se abren desde acá vuelven acá, no a Tu gente
  const conVuelta = eventos.map((e) => (e.href.startsWith('/l/') ? { ...e, href: conVolver(e.href, ACA) } : e))
  // lo próximo de tu gente (no lo tuyo): su lista, para la tarjeta grande con su tapa (la de su lista: el verde si es de
  // una persona, uva si es en común), lo que más quiere y cuántos deseos tiene. Abajo, en "Más adelante", va todo lo demás
  // (sin repetirlo)
  const destacado = eventos.find((e) => !e.propio && e.href.startsWith('/l/'))
  const token = destacado?.href.slice('/l/'.length)
  const destacadoConVuelta = destacado && conVuelta[eventos.indexOf(destacado)]
  const suLista = token ? await getListForViewer(db, token, { userId: session.userId }) : null
  const suColor = suLista ? (suLista.role !== 'owner' && suLista.grupoNombre ? TAPA_EN_COMUN : TAPA_PERSONA) : null
  // la tarjeta va si su lista se pudo abrir; si no, ese evento queda abajo con los demás
  const enGrande = destacado && suColor && suLista && suLista.role !== 'owner'
    ? { e: destacadoConVuelta!, color: suColor, deseos: suLista.items.filter((i) => !('disponible' in i) || i.disponible).length }
    : null
  // lo que vence antes primero (los grupales no vencen); si no, lo último que reservaste
  const aComprar = [...pendientes].sort((a, b) => (a.venceEnDias ?? Infinity) - (b.venceEnDias ?? Infinity)).slice(0, POR_COMPRAR)

  return (
    <Seccion className="gr-ancha flex flex-col gap-5 pb-48 pt-2">
      <AppHeader nombre={nombre ?? session.user?.name ?? 'Vos'} foto={foto} avisos={avisos} desde={ACA}
                 accion={<Link href="/eventos" aria-label="Todo el año" className="gr-icon-btn"><Icon name="calendar" size={19} /></Link>} />
      <div className="flex flex-col gap-1">
        <h1 className="gr-title">Lo que viene</h1>
        <p className="text-sm text-gr-muted">Cumples, regalos y avisos de tu gente.</p>
      </div>

      {enGrande && <Destacada e={enGrande.e} color={enGrande.color} hoy={hoy} deseos={enGrande.deseos} />}

      <ParaVosEnInicio pendientes={paraVos} total={cuantosParaVos} />
      {paraArmar && <ArmarJuegoDeFecha fecha={paraArmar} />}

      {(eventos.length > 0 || especiales.length > 0) && (
        <>
          <SectionHeader title={enGrande ? 'Más adelante' : 'Próximos'} href="/eventos" linkLabel="Todo el año" />
          <Proximos eventos={enGrande ? conVuelta.filter((e) => e !== enGrande.e) : conVuelta} hoy={hoy} especiales={especiales} />
        </>
      )}
      {eventos.length === 0 && (
        <div className="gr-empty flex flex-col items-center gap-3 py-7 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-gr-surface shadow-card"><Icon name="calendar" size={26} /></span>
          <p>Acá van a aparecer los cumples de tu gente, con tiempo para elegir. Para eso, abrí con tu cuenta el link de su lista.</p>
          <div className="flex w-full flex-col gap-2">
            <Link href="/gente" className="gr-btn">Pedile su lista a tu gente</Link>
            <Link href="/agregar" className="gr-btn-primary">Armá tu lista</Link>
          </div>
        </div>
      )}

      {/* lo nuevo de tus amigos: tarjetas grandes que pasan solas; cada una abre el feed en ese deseo */}
      {novedades.length > 0 ? (
        <section aria-labelledby="novedades" className="flex flex-col gap-3">
          <SectionHeader id="novedades" title="Lo nuevo de tus amigos" href="/novedades" linkLabel="Ver todo" />
          <CarruselNovedades items={novedades.map((n) => ({
            id: n.item.id, titulo: n.item.titulo, foto: n.item.fotoUrl, precio: n.item.precio ?? n.item.rangoPrecio, hace: hace(n.creado),
            nombre: n.dueno.nombre, duenoFoto: n.dueno.foto,
          }))} />
        </section>
      ) : !amigos.size && (
        <Link href="/gente/agregar" className="gr-card flex items-center gap-3 p-4">
          <span className="gr-row__icon"><Icon name="users" size={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-base leading-tight font-semibold">Sumá a tus amigos</span>
            <span className="block text-[13px] leading-snug text-gr-muted">Acá vas a ver lo que se van agregando a sus listas.</span>
          </span>
          <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
        </Link>
      )}

      {/* lo que reservaste o los regalos grupales en los que estás, que falta comprar: los primeros; todo, en Regalos */}
      {aComprar.length > 0 && (
        <section aria-labelledby="por-comprar" className="flex flex-col gap-3">
          <SectionHeader id="por-comprar" href="/regalos" linkLabel="Ver todo"
                         title={<>Por comprar<span className="text-gr-muted"> · {pendientes.length}</span></>} />
          <ul className="flex flex-col gap-2.5">{aComprar.map((r) => <FilaRegalo key={`${r.tipo}-${r.id}`} r={r} />)}</ul>
        </section>
      )}
      <CuentasPendientes cuentas={cuentas} />

      {/* gente que quizás conocés (amigos de tus amigos): la primera; las demás, arriba en Tu gente */}
      {sugerencias.length > 0 && (
        <section aria-labelledby="quizas-conoces" className="flex flex-col gap-3">
          <SectionHeader id="quizas-conoces" title="Gente que quizás conocés" href={sugerencias.length > 1 ? '/gente#sugerencias' : undefined} />
          <ul className="gr-card flex flex-col px-3.5">
            <SugerenciaAmigo key={sugerencias[0].p.id} p={sugerencias[0].p} enComun={amigosEnComun(sugerencias[0].enComun)} />
          </ul>
        </section>
      )}

      {!cumple && <CargaTuCumple />}
    </Seccion>
  )
}
