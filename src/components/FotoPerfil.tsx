'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AvatarSticker, Icon } from '@/components/ui'

const LADO = 900

/** Achica la foto en el teléfono antes de subirla (las de cámara pesan varios MB). Si no puede, manda el original. */
async function achicar(archivo: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(archivo)
    const escala = Math.min(1, LADO / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * escala)
    canvas.height = Math.round(img.height * escala)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise((ok) => canvas.toBlob((b) => ok(b ?? archivo), 'image/jpeg', 0.88))
  } catch {
    return archivo
  }
}

/** Tu foto de perfil: tocás la foto (o el botón) y elegís una de la galería o sacás una. */
export function FotoPerfil({ nombre, foto, size = 84, propia }: { nombre: string; foto: string | null; size?: number; propia: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [actual, setActual] = useState(foto)
  const [estado, setEstado] = useState<'listo' | 'subiendo' | 'error'>('listo')

  async function subir(archivo: File | undefined) {
    if (!archivo) return
    setEstado('subiendo')
    const r = await fetch('/api/perfil/foto', { method: 'POST', body: await achicar(archivo), headers: { 'content-type': 'image/jpeg' } })
      .catch(() => null)
    if (!r?.ok) return setEstado('error')
    setActual((await r.json()).url)
    setEstado('listo')
    router.refresh()
  }

  async function quitar() {
    setEstado('subiendo')
    const r = await fetch('/api/perfil/foto', { method: 'DELETE' }).catch(() => null)
    if (!r?.ok) return setEstado('error')
    setActual(null)
    setEstado('listo')
    router.refresh()
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button type="button" onClick={() => input.current?.click()} aria-label={actual ? 'Cambiar tu foto' : 'Subir tu foto'}
              className={`relative ${estado === 'subiendo' ? 'animate-pulse' : ''}`}>
        <AvatarSticker nombre={nombre} foto={actual} size={size} />
        <span className="absolute -bottom-1.5 -right-1.5 flex size-8 items-center justify-center rounded-full border-[2.5px] border-gr-ink bg-gr-surface">
          <Icon name="camera" size={16} strokeWidth={2.4} />
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden
             onChange={(e) => { subir(e.target.files?.[0]); e.target.value = '' }} />
      {estado === 'error' && <p role="alert" className="text-xs font-semibold">No pudimos subir esa foto. Probá con otra.</p>}
      {estado === 'subiendo' && <p role="status" className="text-xs font-semibold text-gr-muted">Subiendo…</p>}
      {propia && estado !== 'subiendo' && actual?.startsWith('/foto/') && (
        <button type="button" onClick={quitar} className="min-h-8 text-xs font-bold underline underline-offset-2">Quitar foto</button>
      )}
    </div>
  )
}
