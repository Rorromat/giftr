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
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
