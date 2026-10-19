import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GiftR',
    short_name: 'GiftR',
    description: 'Pedí lo que querés sin pedirlo.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFF6E5',
    theme_color: '#FFF6E5',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // A sangre: Android recorta su forma (círculo, squircle) sin achicar el logo sobre fondo blanco.
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
