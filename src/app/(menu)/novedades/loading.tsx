import { SkeletonPagina } from '@/components/Skeleton'

// El feed: tarjetas altas, cada una con la foto de un deseo
export default function Loading() {
  return <SkeletonPagina cards={2} alto={480} />
}
