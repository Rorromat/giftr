import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { getOwnList } from '@/lib/lists'
import { misGustos } from '@/lib/bienvenida'
import { MESES, miCumple } from '@/lib/events'
import { miFoto } from '@/lib/perfil'
import { NO_FUTBOL, SOLO_SELECCION } from '@/lib/gustos'
import { TallesIlustrados } from '@/components/TallesIlustrados'
import { AvatarSticker, Icon, Starburst, type IconName } from '@/components/ui'

type Fila = { paso: number; icono: IconName; titulo: string; valor: string | null }

/** "¡Todo listo!": el final de la bienvenida, con todo lo que cargó y lo que le falta (con link a ese paso). */
export default async function Listo({ searchParams }: { searchParams: Promise<{ desde?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [{ desde }, g, cumple, foto, lista] = await Promise.all([
    searchParams, misGustos(db, session.userId), miCumple(db, session.userId), miFoto(db, session.userId), getOwnList(db, session.userId),
  ])
  if (!lista) redirect('/')
  const nombre = session.user?.name ?? ''
  const unir = (...partes: (string[] | string | null | undefined)[]) => partes.flat().filter(Boolean).join(', ') || null
  const talles = g && Object.values(g.talles).some(Boolean) ? g.talles : null

  const filas: Fila[] = [
    { paso: 0, icono: 'cake', titulo: 'Tu cumple', valor: cumple && `${cumple.dia} de ${MESES[cumple.mes - 1]}` },
    { paso: 1, icono: 'ball', titulo: 'Deportes', valor: unir(g?.deportes) },
    { paso: 2, icono: 'shield', titulo: 'Fútbol', valor: g?.club === NO_FUTBOL ? 'No te interesa' : g?.club === SOLO_SELECCION ? 'La Selección' : g?.club ?? null },
    { paso: 3, icono: 'star', titulo: 'Hobbies y mascotas', valor: unir(g?.hobbies, g?.mascotas.filter((m) => m !== 'No tengo')) },
    { paso: 4, icono: 'bag', titulo: 'Marcas y estilo', valor: unir(g?.marcas, g?.estilos) },
    { paso: 5, icono: 'palette', titulo: 'Colores y talles', valor: unir(g?.colores, talles && 'talles cargados') },
    { paso: 6, icono: 'cup', titulo: 'Bebidas y antojos', valor: unir(g?.bebidas) },
    { paso: 7, icono: 'ban', titulo: 'Lo que no querés', valor: unir(g?.noRegalar, g?.nota) },
  ]
  const completas = filas.filter((f) => f.valor).length
  // Completar un paso desde acá vuelve acá. editar=1 es el modo de Perfil (Guardar/Cancelar y vuelta a Perfil): solo si
  // vino de Perfil; la primera vez llevaba a un usuario nuevo a Perfil en vez de a cargar su primer deseo.
  const editar = desde === 'perfil' ? 'editar=1&' : ''
  const activos = lista.items.filter((i) => i.estadoDueno === 'activo').length

  return (
    <main className="flex flex-col gap-5 pb-12 pt-[52px]">
      <div className="relative flex flex-col items-center gap-3 pt-4 text-center">
        <Starburst size={136} fontSize={30} label="Listo" className="rotate-12">¡Listo!</Starburst>
        <h1 className="gr-title">¡Todo listo{nombre ? `, ${nombre.split(' ')[0]}` : ''}!</h1>
        <p className="text-[15px] font-medium leading-snug">
          {completas === filas.length ? 'Cargaste todo. ' : `Cargaste ${completas} de ${filas.length}. `}
          Tu gente lo ve en tu perfil, al abrir tu lista.
        </p>
      </div>

      <div className="gr-sticker flex items-center gap-3 px-3.5 py-3">
        <AvatarSticker nombre={nombre} foto={foto} size={52} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight font-extrabold [overflow-wrap:anywhere]">{nombre}</p>
          <p className="text-[13px] font-medium">{foto ? 'Con tu foto' : 'Sin foto todavía'}</p>
        </div>
        {!foto && <Link href={`/bienvenida?${editar}paso=0`} className="text-sm font-bold underline underline-offset-4">Subir foto</Link>}
      </div>

      <ul className="flex flex-col divide-y-2 divide-dashed divide-gr-dot rounded-sticker border-[3px] border-gr-ink bg-gr-surface px-3.5">
        {filas.map((f) => (
          <li key={f.paso} className="flex items-center gap-3 py-2.5">
            <span aria-hidden className={`flex size-9 flex-none -rotate-6 items-center justify-center rounded-xl border-[2.5px] border-gr-ink ${f.valor ? 'bg-gr-accent' : 'bg-gr-surface'}`}>
              <Icon name={f.icono} size={19} strokeWidth={2.4} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-gr-muted">{f.titulo}</p>
              <p className={`text-sm leading-snug [overflow-wrap:anywhere] ${f.valor ? 'font-semibold' : 'text-gr-muted'}`}>{f.valor ?? 'Sin cargar'}</p>
            </div>
            {f.valor
              ? <Icon name="check" size={20} strokeWidth={3} className="flex-none" />
              : <Link href={`/bienvenida?${editar}paso=${f.paso}`} className="flex-none text-[13px] font-bold underline underline-offset-4">Completar</Link>}
          </li>
        ))}
      </ul>

      {talles && <div className="gr-sticker flex justify-center p-3"><TallesIlustrados talles={talles} /></div>}

      <div className="flex flex-col gap-2.5">
        {desde === 'perfil'
          ? <Link href="/perfil" className="gr-btn-primary w-full">Volver a Perfil</Link>
          : <Link href={activos ? '/mi-lista' : '/agregar'} className="gr-btn-primary w-full">{activos ? 'Ir a mi lista' : 'Agregar mi primer deseo'}</Link>}
        <Link href={`/l/${lista.shareToken}/perfil`} className="gr-btn min-h-[50px] w-full font-sans text-[15px] font-bold">Ver cómo me ven</Link>
      </div>
    </main>
  )
}
