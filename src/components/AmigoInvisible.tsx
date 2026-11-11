import Link from 'next/link'
import {
  borrarAmigoInvisibleAction, cambiarExcluidosAction, cambiarLinkDelJuegoAction, cerrarAltasAction, crearAmigoInvisibleAction,
  dejarVolverAlJuegoAction, editarAmigoInvisibleAction, invitarAlJuegoAction, preguntarAction, responderJuegoAction, responderPreguntaAction,
  revelarQuienMeRegaloAction, sacarDelJuegoAction, sortearAction, verAQuienLeRegaloAction, yaLoTengoAction,
} from '@/app/actions'
import { BotonEnviar } from '@/components/BotonEnviar'
import { CampoPrecio } from '@/components/CamposDeseo'
import { Confirmar } from '@/components/Confirmar'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import { ElegirAmigos } from '@/components/Dividir'
import { ElegirFechaDelJuego } from '@/components/ElegirFechaDelJuego'
import { ElegirRegla, LoQueTeTocaA, ReglaDelJuego, TuTurno } from '@/components/ReglasInvisible'
import { leerRegla, loQueTeToca } from '@/lib/reglas-invisible'
import { IconoFecha } from '@/components/IconoFecha'
import { IlustracionFecha } from '@/components/IlustracionFecha'
import { paletaDe } from '@/lib/colores-fechas'
import { AvatarSticker, Faltan, Icon } from '@/components/ui'
import type { Persona } from '@/lib/amigos'
import { estadoDeJuegos, MAX_JUGADORES, MIN_JUGADORES, type MiJuego, type VistaJuego } from '@/lib/amigo-invisible'
import { juntarNombres } from '@/lib/groups'
import { fechaCorta, fechaLarga } from '@/lib/events'
import { datosDe, FECHAS_ESPECIALES, type FechaEspecial, type TarjetaEspecial } from '@/lib/fechas-especiales'
import { LARGO } from '@/lib/limites'
import { pesos } from '@/lib/pesos'

// Fechas especiales y amigo invisible (ver fechas-especiales.ts y amigo-invisible.ts): las tarjetas de Lo que viene, las
// invitaciones en Inicio, los juegos en Regalos, el formulario para armarlo y las partes de la pantalla de cada juego.
// Cada fecha especial va con sus colores y su ilustración; los "aparte" (sin fecha especial), en negro con lima y el regalo
// con antifaz (ver colores-fechas.ts e IlustracionFecha; en chico, IconoFecha).
// A quién le toca a cada uno no aparece en Inicio; en Regalos va tapado hasta tocar "Ver", y en el juego, después de "Ver".
// Para el que organiza, además: el link para sumar gente por WhatsApp, sacar a alguien y, si después del sorteo alguien
// se bajó o se sumó, volver a sortear.

const primerNombre = (n: string) => n.split(' ')[0]
const enDias = (dias: number) => (dias === 0 ? 'es hoy' : dias === 1 ? 'mañana' : `en ${dias} días`)
const diaDe = (fecha: string) => new Date(`${fecha}T00:00:00Z`)

/** El cuadradito de un juego: el ícono de su fecha sobre su color, o el regalo con antifaz sobre negro si es aparte. */
function TileJuego({ f }: { f: FechaEspecial | null }) {
  const p = paletaDe(f)
  return (
    <span aria-hidden className="flex size-[52px] flex-none items-center justify-center rounded-gr-md text-white" style={{ background: p.fondo }}>
      <IconoFecha fecha={f} size={28} acento={p.acento} />
    </span>
  )
}

/**
 * La tarjeta del carrusel de Próximos: una fecha especial con sus colores (con tus amigos invisibles de esa fecha) o un
 * amigo invisible aparte en negro, con su nombre. También la de un día de Todo el año, a lo ancho.
 */
