import type { Metadata } from 'next'

// Un amigo invisible: el nombre del juego no va en el título (el link puede terminar en cualquier chat).
export const metadata: Metadata = { title: 'Amigo invisible', robots: { index: false } }

export default function InvisibleLayout({ children }: { children: React.ReactNode }) {
  return children
}
