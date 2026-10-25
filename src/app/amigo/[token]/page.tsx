import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { aceptarLinkDeAmigoAction, entrarConGoogleAction } from '@/app/actions'
import { duenoDeAmigoToken, relacionCon } from '@/lib/amigos'
import { getViewer } from '@/lib/viewer'
import { BotonEnviar } from '@/components/BotonEnviar'
import { AvatarSticker, Icon, LogoSticker } from '@/components/ui'

// El link de amigo que alguien mandó (por WhatsApp): quien lo abre entra con Google (si hace falta) y toca "Aceptar":
// quedan amigos sin solicitud. Se puede abrir en el navegador aunque use la app instalada: queda guardado en la cuenta y
// en la app aparece al actualizar.

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const de = await duenoDeAmigoToken(db, (await params).token)
  if (!de) return {}
  const titulo = `${de.nombre.split(' ')[0]} te invita a ser amigos en GiftR`
  return { title: titulo, description: 'Se ven las listas de deseos y los cumples, así saben qué regalarse.', robots: { index: false } }
}

export default async function LinkDeAmigo({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [de, viewer] = await Promise.all([duenoDeAmigoToken(db, token), getViewer()])
  if (!de) notFound()
  const primer = de.nombre.split(' ')[0]
  const relacion = viewer.userId ? await relacionCon(db, viewer.userId, de.id) : null

  return (
    <main className="flex min-h-[85dvh] flex-col gap-5 pb-12 pt-2">
      <header className="flex min-h-14 items-center justify-center"><LogoSticker /></header>
      <section className="gr-hero flex flex-col items-center gap-3 px-5 pb-6 pt-7 text-center">
        <AvatarSticker nombre={de.nombre} foto={de.foto} size={88} className="ring-4 ring-gr-on-hero/15" />
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">
          {relacion === 'yo' ? 'Tu link de amigo' : `${primer} te invita a ser amigos`}
        </h1>
        <p className="text-[15px] leading-snug text-gr-on-hero/75">
          {relacion === 'yo'
            ? 'Mandáselo a tu gente: lo abren, aceptan y ya se ven las listas.'
            : 'En GiftR: se ven las listas de deseos y los cumples, así saben qué regalarse.'}
        </p>
      </section>

      {relacion === 'yo' ? (
        <Link href="/gente" className="gr-btn-primary w-full">Ir a tu gente</Link>
      ) : relacion === 'amigos' ? (
        <div className="flex flex-col gap-3">
          <p className="gr-card flex items-center gap-2.5 px-4 py-3.5 text-sm font-semibold"><Icon name="check" size={18} strokeWidth={2.6} />Ya son amigos con {primer}.</p>
          <Link href="/gente" className="gr-btn-primary w-full">Ver tu gente</Link>
        </div>
      ) : viewer.userId ? (
        <form action={aceptarLinkDeAmigoAction}>
          <input type="hidden" name="token" value={token} />
          <BotonEnviar className="gr-btn-primary h-14 w-full text-[17px]">Aceptar</BotonEnviar>
        </form>
      ) : (
        <form action={entrarConGoogleAction} className="flex flex-col gap-2.5">
          <input type="hidden" name="volver" value={`/amigo/${token}`} />
          <button className="gr-btn-primary h-14 w-full gap-3 text-[17px]">
            <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-gr-surface text-sm font-semibold text-gr-ink">G</span>
            Entrar con Google para aceptar
          </button>
          <p className="text-center text-[13px] text-gr-muted">Si todavía no usás GiftR, se crea tu cuenta y tu lista.</p>
        </form>
      )}
    </main>
  )
}
