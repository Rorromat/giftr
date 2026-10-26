import Link from 'next/link'
import {
  borrarAmigoInvisibleAction, cambiarExcluidosAction, crearAmigoInvisibleAction, editarAmigoInvisibleAction, invitarAlJuegoAction,
  preguntarAction, responderJuegoAction, responderPreguntaAction, revelarQuienMeRegaloAction, sortearAction, verAQuienLeRegaloAction,
  yaLoTengoAction,
} from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { CampoPrecio } from '@/components/CamposDeseo'
import { Confirmar } from '@/components/Confirmar'
import { ElegirAmigos } from '@/components/Dividir'
import { ElegirFechaDelJuego } from '@/components/ElegirFechaDelJuego'
import { IconoFecha } from '@/components/IconoFecha'
import { IlustracionFecha } from '@/components/IlustracionFecha'
import { AvatarSticker, Icon, Starburst } from '@/components/ui'
import type { Persona } from '@/lib/amigos'
import { estadoDeJuegos, MIN_JUGADORES, type MiJuego, type VistaJuego } from '@/lib/amigo-invisible'
import { fechaCorta, fechaLarga } from '@/lib/events'
import { datosDe, FECHAS_ESPECIALES, type FechaEspecial, type TarjetaEspecial } from '@/lib/fechas-especiales'
import { LARGO } from '@/lib/limites'
import { pesos } from '@/lib/pesos'

// Fechas especiales y amigo invisible (ver fechas-especiales.ts y amigo-invisible.ts): las tarjetas de Lo que viene, las
// invitaciones en Inicio, los juegos en Regalos, el formulario para armarlo y las partes de la pantalla de cada juego.
// Los de una fecha especial van en azul con su ilustración; los "aparte" (sin fecha especial), en negro con lima y el regalo
// con antifaz (ver IlustracionFecha; en chico, IconoFecha).
// A quién le toca a cada uno no aparece en Inicio; en Regalos va tapado hasta tocar "Ver", y en el juego, después de "Ver".

const primerNombre = (n: string) => n.split(' ')[0]
const enDias = (dias: number) => (dias === 0 ? 'es hoy' : dias === 1 ? 'mañana' : `en ${dias} días`)
const diaDe = (fecha: string) => new Date(`${fecha}T00:00:00Z`)

/** El cuadradito de un juego: el ícono de su fecha sobre azul, o el regalo con antifaz sobre negro si es aparte. */
function TileJuego({ f }: { f: FechaEspecial | null }) {
  return (
    <span aria-hidden className={`flex size-[52px] flex-none items-center justify-center rounded-2xl text-gr-on-blue ${f ? 'bg-gr-blue' : 'bg-gr-brand'}`}>
      <IconoFecha fecha={f} size={28} />
    </span>
  )
}

/**
 * La tarjeta del carrusel de Próximos: una fecha especial en azul (con tus amigos invisibles de esa fecha) o un amigo
 * invisible aparte en negro, con su nombre.
 */
