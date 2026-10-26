import { embebido, sitioDelVideo } from '@/lib/video'
import { Icon } from '@/components/ui'

/**
 * El video de un deseo: de YouTube, TikTok, Instagram o Vimeo, su reproductor adentro del deseo (carga recién cuando se
 * acerca a la pantalla); de otro sitio, un botón que lo abre (un link acortado de TikTok, por ejemplo, no dice qué video es).
 */
export function VideoDeseo({ url, titulo }: { url: string; titulo: string }) {
  const e = embebido(url)
  if (!e) {
    return (
      <a href={url} target="_blank" rel="noopener" className="gr-btn gr-btn--sm gap-2 self-start">
        <Icon name="play" size={16} strokeWidth={2} />Ver el video <span className="font-medium text-gr-muted">· {sitioDelVideo(url)}</span>
      </a>
    )
  }
  return (
    <figure className="flex flex-col gap-1.5">
      <div className={`overflow-hidden rounded-2xl bg-gr-brand ${e.vertical ? 'mx-auto aspect-[9/16] w-full max-w-[300px]' : 'aspect-video w-full'}`}>
        <iframe src={e.src} title={`Video de ${titulo}`} loading="lazy" className="size-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin" />
      </div>
      <figcaption className="text-center text-xs text-gr-muted">
        Video de {e.sitio} · <a href={url} target="_blank" rel="noopener" className="font-semibold underline underline-offset-2">abrirlo en {e.sitio}</a>
      </figcaption>
    </figure>
  )
}
