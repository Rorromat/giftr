'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Icon } from '@/components/ui'
import { achicarFoto } from '@/lib/achicar-foto'
import { alPegarImagen, estadoDelLink } from '@/lib/foto-del-form'
import { linkHttp } from '@/lib/links'

const ES_LINK = /^https?:\/\/\S+$/i

const AVISOS = {
  subiendo: 'Subiendo la foto…',
  probando: 'Cargando la foto…',
  error: 'No pudimos subir esa foto. Probá con otra.',
  muchas: 'Ya subiste muchas fotos hoy. Probá mañana, o pegá el link de una foto.',
  'sin-foto': 'No hay una foto copiada. Mantené apretada una foto, tocá Copiar y volvé a tocar Pegar.',
  'no-es-foto': 'Ese link no es una foto (si es de una tienda, pegalo en Link a la tienda).',
  'no-carga': 'Esa foto ya no carga. Cambiala, o borrá el link.',
  'muy-largo': 'Ese link es muy largo. Copiá la foto y tocá Pegar.',
} as const

/** Si el link carga como imagen en este navegador (la página de un producto, no). */
function cargaComoFoto(src: string): Promise<boolean> {
  return new Promise((listo) => {
    const img = new Image()
    img.onload = () => listo(img.naturalWidth > 0)
    img.onerror = () => listo(false)
    img.src = src
  })
}

/**
 * La foto del deseo, que es lo que más ayuda a que acierten: de la galería o la cámara, pegada (con el botón
 * o pegando una imagen en cualquier campo del formulario) o con el link de una foto. Lo elegido viaja en el
 * campo oculto fotoUrl: la URL de la foto subida (/foto/deseo/:id) o el link, solo si cargó como foto (un link de
 * tienda en el campo de foto quedaba como foto rota para todos).
 */
