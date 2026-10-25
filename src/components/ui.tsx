import Link from 'next/link'
import { FotoConRespaldo } from '@/components/FotoConRespaldo'

// Piezas base del sistema visual. Server components puros (sin estado); la foto que no carga cae al placeholder
// desde un componente cliente (FotoConRespaldo).

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
      <polygon points={STAR_POINTS} fill="var(--gr-accent)" />
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

/** Etiqueta de prioridad: negra con corazones lima si es "mucho", blanca si no (con una sombrita, sobre la foto). */
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
      className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold shadow-[0_1px_4px_rgb(20_20_20/0.14)] ${
        dark ? 'bg-gr-brand text-gr-accent' : 'bg-white/95 text-gr-ink'} ${className}`}
    >
      <Hearts n={corazones} />
      {children && <span className={dark ? 'text-gr-on-brand' : ''}>{children}</span>}
    </span>
  )
}

/** Foto del deseo a sangre; sin foto (o si no carga), la inicial sobre la superficie suave. */
export function ItemPhoto({ src, titulo, height, dimmed = false, className = '' }: {
  src: string | null
  titulo: string
  height: number
  dimmed?: boolean
  className?: string
}) {
  const inicial = titulo.trim().charAt(0).toUpperCase()
  const placeholder = (
    <div className={`flex items-center justify-center bg-gr-soft ${dimmed ? 'opacity-45' : ''} ${className}`} style={{ height }}>
      <Starburst size={Math.min(84, Math.round(height * 0.5))} fontSize={44}>{inicial}</Starburst>
    </div>
  )
  if (!src) return placeholder
  return (
    <FotoConRespaldo src={src} alt={titulo} respaldo={placeholder}
                     className={`gr-sticker__img ${dimmed ? 'opacity-45' : ''} ${className}`} style={{ height }} />
  )
}

/** Avatar redondo: la foto si hay, si no las iniciales sobre lima (Lista compartida, Perfil). */
export function AvatarSticker({ nombre, foto, size = 56, className = '' }: { nombre: string; foto?: string | null; size?: number; className?: string }) {
  const iniciales = nombre.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('')
  return (
    <div aria-hidden
         className={`flex flex-none items-center justify-center overflow-hidden rounded-full bg-gr-accent font-semibold ${className}`}
         style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto propia o de Google, ya del tamaño justo */}
      {foto ? <img src={foto} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : iniciales}
    </div>
  )
}

/** Avatares redondos superpuestos con un aro blanco: la foto de cada dueño o su inicial (el primero en lima). */
export function AvatarStack({ nombres, fotos = [], size = 40, className = '' }: { nombres: string[]; fotos?: (string | null)[]; size?: number; className?: string }) {
  return (
    <div aria-hidden className={`flex flex-none ${className}`}>
      {nombres.map((n, i) => (
        <span key={i}
              className={`flex items-center justify-center overflow-hidden rounded-full border-2 border-gr-surface font-semibold ${i ? 'bg-gr-soft' : 'bg-gr-accent'}`}
              style={{ width: size, height: size, fontSize: size * 0.4, marginLeft: i ? -size * 0.3 : 0, zIndex: nombres.length - i }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto propia o de Google */}
          {fotos[i] ? <img src={fotos[i]!} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : n.trim().charAt(0).toUpperCase()}
        </span>
      ))}
    </div>
  )
}

/** Un link si hay adónde ir; si no (cambiaron el link para regalar y no lo tiene), lo mismo sin link. */
export function QuizasLink({ href, className, children }: { href: string | null; className: string; children: React.ReactNode }) {
  return href ? <Link href={href} className={className}>{children}</Link> : <div className={className}>{children}</div>
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label} className="gr-icon-btn">
      <Icon name="back" size={20} strokeWidth={2.4} />
    </Link>
  )
}

/** El logo: "GiftR" con la estrella lima. */
export function LogoSticker({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-brand text-[26px] leading-none font-extrabold tracking-[-0.05em] ${className}`}>
      GiftR
      <Starburst size={18} className="-mt-3" />
    </span>
  )
}

