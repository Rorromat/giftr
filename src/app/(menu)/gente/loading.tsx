import { SkeletonInicio } from '@/components/Skeleton'

// Tu gente: la barra del menú y el título como en Inicio (sin el botón del calendario), y abajo filas
export default function Loading() {
  return <SkeletonInicio botones={2} filas={4} />
}
