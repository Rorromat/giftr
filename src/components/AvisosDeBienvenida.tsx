'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ActivarAvisos } from '@/components/ActivarAvisos'
import type { EstadoAvisos } from '@/lib/avisos-del-navegador'

/** La pregunta de los avisos en la bienvenida, y cómo seguir: "Seguir" si ya están activados (o no se puede), si no "Ahora no". */
export function AvisosDeBienvenida({ vapidPublica, siguiente }: { vapidPublica: string; siguiente: string }) {
  const [estado, setEstado] = useState<EstadoAvisos>('cargando')
  // con los avisos activados, o en un navegador donde no se puede, ya no hay nada que decir que no
  const listo = estado === 'activado' || estado === 'no-soportado' || estado === 'ios-instalar' || estado === 'bloqueado'
  return (
    <div className="flex flex-col gap-3">
      <ActivarAvisos vapidPublica={vapidPublica} bienvenida alCambiar={setEstado} />
      <Link href={siguiente} className={listo ? 'gr-btn-primary w-full' : 'gr-btn w-full'}>{listo ? 'Seguir' : 'Ahora no'}</Link>
    </div>
  )
}