export function CardEspecial({ t, hoy, className = 'w-[252px] flex-none snap-start' }: { t: TarjetaEspecial; hoy: Date; className?: string }) {
  const fecha = t.tipo === 'fecha' ? t.fecha : null
  const juegos = t.tipo === 'fecha' ? t.juegos : [t.juego]
  const estado = estadoDeJuegos(juegos)
  const p = paletaDe(fecha?.id ?? null)
  return (
    <li className={className}>
      <Link href={fecha ? `/fechas/${fecha.id}` : `/invisible/${juegos[0].id}`} style={{ background: p.fondo }}
            className="relative flex h-full flex-col overflow-hidden rounded-gr-lg text-white shadow-card">
        <div className="relative flex h-[170px] items-center justify-center" style={{ background: `radial-gradient(circle at 30% 30%, ${p.marco}, ${p.fondo} 70%)` }}>
          <span style={fecha ? { color: p.fondo } : undefined}
                className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${fecha ? 'bg-white' : 'bg-gr-acento text-gr-on-acento'}`}>
            {fecha ? 'FECHA ESPECIAL' : 'AMIGO INVISIBLE'}
          </span>
          <IlustracionFecha fecha={fecha?.id ?? null} size={150} firma={false} className="mt-4" />
          <Faltan dias={t.dias} className="absolute right-2.5 top-2.5" />
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3.5">
          <h2 className="text-[17px] leading-snug font-semibold [overflow-wrap:anywhere]">{fecha ? fecha.nombre : juegos[0].nombre}</h2>
          <p className="flex items-center gap-1.5 text-[13px] opacity-85">
            <Icon name="calendar" size={15} className="flex-none" />
            {fecha ? fecha.cuando : fechaLarga(diaDe(juegos[0].fecha), hoy)}
          </p>
          {estado
            ? <p className="self-start rounded-full bg-gr-soft px-2.5 py-0.5 text-xs font-semibold">{estado}</p>
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
          <span aria-hidden className="flex size-11 flex-none items-center justify-center rounded-full text-white" style={{ background: paletaDe(j.fechaEspecial).fondo }}>
            <Icon name="antifaz" size={22} />
          </span>
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
                   className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold ${tengo ? 'bg-gr-brand text-gr-on-brand' : 'bg-gr-soft'}`}>
        <span aria-hidden className={`flex size-4 items-center justify-center rounded border-[1.5px] border-current ${tengo ? 'bg-gr-on-brand text-gr-brand' : ''}`}>
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
  const regla = leerRegla(j.regla)
  const datos = [
    fechaCorta(diaDe(j.fecha)), j.presupuesto && `hasta ${pesos(j.presupuesto)}`,
    regla && (regla.tipo === 'propia' ? 'con regla propia' : regla.regla.nombre),
    j.soyOrganizador ? 'organizás vos' : `organiza ${primerNombre(j.organizador)}`,
  ].filter(Boolean).join(' · ')
  const toca = j.meToca && regla?.tipo === 'catalogo' ? loQueTeToca(regla.regla, j.id, j.meToca) : null
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

      {/* se bajó o se sumó alguien después del sorteo: al que organiza le toca sortear de nuevo; al que quedó sin nadie, esperar */}
      {!pasado && j.miEstado === 'juega' && j.faltaSortearDeNuevo && (
        <Link href={`${href}#${j.soyOrganizador ? 'sortear' : 'te-toco'}`}
              className="self-start rounded-full bg-gr-brand px-3 py-1.5 text-[13px] font-bold text-gr-on-brand">
          {j.soyOrganizador ? 'Hay que sortear de nuevo ›' : 'Falta que se sortee de nuevo'}
        </Link>
      )}
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
        !j.faltaSortearDeNuevo && (
          <p className="self-start rounded-full bg-gr-soft px-3 py-1.5 text-[13px] font-bold">
            {j.soyOrganizador ? 'Falta que sortees' : 'Falta sortear'} · {j.contestaron} de {j.invitados} contestaron
          </p>
        )
      ) : !j.meToca ? (
        <Link href={`${href}#te-toco`} className="self-start rounded-full bg-gr-brand px-3 py-1.5 text-[13px] font-bold text-gr-on-brand">
          Ya se sorteó: mirá a quién le regalás ›
        </Link>
      ) : (
        <>
          <details className="group rounded-gr-md bg-gr-soft">
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
            {toca && <LoQueTeTocaA toca={toca} nombre={primerNombre(j.meToca.nombre)} className="mx-2 mb-2" />}
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

/** "Armar un amigo invisible", aparte o para una fecha (arriba en Regalos, cuando no estás en ninguno). */
export function ArmarJuego({ fecha }: { fecha?: FechaEspecial }) {
  return (
    <Link href={fecha ? `/invisible/nuevo?fecha=${fecha}` : '/invisible/nuevo'}
          className="flex items-center gap-3.5 rounded-gr-lg border-2 border-dashed border-gr-line-strong px-4 py-3.5">
      <span aria-hidden className="flex size-11 flex-none items-center justify-center rounded-full bg-gr-soft"><IconoFecha fecha={fecha ?? null} size={24} acento="currentColor" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug font-semibold">Armar un amigo invisible</span>
        <span className="block text-[13px] leading-snug text-gr-muted">Para la oficina, la familia o los amigos: mandás un link por WhatsApp, se sortea y cada uno ve solo a quién le regala.</span>
      </span>
      <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
    </Link>
  )
}

/**
 * Armar (o editar) un amigo invisible: si es para una fecha especial o aparte, nombre, temática, la regla (si juegan con una,
 * ver ElegirRegla), presupuesto, cuándo se dan los regalos y, al armarlo, a qué amigos invitar ya (al resto, con el link
 * que da el juego una vez armado). editar: el que ya está (sin elegir amigos: a más se los invita desde el juego).
 * propuestas: el día de cada fecha especial, para completarlo al elegirla.
 */
export function FormJuego({ fechaEspecial, propuestas, amigos, hoy, error, inicial, editar }: {
  fechaEspecial: FechaEspecial | null
  propuestas: Partial<Record<FechaEspecial, string>>
  amigos: Persona[]
  hoy: string
  error: boolean
  inicial: { nombre: string; descripcion: string; presupuesto: string; fecha: string; regla: string | null }
  editar?: { id: string }
}) {
  return (
    <form action={editar ? editarAmigoInvisibleAction : crearAmigoInvisibleAction} className="mt-1 flex flex-col gap-4">
      {editar && <input type="hidden" name="id" value={editar.id} />}
      {error && (
        <p role="alert" className="rounded-gr-md bg-gr-soft px-4 py-3 text-sm font-medium">
          No lo pudimos guardar. Fijate que tenga nombre y una fecha que no haya pasado.
        </p>
      )}
      <p className="flex items-start gap-2.5 rounded-gr-md bg-gr-brand px-4 py-3 text-sm font-medium text-gr-on-brand">
        <Icon name="antifaz" size={20} className="flex-none text-gr-acento-sobre-tinta" />
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
      <ElegirRegla inicial={inicial.regla} />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="gr-label">Se dan los regalos</span>
          <input name="fecha" type="date" required min={hoy} defaultValue={inicial.fecha} className="gr-input" />
        </label>
        <label className="gr-campo-presupuesto flex min-w-0 flex-col gap-1.5">
          <span className="gr-label">Presupuesto</span>
          <CampoPrecio name="presupuesto" maxLength={LARGO.precio} inputMode="decimal" placeholder="$ Hasta…" defaultValue={inicial.presupuesto}
                       className="gr-input" />
        </label>
      </div>

      {!editar && (
        <div className="flex flex-col gap-2.5">
          <p className="gr-label">¿Quiénes juegan?</p>
          <p className="flex items-start gap-2.5 rounded-gr-md bg-gr-soft px-4 py-3 text-sm leading-snug font-medium">
            <Icon name="link" size={18} className="mt-0.5 flex-none" />
            Cuando lo armes te damos un link para mandar por WhatsApp: se suma cualquiera con su cuenta, aunque no sea tu amigo en GiftR.
          </p>
          {amigos.length > 0 && (
            <>
              <p className="text-[13px] font-semibold">Si querés, invitá ya a tus amigos de GiftR</p>
              <ElegirAmigos amigos={amigos} ambito="amigos-invisible" />
              <p className="text-xs leading-snug text-gr-muted">
                A cada uno le llega la invitación y dice si juega. Cuando estén (con vos, al menos {MIN_JUGADORES}), sorteás.
              </p>
            </>
          )}
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-[18px] mt-1 bg-gradient-to-t from-gr-bg from-70% to-transparent px-[18px] pb-[max(18px,env(safe-area-inset-bottom))] pt-3">
        <BotonEnviar pendiente={editar ? 'Guardando…' : 'Armando…'} className="gr-btn-primary h-14 w-full text-[17px]">
          {editar ? 'Guardar cambios' : 'Armarlo'}
        </BotonEnviar>
      </div>
    </form>
  )
}

const ESTADOS: Record<VistaJuego['gente'][number]['estado'], string> = { juega: 'Juega ✓', invitado: 'Esperando', no_juega: 'No juega' }

/** Los datos del juego: cuándo, hasta cuánto, quién organiza y la temática. */
export function DatosDelJuego({ v }: { v: VistaJuego }) {
  const regla = leerRegla(v.regla)
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
        <p className="rounded-gr-md bg-gr-soft px-4 py-3 text-[15px] leading-snug whitespace-pre-line [overflow-wrap:anywhere]">
          <span className="gr-label mb-1 block">Temática</span>{v.descripcion}
        </p>
      )}
      {regla && <ReglaDelJuego regla={regla} />}
    </div>
  )
}