export function CardEspecial({ t, hoy }: { t: TarjetaEspecial; hoy: Date }) {
  const fecha = t.tipo === 'fecha' ? t.fecha : null
  const juegos = t.tipo === 'fecha' ? t.juegos : [t.juego]
  const estado = estadoDeJuegos(juegos)
  return (
    <li className="w-[252px] flex-none snap-start">
      <Link href={fecha ? `/fechas/${fecha.id}` : `/invisible/${juegos[0].id}`}
            className={`relative flex h-full flex-col overflow-hidden rounded-[22px] shadow-card ${fecha ? 'bg-gr-blue text-gr-on-blue' : 'bg-gr-brand text-gr-on-brand'}`}>
        <div className={`relative flex h-[170px] items-center justify-center ${fecha
          ? 'bg-[radial-gradient(circle_at_30%_30%,#4a74ff,var(--gr-blue)_70%)]'
          : 'bg-[radial-gradient(circle_at_30%_30%,#3a3a36,var(--gr-brand)_70%)]'}`}>
          <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${fecha ? 'bg-white text-gr-blue' : 'bg-gr-accent text-gr-ink'}`}>
            {fecha ? 'FECHA ESPECIAL' : 'AMIGO INVISIBLE'}
          </span>
          <IlustracionFecha fecha={fecha?.id ?? null} size={150} firma={false} className="mt-4" />
          <Starburst size={64} fontSize={t.dias > 99 ? 26 : 32} sub={t.dias === 0 ? undefined : t.dias === 1 ? 'día' : 'días'}
                     label={t.dias === 0 ? 'Es hoy' : `Faltan ${t.dias} ${t.dias === 1 ? 'día' : 'días'}`}
                     className="absolute right-2 top-2 drop-shadow-sm">
            {t.dias === 0 ? '¡Hoy!' : t.dias}
          </Starburst>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3.5">
          <h2 className="text-[17px] leading-snug font-semibold [overflow-wrap:anywhere]">{fecha ? fecha.nombre : juegos[0].nombre}</h2>
          <p className="flex items-center gap-1.5 text-[13px] opacity-85">
            <Icon name="calendar" size={15} className="flex-none" />
            {fecha ? fecha.cuando : fechaLarga(diaDe(juegos[0].fecha), hoy)}
          </p>
          {estado
            ? <p className="self-start rounded-full bg-gr-accent px-2.5 py-0.5 text-xs font-semibold text-gr-ink">{estado}</p>
            : <p className="text-[13px] leading-snug opacity-85">Algo de su lista, una sorpresa o un amigo invisible.</p>}
        </div>
      </Link>
    </li>
  )
}

/**
 * En Inicio: los amigos invisibles a los que te invitaron (Juego / No juego) y los que ya pasaron, por si querés saber
 * quién te regaló (no se dice: hay que entrar y pedirlo).
 */
export function JuegosEnInicio({ invitaciones, pasados }: { invitaciones: MiJuego[]; pasados: MiJuego[] }) {
  if (!invitaciones.length && !pasados.length) return null
  return (
    <section aria-labelledby="juegos-titulo" className="flex flex-col gap-2.5">
      <h2 id="juegos-titulo" className="gr-label">Amigo invisible</h2>
      {invitaciones.map((j) => (
        <article key={j.id} className="gr-card flex flex-col gap-3 p-3.5">
          <Link href={`/invisible/${j.id}`} className="flex items-center gap-3">
            <TileJuego f={j.fechaEspecial} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-snug text-gr-muted">
                <span className="font-semibold text-gr-ink">{primerNombre(j.organizador)}</span> te invita a un amigo invisible
              </span>
              <span className="block text-base leading-snug font-semibold [overflow-wrap:anywhere]">{j.nombre}</span>
              <span className="block text-[13px] leading-snug text-gr-muted">{fechaLarga(diaDe(j.fecha))}</span>
            </span>
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <form action={responderJuegoAction}>
              <input type="hidden" name="id" value={j.id} />
              <input type="hidden" name="juega" value="0" />
              <BotonEnviar className="gr-btn gr-btn--sm w-full">No juego</BotonEnviar>
            </form>
            <form action={responderJuegoAction}>
              <input type="hidden" name="id" value={j.id} />
              <input type="hidden" name="juega" value="1" />
              <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">Juego</BotonEnviar>
            </form>
          </div>
        </article>
      ))}
      {pasados.map((j) => (
        <Link key={j.id} href={`/invisible/${j.id}#me-regalo`} className="gr-card flex items-center gap-3 p-3.5">
          <span aria-hidden className="flex size-11 flex-none items-center justify-center rounded-full bg-gr-blue text-gr-on-blue"><Icon name="antifaz" size={22} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]">¿Quién te regaló en «{j.nombre}»?</span>
            <span className="block text-[13px] leading-snug text-gr-muted">Si querés saberlo, entrá y pedilo. Si no, no se dice.</span>
          </span>
          <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
        </Link>
      ))}
    </section>
  )
}

