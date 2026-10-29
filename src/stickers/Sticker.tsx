'use client'

// fun-isometric en React (el Sticker del kit, ver .claude/skills/fun-isometric): un canvas del ancho que le da el css, con el
// reloj compartido de la página; un ícono nuevo arranca otro player, y la paleta y el loop le llegan al que ya corre con set(),
// así la entrada no se repite.
import { useEffect, useRef } from 'react'
import { play } from './fun'
import type { CSSProperties } from 'react'
import type { Icon, PlayOptions, Player } from './fun'

type Props = PlayOptions & {
  icon: Icon
  replayOnHover?: boolean
  /** nombre accesible; sin label es decorativo */
  label?: string
  className?: string
  style?: CSSProperties
}

export function Sticker({ icon, palette, loop, offset, enter, replayOnHover, label, className, style }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const player = useRef<Player | null>(null)
  const opts = useRef<PlayOptions>({ palette, loop, offset, enter })
  useEffect(() => {
    opts.current = { palette, loop, offset, enter }
  })
  useEffect(() => {
    if (!ref.current) return
    const p = play(ref.current, icon, opts.current)
    player.current = p
    return () => p.stop()
  }, [icon])
  // por el contenido de la paleta: un objeto nuevo con los mismos colores no repinta
  const tono = JSON.stringify(palette ?? null)
  useEffect(() => player.current?.set(opts.current), [tono, loop, offset])
  return (
    <canvas
      ref={ref}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      className={className}
      style={{ display: 'block', width: '100%', aspectRatio: '1', ...style }}
      onPointerEnter={replayOnHover ? () => player.current?.replay() : undefined}
    />
  )
}
