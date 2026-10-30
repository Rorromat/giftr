'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AvatarSticker, Icon } from '@/components/ui'
import { achicarFoto } from '@/lib/achicar-foto'

/** Tu foto de perfil: tocás la foto (o el botón) y elegís una de la galería o sacás una. */
export function FotoPerfil({ id, nombre, foto, size = 84, propia }: { id?: string; nombre: string; foto: string | null; size?: number; propia: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [actual, setActual] = useState(foto)
  const [estado, setEstado] = useState<'listo' | 'subiendo' | 'error'>('listo')

  async function subir(archivo: File | undefined) {
    if (!archivo) return
    setEstado('subiendo')
    const r = await fetch('/api/perfil/foto', { method: 'POST', body: await achicarFoto(archivo, 900), headers: { 'content-type': 'image/jpeg' } })
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
        <AvatarSticker id={id} nombre={nombre} foto={actual} size={size} />
        <span className="absolute -bottom-1.5 -right-1.5 flex size-8 items-center justify-center rounded-full border border-gr-line bg-gr-surface">
          <Icon name="camera" size={16} strokeWidth={2} />
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden
             onChange={(e) => { subir(e.target.files?.[0]); e.target.value = '' }} />
      {estado === 'error' && <p role="alert" className="text-xs font-semibold">No pudimos subir esa foto. Probá con otra.</p>}
      {estado === 'subiendo' && <p role="status" className="text-xs font-semibold text-gr-muted">Subiendo…</p>}
      {propia && estado !== 'subiendo' && actual?.startsWith('/foto/') && (
        <button type="button" onClick={quitar} className="min-h-8 text-xs font-semibold underline underline-offset-4">Quitar foto</button>
      )}
    </div>
  )
}