/** "Ya tengo el regalo": lo marcás vos, para no perderte entre varios (no lo ve nadie más). */
function YaLoTengo({ id, tengo }: { id: string; tengo: boolean }) {
  return (
    <form action={yaLoTengoAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="tengo" value={tengo ? '0' : '1'} />
      <BotonEnviar aria-pressed={tengo}
                   className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold ${tengo ? 'bg-gr-accent' : 'bg-gr-soft'}`}>
        <span aria-hidden className={`flex size-4 items-center justify-center rounded border-[1.5px] border-gr-ink ${tengo ? 'bg-gr-ink text-gr-accent' : ''}`}>
          {tengo && <Icon name="check" size={11} strokeWidth={3.4} />}
        </span>
        Ya tengo el regalo
      </BotonEnviar>
    </form>
  )
}

/**
 * Un amigo invisible en tu lista (Regalos y la pantalla de su fecha), con lo que te toca hacer: contestar, esperar el
 * sorteo, ver a quién le regalás, marcar que ya tenés el regalo o, pasada la fecha, ver quién te regaló. A quién le
 * regalás va tapado hasta tocar "Ver". tambien: los otros juegos donde te tocó la misma persona.
 */
export function FilaJuego({ j, tambien = [] }: { j: MiJuego; tambien?: string[] }) {
  const href = `/invisible/${j.id}`
  const datos = [
    fechaCorta(diaDe(j.fecha)), j.presupuesto && `hasta ${pesos(j.presupuesto)}`,
    j.soyOrganizador ? 'organizás vos' : `organiza ${primerNombre(j.organizador)}`,
  ].filter(Boolean).join(' · ')
  const pasado = j.dias < 0
  return (
    <article className="gr-card flex flex-col gap-3 p-3">
      <Link href={href} className="flex items-center gap-3">
        <TileJuego f={j.fechaEspecial} />
        <span className="min-w-0 flex-1">
          <span className="block text-base leading-snug font-semibold [overflow-wrap:anywhere]">{j.nombre}</span>
          <span className="block text-[13px] leading-snug text-gr-muted">{datos}</span>
        </span>
        {j.preguntasSinContestar > 0 && (
          <span className="flex-none rounded-full bg-gr-blue px-2.5 py-1 text-xs font-bold text-gr-on-blue">
            {j.preguntasSinContestar === 1 ? '1 pregunta' : `${j.preguntasSinContestar} preguntas`}
          </span>
        )}
        <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
      </Link>

      {pasado ? (
        <Link href={`${href}#me-regalo`} className="self-start rounded-full bg-gr-soft px-3 py-1.5 text-[13px] font-bold">
          {j.revelado ? 'Ya sabés quién te regaló' : '¿Quién te regaló? ›'}
        </Link>
      ) : j.miEstado === 'invitado' ? (
        <div className="grid grid-cols-2 gap-2">
          <form action={responderJuegoAction}>
            <input type="hidden" name="id" value={j.id} />
            <input type="hidden" name="juega" value="0" />
            <BotonEnviar className="gr-btn gr-btn--sm w-full">No juego</BotonEnviar>
          </form>
          <form action={responderJuegoAction}>
            <input type="hidden" name="id" value={j.id} />
            <input type="hidden" name="juega" value="1" />
            <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">Juego</BotonEnviar>
          </form>
        </div>
      ) : !j.sorteado ? (
        <p className="self-start rounded-full bg-gr-soft px-3 py-1.5 text-[13px] font-bold">
          {j.soyOrganizador ? 'Falta que sortees' : 'Falta sortear'} · {j.contestaron} de {j.invitados} contestaron
        </p>
      ) : !j.meToca ? (
        <Link href={`${href}#te-toco`} className="self-start rounded-full bg-gr-accent px-3 py-1.5 text-[13px] font-bold">
          Ya se sorteó: mirá a quién le regalás ›
        </Link>
      ) : (
        <>
          <details className="group rounded-2xl bg-gr-soft">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-3 text-sm [&::-webkit-details-marker]:hidden">
              <Icon name="antifaz" size={18} className="flex-none" />
              <span className="flex-none">Le regalás a</span>
              <span aria-hidden className="min-w-0 flex-1 font-extrabold tracking-[3px] text-gr-muted group-open:hidden">●●●●●</span>
              <span className="hidden min-w-0 flex-1 truncate font-bold group-open:inline">{j.meToca.nombre}</span>
              <span className="flex-none rounded-full border border-gr-line bg-gr-surface px-3 py-1 text-[13px] font-bold">
                <span className="group-open:hidden">Ver</span><span className="hidden group-open:inline">Tapar</span>
              </span>
            </summary>
            {tambien.length > 0 && (
              <p className="px-3 pb-3 text-[13px] leading-snug font-medium">
                Ojo: también te tocó en {tambien.map((n) => `«${n}»`).join(' y ')}.
              </p>
            )}
          </details>
          <div className="flex flex-wrap items-center gap-2">
            <YaLoTengo id={j.id} tengo={j.yaLoTengo} />
            <span className="text-[13px] text-gr-muted">{enDias(j.dias)}</span>
          </div>
        </>
      )}
    </article>
  )
}

