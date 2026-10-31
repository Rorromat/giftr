import { SkeletonFicha } from '@/components/Skeleton'

// Abriendo un deseo desde la lista: la ficha mientras llega, no la lista (el loading de /l/[token])
export default function Loading() {
  return <SkeletonFicha />
}
