import { SkeletonTapa } from '@/components/Skeleton'

// La lista compartida: la tapa con el logo al medio (verde: casi todas son de una persona)
export default function Loading() {
  return <SkeletonTapa barra="logo" clase="gap-4 pb-36" />
}
