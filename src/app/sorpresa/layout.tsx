import { getViewer } from '@/lib/viewer'
import { BottomNav } from '@/components/BottomNav'

// Una sorpresa y armarla: con tu cuenta, la barra de abajo sigue estando (como en la lista de alguien). Sin cuenta no hay
// nada que ver: el link pide entrar (ver sorpresaParaViewer).
export default async function SorpresaLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer()
  return (
    <>
      {children}
      {viewer.userId && <BottomNav />}
    </>
  )
}
