import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { db } from '@/db'
import { necesitaBienvenida } from '@/lib/bienvenida'
import { hoyLocal, miCumple, misEventos } from '@/lib/events'
import { misCuentas } from '@/lib/regalos'
import { Banners } from '@/components/Banners'
import { CargaTuCumple, Proximos } from '@/components/Eventos'
import { CuentasPendientes } from '@/components/ResumenCuentas'
import { yo } from '@/lib/perfil'
import { amigosEnComun, misAmigos, sugerenciasDeAmigos } from '@/lib/amigos'
import { NO_SUGERIR_COOKIE, noSugerir } from '@/lib/no-sugerir'
import { SugerenciaAmigo } from '@/components/Sugerencias'
import { avisosSinLeer, paraVos } from '@/lib/bandeja'
import { ContenidoAviso } from '@/components/FilaAviso'
import { AvisoDeslizable } from '@/components/AvisoDeslizable'
import { BotonEnviar } from '@/components/BotonEnviar'
import { limpiarParaVosAction } from '@/app/actions'
import { porComprar } from '@/lib/mis-regalos'
import { FilaRegalo } from '@/components/FilaRegalo'
import { hace, novedadesDeAmigos, PRIMEROS } from '@/lib/novedades'
import { CarruselNovedades } from '@/components/Novedades'
import { InvitacionesRegalo } from '@/components/Dividir'
import { invitacionesPendientes } from '@/lib/invitaciones'
import { misAmigosInvisibles } from '@/lib/amigo-invisible'
import { especialesQueVienen } from '@/lib/fechas-especiales'
import { JuegosEnInicio } from '@/components/AmigoInvisible'
import { AppHeader, Icon, Seccion, SectionHeader } from '@/components/ui'

// Inicio: lo que viene. Arriba lo que te espera (los carteles, las propuestas, y "Para vos": lo último de la campanita que
// te pide algo), los próximos cumples y fechas de tu gente (con lo que ya hiciste para cada uno, y las fechas especiales con
// tus amigos invisibles), lo nuevo de tus amigos, lo que tenés por comprar, las cuentas pendientes y alguien que quizás
// conocés. Tu lista está en Vos: en ella, por la regla de la sorpresa, nunca pasa nada que puedas ver.

/** Cuántos días después de su fecha sigue un amigo invisible en Inicio (para "¿Quién te regaló?"). */
const JUEGOS_PASADOS = 15
/** Cuántos regalos por comprar van en Inicio como mucho (los demás, en Regalos). */
const POR_COMPRAR = 3
export default async function Inicio({ searchParams }: { searchParams: Promise<{ invitacion?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const hoy = hoyLocal()
  const sacada = noSugerir((await cookies()).get(NO_SUGERIR_COOKIE)?.value, session.userId)
  const [
    bienvenida, eventos, cumple, cuentas, { nombre, foto }, { novedades }, amigos, invitaciones, juegos, { invitacion }, avisos, sugerencias,
    importantes, pendientes,
  ] = await Promise.all([
    necesitaBienvenida(db, session.userId), misEventos(db, session.userId, hoy), miCumple(db, session.userId), misCuentas(db, session.userId),
    yo(db, session.userId), novedadesDeAmigos(db, session.userId, { limite: PRIMEROS }), misAmigos(db, session.userId),
    invitacionesPendientes(db, session.userId), misAmigosInvisibles(db, session.userId, hoy, JUEGOS_PASADOS), searchParams,
    avisosSinLeer(db, { userId: session.userId }),
    // la primera, y si hay otra (para "Ver más")
    sugerenciasDeAmigos(db, session.userId, 2, sacada),
    paraVos(db, session.userId), porComprar(db, session.userId),
  ])
  // La primera vez que entra: los pasos de bienvenida con sus gustos.
  if (bienvenida) redirect('/bienvenida')
  const especiales = especialesQueVienen(hoy, juegos)
  // lo que vence antes primero (los grupales no vencen); si no, lo último que reservaste
  const aComprar = [...pendientes].sort((a, b) => (a.venceEnDias ?? Infinity) - (b.venceEnDias ?? Infinity)).slice(0, POR_COMPRAR)

  return (
    <Seccion className="flex flex-col gap-5 pb-48 pt-2">
      <AppHeader nombre={nombre ?? session.user?.name ?? 'Vos'} foto={foto} avisos={avisos}
                 left={<Link href="/eventos" aria-label="Todo el año" className="gr-icon-btn"><Icon name="calendar" size={20} /></Link>} />
      <div className="flex flex-col gap-1">
        <h1 className="gr-title">Lo que viene</h1>
        <p className="text-[15px] text-gr-muted">Cumples, regalos y avisos de tu gente.</p>
      </div>

      <Banners />
      {/* te proponen dividir un regalo: te sumás o no */}
      <InvitacionesRegalo invitaciones={invitaciones} noSePudo={invitacion === 'no_se_pudo'} />
      {/* te invitaron a un amigo invisible (juego o no), o ya pasó y podés pedir saber quién te regaló */}
      <JuegosEnInicio invitaciones={juegos.filter((j) => j.miEstado === 'invitado' && j.dias >= 0)}
                      pasados={juegos.filter((j) => j.dias < 0 && j.miEstado === 'juega' && j.sorteado && !j.revelado)} />

      {/* lo último de la campanita que te pide algo: te toca pagar, te pagaron, el amigo invisible (ver PARA_VOS). Cada uno
          con su ícono moviéndose; se desliza para verlo o archivarlo, y abajo, limpiarlos todos de acá o ir a la campanita */}
      {importantes.entradas.length > 0 && (
        <section aria-labelledby="para-vos" className="flex flex-col gap-3">
          <SectionHeader id="para-vos" title={<>Para vos<span className="text-gr-muted"> · {importantes.total}</span></>} />
          <div className="gr-card">
            <ul className="divide-y divide-gr-line">
              {importantes.entradas.map((e, i) => (
                <AvisoDeslizable key={e.id} id={e.id} titulo={e.titulo}><ContenidoAviso e={e} animar i={i} /></AvisoDeslizable>
              ))}
            </ul>
            <div className="flex divide-x divide-gr-line border-t border-gr-line text-sm font-semibold">
              <form action={limpiarParaVosAction} className="flex flex-1">
                <input type="hidden" name="hasta" value={importantes.hasta.toISOString()} />
                <BotonEnviar pendiente="Limpiando…" className="flex min-h-12 flex-1 items-center justify-center gap-2">
                  <Icon name="check" size={17} strokeWidth={2.6} className="flex-none" /> Limpiar
                </BotonEnviar>
              </form>
              <Link href="/avisos" className="flex min-h-12 flex-1 items-center justify-center gap-2">
                <Icon name="bell" size={17} className="flex-none" /> Ver todos
              </Link>
            </div>
          </div>
        </section>
      )}

      {(eventos.length > 0 || especiales.length > 0) && (
        <>
          <SectionHeader title="Próximos" href="/eventos" linkLabel="Todo el año" />
          <Proximos eventos={eventos} hoy={hoy} especiales={especiales} />
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
