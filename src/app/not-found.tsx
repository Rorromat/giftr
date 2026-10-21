import Link from 'next/link'
import { Starburst } from '@/components/ui'

/**
 * Un link cortado o mal copiado de WhatsApp, una lista que cambió su link, un deseo que ya no está. No dice cuál de esas
 * fue: el mismo cartel para todos (un deseo que el dueño sacó tampoco cuenta por qué).
 */
export default function NoEncontrado() {
  return (
    <main className="flex min-h-[85dvh] flex-col items-center justify-center gap-4 py-12 text-center">
      <Starburst size={120} fontSize={64} label="No está" className="rotate-12">?</Starburst>
      <h1 className="gr-title">Esto no está</h1>
      <p className="text-[15px] font-medium leading-snug">
        Puede que el link esté cortado o que lo hayan cambiado. Pedíselo de nuevo a quien te lo mandó.
      </p>
      <Link href="/" className="gr-btn-primary mt-2 w-full">Ir al inicio</Link>
    </main>
  )
}
