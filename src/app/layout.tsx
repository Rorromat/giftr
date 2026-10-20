import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google'
import './globals.css'

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], axes: ['opsz'], variable: '--font-bricolage' })
const instrument = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument' })

export const metadata: Metadata = {
  // Base de las URLs absolutas de la vista previa al compartir (og:image, og:url).
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'),
  title: 'GiftR',
  description: 'Pedí lo que querés sin pedirlo.',
  openGraph: { siteName: 'GiftR', locale: 'es_AR', type: 'website' },
  // "Agregar a inicio" en iPhone: abre a pantalla completa y con el nombre corto bajo el ícono.
  appleWebApp: { capable: true, title: 'GiftR', statusBarStyle: 'default' },
}

export const viewport: Viewport = { themeColor: '#FFF6E5' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${bricolage.variable} ${instrument.variable}`}>
      <body className="min-h-screen font-sans">
        <div className="mx-auto max-w-md px-[18px]">{children}</div>
      </body>
    </html>
  )
}
