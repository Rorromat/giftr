import { SkeletonTapa } from '@/components/Skeleton'
import { TAPA_EN_COMUN } from '@/lib/tapas'

// Una lista en común: su tapa uva, con volver y agregar arriba
export default function Loading() {
  return <SkeletonTapa color={TAPA_EN_COMUN} barra="volver" />
}
