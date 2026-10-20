import { db } from '@/db'
import { itemParaCompartir } from '@/lib/compartir'
import { esUuid } from '@/lib/groups'
import { imagenGenerica, imagenItem, OG_SIZE } from '@/lib/og'

// Vista previa al compartir un deseo (WhatsApp y demás): foto, qué es, de quién y cuánto sale. Nunca reservas.
export const alt = 'Un deseo en GiftR'
export const size = OG_SIZE
export const contentType = 'image/jpeg'

export default async function Image({ params }: { params: Promise<{ token: string; itemId: string }> }) {
  const { token, itemId } = await params
  const item = esUuid(itemId) ? await itemParaCompartir(db, token, itemId) : null
  return item ? imagenItem(item) : imagenGenerica()
}
