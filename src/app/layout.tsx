import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google'
import { ICONO_INICIO } from '@/app/icono-inicio'
import { Arranque } from '@/components/Arranque'
import { Refrescar } from '@/components/Refrescar'
import { RegistrarSW } from '@/components/RegistrarSW'
import { ATRAPAR_PEDIDO_INSTALAR } from '@/lib/app-instalable'
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
  // El ícono de inicio del iPhone va adentro del HTML (data:): el instalador de iOS 27 no carga los que
  // vienen por red y pone la inicial sobre gris. /apple-touch-icon.png sigue en public/ para quien lo pida.
  // Declarar íconos acá pisa los de archivo, así que el de la pestaña (app/icon.png) va también.
  icons: {
    icon: [{ url: '/icon.png', sizes: '96x96', type: 'image/png' }],
    apple: [{ url: ICONO_INICIO, sizes: '180x180', type: 'image/png' }],
  },
  // La etiqueta clásica de Apple: Next solo pone la genérica (mobile-web-app-capable).
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = { themeColor: '#F4F4F0' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${bricolage.variable} ${instrument.variable}`}>
      <head>
        {/* el pedido de instalar de Chrome, si llega antes de que hidrate (texto fijo, no viene del pedido) */}
        <script dangerouslySetInnerHTML={{ __html: ATRAPAR_PEDIDO_INSTALAR }} />
      </head>
      <body className="min-h-screen font-sans">
        <div className="mx-auto max-w-md px-[18px]">{children}</div>
        <Arranque />
        <Refrescar />
        {/* acá y no en el menú: también lo registran la portada, las listas compartidas (/l/…) y la bienvenida */}
        <RegistrarSW />
      </body>
    </html>
  )
}
