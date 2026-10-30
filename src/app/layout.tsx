import type { Metadata, Viewport } from 'next'
import { Hanken_Grotesk } from 'next/font/google'
import { ICONO_INICIO } from '@/app/icono-inicio'
import { ICONO_INICIO_DEV } from '@/app/icono-inicio-dev'
import { Arranque } from '@/components/Arranque'
import { Refrescar } from '@/components/Refrescar'
import { RegistrarSW } from '@/components/RegistrarSW'
import { ATRAPAR_PEDIDO_INSTALAR, SIN_ZOOM } from '@/lib/app-instalable'
import { DE_PRUEBA, NOMBRE_APP } from '@/lib/entorno'
import './globals.css'

// Tapas: todo en Hanken Grotesk, los títulos en 900 (ver tokens.css)
const hanken = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-hanken' })

export const metadata: Metadata = {
  // Base de las URLs absolutas de la vista previa al compartir (og:image, og:url).
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'),
  title: NOMBRE_APP,
  description: 'Pedí lo que querés sin pedirlo.',
  openGraph: { siteName: 'GiftR', locale: 'es_AR', type: 'website' },
  // "Agregar a inicio" en iPhone: abre a pantalla completa y con el nombre corto bajo el ícono.
  appleWebApp: { capable: true, title: NOMBRE_APP, statusBarStyle: 'default' },
  // El ícono de inicio del iPhone va adentro del HTML (data:): el instalador de iOS 27 no carga los que
  // vienen por red y pone la inicial sobre gris. /apple-touch-icon.png sigue en public/ para quien lo pida.
  // Declarar íconos acá pisa los de archivo, así que el de la pestaña (app/icon.png) va también, y el favicon está en public/
  // (en app/ Next lo pone siempre). En los deploys de prueba, los de public/dev: rojos, con "DEV" (ver lib/entorno.ts).
  icons: DE_PRUEBA
    ? {
      icon: [{ url: '/dev/favicon.ico', sizes: '48x48', type: 'image/x-icon' }, { url: '/dev/icon.png', sizes: '96x96', type: 'image/png' }],
      apple: [{ url: ICONO_INICIO_DEV, sizes: '180x180', type: 'image/png' }],
    }
    : {
      icon: [{ url: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' }, { url: '/icon.png', sizes: '96x96', type: 'image/png' }],
      apple: [{ url: ICONO_INICIO, sizes: '180x180', type: 'image/png' }],
    },
  // La etiqueta clásica de Apple: Next solo pone la genérica (mobile-web-app-capable).
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

// Como una app: sin zoom (ni con dos dedos, ni con doble toque, ni el que hace el iPhone al tocar un campo). Safari en
// iPhone no respeta userScalable para el pellizco: ahí lo frenan touch-action (tokens.css) y SIN_ZOOM. La barra del sistema
// toma el fondo de la app, de día y de noche.
export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F6F6F8' }, { media: '(prefers-color-scheme: dark)', color: '#0C0C0E' }],
  colorScheme: 'light dark', width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={hanken.variable}>
      <head>
        {/* el pedido de instalar de Chrome, si llega antes de que hidrate (texto fijo, no viene del pedido) */}
        <script dangerouslySetInnerHTML={{ __html: ATRAPAR_PEDIDO_INSTALAR }} />
        <script dangerouslySetInnerHTML={{ __html: SIN_ZOOM }} />
      </head>
      <body className="min-h-screen font-sans">
        <div className="mx-auto max-w-md px-[18px]">{children}</div>
        {/* GiftR va en vertical: en un teléfono de costado, que lo vuelva a poner derecho (la app instalada en Android ya
            no gira, ver manifest; el navegador y el iPhone no dejan trabarla) */}
        <div className="gr-girar">
          <svg aria-hidden width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="gr-girar__tel">
            <rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" />
          </svg>
          <p className="text-lg font-semibold">Girá el teléfono</p>
          <p className="text-sm text-gr-muted">GiftR se usa en vertical.</p>
        </div>
        <Arranque />
        <Refrescar />
        {/* acá y no en el menú: también lo registran la portada, las listas compartidas (/l/…) y la bienvenida */}
        <RegistrarSW />
      </body>
    </html>
  )
}
