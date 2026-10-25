import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { BottomNav } from '@/components/BottomNav'
import { AnotarCuenta } from '@/components/AnotarCuenta'
import { PreguntaAvisos } from '@/components/AvisosDeBienvenida'
import { cuentaAnotada } from '@/lib/cookie-invitado'
import { clavesVapid, preguntarAvisos } from '@/lib/codazos'
import { db } from '@/db'

/** Con sesión, si la cuenta todavía no quedó anotada en este navegador (una sesión de antes de que se anotaran), la anota. */
async function SiFaltaAnotarCuenta() {
  const session = await auth()
  if (!session?.userId || cuentaAnotada(await cookies(), session.userId)) return null
  return <AnotarCuenta />
}

/** A los que ya estaban antes de que la bienvenida preguntara por los avisos: el cartel, una sola vez. */
async function SiFaltaPreguntarAvisos() {
  const session = await auth()
  if (!session?.userId || !(await preguntarAvisos(db, session.userId))) return null
  return <PreguntaAvisos vapidPublica={(await clavesVapid(db)).publica} />
}

// Las secciones con la barra de abajo. La barra va acá y no en cada página para que siga montada al cambiar
// de sección: así el círculo verde se desliza en vez de saltar.
export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
      {/* aparte, así no hace esperar a la pantalla */}
      <Suspense fallback={null}>
        <SiFaltaAnotarCuenta />
      </Suspense>
      <Suspense fallback={null}>
        <SiFaltaPreguntarAvisos />
      </Suspense>
    </>
  )
}
