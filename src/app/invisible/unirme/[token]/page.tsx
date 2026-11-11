import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { entrarConGoogleAction, unirseAlJuegoAction } from '@/app/actions'
import { juegoPorInvitacion, MAX_JUGADORES } from '@/lib/amigo-invisible'
import { paletaDe } from '@/lib/colores-fechas'
import { pesos } from '@/lib/pesos'
import { leerRegla } from '@/lib/reglas-invisible'
import { BotonEnviar } from '@/components/BotonEnviar'
import { IlustracionFecha } from '@/components/IlustracionFecha'
import { ReglaDelJuego } from '@/components/ReglasInvisible'
import { AvatarSticker, Icon, LogoSticker } from '@/components/ui'

// El link de un amigo invisible, el que el que organiza manda por WhatsApp al chat de la oficina o de la familia. Lo abre
// cualquiera, con o sin cuenta: dice quién organiza, cómo se llama, cuándo se dan los regalos, hasta cuánto y con qué regla.
// Para sumarse hace falta cuenta (cada uno tiene que poder ver, en privado, a quién le tocó): sin sesión, "Entrar con
// Google" y vuelve acá a confirmar. Sumarse pide un toque (POST): WhatsApp abre los links solo para armar la vista previa,
// y eso no tiene que sumar a nadie. No hace falta ser amigo del que organiza, ni se queda amigo de nadie.

const primerNombre = (n: string) => n.split(' ')[0]
const enDias = (dias: number) => (dias === 0 ? 'es hoy' : dias === 1 ? 'mañana' : `en ${dias} días`)

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const inv = await juegoPorInvitacion(db, (await params).token)
  if (!inv) return { title: 'Amigo invisible', robots: { index: false } }
  return {
    title: `${primerNombre(inv.organizador.nombre)} te invita a un amigo invisible`,
    description: `«${inv.nombre}» · ${inv.cuando}. Sumate: se sortea y cada uno ve solo a quién le regala.`,
    robots: { index: false },
  }
}

export default async function UnirmeAlJuego({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, session] = await Promise.all([params, auth()])
  const inv = await juegoPorInvitacion(db, token, session?.userId)
  // el que ya está (jugando, invitado o habiendo dicho que no) va al juego: ahí contesta o mira lo suyo
  if (inv?.yo === 'adentro') redirect(`/invisible/${inv.id}`)

  if (!inv) {
    return (
      <main className="flex min-h-[85dvh] flex-col gap-5 pb-12 pt-2">
        <header className="flex min-h-14 items-center justify-center"><LogoSticker /></header>
        <div className="gr-empty flex flex-col items-center gap-2 py-8 text-center">
          <Icon name="link" size={26} />
          <h1 className="text-lg font-semibold">Este link ya no sirve</h1>
          <p className="text-gr-muted">Puede que quien organiza el amigo invisible lo haya cambiado. Pedile el link nuevo.</p>
        </div>
        <Link href="/" className="gr-btn w-full">Ir a GiftR</Link>
      </main>
    )
  }

  const org = primerNombre(inv.organizador.nombre)
  const paleta = paletaDe(inv.fechaEspecial)
  const regla = leerRegla(inv.regla)
  const noEntra = inv.yo === 'sacado' ? `${org} te sacó de este amigo invisible. Si fue un error, pedile que te deje volver.`
    : inv.estado === 'pasado' ? 'Este amigo invisible ya pasó.'
      : inv.estado === 'cerrado' ? `${org} cerró las altas: ya no se suma gente. Si querés jugar, pedile que las abra.`
        : inv.estado === 'lleno' ? `Ya son ${MAX_JUGADORES} y no entra nadie más.`
          : null

  return (
    <main className="flex min-h-[85dvh] flex-col gap-5 pb-12 pt-2">
      <header className="flex min-h-14 items-center justify-center"><LogoSticker /></header>
      <section className="flex flex-col items-center gap-2 rounded-gr-xl px-5 pb-6 pt-5 text-center text-white"
               style={{ background: `radial-gradient(circle at 30% 20%, ${paleta.marco}, ${paleta.fondo} 70%)` }}>
        <IlustracionFecha fecha={inv.fechaEspecial} size={132} firma={false} />
        <p className="flex items-center gap-2 text-[15px] font-medium">
          <AvatarSticker nombre={inv.organizador.nombre} foto={inv.organizador.foto} size={28} />
          {org} te invita a un amigo invisible
        </p>
        <h1 className="text-[30px] leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">{inv.nombre}</h1>
        <p className="text-[15px] leading-snug opacity-90">
          Se dan los regalos el {inv.cuando.toLowerCase()}{inv.dias >= 0 && ` (${enDias(inv.dias)})`}
          {inv.presupuesto ? ` · hasta ${pesos(inv.presupuesto)}` : ''}
        </p>
        <p className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold">
          {inv.juegan === 1 ? 'Ya juega 1' : `Ya juegan ${inv.juegan}`}
        </p>
      </section>

      {inv.descripcion && (
        <p className="rounded-gr-md bg-gr-soft px-4 py-3 text-[15px] leading-snug whitespace-pre-line [overflow-wrap:anywhere]">
          <span className="gr-label mb-1 block">Temática</span>{inv.descripcion}
        </p>
      )}
      {regla && <ReglaDelJuego regla={regla} />}

      <p className="flex items-start gap-2.5 rounded-gr-md bg-gr-soft px-4 py-3 text-sm leading-snug font-medium">
        <Icon name="antifaz" size={20} className="mt-px flex-none" />
        Se sortea entre los que juegan y cada uno ve solo a quién le regala. Nadie más lo sabe, tampoco {org}: por eso cada uno
        entra con su cuenta.
      </p>

      {noEntra ? (
        <p role="status" className="gr-card px-4 py-3.5 text-[15px] leading-snug font-semibold">{noEntra}</p>
      ) : session?.userId ? (
        <form action={unirseAlJuegoAction} className="flex flex-col gap-2.5">
          <input type="hidden" name="token" value={token} />
          <BotonEnviar pendiente="Sumándote…" className="gr-btn-primary h-14 w-full text-[17px]">Sumarme al amigo invisible</BotonEnviar>
          {inv.sorteado && (
            <p className="text-center text-[13px] leading-snug text-gr-muted">Ya se sorteó: entrás cuando {org} sortee de nuevo, y ahí te llega a quién le regalás.</p>
          )}
        </form>
      ) : (
        <form action={entrarConGoogleAction} className="flex flex-col gap-2.5">
          <input type="hidden" name="volver" value={`/invisible/unirme/${token}`} />
          <button className="gr-btn-primary h-14 w-full gap-3 text-[17px]">
            <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-gr-surface text-sm font-semibold text-gr-ink">G</span>
            Entrar con Google para sumarme
          </button>
          <p className="text-center text-[13px] leading-snug text-gr-muted">
            Al volver confirmás con un toque. Si todavía no usás GiftR, se crea tu cuenta y tu lista.
          </p>
        </form>
      )}
    </main>
  )
}
