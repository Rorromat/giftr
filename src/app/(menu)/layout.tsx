import { BottomNav } from '@/components/BottomNav'

// Las secciones con la barra de abajo. La barra va acá y no en cada página para que siga montada al cambiar
// de sección: así el círculo verde se desliza en vez de saltar.
export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  )
}
