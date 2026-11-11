import type { Metadata, Viewport } from 'next'
import { Hanken_Grotesk } from 'next/font/google'
import { ICONO_INICIO } from '@/app/icono-inicio'
import { ICONO_INICIO_DEV } from '@/app/icono-inicio-dev'
import { Arranque } from '@/components/Arranque'
import { Refrescar } from '@/components/Refrescar'
import { RegistrarSW } from '@/components/RegistrarSW'
import { ATRAPAR_PEDIDO_INSTALAR } from '@/lib/app-instalable'
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
  // (en app/ Next lo pone siempre). En los deploys de prueba, los de public/dev: sobre blanco, con "DEV" (ver lib/entorno.ts).
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

// El zoom queda libre, con dos dedos y con doble toque: hay quien lo necesita para leer (antes estaba trabado acá, con
// touch-action y con un script). El que hace solo el iPhone al tocar un campo se evita con la letra de los campos, de 16 px
// o más (ver tokens.css). viewportFit cover: la app llega a los bordes de la pantalla y env(safe-area-inset-*) deja de
// valer 0 en iPhone, así lo fijo de abajo (la barra, los botones) queda arriba de la barra de gestos. La barra del
// sistema toma el fondo de la app, de día y de noche.
export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F6F6F8' }, { media: '(prefers-color-scheme: dark)', color: '#0C0C0E' }],
  colorScheme: 'light dark', width: 'device-width', initialScale: 1, viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={hanken.variable}>
      <head>
        {/* el pedido de instalar de Chrome, si llega antes de que hidrate (texto fijo, no viene del pedido) */}
        <script dangerouslySetInnerHTML={{ __html: ATRAPAR_PEDIDO_INSTALAR }} />
      </head>
      <body className="min-h-screen font-sans">
        {/* una columna angosta: con el teléfono de costado se usa igual (antes un cartel la tapaba y pedía girarlo) */}
        <div className="mx-auto max-w-md px-[18px]">{children}</div>
        <Arranque />
        <Refrescar />
        {/* acá y no en el menú: también lo registran la portada, las listas compartidas (/l/…) y la bienvenida */}
        <RegistrarSW />
      </body>
    </html>
  )
}