/** "Armar un amigo invisible", aparte o para una fecha (en Regalos, cuando no estás en ninguno). */
export function ArmarJuego({ fecha }: { fecha?: FechaEspecial }) {
  return (
    <Link href={fecha ? `/invisible/nuevo?fecha=${fecha}` : '/invisible/nuevo'}
          className="flex items-center gap-3.5 rounded-[22px] border-2 border-dashed border-gr-line-strong px-4 py-3.5">
      <span aria-hidden className="flex size-11 flex-none items-center justify-center rounded-full bg-gr-accent"><IconoFecha fecha={fecha ?? null} size={24} acento="currentColor" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug font-semibold">Armar un amigo invisible</span>
        <span className="block text-[13px] leading-snug text-gr-muted">Con tus amigos de GiftR. Se sortea y cada uno ve solo a quién le regala.</span>
      </span>
      <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
    </Link>
  )
}

/**
 * Armar (o editar) un amigo invisible: si es para una fecha especial o aparte, nombre, temática, presupuesto, cuándo se dan
 * los regalos y, al armarlo, a qué amigos invitar. editar: el que ya está (sin elegir amigos: a más se los invita desde el
 * juego). propuestas: el día de cada fecha especial, para completarlo al elegirla.
 */
export function FormJuego({ fechaEspecial, propuestas, amigos, hoy, error, inicial, editar }: {
  fechaEspecial: FechaEspecial | null
  propuestas: Partial<Record<FechaEspecial, string>>
  amigos: Persona[]
  hoy: string
  error: boolean
  inicial: { nombre: string; descripcion: string; presupuesto: string; fecha: string }
  editar?: { id: string }
}) {
  return (
    <form action={editar ? editarAmigoInvisibleAction : crearAmigoInvisibleAction} className="mt-1 flex flex-col gap-4">
      {editar && <input type="hidden" name="id" value={editar.id} />}
      {error && (
        <p role="alert" className="rounded-[18px] bg-gr-soft px-4 py-3 text-sm font-medium">
          No lo pudimos guardar. Fijate que tenga nombre y una fecha que no haya pasado.
        </p>
      )}
      <p className="flex items-start gap-2.5 rounded-[18px] bg-gr-brand px-4 py-3 text-sm font-medium text-gr-on-brand">
        <Icon name="antifaz" size={20} className="flex-none text-gr-accent" />
        Se sortea entre los que juegan y cada uno ve solo a quién le regala. Nadie más lo ve, tampoco vos que lo organizás.
      </p>
      <ElegirFechaDelJuego inicial={fechaEspecial} propuestas={propuestas}
                           opciones={FECHAS_ESPECIALES.map((f) => ({ id: f, nombre: datosDe(f).nombre }))} />
      <label className="flex flex-col gap-1.5">
        <span className="gr-label">Nombre</span>
        <input name="nombre" required maxLength={LARGO.nombreGrupo} defaultValue={inicial.nombre} placeholder="Navidad con los chicos"
               autoComplete="off" className="gr-input" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="gr-label">Temática o descripción (si hay)</span>
        <textarea name="descripcion" rows={3} maxLength={LARGO.temaInvisible} defaultValue={inicial.descripcion}
                  placeholder="Algo hecho a mano, un libro, todo de la Selección… Lo que acuerden." className="gr-input" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="gr-label">Se dan los regalos</span>
          <input name="fecha" type="date" required min={hoy} defaultValue={inicial.fecha} className="gr-input" />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="gr-label">Presupuesto</span>
          <CampoPrecio name="presupuesto" maxLength={LARGO.precio} inputMode="decimal" placeholder="$ Hasta…" defaultValue={inicial.presupuesto}
                       className="gr-input" />
        </label>
      </div>

      {!editar && (
        <div className="flex flex-col gap-2.5">
          <p className="gr-label">¿Quiénes juegan? (tus amigos)</p>
          {amigos.length > 0 ? (
            <>
              <ElegirAmigos amigos={amigos} ambito="amigos-invisible" />
              <p className="text-xs leading-snug text-gr-muted">
                A cada uno le llega la invitación y dice si juega. Cuando estén (con vos, al menos {MIN_JUGADORES}), sorteás. También
                podés invitar a más después.
              </p>
            </>
          ) : (
            <p className="text-xs leading-snug text-gr-muted">
              Juegan tus amigos de GiftR, y todavía no tenés. Armalo igual y{' '}
              <Link href="/gente/agregar" className="font-semibold underline underline-offset-2">sumá amigos</Link> para invitarlos.
            </p>
          )}
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-[18px] mt-1 bg-gradient-to-t from-gr-bg from-70% to-transparent px-[18px] pb-[max(18px,env(safe-area-inset-bottom))] pt-3">
        <BotonEnviar pendiente={editar ? 'Guardando…' : 'Armando…'} className="gr-btn-primary h-14 w-full text-[17px]">
          {editar ? 'Guardar cambios' : amigos.length ? 'Armarlo e invitarlos' : 'Armarlo'}
        </BotonEnviar>
      </div>
    </form>
  )
}

const ESTADOS: Record<VistaJuego['gente'][number]['estado'], string> = { juega: 'Juega ✓', invitado: 'Esperando', no_juega: 'No juega' }

/** Los datos del juego: cuándo, hasta cuánto, quién organiza y la temática. */
export function DatosDelJuego({ v }: { v: VistaJuego }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <TileJuego f={v.fechaEspecial} />
          <h2 className="gr-title min-w-0 [overflow-wrap:anywhere]">{v.nombre}</h2>
        </div>
        <p className="text-[14px] leading-snug text-gr-muted">
          {v.cuando}{v.dias >= 0 && ` (${enDias(v.dias)})`}
          {v.presupuesto ? ` · hasta ${pesos(v.presupuesto)}` : ''} · organiza {v.soyOrganizador ? 'vos' : primerNombre(v.organizador.nombre)}
        </p>
      </div>
      {v.descripcion && (
        <p className="rounded-[18px] bg-gr-soft px-4 py-3 text-[15px] leading-snug whitespace-pre-line [overflow-wrap:anywhere]">
          <span className="gr-label mb-1 block">Temática</span>{v.descripcion}
        </p>
      )}
    </div>
  )
}

/** Antes del sorteo, para el que está invitado o ya contestó: juego, no juego, o bajarse. */
export function MiRespuesta({ v }: { v: VistaJuego }) {
  if (v.sorteado || v.soyOrganizador) return null
  const responder = (juega: boolean, texto: string, primario: boolean) => (
    <form action={responderJuegoAction} className="flex-1">
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="juega" value={juega ? '1' : '0'} />
      <input type="hidden" name="desde" value="juego" />
      <BotonEnviar className={`${primario ? 'gr-btn-primary' : 'gr-btn'} gr-btn--sm w-full`}>{texto}</BotonEnviar>
    </form>
  )
  if (v.miEstado === 'invitado') {
    return (
      <div className="gr-card flex flex-col gap-3 p-4">
        <p className="text-[15px] font-semibold">{primerNombre(v.organizador.nombre)} te invitó. ¿Jugás?</p>
        <div className="flex gap-2">{responder(false, 'No juego', false)}{responder(true, 'Juego', true)}</div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 rounded-[18px] bg-gr-soft px-4 py-3">
      <p className="min-w-0 flex-1 text-sm font-medium">
        {v.miEstado === 'juega' ? 'Estás adentro. Cuando se sortee, te llega a quién le regalás.' : 'Dijiste que no jugás.'}
      </p>
      <div className="w-32 flex-none">{v.miEstado === 'juega' ? responder(false, 'Me bajo', false) : responder(true, 'Me sumo', true)}</div>
    </div>
  )
}

/** Los que están, con cómo están; después del sorteo, si ya vieron a quién les toca (nunca a quién). */
export function GenteDelJuego({ v }: { v: VistaJuego }) {
  const juegan = v.gente.filter((g) => g.estado === 'juega')
  const lista = v.sorteado ? juegan : v.gente
  return (
    <section aria-labelledby="gente-titulo" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="gente-titulo" className="gr-label">{v.sorteado ? `Juegan ${juegan.length}` : `${juegan.length} juegan · ${v.gente.length} invitados`}</h2>
        {v.sorteado && <span className="text-xs font-semibold text-gr-muted">{juegan.filter((g) => g.vio).length} ya vieron a quién les toca</span>}
      </div>
      <ul className="flex flex-col divide-y divide-gr-line rounded-2xl border border-gr-line bg-gr-surface px-3">
        {lista.map((g) => (
          <li key={g.persona.id} className="flex min-h-12 items-center gap-3 py-1.5">
            <AvatarSticker nombre={g.persona.nombre} foto={g.persona.foto} size={32} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.persona.nombre}</span>
            <span className={`flex-none text-[13px] font-semibold ${g.estado === 'juega' && !v.sorteado ? '' : 'text-gr-muted'}`}>
              {v.sorteado ? (g.vio ? 'Ya vio ✓' : 'Todavía no vio') : ESTADOS[g.estado]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Para el que organiza, antes del sorteo: invitar a más, quiénes no se tocan y sortear. Lo que no salió (pocos, o no hay
 * forma con los que no se tocan) vuelve en ?sorteo=.
 */
export function Organizar({ v, paraInvitar, sorteo, excluirError }: {
  v: VistaJuego; paraInvitar: Persona[]; sorteo?: string; excluirError: boolean
}) {
  const juegan = v.gente.filter((g) => g.estado === 'juega').map((g) => g.persona)
  const faltan = v.gente.filter((g) => g.estado === 'invitado').length
  return (
    <section aria-labelledby="organizar-titulo" className="flex flex-col gap-4">
      <h2 id="organizar-titulo" className="gr-label">Lo organizás vos</h2>

      {paraInvitar.length > 0 && (
        <details className="group flex flex-col">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold underline underline-offset-4 [&::-webkit-details-marker]:hidden">
            <Icon name="users" size={17} />Invitar a más amigos
          </summary>
          <form action={invitarAlJuegoAction} className="mt-2 flex flex-col gap-2.5">
            <input type="hidden" name="id" value={v.id} />
            <ElegirAmigos amigos={paraInvitar} ambito="amigos-invitar-juego" />
            <BotonEnviar pendiente="Mandando…" className="gr-btn gr-btn--sm w-full">Mandarles la invitación</BotonEnviar>
          </form>
        </details>
      )}

      <div id="no-se-tocan" className="flex scroll-mt-6 flex-col gap-2.5 rounded-[22px] border-2 border-dashed border-gr-line-strong p-3.5">
        <p className="text-[15px] font-semibold">Que no se toquen</p>
        <p className="-mt-1.5 text-[13px] leading-snug text-gr-muted">Parejas, hermanos o los que ya se regalan igual: no les toca regalarse entre ellos.</p>
        {excluirError && <p role="alert" className="text-[13px] font-semibold">Elegí a dos que estén en el juego.</p>}
        {v.excluidos.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {v.excluidos.map(([a, b]) => (
              <li key={`${a.id}-${b.id}`} className="flex min-h-11 items-center gap-2 rounded-2xl bg-gr-soft px-3">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{primerNombre(a.nombre)} ↔ {primerNombre(b.nombre)}</span>
                <form action={cambiarExcluidosAction}>
                  <input type="hidden" name="id" value={v.id} />
                  <input type="hidden" name="a" value={a.id} />
                  <input type="hidden" name="b" value={b.id} />
                  <input type="hidden" name="excluir" value="0" />
                  <BotonEnviar aria-label={`Que ${primerNombre(a.nombre)} y ${primerNombre(b.nombre)} sí se puedan tocar`}
                               className="flex size-9 items-center justify-center rounded-full">
                    <Icon name="close" size={16} />
                  </BotonEnviar>
                </form>
              </li>
            ))}
          </ul>
        )}
        {v.gente.length >= 2 && (
          <form action={cambiarExcluidosAction} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <input type="hidden" name="id" value={v.id} />
            <input type="hidden" name="excluir" value="1" />
            <select name="a" required aria-label="Uno" className="gr-input min-w-0" defaultValue="">
              <option value="" disabled>Uno</option>
              {v.gente.map((g) => <option key={g.persona.id} value={g.persona.id}>{g.persona.nombre}</option>)}
            </select>
            <span aria-hidden className="font-semibold">↔</span>
            <select name="b" required aria-label="Otro" className="gr-input min-w-0" defaultValue="">
              <option value="" disabled>Otro</option>
              {v.gente.map((g) => <option key={g.persona.id} value={g.persona.id}>{g.persona.nombre}</option>)}
            </select>
            <BotonEnviar className="gr-btn gr-btn--sm col-span-3 w-full">Que no se toquen</BotonEnviar>
          </form>
        )}
      </div>

      <div id="sortear" className="flex scroll-mt-6 flex-col gap-2">
        {sorteo === 'pocos' && (
          <p role="alert" className="rounded-[18px] bg-gr-soft px-4 py-3 text-sm font-medium">
            Para sortear tienen que jugar al menos {MIN_JUGADORES} (con vos). Esperá que contesten o invitá a más.
          </p>
        )}
        {sorteo === 'imposible' && (
          <p role="alert" className="rounded-[18px] bg-gr-soft px-4 py-3 text-sm font-medium">
            Con los que no se tocan no hay forma de sortear: sacá alguno de la lista de arriba.
          </p>
        )}
        {juegan.length >= MIN_JUGADORES ? (
          // el paso que no se deshace: el botón abre la explicación y el de verdad está adentro (como Confirmar)
          <details className="group flex flex-col">
            <summary className="gr-btn-primary h-14 w-full cursor-pointer list-none text-[17px] [&::-webkit-details-marker]:hidden">
              Sortear entre los {juegan.length} que juegan
            </summary>
            <form action={sortearAction} className="mt-2 flex flex-col gap-2.5 rounded-2xl border border-gr-line bg-gr-surface p-3.5">
              <input type="hidden" name="id" value={v.id} />
              <p className="text-[13px] leading-snug font-medium">
                {faltan > 0 && `${faltan === 1 ? 'Uno no contestó y queda afuera' : `${faltan} no contestaron y quedan afuera`}. `}
                Se sortea una sola vez: a cada uno le llega el aviso y ve solo a quién le regala. Después no se puede volver a sortear.
              </p>
              <BotonEnviar pendiente="Sorteando…" className="gr-btn-primary gr-btn--sm w-full">Sortear ahora</BotonEnviar>
            </form>
          </details>
        ) : (
          <p className="text-[13px] leading-snug text-gr-muted">
            Cuando jueguen al menos {MIN_JUGADORES} (con vos), vas a poder sortear. Ahora juegan {juegan.length}.
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * Después del sorteo: "Ver a quién le regalo" (y desde ahí, a quién, con su lista y "Ya tengo el regalo"). tambien: los
 * otros juegos donde te tocó la misma persona.
 */
export function TeToco({ v, tambien = [] }: { v: VistaJuego; tambien?: string[] }) {
  if (!v.sorteado || v.miEstado !== 'juega') return null
  if (!v.meToca) {
    return (
      <div id="te-toco" className="flex scroll-mt-6 flex-col items-center gap-3 rounded-[26px] bg-gr-brand px-5 py-6 text-center text-gr-on-brand">
        <IlustracionFecha fecha={v.fechaEspecial} size={120} />
        <p className="text-xl font-semibold">Ya se sorteó</p>
        <p className="text-sm opacity-80">Fijate que nadie esté mirando tu pantalla.</p>
        <form action={verAQuienLeRegaloAction} className="w-full">
          <input type="hidden" name="id" value={v.id} />
          <BotonEnviar pendiente="Abriendo…" className="gr-btn gr-btn--accent h-12 w-full">Ver a quién le regalo</BotonEnviar>
        </form>
      </div>
    )
  }
  const { persona, token } = v.meToca
  return (
    <div id="te-toco" className="flex scroll-mt-6 flex-col items-center gap-2 rounded-[26px] bg-gr-brand px-5 py-6 text-center text-gr-on-brand">
      <span className="flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-gr-accent"><Icon name="antifaz" size={18} />TE TOCÓ</span>
      <AvatarSticker nombre={persona.nombre} foto={persona.foto} size={84} className="ring-[3px] ring-gr-accent" />
      <p className="text-[28px] leading-tight font-semibold [overflow-wrap:anywhere]">{persona.nombre}</p>
      <p className="text-[13px] opacity-80">
        Solo vos lo sabés.{v.soyOrganizador ? ' Nadie más lo ve.' : ` Ni ${primerNombre(v.organizador.nombre)} (que lo organiza) lo ve.`}
      </p>
      {tambien.length > 0 && (
        <p className="text-[13px] font-semibold text-gr-accent">Ojo: también te tocó en {tambien.map((n) => `«${n}»`).join(' y ')}.</p>
      )}
      {token && <Link href={`/l/${token}`} className="gr-btn gr-btn--accent mt-1.5 h-12 w-full">Ver su lista y sus talles</Link>}
      <div className="mt-1 text-gr-ink"><YaLoTengo id={v.id} tengo={v.yaLoTengo} /></div>
    </div>
  )
}

/** Preguntas anónimas: las que le hacés a quien le regalás y las que te hace tu amigo invisible (sin decir quién). */
export function Preguntas({ v, error }: { v: VistaJuego; error: boolean }) {
  if (!v.sorteado || v.miEstado !== 'juega' || (!v.meToca && !v.preguntasParaMi.length)) return null
  const quien = v.meToca ? primerNombre(v.meToca.persona.nombre) : null
  return (
    <section id="preguntas" aria-labelledby="preguntas-titulo" className="flex scroll-mt-6 flex-col gap-3">
      <h2 id="preguntas-titulo" className="gr-label">Preguntas anónimas</h2>
      {v.preguntasParaMi.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Tu amigo invisible te preguntó</p>
          {v.preguntasParaMi.map((p) => (
            <div key={p.id} className="gr-card flex flex-col gap-2 p-3.5">
              <p className="flex gap-2 text-[15px] leading-snug [overflow-wrap:anywhere]"><Icon name="antifaz" size={20} className="mt-px flex-none text-gr-muted" />{p.texto}</p>
              {p.respuesta ? (
                <p className="rounded-2xl bg-gr-soft px-3 py-2 text-sm leading-snug [overflow-wrap:anywhere]"><b>Vos:</b> {p.respuesta}</p>
              ) : (
                <form action={responderPreguntaAction} className="flex gap-2">
                  <input type="hidden" name="pregunta" value={p.id} />
                  <input name="respuesta" required maxLength={LARGO.comentario} placeholder="Tu respuesta" aria-label="Tu respuesta"
                         autoComplete="off" className="gr-input min-w-0 flex-1" />
                  <BotonEnviar className="gr-btn-primary gr-btn--sm flex-none">Contestar</BotonEnviar>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
      {quien && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Preguntale algo a {quien} sin que sepa que sos vos</p>
          {v.preguntasMias.map((p) => (
            <div key={p.id} className="gr-card flex flex-col gap-1.5 p-3.5">
              <p className="text-[15px] leading-snug [overflow-wrap:anywhere]">{p.texto}</p>
              <p className={`text-sm leading-snug [overflow-wrap:anywhere] ${p.respuesta ? '' : 'text-gr-muted'}`}>
                {p.respuesta ? <><b>{quien}:</b> {p.respuesta}</> : 'Todavía no contestó.'}
              </p>
            </div>
          ))}
          {error && <p role="alert" className="text-[13px] font-semibold">No se pudo mandar. Probá de nuevo.</p>}
          <form action={preguntarAction} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={v.id} />
            <textarea name="texto" required rows={2} maxLength={LARGO.comentario} placeholder="¿Qué talle de remera usás?" aria-label="Tu pregunta"
                      className="gr-input" />
            <BotonEnviar pendiente="Mandando…" className="gr-btn gr-btn--sm w-full">Preguntar sin decir que soy yo</BotonEnviar>
          </form>
          <p className="text-xs leading-snug text-gr-muted">Le llega de «tu amigo invisible» y te contesta acá.</p>
        </div>
      )}
    </section>
  )
}

/** "¿Quién me regaló?": después de la fecha, solo si lo pedís. */
export function QuienMeRegalo({ v }: { v: VistaJuego }) {
  if (!v.sorteado || v.miEstado !== 'juega') return null
  if (v.meRegalo) {
    return (
      <div id="me-regalo" className="gr-card flex scroll-mt-6 items-center gap-3 p-4">
        <AvatarSticker nombre={v.meRegalo.nombre} foto={v.meRegalo.foto} size={48} />
        <p className="min-w-0 flex-1 text-[15px] leading-snug">Te regaló <b>{v.meRegalo.nombre}</b></p>
      </div>
    )
  }
  if (!v.puedoRevelar) {
    return (
      <p id="me-regalo" className="scroll-mt-6 text-center text-[13px] leading-snug text-gr-muted">
        Después del {fechaLarga(new Date(`${v.fecha}T00:00:00Z`)).toLowerCase()}, si querés, vas a poder ver quién te regaló.
      </p>
    )
  }
  return (
    <div id="me-regalo" className="flex scroll-mt-6 flex-col gap-2.5 rounded-[22px] border-2 border-dashed border-gr-line-strong p-4">
      <p className="text-[15px] font-semibold">¿Quién te regaló?</p>
      <p className="-mt-1 text-[13px] leading-snug text-gr-muted">No se dice si no lo pedís. Nadie se entera de que miraste.</p>
      <form action={revelarQuienMeRegaloAction}>
        <input type="hidden" name="id" value={v.id} />
        <BotonEnviar className="gr-btn gr-btn--sm w-full">Ver quién me regaló</BotonEnviar>
      </form>
    </div>
  )
}

/** Abajo, para el que organiza: editar y borrar. */
export function EditarYBorrar({ v }: { v: VistaJuego }) {
  if (!v.soyOrganizador) return null
  return (
    <div className="flex flex-col items-center gap-1 pt-2">
      <Link href={`/invisible/${v.id}/editar`} className="flex min-h-11 items-center gap-2 text-sm font-semibold underline underline-offset-4">
        Cambiar nombre, temática, presupuesto o fecha
      </Link>
      <Confirmar resumen="Borrar este amigo invisible" boton="Sí, borrarlo" action={borrarAmigoInvisibleAction}
                 ocultos={{ id: v.id }} className="items-center">
        Se borra para todos, con el sorteo y las preguntas. No se puede deshacer.
      </Confirmar>
    </div>
  )
}