export function FotoField({ inicial = null }: { inicial?: string | null }) {
  const elegir = useRef<HTMLInputElement>(null)
  const link = useRef<HTMLInputElement>(null)
  const guardado = inicial && ES_LINK.test(inicial) ? inicial : null
  const [subida, setSubida] = useState(inicial && !guardado ? inicial : null)
  const [url, setUrl] = useState(guardado ?? '')
  // los links que ya se probaron: si cargan como foto o no
  const [probados, setProbados] = useState<Record<string, boolean>>({})
  const [aviso, setAviso] = useState<keyof typeof AVISOS | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  // la vista previa que no cargó (la foto guardada de una tienda que la sacó)
  const [rota, setRota] = useState<string | null>(null)
  // Una subida a la vez (un pegado y un toque en Foto seguidos no corren juntos), y lo último que se hizo gana: si
  // mientras sube se escribe un link o se quita la foto, lo que llega tarde no lo pisa.
  const enCurso = useRef(false)
  const ultima = useRef(0)
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined)

  const delLink = estadoDelLink(url, guardado, probados)
  const foto = subida ?? (delLink.estado === 'ok' ? delLink.link : null)

  function anotar(l: string, ok: boolean) {
    setProbados((p) => ({ ...p, [l]: ok }))
  }

  async function subir(imagen: Blob) {
    if (enCurso.current) return
    enCurso.current = true
    const n = ++ultima.current
    setSubiendo(true)
    setAviso(null)
    try {
      const r = await fetch('/api/deseo/foto', { method: 'POST', body: await achicarFoto(imagen, 1400), headers: { 'content-type': 'image/jpeg' } })
        .catch(() => null)
      if (n !== ultima.current) return
      if (!r?.ok) return setAviso(r?.status === 429 ? 'muchas' : 'error')
      const { url: nueva } = await r.json()
      if (n !== ultima.current) return
      setSubida(nueva)
      setUrl('')
    } finally {
      enCurso.current = false
      setSubiendo(false)
    }
  }

  /** El botón Pegar: una imagen copiada se sube; un link copiado va al campo de link, solo si es una foto. */
  async function pegar() {
    setAviso(null)
    try {
      for (const copiado of await navigator.clipboard.read()) {
        const tipo = copiado.types.find((t) => t.startsWith('image/'))
        if (tipo) return await subir(await copiado.getType(tipo))
        if (copiado.types.includes('text/plain')) {
          const l = linkHttp(await (await copiado.getType('text/plain')).text())
          if (l) {
            // se prueba antes de ponerlo: el link de un producto (lo más común de copiar) no es una foto
            setAviso('probando')
            const ok = probados[l] ?? await cargaComoFoto(l)
            anotar(l, ok)
            if (!ok) return setAviso('no-es-foto')
            ultima.current++
            setSubida(null)
            setUrl(l)
            return setAviso(null)
          }
        }
      }
    } catch {
      // sin permiso o sin soporte: el mismo aviso
    }
    setAviso('sin-foto')
  }

  function escribir(v: string) {
    ultima.current++
    setUrl(v)
    setSubida(null)
    setAviso(null)
    // se prueba cuando deja de escribir, no con cada letra
    clearTimeout(espera.current)
    const { link: l, estado } = estadoDelLink(v, guardado, probados)
    if (l && estado === 'probando') espera.current = setTimeout(() => cargaComoFoto(l).then((ok) => anotar(l, ok)), 400)
  }

  function quitar() {
    ultima.current++
    setSubida(null)
    setUrl('')
    setAviso(null)
  }

  // Pegar una imagen en cualquier campo (por ejemplo en "¿Qué querés?") también la sube; si trae texto, el texto va al
  // campo (ver alPegarImagen).
  const alPegar = useEffectEvent((e: ClipboardEvent) => {
    const imagen = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (!imagen) return
    const destino = e.target
    const enCampoDeTexto = destino instanceof HTMLTextAreaElement || destino instanceof HTMLInputElement
      || (destino instanceof HTMLElement && destino.isContentEditable)
    const que = alPegarImagen({ texto: e.clipboardData?.getData('text/plain') ?? '', enCampoDeTexto, hayFoto: !!foto, subiendo: enCurso.current })
    if (!que.dejarTexto) e.preventDefault()
    if (que.subir) subir(imagen)
  })
  useEffect(() => {
    const escuchar = (e: ClipboardEvent) => alPegar(e)
    document.addEventListener('paste', escuchar)
    return () => document.removeEventListener('paste', escuchar)
  }, [])

  // El formulario no se manda mientras sube o prueba (el deseo se guardaría sin la foto), ni con un link que no es una
  // foto: se manda sin foto y el que escribió el link no se entera.
  const bloqueo = subiendo ? 'Esperá que termine de subir la foto.'
    : subida ? ''
      : delLink.estado === 'probando' ? 'Esperá que cargue la foto.'
        : delLink.estado === 'no-es-foto' || delLink.estado === 'muy-largo' ? AVISOS[delLink.estado] : ''
  useEffect(() => {
    link.current?.setCustomValidity(bloqueo)
  }, [bloqueo])

  const mensaje = subiendo ? 'subiendo'
    : aviso ?? (subida ? null : delLink.estado === 'ok' ? (rota === foto ? 'no-carga' : null) : delLink.estado)
  const boton = 'flex size-[72px] flex-none cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[14px] border-[2.5px] border-dashed border-gr-ink text-xs font-bold'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        {foto && rota !== foto && (
          <div className="relative flex-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- fotos subidas o de tiendas externas */}
            <img src={foto} alt="Vista previa de la foto" onError={() => setRota(foto)}
                 // si falló antes de que cargue la página, onError no llega
                 ref={(img) => { if (img?.complete && !img.naturalWidth) setRota(foto) }}
                 className="size-[72px] -rotate-4 rounded-[14px] border-[2.5px] border-gr-ink object-cover" />
            <button type="button" aria-label="Quitar foto" onClick={quitar}
                    className="absolute -right-2.5 -top-2.5 flex size-7 items-center justify-center rounded-full border-[2.5px] border-gr-ink bg-gr-surface before:absolute before:-inset-2 before:content-['']">
              <Icon name="close" size={12} strokeWidth={3.2} />
            </button>
          </div>
        )}
        <button type="button" onClick={() => elegir.current?.click()} disabled={subiendo}
                aria-label={foto ? 'Cambiar la foto' : 'Subir una foto de la galería o sacar una'}
                className={`${boton} ${subiendo ? 'animate-pulse' : ''}`}>
          <Icon name="camera" size={20} strokeWidth={2.4} />
          Foto
        </button>
        <button type="button" onClick={pegar} disabled={subiendo} aria-label="Pegar una foto copiada" className={boton}>
          <Icon name="paste" size={20} strokeWidth={2.4} />
          Pegar
        </button>
        {!foto && <p className="text-[13px] leading-snug font-medium">La foto es lo que más ayuda a que acierten.</p>}
      </div>
      <input ref={elegir} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden
             onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />
      {mensaje && (
        <p role={mensaje === 'subiendo' || mensaje === 'probando' ? 'status' : 'alert'} className="text-xs font-semibold">{AVISOS[mensaje]}</p>
      )}
      <input ref={link} value={url} placeholder="O el link de una foto (opcional)" aria-label="Link de una foto"
             inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
             className="gr-input shadow-none" onChange={(e) => escribir(e.target.value)} />
      <input type="hidden" name="fotoUrl" value={foto ?? ''} />
    </div>
  )
}
