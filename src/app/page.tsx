import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'
import { db } from '@/db'
import { asegurarListaPropia } from '@/lib/users'
// Fotos de marca: una alta a la izquierda y dos a la derecha.
const FOTOS = [
  { src: '/brand/mate.jpg', alt: 'Mate imperial', className: 'row-span-2' },
  { src: '/brand/zapatillas.jpg', alt: 'Zapatillas blancas', className: '' },
  { src: '/brand/vinilos.jpg', alt: 'Vinilos', className: '' },
]

export default async function Home() {
  const session = await auth()
  // Solo si la sesión tiene lista (si le faltaba, se crea): una sesión de un usuario que ya no existe
  // ve la portada y vuelve a entrar, en vez de rebotar entre / e /inicio.
  if (session?.userId && await asegurarListaPropia(db, session.userId)) redirect('/inicio')
  return (
    <main className="flex min-h-screen flex-col pb-10">
      <div className="grid h-[340px] grid-cols-2 grid-rows-2 gap-2.5 pt-[18px]">
        {FOTOS.map((f) => (
          // eslint-disable-next-line @next/next/no-img-element -- fotos estáticas de marca
          <img key={f.src} src={f.src} alt={f.alt} className={`gr-diecut size-full ${f.className}`} />
        ))}
      </div>

      <div className="flex flex-col items-center gap-3.5 px-2.5 pt-8 text-center">
        <p className="font-display text-[30px] leading-none font-extrabold tracking-[-0.05em]">GiftR</p>
        <h1 className="font-display text-[40px] leading-[0.95] font-extrabold tracking-[-0.045em] [font-variation-settings:'opsz'_96]">
          Pedí lo que querés sin pedirlo.
        </h1>
        <p className="text-base leading-snug font-medium">Tu gente coordina los regalos sin arruinarte la sorpresa.</p>
        <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/inicio' }) }} className="mt-2.5 w-full">
          <button className="gr-btn-primary h-[56px] w-full gap-3">
            <span aria-hidden className="flex size-[30px] items-center justify-center rounded-full bg-gr-surface font-sans text-base font-bold">G</span>
            Entrar con Google
          </button>
        </form>
      </div>
    </main>
  )
}
