import Link from 'next/link'
import { fotoDeEstilo, muestraDeColor, type BloqueGustos, type SeccionGustos, type Talles } from '@/lib/gustos'
import { paletaGusto } from '@/lib/colores-gustos'
import { IlustracionGusto } from '@/components/IlustracionGusto'
import { AvatarSticker, Icon } from '@/components/ui'

/** Ícono de la sección en un cuadradito ácido, apenas girado. */
export function IconoSeccion({ s, size = 36 }: { s: Pick<SeccionGustos, 'icono'>; size?: number }) {
  return (
    <span aria-hidden className="flex flex-none items-center justify-center rounded-full bg-gr-acento text-gr-on-acento"
          style={{ width: size, height: size }}>
      <Icon name={s.icono} size={size * 0.55} strokeWidth={2} />
    </span>
  )
}

/** Un gusto como etiqueta; un color, con su muestra al lado; un estilo, con su foto de ejemplo. */
function Etiqueta({ texto, oscuro = false }: { texto: string; oscuro?: boolean }) {
  const muestra = muestraDeColor(texto)
  const foto = fotoDeEstilo(texto)
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium [overflow-wrap:anywhere] ${foto ? 'pl-1' : ''} ${oscuro ? 'bg-gr-bg/12' : 'bg-gr-soft'}`}>
      {muestra && <span aria-hidden className="size-3.5 flex-none rounded-full border border-gr-ink/20" style={{ background: muestra }} />}
      {/* eslint-disable-next-line @next/next/no-img-element -- fotos propias de public/ */}
      {foto && <img src={foto} alt="" className="size-6 flex-none rounded-full object-cover" />}
      {texto}
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
              {s.items.map((i) => <Etiqueta key={i} texto={i} />)}
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
            {s.clave === 'colores' && (
              <span aria-hidden className="mb-1.5 flex">
                {s.items.slice(0, 5).map((c) => (
                  <span key={c} className="-mr-1.5 size-5 rounded-full border-2 border-gr-surface" style={{ background: muestraDeColor(c) ?? undefined }} />
                ))}
              </span>
            )}
            {s.clave === 'estilos' && (
              <span aria-hidden className="mb-1.5 flex">
                {s.items.slice(0, 3).map((e) => (
                  // eslint-disable-next-line @next/next/no-img-element -- fotos propias de public/
                  <img key={e} src={fotoDeEstilo(e) ?? ''} alt="" className="-mr-2 h-10 w-[30px] rounded-lg border-2 border-gr-surface object-cover" />
                ))}
              </span>
            )}
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

/** Lo que dice cada bloque vacío en Tus gustos, para que den ganas de completarlo. */
const PISTAS: Record<BloqueGustos['paso'], string> = {
  deportes: 'Los que hacés o mirás.',
  futbol: 'Para la camiseta, el buzo, la taza…',
  hobbies: 'Lo que te gusta hacer, y si hay mascota.',
  ropa: 'Tus marcas y tu estilo.',
  colores: 'Así nadie tiene que ir a cambiar nada.',
  bebidas: 'Para el regalito de último momento.',
  'no-regalar': 'Tan importante como lo que sí.',
}

/** La ilustración del paso en un cuadradito de su color (la misma del cartel de la bienvenida). */
function MiniIlustracion({ paso }: { paso: BloqueGustos['paso'] }) {
  return (
    <span aria-hidden className="flex size-12 flex-none items-center justify-center overflow-hidden rounded-2xl" style={{ background: paletaGusto(paso).fondo }}>
      <IlustracionGusto paso={paso} size={58} />
    </span>
  )
}

/** Los tres talles en fila, con un guión en el que falta. */
function TallesEnFila({ talles }: { talles: Talles }) {
  return (
    <span className="grid grid-cols-3 gap-2">
      {(['remera', 'pantalon', 'calzado'] as const).map((k) => (
        <span key={k} className="flex flex-col rounded-2xl bg-gr-soft px-3 py-2">
          <span className="text-[12px] font-semibold text-gr-muted">{k === 'remera' ? 'Remera' : k === 'pantalon' ? 'Pantalón' : 'Calzado'}</span>
          <span className={`font-display text-[22px] leading-tight font-bold ${talles[k] ? '' : 'text-gr-muted'}`}>{talles[k] ?? '—'}</span>
        </span>
      ))}
    </span>
  )
}

/**
 * Un bloque de Tus gustos (un paso de la bienvenida): lo que cargaste, y tocarlo lo edita solo. Vacío, punteado y con
 * "Sumar"; "Lo que no querés", en negro como lo ve tu gente.
 */
export function TarjetaBloque({ b, talles }: { b: BloqueGustos; talles: Talles }) {
  const href = `/perfil/gustos/${b.paso}`
  if (!b.cargado) {
    return (
      <Link href={href} className="flex min-h-[76px] items-center gap-3 rounded-[22px] border-2 border-dashed border-gr-line px-4 py-3">
        <MiniIlustracion paso={b.paso} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{b.titulo}</span>
          <span className="block text-[13px] leading-snug text-gr-muted">{PISTAS[b.paso]}</span>
        </span>
        <span className="flex flex-none items-center gap-1 text-sm font-semibold"><Icon name="plus" size={16} strokeWidth={2.4} />Sumar</span>
      </Link>
    )
  }
  const oscuro = b.paso === 'no-regalar'
  return (
    <Link href={href} className={`flex flex-col gap-3 rounded-[22px] p-4 ${oscuro ? 'border border-gr-line bg-gr-brand text-gr-bg' : 'gr-card'}`}>
      <span className="flex items-center gap-3">
        <MiniIlustracion paso={b.paso} />
        <span className={`min-w-0 flex-1 text-[15px] font-semibold ${oscuro ? 'text-gr-acento-sobre-tinta' : ''}`}>{b.titulo}</span>
        <span className="flex-none text-sm font-semibold underline underline-offset-4">Editar</span>
      </span>
      {b.partes.map((p) => (
        <span key={p.clave} className="flex flex-col gap-1.5">
          {b.partes.length > 1 && <span className={`gr-label ${oscuro ? 'text-gr-bg/60' : ''}`}>{p.titulo}</span>}
          {p.clave === 'talles' ? <TallesEnFila talles={talles} />
            : !p.items.length ? <span className={`text-[13px] ${oscuro ? 'text-gr-bg/60' : 'text-gr-muted'}`}>Sin cargar</span>
            : p.clave === 'nota' ? <span className="text-sm leading-snug">«{p.items[0]}»</span>
            : <span className="flex flex-wrap gap-1.5">{p.items.map((i) => <Etiqueta key={i} texto={i} oscuro={oscuro} />)}</span>}
        </span>
      ))}
    </Link>
  )
}
