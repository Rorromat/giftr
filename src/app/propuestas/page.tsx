import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui'
import { Propuestas } from '@/components/Propuestas'

export const metadata: Metadata = { title: 'Propuestas de diseño · GiftR' }

// Las cuatro propuestas de diseño (ver lib/tema.ts), para probarlas en toda la app. Sin cuenta también: así se puede
// mandar el link a quien tenga que opinar.
export default function PaginaPropuestas() {
  return (
    <main className="flex flex-col gap-5 pb-16 pt-2">
      <PageHeader title="Propuestas de diseño" back="/perfil" backLabel="Volver a tu perfil" />
      <p className="text-[15px] leading-snug text-gr-muted">
        Cuatro maneras de vestir GiftR, con las mismas pantallas y todo lo que hace. Tocá una y recorré la app: queda puesta
        en este navegador hasta que vuelvas a la de siempre. Los dibujos son stickers que se mueven, pintados con la paleta de
        cada una.
      </p>
      <Propuestas />
    </main>
  )
}
