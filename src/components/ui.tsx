import Link from 'next/link'

// Piezas base del sistema "Sticker". Server components puros (sin estado).

export const PRIORIDADES = {
  mucho: { label: 'Lo quiero mucho', corazones: 3 },
  gustaria: { label: 'Me gustaría', corazones: 2 },
  suelta: { label: 'Idea suelta', corazones: 1 },
} as const

export type Prioridad = keyof typeof PRIORIDADES

const STAR_POINTS =
  '50.0,2.0 59.8,13.3 74.0,8.4 76.9,23.1 91.6,26.0 86.7,40.2 98.0,50.0 86.7,59.8 91.6,74.0 76.9,76.9 74.0,91.6 59.8,86.7 50.0,98.0 40.2,86.7 26.0,91.6 23.1,76.9 8.4,74.0 13.3,59.8 2.0,50.0 13.3,40.2 8.4,26.0 23.1,23.1 26.0,8.4 40.2,13.3'

/** Estrella de 12 puntas (contador). `label` la vuelve accesible; sin label es decorativa. */
export function Starburst({ children, sub, label, size = 62, fontSize = 40, className = '', style }: {
  children?: React.ReactNode
  /** Segunda línea chica debajo del número ("días"). */
  sub?: string
  label?: string
  size?: number
  fontSize?: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      width={size} height={size} viewBox="0 0 100 100" className={className} style={style}
    >
      <polygon points={STAR_POINTS} fill="var(--gr-accent)" stroke="var(--gr-ink)" strokeWidth="3.5" strokeLinejoin="round" />
      {children != null && (
        <text x="50" y={sub ? 44 : 50} dy="0.35em" textAnchor="middle" fontSize={fontSize} fontWeight={800}
              fill="var(--gr-ink)" style={{ fontFamily: 'var(--gr-font-display)' }}>
          {children}
        </text>
      )}
      {sub && (
        <text x="50" y="70" dy="0.35em" textAnchor="middle" fontSize={17} fontWeight={800}
              fill="var(--gr-ink)" style={{ fontFamily: 'var(--gr-font-display)' }}>
          {sub}
        </text>
      )}
    </svg>
  )
}

export function Heart({ size = 11 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 22">
      <path d="M12 20.5s-9.5-5.7-9.5-12.3A5.2 5.2 0 0 1 12 5.2a5.2 5.2 0 0 1 9.5 3C21.5 14.8 12 20.5 12 20.5z" fill="currentColor" />
    </svg>
  )
}

export function Hearts({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span className={`flex gap-0.5 ${className}`}>
      {Array.from({ length: n }, (_, i) => <Heart key={i} />)}
    </span>
  )
}

