import Link from 'next/link'
import type { SeccionGustos } from '@/lib/gustos'
import { AvatarSticker, Icon } from '@/components/ui'

/** Ícono de la sección en un cuadradito ácido, apenas girado. */
export function IconoSeccion({ s, size = 36 }: { s: Pick<SeccionGustos, 'icono'>; size?: number }) {
  return (
    <span aria-hidden className="flex flex-none items-center justify-center rounded-xl bg-gr-accent"
          style={{ width: size, height: size }}>
      <Icon name={s.icono} size={size * 0.55} strokeWidth={2.4} />
    </span>
  )
}

/** Todas las secciones, cada una con su ícono y sus etiquetas ("Ver todo"). */
export function SeccionesGustos({ secciones }: { secciones: SeccionGustos[] }) {
  return (
    <dl className="flex flex-col gap-3.5">
      {secciones.map((s) => (
        <div key={s.clave} className="flex gap-3">
          <IconoSeccion s={s} size={34} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <dt className="text-xs font-bold uppercase tracking-wide text-gr-muted">{s.titulo}</dt>
            <dd className="flex flex-wrap gap-1.5">
              {s.items.map((i) => (
                <span key={i} className="rounded-full border border-gr-line bg-gr-surface px-2.5 py-0.5 text-[13px] font-semibold [overflow-wrap:anywhere]">{i}</span>
              ))}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  )
}

/** Lo que va en el resumen de tarjetas (los talles, lo que no y la nota tienen su lugar aparte). */
export const paraResumen = (secciones: SeccionGustos[]) =>
  secciones.filter((s) => !['talles', 'noRegalar', 'nota'].includes(s.clave))

/** Un adelanto de una línea: "River Plate · Pádel · Mate · Talle M". */
export const adelantoGustos = (secciones: SeccionGustos[]) =>
  paraResumen(secciones).flatMap((s) => s.items).slice(0, 5).join(' · ')

/** El resumen de gustos en tarjetas: ícono, qué es y lo primero de cada sección. */
export function ResumenGustos({ secciones }: { secciones: SeccionGustos[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2.5">
      {paraResumen(secciones).slice(0, 6).map((s) => (
        <li key={s.clave} className="flex flex-col gap-2 rounded-2xl bg-gr-surface p-3">
          <div className="flex items-center gap-2">
            <IconoSeccion s={s} size={30} />
            <span className="text-[11px] font-bold uppercase leading-tight tracking-wide text-gr-muted">{s.titulo}</span>
          </div>
          <p className="font-display text-[17px] leading-tight font-extrabold [overflow-wrap:anywhere]">
            {s.items.slice(0, 2).join(', ')}
            {s.items.length > 2 && <span className="text-gr-muted"> +{s.items.length - 2}</span>}
          </p>
        </li>
      ))}
    </ul>
  )
}

/** En la lista de alguien: su foto, un adelanto con los íconos de lo que le gusta y el link a su perfil. */
export function TarjetaPerfil({ nombre, foto, secciones, href }: { nombre: string; foto: string | null; secciones: SeccionGustos[]; href: string }) {
  const resumen = paraResumen(secciones)
  return (
    <Link href={href} className="gr-sticker flex items-center gap-3 px-3.5 py-3">
      <AvatarSticker nombre={nombre} foto={foto} size={46} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-display text-lg leading-tight font-extrabold">Conocé a {nombre.split(' ')[0]}</span>
        {resumen.length > 0
          ? (
            <span className="flex items-center gap-1.5">
              {resumen.slice(0, 5).map((s) => <IconoSeccion key={s.clave} s={s} size={24} />)}
              <span className="truncate text-[13px] font-medium">{adelantoGustos(secciones)}</span>
            </span>
          )
          : <span className="text-[13px] font-medium">Su cumple, sus talles y lo que le gusta</span>}
      </span>
      <Icon name="chevron" size={18} strokeWidth={2.6} className="flex-none" />
    </Link>
  )
}
