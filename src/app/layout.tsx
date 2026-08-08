import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Wishy',
  description: 'Pedí lo que querés sin pedirlo.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        <div className="mx-auto max-w-md px-4 pb-24">{children}</div>
      </body>
    </html>
  )
}
