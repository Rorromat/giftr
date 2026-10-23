import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { entrarConGoogleAction } from '@/app/actions'
import { esRutaAgregar, VUELTA_MAX } from '@/lib/recibir-compartido'
import { asegurarListaPropia } from '@/lib/users'
// Fotos de marca: una alta a la izquierda y dos a la derecha.
const FOTOS = [
  { src: '/brand/mate.jpg', alt: 'Mate imperial', className: 'row-span-2' },
  { src: '/brand/zapatillas.jpg', alt: 'Zapatillas blancas', className: '' },
  { src: '/brand/vinilos.jpg', alt: 'Vinilos', className: '' },
]

export default async function Home({ searchParams }: { searchParams: Promise<{ volver?: string | string[] }> }) {
  const [session, { volver: v }] = await Promise.all([auth(), searchParams])
  // Lo compartido desde otra app sin sesión (ver /agregar): después de entrar, vuelve ahí. Solo a una ruta de agregar, y
  // una que entre en la cookie de Auth.js.
  const volver = typeof v === 'string' && v.length <= VUELTA_MAX && esRutaAgregar(v) ? v : null
  // Solo si la sesión tiene lista (si le faltaba, se crea): una sesión de un usuario que ya no existe
  // ve la portada y vuelve a entrar, en vez de rebotar entre / e /inicio.
  if (session?.userId && await asegurarListaPropia(db, session.userId)) redirect(volver ?? '/inicio')
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
        <form action={entrarConGoogleAction} className="mt-2.5 w-full">
          <input type="hidden" name="volver" value={volver ?? '/inicio'} />
          {volver && <p className="mb-3 text-[15px] font-bold">Entrá y seguimos con lo que compartiste.</p>}
          <button className="gr-btn-primary h-[56px] w-full gap-3">
            <span aria-hidden className="flex size-[30px] items-center justify-center rounded-full bg-gr-surface font-sans text-base font-bold">G</span>
            Entrar con Google
          </button>
        </form>
      </div>
    </main>
  )
}
