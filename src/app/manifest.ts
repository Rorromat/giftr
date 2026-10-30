import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GiftR',
    short_name: 'GiftR',
    description: 'Pedí lo que querés sin pedirlo.',
    start_url: '/',
    display: 'standalone',
    // como una app: en vertical (Android la traba así; el iPhone no hace caso, ahí aparece "Girá el teléfono")
    orientation: 'portrait',
    background_color: '#F6F6F8',
    theme_color: '#F6F6F8',
    // Todos a sangre y sin transparencia (como el apple-touch-icon): si un sistema usa estos en vez del
    // apple-touch-icon, no le quedan esquinas transparentes que después pinta de negro.
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // A sangre: Android recorta su forma (círculo, squircle) sin achicar el logo sobre fondo blanco.
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // GiftR al compartir desde otra app (Android): links, textos y fotos. Lo recibe el service worker (public/sw.js) y, si
    // no está, el route src/app/compartir/route.ts: los dos leen estos nombres de campo.
    share_target: {
      action: '/compartir',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        // Solo tipos MIME (Chrome filtra con eso). Sin HEIC: no se puede achicar en el teléfono ni leer en el servidor
        files: [{ name: 'foto', accept: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] }],
      },
    },
  }
}
