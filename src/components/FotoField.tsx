'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Icon } from '@/components/ui'
import { achicarFoto } from '@/lib/achicar-foto'

const ES_LINK = /^https?:\/\/\S+$/i

const AVISOS = {
  subiendo: 'Subiendo la foto…',
  error: 'No pudimos subir esa foto. Probá con otra.',
  'sin-foto': 'No hay una foto copiada. Mantené apretada una foto, tocá Copiar y volvé a tocar Pegar.',
} as const

/**
 * La foto del deseo, que es lo que más ayuda a que acierten: de la galería o la cámara, pegada (con el botón
 * o pegando una imagen en cualquier campo del formulario) o con el link de una foto. Lo elegido viaja en el
 * campo oculto fotoUrl: la URL de la foto subida (/foto/deseo/:id) o el link.
 */
export function FotoField({ inicial = null }: { inicial?: string | null }) {
  const elegir = useRef<HTMLInputElement>(null)
  const link = useRef<HTMLInputElement>(null)
  const [subida, setSubida] = useState(inicial && !ES_LINK.test(inicial) ? inicial : null)
  const [url, setUrl] = useState(inicial && ES_LINK.test(inicial) ? inicial : '')
  const [estado, setEstado] = useState<'listo' | keyof typeof AVISOS>('listo')
  const [rota, setRota] = useState(false)
  const foto = subida ?? (ES_LINK.test(url.trim()) ? url.trim() : null)

  async function subir(imagen: Blob) {
    setEstado('subiendo')
    const r = await fetch('/api/deseo/foto', { method: 'POST', body: await achicarFoto(imagen, 1400), headers: { 'content-type': 'image/jpeg' } })
      .catch(() => null)
    if (!r?.ok) return setEstado('error')
    setSubida((await r.json()).url)
    setUrl('')
    setRota(false)
    setEstado('listo')
  }

  /** El botón Pegar: una imagen copiada se sube; un link copiado va al campo de link. */
  async function pegar() {
    setEstado('listo')
    try {
      for (const copiado of await navigator.clipboard.read()) {
        const tipo = copiado.types.find((t) => t.startsWith('image/'))
        if (tipo) return await subir(await copiado.getType(tipo))
        if (copiado.types.includes('text/plain')) {
          const texto = (await (await copiado.getType('text/plain')).text()).trim()
          if (ES_LINK.test(texto)) {
            setSubida(null)
            setRota(false)
            return setUrl(texto)
          }
        }
      }
    } catch {
      // sin permiso o sin soporte: el mismo aviso
    }
    setEstado('sin-foto')
  }

  function quitar() {
    setSubida(null)
    setUrl('')
    setEstado('listo')
  }

  // Pegar una imagen en cualquier campo (por ejemplo en "¿Qué querés?") también la sube.
  const alPegar = useEffectEvent((e: ClipboardEvent) => {
    const imagen = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (!imagen) return
    e.preventDefault()
    subir(imagen)
  })
  useEffect(() => {
    const escuchar = (e: ClipboardEvent) => alPegar(e)
    document.addEventListener('paste', escuchar)
    return () => document.removeEventListener('paste', escuchar)
  }, [])

  // Mientras sube, el formulario no se manda (si no, el deseo se guardaría sin la foto).
  useEffect(() => {
    link.current?.setCustomValidity(estado === 'subiendo' ? 'Esperá que termine de subir la foto.' : '')
  }, [estado])

  const boton = 'flex size-[72px] flex-none cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[14px] border-[2.5px] border-dashed border-gr-ink text-xs font-bold'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        {foto && !rota && (
          <div className="relative flex-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- fotos subidas o de tiendas externas */}
            <img src={foto} alt="Vista previa de la foto" onError={() => setRota(true)}
                 className="size-[72px] -rotate-4 rounded-[14px] border-[2.5px] border-gr-ink object-cover" />
            <button type="button" aria-label="Quitar foto" onClick={quitar}
                    className="absolute -right-2.5 -top-2.5 flex size-7 items-center justify-center rounded-full border-[2.5px] border-gr-ink bg-gr-surface before:absolute before:-inset-2 before:content-['']">
              <Icon name="close" size={12} strokeWidth={3.2} />
            </button>
          </div>
        )}
        <button type="button" onClick={() => elegir.current?.click()} disabled={estado === 'subiendo'}
                aria-label={foto ? 'Cambiar la foto' : 'Subir una foto de la galería o sacar una'}
                className={`${boton} ${estado === 'subiendo' ? 'animate-pulse' : ''}`}>
          <Icon name="camera" size={20} strokeWidth={2.4} />
          Foto
        </button>
        <button type="button" onClick={pegar} disabled={estado === 'subiendo'} aria-label="Pegar una foto copiada" className={boton}>
          <Icon name="paste" size={20} strokeWidth={2.4} />
          Pegar
        </button>
        {!foto && <p className="text-[13px] leading-snug font-medium">La foto es lo que más ayuda a que acierten.</p>}
      </div>
      <input ref={elegir} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden
             onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />
      {estado !== 'listo' && (
        <p role={estado === 'subiendo' ? 'status' : 'alert'} className="text-xs font-semibold">{AVISOS[estado]}</p>
      )}
      <input ref={link} value={url} placeholder="O el link de una foto (opcional)" aria-label="Link de una foto"
             className="gr-input shadow-none" onChange={(e) => { setUrl(e.target.value); setSubida(null); setRota(false) }} />
      <input type="hidden" name="fotoUrl" value={foto ?? ''} />
    </div>
  )
}
