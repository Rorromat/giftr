'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui'

// Campo fotoUrl con miniatura: la foto es lo que más ayuda, así que se ve apenas se pega.
export function FotoField() {
  const [url, setUrl] = useState('')
  const [rota, setRota] = useState(false)
  const preview = /^https?:\/\/\S+$/i.test(url.trim()) && !rota

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        {preview && (
          <div className="relative flex-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- PoC: remote host images, no next/image config */}
            <img src={url.trim()} alt="Vista previa de la foto" onError={() => setRota(true)}
                 className="size-[72px] -rotate-4 rounded-[14px] border-[2.5px] border-gr-ink object-cover" />
            <button type="button" aria-label="Quitar foto" onClick={() => setUrl('')}
                    className="absolute -right-2.5 -top-2.5 flex size-7 items-center justify-center rounded-full border-[2.5px] border-gr-ink bg-gr-surface before:absolute before:-inset-2 before:content-['']">
              <Icon name="close" size={12} strokeWidth={3.2} />
            </button>
          </div>
        )}
        <label htmlFor="fotoUrl"
               className="flex size-[72px] flex-none cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[14px] border-[2.5px] border-dashed border-gr-ink text-xs font-bold">
          <Icon name="camera" size={20} strokeWidth={2.4} />
          Foto
        </label>
        <p className="text-[13px] leading-snug font-medium">La foto es lo que más ayuda a que acierten.</p>
      </div>
      <input id="fotoUrl" name="fotoUrl" value={url} placeholder="URL de foto (opcional)" className="gr-input shadow-none"
             onChange={(e) => { setUrl(e.target.value); setRota(false) }} />
    </div>
  )
}
