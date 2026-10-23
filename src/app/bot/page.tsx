import type { Metadata } from 'next'
import Link from 'next/link'
import { UA_GIFTR } from '@/lib/giftrbot'

export const metadata: Metadata = {
  title: 'El lector de links de GiftR',
  description: 'Qué es el lector de links de GiftR, el que lee la página de un producto cuando alguien pega su link en GiftR.',
}

/**
 * Qué es el lector de links de GiftR: la URL que va en su User-Agent, para quien lo vea en los logs de su sitio. Estática. En castellano y
 * con un resumen en inglés, que es lo que lee quien administra un sitio de afuera.
 */
export default function Bot() {
  return (
    <main className="flex flex-col gap-4 py-12">
      <h1 className="gr-title">El lector de links de GiftR</h1>
      <p className="text-[15px] font-medium leading-snug">
        Es el que usa GiftR para leer la página de un producto cuando alguien pega su link en un deseo: así se completan
        solos el nombre, la foto y el precio.
      </p>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-snug">
        <li>Pide esa página una sola vez, cuando la persona pega el link. No sigue otros links ni recorre el sitio.</li>
        <li>De la página usa solo el nombre, la foto y el precio del producto.</li>
        <li>Si la página no carga o no lo deja pasar, la persona completa el deseo a mano.</li>
      </ul>
      <p className="text-[15px] leading-snug">
        Se presenta siempre así: <code className="break-all text-[13px]">{UA_GIFTR}</code>
      </p>
      <p lang="en" className="gr-muted text-[13px] leading-snug">
        GiftR fetches a product page once, when a GiftR user pastes its link into a wish, to fill in the product&apos;s
        name, photo and price. It doesn&apos;t follow links or crawl.
      </p>
      <Link href="/" className="gr-btn-primary mt-2 w-full">Ir a GiftR</Link>
    </main>
  )
}
