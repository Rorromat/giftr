import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { entrarConGoogleAction } from '@/app/actions'
import { esRutaAgregar, VUELTA_MAX } from '@/lib/recibir-compartido'
import { asegurarListaPropia } from '@/lib/users'
import { LogoSticker } from '@/components/ui'
import { Portada } from '@/components/Portada'

export default async function Home({ searchParams }: { searchParams: Promise<{ volver?: string | string[]; cuenta?: string | string[] }> }) {
  const [session, { volver: v, cuenta }] = await Promise.all([auth(), searchParams])
  // Lo compartido desde otra app sin sesión (ver /agregar): después de entrar, vuelve ahí. Solo a una ruta de agregar, y
  // una que entre en la cookie de Auth.js.
  const volver = typeof v === 'string' && v.length <= VUELTA_MAX && esRutaAgregar(v) ? v : null
  // Solo si la sesión tiene lista (si le faltaba, se crea): una sesión de un usuario que ya no existe
  // ve la portada y vuelve a entrar, en vez de rebotar entre / e /inicio.
  if (session?.userId && await asegurarListaPropia(db, session.userId)) redirect(volver ?? '/inicio')
  return (
    <main className="flex min-h-screen flex-col gap-6 pb-10 pt-2">
      <header className="flex min-h-14 items-center justify-center"><LogoSticker /></header>

      {/* recién borró su cuenta (ver borrarCuentaAction): que sepa que ya está */}
      {cuenta === 'borrada' && !session?.userId && (
        <p role="status" className="rounded-2xl bg-gr-soft px-3.5 py-3 text-center text-sm font-medium">
          Listo: borramos tu cuenta y todo lo tuyo. Si algún día querés volver, entrás de nuevo y empezás de cero.
        </p>
      )}

      <Portada />

      <div className="flex flex-col items-center gap-3 px-2.5 text-center">
        <h1 className="font-brand text-[40px] leading-[0.98] font-extrabold tracking-[-0.045em] [font-variation-settings:'opsz'_96]">
          Pedí lo que querés sin pedirlo.
        </h1>
        <p className="text-base leading-snug text-gr-muted">Tu lista, la de tu gente y el amigo invisible. Sin arruinar ninguna sorpresa.</p>
        <form action={entrarConGoogleAction} className="mt-3 w-full">
          <input type="hidden" name="volver" value={volver ?? '/inicio'} />
          {volver && <p className="mb-3 text-[15px] font-semibold">Entrá y seguimos con lo que compartiste.</p>}
          <button className="gr-btn-primary h-14 w-full gap-3 text-[17px]">
            <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-gr-surface text-sm font-semibold text-gr-ink">G</span>
            Entrar con Google
          </button>
        </form>
      </div>

      {/* al pie, sin competir con "Entrar": qué se guarda y quién lo ve, antes de dar el mail */}
      <footer className="flex justify-center">
        <Link href="/privacidad" className="flex min-h-11 items-center px-3 text-[13px] font-semibold text-gr-muted underline underline-offset-4">Privacidad</Link>
      </footer>
    </main>
  )
}
