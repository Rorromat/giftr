import { db } from '@/db'
import { listaParaCompartir } from '@/lib/compartir'
import { imagenGenerica, imagenLista, OG_SIZE } from '@/lib/og'

// Vista previa al compartir una lista: de quién es, cuántos deseos y algunas fotos. Nunca reservas.
export const alt = 'Una lista de deseos en GiftR'
export const size = OG_SIZE
export const contentType = 'image/jpeg'

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const lista = await listaParaCompartir(db, (await params).token)
  return lista ? imagenLista(lista) : imagenGenerica()
}
