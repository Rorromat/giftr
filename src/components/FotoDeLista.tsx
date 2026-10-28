'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setGroupPhotoAction } from '@/app/actions'
import { Icon } from '@/components/ui'
import { achicarFoto } from '@/lib/achicar-foto'

/**
 * La foto de una lista en común (la cara de Juancito): tocás el círculo y elegís una de la galería o sacás una. Se sube
 * como la de un deseo (/api/deseo/foto). Al crear la lista va en el formulario (campo "foto"); en el grupo (grupoId) se
 * guarda apenas sube.
 */
export function FotoDeLista({ foto, grupoId, size = 72, enHero = false }: { foto: string | null; grupoId?: string; size?: number; enHero?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [actual, setActual] = useState(foto)
  const [estado, setEstado] = useState<'listo' | 'subiendo' | 'error' | 'muchas'>('listo')

  async function guardar(url: string | null) {
    if (!grupoId) return
    const fd = new FormData()
    fd.set('grupoId', grupoId)
    if (url) fd.set('foto', url)
    await setGroupPhotoAction(fd)
    router.refresh()
  }

  async function subir(archivo: File | undefined) {
    if (!archivo) return
    setEstado('subiendo')
    const r = await fetch('/api/deseo/foto', { method: 'POST', body: await achicarFoto(archivo, 1200), headers: { 'content-type': 'image/jpeg' } })
      .catch(() => null)
    if (!r?.ok) return setEstado(r?.status === 429 ? 'muchas' : 'error')
    const { url } = await r.json()
    try {
      await guardar(url)
    } catch {
      return setEstado('error')
    }
    setActual(url)
    setEstado('listo')
  }

  async function quitar() {
    setEstado('subiendo')
    try {
      await guardar(null)
    } catch {
      return setEstado('error')
    }
    setActual(null)
    setEstado('listo')
  }

  const texto = enHero ? 'text-gr-on-hero' : ''
  return (
    <div className="flex flex-none flex-col items-center gap-1">
      <button type="button" onClick={() => input.current?.click()} aria-label={actual ? 'Cambiar la foto de la lista' : 'Ponerle una foto a la lista'}
              className={`relative flex-none ${estado === 'subiendo' ? 'animate-pulse' : ''}`}>
        <span className={`flex items-center justify-center overflow-hidden rounded-full ${actual ? '' : 'border-2 border-dashed border-gr-comun-line bg-gr-comun text-gr-comun-ink'}`}
              style={{ width: size, height: size }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto subida, ya achicada */}
          {actual ? <img src={actual} alt="" className="size-full object-cover" /> : <Icon name="camera" size={size * 0.38} />}
        </span>
        {actual && (
          <span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border border-gr-line bg-gr-surface text-gr-ink">
            <Icon name="camera" size={14} strokeWidth={2} />
          </span>
        )}
      </button>
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden
             onChange={(e) => { subir(e.target.files?.[0]); e.target.value = '' }} />
      {!grupoId && <input type="hidden" name="foto" value={actual ?? ''} />}
      {estado === 'error' && <p role="alert" className={`max-w-28 text-center text-xs font-semibold ${texto}`}>No pudimos subir esa foto. Probá con otra.</p>}
      {estado === 'muchas' && <p role="alert" className={`max-w-28 text-center text-xs font-semibold ${texto}`}>Ya subiste muchas fotos hoy. Probá mañana.</p>}
      {estado === 'subiendo' && <p role="status" className={`text-xs font-semibold ${enHero ? 'text-gr-on-hero/70' : 'text-gr-muted'}`}>Subiendo…</p>}
      {estado === 'listo' && actual && (
        <button type="button" onClick={quitar} className={`min-h-8 text-xs font-semibold underline underline-offset-4 ${texto}`}>Quitar foto</button>
      )}
    </div>
  )
}
