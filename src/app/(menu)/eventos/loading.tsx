import { SkeletonPagina } from '@/components/Skeleton'

// Todo el año: la tarjeta con los doce meses
export default function Loading() {
  return <SkeletonPagina cards={1} alto={420} />
}