/**
 * Barra de arriba de las secciones del menú: algo a la izquierda, el logo al medio y tu foto a la derecha (lleva a tu
 * perfil). Mide 56 de alto.
 */
export function AppHeader({ left, nombre, foto }: { left?: React.ReactNode; nombre: string; foto: string | null }) {
  return (
    <header className="grid min-h-14 grid-cols-[1fr_auto_1fr] items-center">
      <div className="justify-self-start">{left}</div>
      <LogoSticker />
      <Link href="/perfil" prefetch aria-label="Tu perfil" className="justify-self-end">
        <AvatarSticker nombre={nombre} foto={foto} size={40} className="shadow-card" />
      </Link>
    </header>
  )
}

/**
 * Barra de las pantallas de adentro: volver, el título al medio y una acción opcional. El título es el h1 de la
 * pantalla, salvo que la pantalla tenga el suyo más abajo (titulo="p").
 */
export function PageHeader({ title, back, backLabel = 'Volver', action, titulo: Titulo = 'h1' }: {
  title: string
  back?: string
  backLabel?: string
  action?: React.ReactNode
  titulo?: 'h1' | 'p'
}) {
  return (
    <header className="grid min-h-14 grid-cols-[48px_1fr_48px] items-center gap-2">
      <div>{back && <BackLink href={back} label={backLabel} />}</div>
      <Titulo className="truncate text-center text-lg font-semibold tracking-[-0.01em]">{title}</Titulo>
      <div className="justify-self-end">{action}</div>
    </header>
  )
}

/** Título de sección con su "Ver más" a la derecha. */
export function SectionHeader({ title, href, linkLabel = 'Ver más', id }: { title: React.ReactNode; href?: string; linkLabel?: string; id?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="gr-heading">{title}</h2>
      {href && <Link href={href} className="flex-none text-sm font-semibold">{linkLabel}</Link>}
    </div>
  )
}

/** Fila de opciones: ícono en un círculo, título, bajada y flecha (va dentro de una tarjeta `gr-rows`). */
export function Row({ href, icon, title, sub, children }: {
  href?: string
  icon: IconName
  title: React.ReactNode
  sub?: React.ReactNode
  children?: React.ReactNode
}) {
  const adentro = (
    <>
      <span className="gr-row__icon"><Icon name={icon} size={20} /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold">{title}</span>
        {sub && <span className="truncate text-[13px] text-gr-muted">{sub}</span>}
      </span>
      {children ?? (href && <Icon name="chevron" size={18} className="flex-none text-gr-muted" />)}
    </>
  )
  return href ? <Link href={href} className="gr-row">{adentro}</Link> : <div className="gr-row">{adentro}</div>
}

const ICONS = {
  back: <path d="M15 18l-6-6 6-6" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  home: <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M16 12.5h2.5" /><path d="M6 6l9-3 1.5 3" /></>,
  gift: <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13" /><path d="M3 12h18" /><path d="M12 8c-2-4-6-4-6-1.5S9 8 12 8c3 0 6-.5 6-1.5S14 4 12 8z" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14.5c2.4 0 4 1.6 4.5 4.5" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  camera: <><rect x="3" y="6" width="18" height="14" rx="3" /><circle cx="12" cy="13" r="3.5" /><path d="M9 6l1.5-2h3L15 6" /></>,
  paste: <><rect x="5" y="4.5" width="14" height="16.5" rx="2.5" /><path d="M9 4.5V3h6v1.5" /><path d="M9 11h6M9 15h4" /></>,
  chat: <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  more: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  heart: <path d="M12 20s-8-4.8-8-10.4A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.6C20 15.2 12 20 12 20z" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
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
  // "Me lo robo": copiarlo a tu lista
  copiar: <><rect x="8.5" y="8.5" width="12" height="12" rx="3" /><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" /></>,
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 22, strokeWidth = 2, className = '' }: {
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

/** El <main> de una sección del menú: aparece con un fundido corto al llegar (la anterior ya se fue, no se superponen). */
export function Seccion({ className = '', ...props }: React.ComponentProps<'main'>) {
  return <main {...props} className={`gr-seccion ${className}`} />
}
