import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { bandeja, type EntradaBandeja, type TipoEnBandeja } from '@/lib/bandeja'
import { pendientesDe, type Pendiente } from '@/lib/para-vos'
import { tieneAvisos } from '@/lib/codazos'
import { hoyLocal } from '@/lib/events'
import { invitadoParaPreguntar } from '@/lib/viewer'
import { MarcarBandejaVista } from '@/components/MarcarBandejaVista'
import { FilaAviso } from '@/components/FilaAviso'
import { ParaVosEntero } from '@/components/ParaVos'
import { Icon, PageHeader, Seccion } from '@/components/ui'

/**
 * Avisos (la campanita): arriba todo lo que espera que hagas algo, entero y por urgencia (ver ParaVosEntero: en Inicio van
 * solo los primeros) y abajo todo lo que te llegó en los últimos 60 días, lo nuevo primero. Al abrirla, deja de ser nuevo.
 * Se llega desde la campanita de las cuatro secciones: "Volver" lleva a la que estaba (?volver=, ver lib/volver.ts).
 */
/**
 * Lo que llegó como aviso y además espera arriba, entero y con sus botones: la solicitud de Sofi estaba dos veces en la
 * misma pantalla, una para contestarla y otra como aviso. Mientras espera arriba, el aviso no se repite abajo.
 */
const YA_ARRIBA: Partial<Record<Pendiente['tipo'], TipoEnBandeja>> = {
  solicitudes: 'amistad_pedida', propuesta: 'propuesta_regalo', juego: 'invisible_invitacion', codazos: 'codazo',
}

export default async function Avisos({ searchParams }: { searchParams: Promise<{ invitacion?: string; volver?: string | string[] }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const yo = session.userId
  const [{ entradas: todas, hasta }, { pendientes }, conPush, { invitacion, volver }] = await Promise.all([
    bandeja(db, { userId: yo }), invitadoParaPreguntar(yo).then((invitado) => pendientesDe(db, yo, hoyLocal(), invitado)),
    tieneAvisos(db, yo), searchParams,
  ])
  // los avisos de la campanita que piden algo ya están abajo, entre los nuevos
  const esperan = pendientes.filter((p) => p.tipo !== 'aviso')
  const arriba = new Set(esperan.flatMap((p) => YA_ARRIBA[p.tipo] ?? []))
  const entradas = todas.filter((e) => !(e.tipo && arriba.has(e.tipo)))
  const nuevos = entradas.filter((e) => e.nuevo)
  const antes = entradas.filter((e) => !e.nuevo)
  const nada = !entradas.length && !esperan.length

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <PageHeader title="Avisos" back="/inicio" backLabel="Volver a Inicio" origen={{ pantalla: '/avisos', volver }} />
      <MarcarBandejaVista hasta={hasta.toISOString()} />

      <ParaVosEntero pendientes={esperan} noSePudo={invitacion === 'no_se_pudo'} />

      {nuevos.length > 0 && <ListaDeAvisos titulo="Nuevos" entradas={nuevos} animar />}
      {antes.length > 0 && <ListaDeAvisos titulo={nuevos.length ? 'Antes' : 'Lo último'} entradas={antes} />}

      {nada && (
        <div className="gr-empty flex flex-col items-center gap-2 py-8 text-center">
          <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-gr-surface shadow-card"><Icon name="bell" size={26} /></span>
          <p>Todavía no te llegó nada. Acá vas a ver los codazos, las solicitudes de amistad, las propuestas de regalo grupal, las cuentas de los regalos grupales y los cambios en lo que regalás.</p>
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
