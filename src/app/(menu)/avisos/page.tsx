import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { bandeja, type EntradaBandeja } from '@/lib/bandeja'
import { solicitudesRecibidas } from '@/lib/amigos'
import { invitacionesPendientes } from '@/lib/invitaciones'
import { misAmigosInvisibles } from '@/lib/amigo-invisible'
import { tieneAvisos } from '@/lib/codazos'
import { hoyLocal } from '@/lib/events'
import { SolicitudRecibida } from '@/components/Amigos'
import { InvitacionesRegalo } from '@/components/Dividir'
import { JuegosEnInicio } from '@/components/AmigoInvisible'
import { MarcarBandejaVista } from '@/components/MarcarBandejaVista'
import { FilaAviso } from '@/components/FilaAviso'
import { Icon, PageHeader, Seccion } from '@/components/ui'

/**
 * Avisos (la campanita): arriba lo que espera que contestes (solicitudes de amistad, propuestas de dividir, invitaciones al
 * amigo invisible) y abajo todo lo que te llegó en los últimos 60 días, lo nuevo primero. Al abrirla, deja de ser nuevo.
 */
export default async function Avisos({ searchParams }: { searchParams: Promise<{ invitacion?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const yo = session.userId
  const [{ entradas, hasta }, solicitudes, invitaciones, juegos, conPush, { invitacion }] = await Promise.all([
    bandeja(db, { userId: yo }), solicitudesRecibidas(db, yo), invitacionesPendientes(db, yo),
    misAmigosInvisibles(db, yo, hoyLocal(), 0), tieneAvisos(db, yo), searchParams,
  ])
  const juegosInvitado = juegos.filter((j) => j.miEstado === 'invitado' && j.dias >= 0)
  const nuevos = entradas.filter((e) => e.nuevo)
  const antes = entradas.filter((e) => !e.nuevo)
  const nada = !entradas.length && !solicitudes.length && !invitaciones.length && !juegosInvitado.length

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <PageHeader title="Avisos" back="/inicio" backLabel="Volver a Inicio" />
      <MarcarBandejaVista hasta={hasta.toISOString()} />

      {solicitudes.length > 0 && (
        <section id="solicitudes" aria-labelledby="solicitudes-titulo" className="flex scroll-mt-6 flex-col gap-2.5">
          <h2 id="solicitudes-titulo" className="gr-label">Solicitudes de amistad</h2>
          <ul className="flex flex-col gap-2.5">
            {solicitudes.map((s) => <SolicitudRecibida key={s.id} id={s.id} de={s.de} volver="avisos" />)}
          </ul>
        </section>
      )}
      <InvitacionesRegalo invitaciones={invitaciones} noSePudo={invitacion === 'no_se_pudo'} volver="avisos" />
      <JuegosEnInicio invitaciones={juegosInvitado} pasados={[]} />

      {nuevos.length > 0 && <ListaDeAvisos titulo="Nuevos" entradas={nuevos} animar />}
      {antes.length > 0 && <ListaDeAvisos titulo={nuevos.length ? 'Antes' : 'Lo último'} entradas={antes} />}

      {nada && (
        <div className="gr-empty flex flex-col items-center gap-2 py-8 text-center">
          <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-gr-surface shadow-card"><Icon name="bell" size={26} /></span>
          <p>Todavía no te llegó nada. Acá vas a ver los codazos, las solicitudes de amistad, las propuestas para dividir un regalo, las cuentas de los regalos grupales y los cambios en lo que regalás.</p>
        </div>
      )}

      {!conPush && (
        <Link href="/perfil#avisos" className="gr-card flex items-center gap-3 px-4 py-3.5 text-sm font-medium">
          <span className="gr-row__icon text-gr-ink"><Icon name="bell" size={20} /></span>
          <span className="min-w-0 flex-1">Activá las notificaciones para que también te lleguen al celular.</span>
          <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
        </Link>
      )}
    </Seccion>
  )
}

/** animar: los íconos de lo nuevo se mueven (ver IconoAviso). */
function ListaDeAvisos({ titulo, entradas, animar = false }: { titulo: string; entradas: EntradaBandeja[]; animar?: boolean }) {
  const id = `avisos-${titulo.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <h2 id={id} className="gr-label">{titulo}</h2>
      <ul className="gr-card divide-y divide-gr-line">
        {entradas.map((e, i) => <FilaAviso key={e.id} e={e} animar={animar} i={i} />)}
      </ul>
    </section>
  )
}
