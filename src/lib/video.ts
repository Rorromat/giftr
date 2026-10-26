// El video de un deseo: un link de YouTube, TikTok, Instagram o Vimeo se ve adentro del deseo (su reproductor oficial);
// cualquier otro, como un botón que lo abre afuera. Sin dependencias del servidor: lo usa la pantalla.

export type Embebido = {
  /** el reproductor de esa plataforma */
  src: string
  /** Shorts, TikTok y Reels son verticales */
  vertical: boolean
  /** "YouTube", "TikTok"… */
  sitio: string
}

const ID = /^[A-Za-z0-9_-]{4,64}$/

/** El reproductor para un link de video que conocemos; null si es otro sitio (o no es de un video). */
export function embebido(link: string): Embebido | null {
  let u: URL
  try { u = new URL(link) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.replace(/^(www|m|mobile)\./, '')
  const partes = u.pathname.split('/').filter(Boolean)
  const valido = (id: string | null | undefined): id is string => !!id && ID.test(id)

  if (host === 'youtube.com' || host === 'music.youtube.com') {
    const [tipo, id] = partes
    if (tipo === 'shorts' && valido(id)) return { src: `https://www.youtube-nocookie.com/embed/${id}`, vertical: true, sitio: 'YouTube' }
    if ((tipo === 'embed' || tipo === 'live') && valido(id)) return { src: `https://www.youtube-nocookie.com/embed/${id}`, vertical: false, sitio: 'YouTube' }
    const v = u.searchParams.get('v')
    if (tipo === 'watch' && valido(v)) return { src: `https://www.youtube-nocookie.com/embed/${v}`, vertical: false, sitio: 'YouTube' }
    return null
  }
  if (host === 'youtu.be') {
    return valido(partes[0]) ? { src: `https://www.youtube-nocookie.com/embed/${partes[0]}`, vertical: false, sitio: 'YouTube' } : null
  }
  if (host === 'tiktok.com') {
    // tiktok.com/@usuario/video/123…
    const i = partes.indexOf('video')
    const id = i >= 0 ? partes[i + 1] : null
    return id && /^\d{5,25}$/.test(id) ? { src: `https://www.tiktok.com/embed/v2/${id}`, vertical: true, sitio: 'TikTok' } : null
  }
  if (host === 'instagram.com') {
    const [tipo, id] = partes
    if ((tipo === 'reel' || tipo === 'reels' || tipo === 'p' || tipo === 'tv') && valido(id)) {
      return { src: `https://www.instagram.com/${tipo === 'reels' ? 'reel' : tipo}/${id}/embed`, vertical: tipo !== 'p', sitio: 'Instagram' }
    }
    return null
  }
  if (host === 'vimeo.com') {
    const id = partes.find((p) => /^\d{3,15}$/.test(p))
    return id ? { src: `https://player.vimeo.com/video/${id}`, vertical: false, sitio: 'Vimeo' } : null
  }
  return null
}

/** Para el botón de un link que no se puede ver adentro: "Ver el video en vm.tiktok.com". */
export function sitioDelVideo(link: string): string {
  try { return new URL(link).hostname.replace(/^www\./, '') } catch { return 'el link' }
}
