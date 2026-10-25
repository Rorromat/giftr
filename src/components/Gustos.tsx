import Link from 'next/link'
import type { SeccionGustos } from '@/lib/gustos'
import { AvatarSticker, Icon } from '@/components/ui'

/** Ícono de la sección en un cuadradito ácido, apenas girado. */
export function IconoSeccion({ s, size = 36 }: { s: Pick<SeccionGustos, 'icono'>; size?: number }) {
  return (
    <span aria-hidden className="flex flex-none items-center justify-center rounded-full bg-gr-accent"
          style={{ width: size, height: size }}>
      <Icon name={s.icono} size={size * 0.55} strokeWidth={2} />
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
            <dt className="gr-label">{s.titulo}</dt>
            <dd className="flex flex-wrap gap-1.5">
              {s.items.map((i) => (
                <span key={i} className="rounded-full bg-gr-soft px-3 py-1 text-[13px] font-medium [overflow-wrap:anywhere]">{i}</span>
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
        <li key={s.clave} className="gr-card flex flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <IconoSeccion s={s} size={30} />
            <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-gr-muted">{s.titulo}</span>
          </div>
          <p className="text-base leading-tight font-semibold [overflow-wrap:anywhere]">
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
    <Link href={href} className="gr-card flex items-center gap-3 p-3.5">
      <AvatarSticker nombre={nombre} foto={foto} size={46} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-base leading-tight font-semibold">Conocé a {nombre.split(' ')[0]}</span>
        {resumen.length > 0
          ? (
            <span className="flex items-center gap-1.5">
              {resumen.slice(0, 5).map((s) => <IconoSeccion key={s.clave} s={s} size={24} />)}
              <span className="truncate text-[13px] text-gr-muted">{adelantoGustos(secciones)}</span>
            </span>
          )
          : <span className="text-[13px] text-gr-muted">Su cumple, sus talles y lo que le gusta</span>}
      </span>
      <Icon name="chevron" size={18} className="flex-none text-gr-muted" />
    </Link>
  )
}
