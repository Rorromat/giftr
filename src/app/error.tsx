'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Starburst } from '@/components/ui'

/**
 * Algo falló al armar la pantalla (un corte de la base, un error nuestro): en vez de la pantalla genérica, un mensaje y
 * la forma de seguir. "Probar de nuevo" vuelve a pedir la pantalla (retry); si sigue, al inicio.
 */
export default function ErrorDePantalla({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <main className="flex min-h-[85dvh] flex-col items-center justify-center gap-4 py-12 text-center">
      <Starburst size={120} fontSize={64} label="Error" className="-rotate-6">!</Starburst>
      <h1 className="gr-title">Algo no salió</h1>
      <p className="text-[15px] font-medium leading-snug">
        No pudimos cargar esta pantalla. Puede ser la conexión: probá de nuevo en un ratito.
      </p>
      <button type="button" onClick={() => retry()} className="gr-btn-primary mt-2 w-full">Probar de nuevo</button>
      <Link href="/" className="gr-btn min-h-[50px] w-full font-sans text-[15px] font-bold">Ir al inicio</Link>
    </main>
  )
}
