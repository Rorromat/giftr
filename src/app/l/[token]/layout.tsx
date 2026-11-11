import { getViewer } from '@/lib/viewer'
import { BottomNav } from '@/components/BottomNav'

// La lista de alguien abierta desde la app (Tu gente, Inicio, un aviso): con tu cuenta, la barra de abajo sigue estando,
// así se vuelve a Inicio o a tu gente sin salir de la lista a mano. Sin cuenta (el link que llegó por WhatsApp) no hay
// barra: al final de la lista va "¿Y vos qué querés?" para armar la tuya (flota abajo recién cuando ya reservó algo).
export default async function ListaLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer()
  return (
    <>
      {children}
      {viewer.userId && <BottomNav />}
    </>
  )
}