/** Etiqueta de prioridad sobre la foto: negra con corazones ácidos si es "mucho", blanca si no. */
export function PriorityTag({ prioridad, children, className = '' }: {
  prioridad: Prioridad
  children?: React.ReactNode
  className?: string
}) {
  const { label, corazones } = PRIORIDADES[prioridad]
  const dark = prioridad === 'mucho'
  return (
    <span
      role="img" aria-label={label}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border-[2.5px] border-gr-ink px-2.5 text-xs font-bold ${
        dark ? 'bg-gr-ink text-gr-accent' : 'bg-gr-surface text-gr-ink'} ${className}`}
    >
      <Hearts n={corazones} />
      {children && <span className={dark ? 'text-gr-bg' : ''}>{children}</span>}
    </span>
  )
}

/** Precio montado sobre el borde inferior de la foto (el padre tiene que ser `relative`). */
export function PriceSticker({ children, rotate = -5, className = '' }: {
  children: React.ReactNode
  rotate?: number
  className?: string
}) {
  return (
    <span className={`gr-price absolute bottom-1 right-2 max-w-[calc(100%-16px)] [overflow-wrap:anywhere] ${className}`}
          style={{ transform: `rotate(${rotate}deg)` }}>
      {children}
    </span>
  )
}

/** Foto del deseo a sangre; sin foto, placeholder crema con la estrella y la inicial. */
export function ItemPhoto({ src, titulo, height, dimmed = false, className = '' }: {
  src: string | null
  titulo: string
  height: number
  dimmed?: boolean
  className?: string
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- PoC: remote host images, no next/image config
      <img src={src} alt={titulo} className={`gr-sticker__img ${dimmed ? 'opacity-45' : ''} ${className}`} style={{ height }} />
    )
  }
  const inicial = titulo.trim().charAt(0).toUpperCase()
  return (
    <div className={`flex items-center justify-center border-b-[3px] border-gr-ink bg-gr-bg ${dimmed ? 'opacity-45' : ''} ${className}`}
         style={{ height }}>
      <Starburst size={Math.min(96, Math.round(height * 0.55))} fontSize={46} className="rotate-12">{inicial}</Starburst>
    </div>
  )
}

/** Avatar sticker cuadrado: la foto si hay, si no las iniciales (Lista compartida, Perfil). */
export function AvatarSticker({ nombre, foto, size = 56, className = '' }: { nombre: string; foto?: string | null; size?: number; className?: string }) {
  const iniciales = nombre.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('')
  return (
    <div aria-hidden
         className={`flex flex-none items-center justify-center overflow-hidden border-[3px] border-gr-ink bg-gr-accent font-display font-extrabold tracking-[-0.04em] shadow-sticker-sm ${className}`}
         style={{ width: size, height: size, borderRadius: size * 0.31, fontSize: size * 0.42, transform: 'rotate(-5deg)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto propia o de Google, ya del tamaño justo */}
      {foto ? <img src={foto} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : iniciales}
    </div>
  )
}

/** Avatares redondos superpuestos: la foto de cada dueño o su inicial (el primero en ácido). */
export function AvatarStack({ nombres, fotos = [], size = 40, className = '' }: { nombres: string[]; fotos?: (string | null)[]; size?: number; className?: string }) {
  return (
    <div aria-hidden className={`flex flex-none ${className}`}>
      {nombres.map((n, i) => (
        <span key={i}
              className={`flex items-center justify-center overflow-hidden rounded-full border-[2.5px] border-gr-ink font-display font-extrabold ${i ? 'bg-gr-surface' : 'bg-gr-accent'}`}
              style={{ width: size, height: size, fontSize: size * 0.42, marginLeft: i ? -size * 0.3 : 0, zIndex: nombres.length - i }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto propia o de Google */}
          {fotos[i] ? <img src={fotos[i]!} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : n.trim().charAt(0).toUpperCase()}
        </span>
      ))}
    </div>
  )
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label} className="gr-icon-btn">
      <Icon name="back" size={20} strokeWidth={2.6} />
    </Link>
  )
}

/** Logo "GiftR" en sticker blanco. */
export function LogoSticker({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-block rounded-2xl border-[3px] border-gr-ink bg-gr-surface px-3 pb-1 pt-0.5 font-display text-[28px] leading-none font-extrabold tracking-[-0.05em] shadow-sticker-sm ${className}`}
          style={{ transform: 'rotate(-3deg)' }}>
      GiftR
    </span>
  )
}

