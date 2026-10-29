'use client'

import { useSyncExternalStore } from 'react'
import { Icon, type IconName } from '@/components/ui'
import { Sticker } from '@/stickers/Sticker'
import { STICKERS, type NombreSticker } from '@/stickers/giftr'
import { PALETAS } from '@/stickers/paletas'
import { alCambiarTema, temaPuesto } from '@/lib/tema'
import type { FechaEspecial } from '@/lib/fechas-especiales'
import type { PasoGustos } from '@/lib/gustos'

// Con una propuesta de diseño puesta (ver lib/tema.ts), las ilustraciones son stickers de fun-isometric con sus colores;
// con el diseño de siempre, las de siempre. Van las dos y CSS muestra una (gr-solo-actual y gr-solo-tema en temas.css),
// así no hay salto al hidratar: el servidor no sabe qué propuesta eligió este navegador.

/** La propuesta puesta, o null (también en el servidor). */
export const useTema = () => useSyncExternalStore(alCambiarTema, temaPuesto, () => null)

/** El sticker con los colores de la propuesta puesta. Mide lo que le dé el css (es cuadrado). */
export function StickerDelTema({ nombre, label, loop, enter, className = '', style }: {
  nombre: NombreSticker
  /** nombre accesible; sin label es decorativo */
  label?: string
  loop?: boolean
  enter?: number
  className?: string
  style?: React.CSSProperties
}) {
  const tema = useTema()
  return (
    <Sticker icon={STICKERS[nombre]} palette={tema ? PALETAS[tema] : undefined} label={label} loop={loop} enter={enter}
             className={`gr-solo-tema ${className}`} style={style} />
  )
}

/** Una ilustración de siempre (children) que, con una propuesta puesta, es un sticker. */
export function Ilustrado({ sticker, className = '', style, children }: {
  sticker: NombreSticker
  /** dónde y de qué tamaño va el sticker */
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <>
      <span className="gr-solo-actual contents">{children}</span>
      <StickerDelTema nombre={sticker} className={className} style={style} />
    </>
  )
}

/** El dibujo de arriba de un vacío: el ícono en un círculo blanco o, con una propuesta, su sticker. */
export function DibujoVacio({ icon, sticker, className = '' }: { icon: IconName; sticker: NombreSticker; className?: string }) {
  return (
    <Ilustrado sticker={sticker} className="-my-2 size-[104px]">
      <span aria-hidden className={`flex size-14 items-center justify-center rounded-full bg-gr-surface shadow-card ${className}`}>
        <Icon name={icon} size={26} />
      </span>
    </Ilustrado>
  )
}

/** El sticker de cada paso de los gustos. */
export const STICKER_GUSTO: Record<PasoGustos, NombreSticker> = {
  cumple: 'torta',
  deportes: 'padel',
  futbol: 'camiseta',
  hobbies: 'auriculares',
  ropa: 'bolsa',
  colores: 'remera',
  bebidas: 'cafe',
  'no-regalar': 'tazas',
}

/** El de cada fecha especial, y el del amigo invisible aparte (null). */
export const stickerDeFecha = (f: FechaEspecial | null): NombreSticker =>
  f === 'navidad' ? 'arbol' : f === 'amigo' ? 'mate' : f === 'padre' ? 'corbata' : f === 'madre' ? 'flores' : f === 'ninos' ? 'barrilete' : 'antifaz'
