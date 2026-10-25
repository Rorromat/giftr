'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Icon } from '@/components/ui'
import { coincide } from '@/lib/buscar'

/**
 * Un buscador que filtra en el momento lo que ya está en la pantalla: lo que tiene data-buscar (su texto, con paraBuscar)
 * adentro de #ambito. Lo que no coincide se esconde (sigue en el formulario: un amigo tildado y escondido se manda igual);
 * si no queda nada, lo dice y, con masAlla, ofrece buscarlo afuera (a masAlla.href se le agrega lo escrito).
 */
export function Buscador({ ambito, placeholder, vacio, masAlla }: {
  ambito: string
  placeholder: string
  /** Sin resultados: "No hay nadie con «%s» en tu gente." (%s es lo escrito). */
  vacio: string
  masAlla?: { href: string; texto: string }
}) {
  const [q, setQ] = useState('')
  const [hay, setHay] = useState(true)

  /** Esconde lo que no coincide con lo escrito y anota si quedó algo. */
  function buscar(escrito: string) {
    setQ(escrito)
    const items = document.getElementById(ambito)?.querySelectorAll<HTMLElement>('[data-buscar]') ?? []
    let n = 0
    for (const item of items) {
      const si = coincide(item.dataset.buscar ?? '', escrito)
      item.hidden = !si
      if (si) n++
    }
    setHay(n > 0 || !items.length)
  }

  const escrito = q.trim()
  return (
    <div className="flex flex-col gap-2">
      <label className="flex h-12 items-center gap-2.5 rounded-full border border-gr-line bg-gr-surface px-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gr-ink">
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="flex-none text-gr-muted">
          <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
        </svg>
        <input type="search" value={q} onChange={(e) => buscar(e.target.value)} placeholder={placeholder} aria-label={placeholder}
               autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search"
               className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-gr-muted [&::-webkit-search-cancel-button]:hidden" />
        {q && (
          <button type="button" onClick={() => buscar('')} aria-label="Borrar la búsqueda" className="-mr-2 flex size-9 flex-none items-center justify-center rounded-full">
            <Icon name="close" size={14} strokeWidth={2.6} />
          </button>
        )}
      </label>
      {!hay && escrito && (
        <div role="status" className="flex flex-col items-start gap-1 px-1 text-sm font-medium">
          <p>{vacio.replace('%s', escrito)}</p>
          {masAlla && (
            <Link href={`${masAlla.href}${encodeURIComponent(escrito)}`} className="font-semibold underline underline-offset-4">{masAlla.texto}</Link>
          )}
        </div>
      )}
    </div>
  )
}