const ICONS = {
  back: <path d="M15 18l-6-6 6-6" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  home: <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
  gift: <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13" /><path d="M3 12h18" /><path d="M12 8c-2-4-6-4-6-1.5S9 8 12 8c3 0 6-.5 6-1.5S14 4 12 8z" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14.5c2.4 0 4 1.6 4.5 4.5" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  camera: <><rect x="3" y="6" width="18" height="14" rx="3" /><circle cx="12" cy="13" r="3.5" /><path d="M9 6l1.5-2h3L15 6" /></>,
  chat: <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  more: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  // Secciones de gustos y del perfil
  cake: <><path d="M4 21h16" /><rect x="5" y="12" width="14" height="9" rx="2" /><path d="M5 16c2 1.5 4.5 1.5 7 0s5-1.5 7 0" /><path d="M12 12V9" /><path d="M12 6.5c-1.1-1-1.1-2.6 0-3.8 1.1 1.2 1.1 2.8 0 3.8z" /></>,
  ball: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5l4 2.9-1.5 4.6h-5L8 10.4z" /><path d="M12 3v4.5M16 10.4l4.3-1.5M14.5 15l2.7 3.9M9.5 15l-2.7 3.9M8 10.4L3.7 8.9" /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.4 7.6-8 9-4.6-1.4-8-4.5-8-9V6z" /><path d="M9.3 4.1v14.6M14.7 4.1v14.6" /></>,
  star: <path d="M12 3l2.3 5.7L20 11l-5.7 2.3L12 19l-2.3-5.7L4 11l5.7-2.3z" />,
  paw: <><circle cx="6.5" cy="10.5" r="1.7" /><circle cx="10" cy="6.5" r="1.7" /><circle cx="14.5" cy="6.5" r="1.7" /><circle cx="18" cy="10.5" r="1.7" /><path d="M12.3 11.5c-3 0-6 4-6 6.5 0 2 2 2.5 3.5 2 1-.3 1.6-.6 2.5-.6s1.5.3 2.5.6c1.5.5 3.5 0 3.5-2 0-2.5-3-6.5-6-6.5z" /></>,
  bag: <><path d="M5 8h14l-1.2 13H6.2z" /><path d="M9 10V6.5a3 3 0 0 1 6 0V10" /></>,
  hanger: <><path d="M10 5.5a2 2 0 1 1 2 2v1.5" /><path d="M12 9L3.4 15.6c-.8.6-.4 1.9.6 1.9h16c1 0 1.4-1.3.6-1.9z" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9s-1-1.6-1-2.6 1-1.5 2-1.5h2a4 4 0 0 0 4-4C21 6.5 17 3 12 3z" /><circle cx="7.5" cy="11.5" r="1.2" /><circle cx="10" cy="7.2" r="1.2" /><circle cx="15" cy="7.5" r="1.2" /></>,
  shirt: <path d="M8.5 3L3 6.2l2 4.3 2.2-1V21h9.6V9.5l2.2 1 2-4.3L15.5 3c-.6 1.5-1.9 2.4-3.5 2.4S9.1 4.5 8.5 3z" />,
  cup: <><path d="M4.5 9h12v4.5a6 6 0 0 1-12 0z" /><path d="M16.5 10h1.3a2.5 2.5 0 0 1 0 5h-1.6" /><path d="M8.5 2.8c-.8 1 .8 2 0 3.2M12.5 2.8c-.8 1 .8 2 0 3.2" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  note: <><path d="M5 4h14v11l-5 5H5z" /><path d="M14 20v-5h5" /><path d="M8 9h8M8 12.5h5" /></>,
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 22, strokeWidth = 2.2, className = '' }: {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
}) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {ICONS[name]}
    </svg>
  )
}

/** Píldora negra flotante. Solo lista los destinos que existen hoy. */
export function BottomNav({ active }: { active: 'mi-lista' | 'eventos' | 'grupos' | 'perfil' }) {
  return (
    <nav aria-label="Navegación principal" className="gr-nav">
      {/* prefetch: las secciones del menú se precargan completas (con datos) y el toque es instantáneo. */}
      <Link href="/mi-lista" prefetch aria-label="Mi lista" aria-current={active === 'mi-lista' ? 'page' : undefined}>
        <span><Icon name="home" /></span>
      </Link>
      <Link href="/eventos" prefetch aria-label="Eventos" aria-current={active === 'eventos' ? 'page' : undefined}>
        <span><Icon name="gift" /></span>
      </Link>
      <Link href="/agregar" prefetch aria-label="Agregar deseo">
        <span className="gr-nav__add"><Icon name="plus" size={24} strokeWidth={3} /></span>
      </Link>
      <Link href="/grupos" prefetch aria-label="Grupos" aria-current={active === 'grupos' ? 'page' : undefined}>
        <span><Icon name="users" strokeWidth={2.4} /></span>
      </Link>
      <Link href="/perfil" prefetch aria-label="Perfil" aria-current={active === 'perfil' ? 'page' : undefined}>
        <span><Icon name="user" strokeWidth={active === 'perfil' ? 2.4 : 2.2} /></span>
      </Link>
    </nav>
  )
}
