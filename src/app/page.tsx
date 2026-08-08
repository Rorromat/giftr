import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'

export default async function Home() {
  const session = await auth()
  if (session?.userId) redirect('/mi-lista')
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-4xl font-bold">🎁 Wishy</h1>
      <p className="text-stone-600">Pedí lo que querés sin pedirlo.<br />Tu gente coordina los regalos sin arruinarte la sorpresa.</p>
      <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/mi-lista' }) }}>
        <button className="rounded-2xl bg-[#E2725B] px-6 py-3 font-semibold text-white shadow-md">
          Entrar con Google
        </button>
      </form>
    </main>
  )
}