/**
 * Para el que no organiza: juego, no juego, o (antes del sorteo) bajarse. Con el sorteo ya hecho, el invitado tardío o
 * el que había dicho que no todavía se puede sumar: entra cuando se sortee de nuevo. El que ya juega se baja con Bajarme.
 */
export function MiRespuesta({ v }: { v: VistaJuego }) {
  if (v.soyOrganizador || (v.sorteado && v.miEstado === 'juega')) return null
  const org = primerNombre(v.organizador.nombre)
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
        <p className="text-[15px] font-semibold">{org} te invitó. ¿Jugás?</p>
        {v.sorteado && <p className="-mt-2 text-[13px] leading-snug text-gr-muted">Ya se sorteó: si jugás, entrás cuando {org} sortee de nuevo.</p>}
        <div className="flex gap-2">{responder(false, 'No juego', false)}{responder(true, 'Juego', true)}</div>
      </div>
    )
  }
  if (v.sorteado && !v.puedoSumarme) return null
  return (
    <div className="flex items-center gap-3 rounded-gr-md bg-gr-soft px-4 py-3">
      <p className="min-w-0 flex-1 text-sm font-medium">
        {v.miEstado === 'juega' ? 'Estás adentro. Cuando se sortee, te llega a quién le regalás.'
          : v.sorteado ? `Ya se sorteó y no estás jugando. Si te sumás, entrás cuando ${org} sortee de nuevo.` : 'Dijiste que no jugás.'}
      </p>
      <div className="w-32 flex-none">{v.miEstado === 'juega' ? responder(false, 'Me bajo', false) : responder(true, 'Me sumo', true)}</div>
    </div>
  )
}

