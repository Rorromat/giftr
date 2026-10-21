import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'
import { db } from '@/db'
import { asegurarListaPropia } from '@/lib/users'
import { Starburst } from '@/components/ui'

// Collage de fotos troqueladas (posiciones relativas al centro para que no se desarme en pantallas anchas).
const COLLAGE = [
  { src: '/brand/mate.jpg', alt: 'Mate imperial', className: 'left-[-20px] top-[70px] h-[200px] w-[170px] -rotate-9' },
  { src: '/brand/zapatillas.jpg', alt: 'Zapatillas blancas', className: 'left-[calc(50%-75px)] top-[40px] size-[150px] rotate-5' },
  { src: '/brand/vinilos.jpg', alt: 'Vinilos', className: 'right-[-24px] top-[110px] h-[190px] w-[160px] rotate-7' },
  { src: '/brand/copas.jpg', alt: 'Copas de vino', className: 'left-[calc(50%-83px)] top-[196px] h-[104px] w-[140px] -rotate-4' },
]

export default async function Home() {
  const session = await auth()
  // Solo si la sesión tiene lista (si le faltaba, se crea): una sesión de un usuario que ya no existe
  // ve la portada y vuelve a entrar, en vez de rebotar entre / y /mi-lista.
  if (session?.userId && await asegurarListaPropia(db, session.userId)) redirect('/mi-lista')
  return (
    <main className="flex min-h-screen flex-col pb-10">
      <div className="relative -mx-[18px] h-[380px] overflow-hidden">
        {COLLAGE.map((f) => (
          // eslint-disable-next-line @next/next/no-img-element -- fotos estáticas de marca
          <img key={f.src} src={f.src} alt={f.alt} className={`gr-diecut absolute rounded-[20px] ${f.className}`} />
        ))}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 -rotate-3 rounded-sticker border-[3px] border-gr-ink bg-gr-surface px-[22px] pb-2.5 pt-1.5 font-display text-[50px] leading-none font-extrabold tracking-[-0.05em] shadow-[6px_6px_0_var(--gr-ink)] [font-variation-settings:'opsz'_96]">
          GiftR
        </div>
        <Starburst size={58} fontSize={46} className="absolute bottom-[50px] left-[calc(50%+57px)] rotate-14">!</Starburst>
      </div>

      <div className="flex flex-col items-center gap-3.5 px-2.5 pt-[30px] text-center">
        <h1 className="font-display text-[44px] leading-[0.95] font-extrabold tracking-[-0.05em] [font-variation-settings:'opsz'_96]">
          Pedí lo que querés sin pedirlo.
        </h1>
        <p className="text-base leading-snug font-medium">Tu gente coordina los regalos sin arruinarte la sorpresa.</p>
        <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/mi-lista' }) }} className="mt-2.5 w-full">
          <button className="gr-btn-primary h-[58px] w-full gap-3 rounded-[18px] border-[3px]">
            <span aria-hidden className="flex size-[30px] items-center justify-center rounded-full border-2 border-gr-ink bg-gr-surface font-sans text-base font-bold">G</span>
            Entrar con Google
          </button>
        </form>
      </div>
    </main>
  )
}