/**
 * Los que están, con cómo están; después del sorteo, si ya vieron a quién les toca (nunca a quién). El que se sumó
 * después del sorteo figura esperando el próximo.
 */
export function GenteDelJuego({ v }: { v: VistaJuego }) {
  const juegan = v.gente.filter((g) => g.estado === 'juega')
  const lista = v.sorteado ? juegan : v.gente
  return (
    <section aria-labelledby="gente-titulo" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="gente-titulo" className="gr-label">{v.sorteado ? `Juegan ${juegan.length}` : `${juegan.length} juegan · ${v.gente.length} invitados`}</h2>
        {v.sorteado && <span className="text-xs font-semibold text-gr-muted">{juegan.filter((g) => g.vio).length} ya vieron a quién les toca</span>}
      </div>
      <ul className="flex flex-col divide-y divide-gr-line rounded-gr-md border border-gr-line bg-gr-surface px-3">
        {lista.map((g) => (
          <li key={g.persona.id} className="flex min-h-12 items-center gap-3 py-1.5">
            <AvatarSticker nombre={g.persona.nombre} foto={g.persona.foto} size={32} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.persona.nombre}</span>
            <span className={`flex-none text-[13px] font-semibold ${g.estado === 'juega' && !v.sorteado ? '' : 'text-gr-muted'}`}>
              {!v.sorteado ? ESTADOS[g.estado] : g.espera ? 'Entra en el próximo sorteo' : g.vio ? 'Ya vio ✓' : 'Todavía no vio'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Para el que organiza, desde el sorteo: quién se bajó y quién se sumó después, y si hay que sortear de nuevo. De una
 * baja que se arregló sola dice eso y nada más: a quién le cambió no lo sabe ni él.
 */
export function CambiosDelJuego({ v }: { v: VistaJuego }) {
  if (!v.soyOrganizador || !v.sorteado) return null
  const bajas = v.bajas.map((p) => primerNombre(p.nombre))
  const esperan = v.gente.filter((g) => g.espera).map((g) => primerNombre(g.persona.nombre))
  if (!bajas.length && !esperan.length && !v.faltaSortearDeNuevo) return null
  const falta = v.faltaSortearDeNuevo
  return (
    <div role="status" className={`flex flex-col gap-1.5 rounded-gr-md px-4 py-3 text-sm leading-snug font-medium ${falta ? 'bg-gr-brand text-gr-on-brand' : 'bg-gr-soft'}`}>
      {bajas.length > 0 && (
        <p>
          <b>{juntarNombres(bajas)}</b> {bajas.length === 1 ? 'se bajó' : 'se bajaron'}
          {!falta ? '. Al que le había tocado ya le toca otra persona (le avisamos) y a los demás no les cambió nada: no hace falta sortear de nuevo.'
            : esperan.length ? '.' : ': hay que sortear de nuevo.'}
        </p>
      )}
      {esperan.length > 0 && (
        <p>
          <b>{juntarNombres(esperan)}</b> {esperan.length === 1 ? 'se sumó' : 'se sumaron'} después del sorteo: sorteá de nuevo para que{' '}
          {esperan.length === 1 ? 'entre' : 'entren'}.
        </p>
      )}
      {falta && !bajas.length && !esperan.length && <p>Hay que sortear de nuevo.</p>}
      {v.puedeSortearDeNuevo && <a href="#sortear" className="self-start font-bold underline underline-offset-4">Volver a sortear ›</a>}
    </div>
  )
}

/** Lo que va por WhatsApp con el link del juego (el link arma la vista previa). */
const textoParaInvitar = (v: VistaJuego, link: string) =>
  `Sumate al amigo invisible «${v.nombre}» 🎁 Se dan los regalos el ${v.cuando.toLowerCase()}. Entrá acá para jugar:\n${link}`

const LINK_DE_TEXTO = 'flex min-h-11 items-center text-sm font-semibold underline underline-offset-4'

/**
 * Para el que organiza, mientras no pasó la fecha: sumar gente. El link del juego para mandar por WhatsApp (entra
 * cualquiera con su cuenta, sin ser su amigo en GiftR), cerrar las altas, cambiar el link, invitar amigos eligiéndolos y
 * sacar a alguien (o dejar volver al que sacó). link: el de ahora, completo.
 */
export function SumarGente({ v, link, paraInvitar }: { v: VistaJuego; link: string | null; paraInvitar: Persona[] }) {
  if (!v.soyOrganizador || v.dias < 0) return null
  const sacables = v.gente.filter((g) => g.persona.id !== v.organizador.id)
  return (
    <section id="invitar" aria-labelledby="invitar-titulo" className="flex scroll-mt-6 flex-col gap-3">
      <h2 id="invitar-titulo" className="gr-label">Sumar gente</h2>
      {link && (
        <div className="gr-card flex flex-col gap-2.5 p-4">
          <div>
            <p className="text-[15px] font-semibold">Invitá con el link</p>
            <p className="text-[13px] leading-snug text-gr-muted">
              Mandalo al chat de la oficina o de la familia: cada uno entra con su cuenta de Google y se suma. No hace falta que
              sean tus amigos en GiftR.
            </p>
          </div>
          {v.altasCerradas ? (
            <p role="status" className="rounded-gr-md bg-gr-soft px-3.5 py-3 text-sm font-medium">
              Cerraste las altas: el link no suma a nadie hasta que las abras.
            </p>
          ) : v.lleno ? (
            <p role="status" className="rounded-gr-md bg-gr-soft px-3.5 py-3 text-sm font-medium">Ya son {MAX_JUGADORES}: no entra nadie más.</p>
          ) : (
            <>
              <a href={`https://wa.me/?text=${encodeURIComponent(textoParaInvitar(v, link))}`} target="_blank"
                 className="gr-btn-primary gr-btn--sm justify-center gap-2">
                <Icon name="users" size={18} />
                Invitar por WhatsApp
              </a>
              <div className="flex items-center gap-2 rounded-full bg-gr-soft py-1.5 pl-4 pr-1.5">
                <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{link.replace(/^https?:\/\//, '')}</p>
                <CopyLinkButton url={link} />
              </div>
              {v.sorteado && <p className="text-xs leading-snug text-gr-muted">Ya se sorteó: el que se sume ahora entra cuando sortees de nuevo.</p>}
            </>
          )}
          <div className="flex flex-col">
            <form action={cerrarAltasAction}>
              <input type="hidden" name="id" value={v.id} />
              <input type="hidden" name="cerrar" value={v.altasCerradas ? '0' : '1'} />
              <BotonEnviar className={LINK_DE_TEXTO}>{v.altasCerradas ? 'Abrir las altas de nuevo' : 'Cerrar las altas: que no se sume nadie más'}</BotonEnviar>
            </form>
            {/* por si el link llegó a un chat al que no tenía que llegar */}
            <Confirmar resumen="Cambiar el link" boton="Sí, cambiarlo" action={cambiarLinkDelJuegoAction} ocultos={{ id: v.id }}>
              El link de ahora deja de servir: quien lo tenga y todavía no se sumó ya no va a poder. Los que ya están siguen.
            </Confirmar>
          </div>
        </div>
      )}

      {paraInvitar.length > 0 && (
        <details className="group flex flex-col">
          <summary className={`${LINK_DE_TEXTO} cursor-pointer list-none gap-2 [&::-webkit-details-marker]:hidden`}>
            <Icon name="users" size={17} />Invitar a tus amigos de GiftR
          </summary>
          <form action={invitarAlJuegoAction} className="mt-2 flex flex-col gap-2.5">
            <input type="hidden" name="id" value={v.id} />
            <ElegirAmigos amigos={paraInvitar} ambito="amigos-invitar-juego" />
            <BotonEnviar pendiente="Mandando…" className="gr-btn gr-btn--sm w-full">Mandarles la invitación</BotonEnviar>
          </form>
        </details>
      )}

      {/* el que entró por error (o con un link que circuló de más): lo saca el que organiza, sin cambiarles el link a los demás */}
      {sacables.length > 0 && (
        <details className="group flex flex-col">
          <summary className={`${LINK_DE_TEXTO} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>¿Alguien se sumó por error?</summary>
          <p className="text-[13px] leading-snug text-gr-muted">Podés sacarlo: deja de ver el juego y no vuelve a entrar con el link.</p>
          {sacables.map((g) => {
            const nombre = primerNombre(g.persona.nombre)
            return (
              <Confirmar key={g.persona.id} resumen={`Sacar a ${g.persona.nombre}`} boton={`Sí, sacar a ${nombre}`}
                         action={sacarDelJuegoAction} ocultos={{ id: v.id, userId: g.persona.id }}>
                {v.sorteado && g.estado === 'juega' && !g.espera
                  ? `${nombre} sale del juego. Al que le había tocado ${nombre} le va a tocar otra persona (le avisamos) y a los demás no les cambia nada; si eso no se puede, vas a tener que sortear de nuevo.`
                  : `${nombre} sale del juego y no vuelve a entrar con el link. Si fue un error, después podés dejar que vuelva.`}
              </Confirmar>
            )
          })}
        </details>
      )}
      {v.sacados.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {v.sacados.map((p) => (
            <li key={p.id} className="flex min-h-11 items-center gap-2 rounded-gr-md bg-gr-soft px-3.5">
              <span className="min-w-0 flex-1 truncate text-sm">Sacaste a <b>{p.nombre}</b></span>
              <form action={dejarVolverAlJuegoAction}>
                <input type="hidden" name="id" value={v.id} />
                <input type="hidden" name="userId" value={p.id} />
                <BotonEnviar className="flex min-h-9 items-center text-[13px] font-semibold underline underline-offset-4">Dejar que vuelva</BotonEnviar>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Para el que organiza: quiénes no se tocan y sortear. Antes del sorteo, o después si alguien se bajó o se sumó: ahí es
 * "Volver a sortear", que antes de hacerlo dice lo que pasa (a todos les puede cambiar a quién le regalan, también al
 * que ya compró). Lo que no salió (pocos, o no hay forma con los que no se tocan) vuelve en ?sorteo=.
 */
export function Organizar({ v, sorteo, excluirError }: { v: VistaJuego; sorteo?: string; excluirError: boolean }) {
  if (!v.soyOrganizador || (v.sorteado && !v.puedeSortearDeNuevo)) return null
  const juegan = v.gente.filter((g) => g.estado === 'juega').map((g) => g.persona)
  const faltan = v.gente.filter((g) => g.estado === 'invitado').length
  return (
    <section aria-labelledby="organizar-titulo" className="flex flex-col gap-4">
      <h2 id="organizar-titulo" className="gr-label">{v.sorteado ? 'Sortear de nuevo' : 'Lo organizás vos'}</h2>

      <div id="no-se-tocan" className="flex scroll-mt-6 flex-col gap-2.5 rounded-gr-lg border-2 border-dashed border-gr-line-strong p-3.5">
        <p className="text-[15px] font-semibold">Que no se toquen</p>
        <p className="-mt-1.5 text-[13px] leading-snug text-gr-muted">
          Parejas, hermanos o los que ya se regalan igual: no les toca regalarse entre ellos.{v.sorteado && ' Vale para el sorteo que viene.'}
        </p>
        {excluirError && <p role="alert" className="text-[13px] font-semibold">Elegí a dos que estén en el juego.</p>}
        {v.excluidos.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {v.excluidos.map(([a, b]) => (
              <li key={`${a.id}-${b.id}`} className="flex min-h-11 items-center gap-2 rounded-gr-md bg-gr-soft px-3">
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
          <p role="alert" className="rounded-gr-md bg-gr-soft px-4 py-3 text-sm font-medium">
            Para sortear tienen que jugar al menos {MIN_JUGADORES} (con vos). Esperá que contesten o sumá a más.
          </p>
        )}
        {sorteo === 'imposible' && (
          <p role="alert" className="rounded-gr-md bg-gr-soft px-4 py-3 text-sm font-medium">
            Con los que no se tocan no hay forma de sortear: sacá alguno de la lista de arriba.
          </p>
        )}
        {juegan.length < MIN_JUGADORES ? (
          <p className="text-[13px] leading-snug text-gr-muted">
            {v.sorteado
              ? `Quedaron ${juegan.length} jugando y hacen falta al menos ${MIN_JUGADORES} (con vos): sumá a alguien más para sortear de nuevo.`
              : `Cuando jueguen al menos ${MIN_JUGADORES} (con vos), vas a poder sortear. Ahora juegan ${juegan.length}.`}
          </p>
        ) : v.sorteado ? (
          // antes de hacerlo, lo que pasa: les cambia a todos, también al que ya compró para quien le había tocado
          <details className="group flex flex-col">
            <summary className={`${v.faltaSortearDeNuevo ? 'gr-btn-primary' : 'gr-btn'} h-14 w-full cursor-pointer list-none text-[17px] [&::-webkit-details-marker]:hidden`}>
              Volver a sortear
            </summary>
            <form action={sortearAction} className="mt-2 flex flex-col gap-2.5 rounded-gr-md border border-gr-line bg-gr-surface p-3.5">
              <input type="hidden" name="id" value={v.id} />
              <p className="text-[13px] leading-snug font-medium">
                {!v.faltaSortearDeNuevo && 'No hace falta: el sorteo de ahora sigue valiendo. Si igual querés mezclar todo: '}
                {faltan > 0 && `${faltan === 1 ? 'Uno no contestó y queda afuera' : `${faltan} no contestaron y quedan afuera`}. `}
                Se sortea todo de nuevo entre los {juegan.length} que juegan ahora: a todos les puede cambiar a quién le regalan, también
                a los que ya lo vieron.
              </p>
              <p className="text-[13px] leading-snug font-medium">
                Ojo con lo que ya se compró: si alguien ya reservó o compró un regalo para quien le había tocado, le puede quedar para
                otra persona. Avisales antes. A cada uno le llega el aviso para que mire de nuevo.
              </p>
              <BotonEnviar pendiente="Sorteando…" className="gr-btn-primary gr-btn--sm w-full">Sí, sortear de nuevo</BotonEnviar>
            </form>
          </details>
        ) : (
          // el botón abre la explicación y el de verdad está adentro (como Confirmar)
          <details className="group flex flex-col">
            <summary className="gr-btn-primary h-14 w-full cursor-pointer list-none text-[17px] [&::-webkit-details-marker]:hidden">
              Sortear entre los {juegan.length} que juegan
            </summary>
            <form action={sortearAction} className="mt-2 flex flex-col gap-2.5 rounded-gr-md border border-gr-line bg-gr-surface p-3.5">
              <input type="hidden" name="id" value={v.id} />
              <p className="text-[13px] leading-snug font-medium">
                {faltan > 0 && `${faltan === 1 ? 'Uno no contestó y queda afuera' : `${faltan} no contestaron y quedan afuera`}. `}
                A cada uno le llega el aviso y ve solo a quién le regala. Si después alguien se baja o se suma, vas a poder sortear
                de nuevo.
              </p>
              <BotonEnviar pendiente="Sorteando…" className="gr-btn-primary gr-btn--sm w-full">Sortear ahora</BotonEnviar>
            </form>
          </details>
        )}
      </div>
    </section>
  )
}

/**
 * Después del sorteo: "Ver a quién le regalo" (y desde ahí, a quién, con su lista y "Ya tengo el regalo"). tambien: los
 * otros juegos donde te tocó la misma persona. Al que se sumó después del sorteo, o se le bajó quien le había tocado,
 * no se le muestra a nadie: espera a que se sortee de nuevo.
 */
export function TeToco({ v, tambien = [] }: { v: VistaJuego; tambien?: string[] }) {
  if (!v.sorteado || v.miEstado !== 'juega') return null
  if (v.esperoSorteo) {
    return (
      <div id="te-toco" role="status" className="flex scroll-mt-6 flex-col items-center gap-2 rounded-gr-xl bg-gr-soft px-5 py-6 text-center">
        <Icon name="clock" size={28} />
        <p className="text-xl font-semibold">Falta sortear de nuevo</p>
        <p className="text-sm leading-snug">
          {v.esperoSorteo === 'nuevo' ? 'Te sumaste con el sorteo ya hecho.' : 'Se bajó la persona que te había tocado, así que por ahora no le regalás a nadie.'}{' '}
          {v.soyOrganizador
            ? 'Sorteá de nuevo (más abajo) y te toca alguien.'
            : `Cuando ${primerNombre(v.organizador.nombre)} sortee de nuevo, te llega el aviso con a quién le regalás.`}
        </p>
      </div>
    )
  }
  if (!v.meToca) {
    return (
      <div id="te-toco" className="flex scroll-mt-6 flex-col items-center gap-3 rounded-gr-xl bg-gr-brand px-5 py-6 text-center text-gr-on-brand">
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
  const regla = leerRegla(v.regla)
  const toca = regla?.tipo === 'catalogo' ? loQueTeToca(regla.regla, v.id, persona) : null
  return (
    <div id="te-toco" className="flex scroll-mt-6 flex-col items-center gap-2 rounded-gr-xl bg-gr-brand px-5 py-6 text-center text-gr-on-brand">
      <span className="flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-gr-acento-sobre-tinta"><Icon name="antifaz" size={18} />TE TOCÓ</span>
      <AvatarSticker nombre={persona.nombre} foto={persona.foto} size={84} className="ring-[3px] ring-gr-acento-sobre-tinta" />
      <p className="text-[28px] leading-tight font-semibold [overflow-wrap:anywhere]">{persona.nombre}</p>
      <p className="text-[13px] opacity-80">
        Solo vos lo sabés.{v.soyOrganizador ? ' Nadie más lo ve.' : ` Ni ${primerNombre(v.organizador.nombre)} (que lo organiza) lo ve.`}
      </p>
      {tambien.length > 0 && (
        <p className="text-[13px] font-semibold text-gr-acento-sobre-tinta">Ojo: también te tocó en {tambien.map((n) => `«${n}»`).join(' y ')}.</p>
      )}
      {toca && <LoQueTeTocaA toca={toca} nombre={primerNombre(persona.nombre)} className="mt-1.5 w-full" />}
      {v.miTurno && <TuTurno turno={v.miTurno.turno} de={v.miTurno.de} className="mt-1.5 w-full" />}
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
                <p className="rounded-gr-md bg-gr-soft px-3 py-2 text-sm leading-snug [overflow-wrap:anywhere]"><b>Vos:</b> {p.respuesta}</p>
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
  if (!v.sorteado || v.miEstado !== 'juega' || v.esperoSorteo === 'nuevo') return null
  if (v.meRegalo) {
    return (
      <div id="me-regalo" className="gr-card flex scroll-mt-6 items-center gap-3 p-4">
        <AvatarSticker nombre={v.meRegalo.nombre} foto={v.meRegalo.foto} size={48} />
        <p className="min-w-0 flex-1 text-[15px] leading-snug">Te regaló <b>{v.meRegalo.nombre}</b></p>
      </div>
    )
  }
  if (!v.puedoRevelar) {
    // pasó la fecha y no hay quién le haya regalado (quedó un hueco sin sortear de nuevo): nada que prometer
    if (v.dias < 0) return null
    return (
      <p id="me-regalo" className="scroll-mt-6 text-center text-[13px] leading-snug text-gr-muted">
        Después del {fechaLarga(new Date(`${v.fecha}T00:00:00Z`)).toLowerCase()}, si querés, vas a poder ver quién te regaló.
      </p>
    )
  }
  return (
    <div id="me-regalo" className="flex scroll-mt-6 flex-col gap-2.5 rounded-gr-lg border-2 border-dashed border-gr-line-strong p-4">
      <p className="text-[15px] font-semibold">¿Quién te regaló?</p>
      <p className="-mt-1 text-[13px] leading-snug text-gr-muted">No se dice si no lo pedís. Nadie se entera de que miraste.</p>
      <form action={revelarQuienMeRegaloAction}>
        <input type="hidden" name="id" value={v.id} />
        <BotonEnviar className="gr-btn gr-btn--sm w-full">Ver quién me regaló</BotonEnviar>
      </form>
    </div>
  )
}

/**
 * Abajo, después del sorteo, para el que juega y no organiza: bajarse. Deja un hueco que se arregla solo si se puede (ver
 * salir en amigo-invisible.ts); si no, el que organiza sortea de nuevo.
 */
export function Bajarme({ v }: { v: VistaJuego }) {
  if (v.soyOrganizador || !v.sorteado || v.miEstado !== 'juega' || v.dias < 0) return null
  const org = primerNombre(v.organizador.nombre)
  return (
    <div className="flex flex-col items-center pt-2">
      <Confirmar resumen="Bajarme de este amigo invisible" boton="Sí, bajarme" action={responderJuegoAction}
                 ocultos={{ id: v.id, juega: '0', desde: 'juego' }} className="items-center">
        {v.esperoSorteo === 'nuevo'
          ? `Dejás de jugar: no entrás cuando ${org} sortee de nuevo.`
          : `Dejás de jugar: no le regalás a nadie y nadie te regala. Al que le habías tocado le va a tocar otra persona, y ${org} se entera de que te bajaste.`}
      </Confirmar>
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
