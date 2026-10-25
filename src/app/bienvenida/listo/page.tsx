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
import { AvatarSticker, Icon, Starburst, type IconName, LogoSticker } from '@/components/ui'

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
    <main className="flex flex-col gap-5 pb-12 pt-2">
      <header className="flex min-h-14 items-center justify-center"><LogoSticker /></header>
      <div className="gr-hero flex flex-col items-center gap-3 px-5 pb-6 pt-7 text-center">
        <Starburst size={120} fontSize={28} label="Listo">¡Listo!</Starburst>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">¡Todo listo{nombre ? `, ${nombre.split(' ')[0]}` : ''}!</h1>
        <p className="text-[15px] leading-snug text-gr-on-hero/75">
          {completas === filas.length ? 'Cargaste todo. ' : `Cargaste ${completas} de ${filas.length}. `}
          Tu gente lo ve en tu perfil, al abrir tu lista.
        </p>
      </div>

      <div className="gr-card flex items-center gap-3 p-4">
        <AvatarSticker nombre={nombre} foto={foto} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-base leading-tight font-semibold [overflow-wrap:anywhere]">{nombre}</p>
          <p className="text-[13px] text-gr-muted">{foto ? 'Con tu foto' : 'Sin foto todavía'}</p>
        </div>
        {!foto && <Link href={`/bienvenida?${editar}paso=0`} className="text-sm font-semibold underline underline-offset-4">Subir foto</Link>}
      </div>

      <ul className="gr-card gr-rows flex flex-col">
        {filas.map((f) => (
          <li key={f.paso} className="flex items-center gap-3 px-4 py-3">
            <span aria-hidden className={`flex size-10 flex-none items-center justify-center rounded-full ${f.valor ? 'bg-gr-accent' : 'bg-gr-soft'}`}>
              <Icon name={f.icono} size={19} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="gr-label">{f.titulo}</p>
              <p className={`text-sm leading-snug [overflow-wrap:anywhere] ${f.valor ? 'font-semibold' : 'text-gr-muted'}`}>{f.valor ?? 'Sin cargar'}</p>
            </div>
            {f.valor
              ? <Icon name="check" size={20} strokeWidth={2.6} className="flex-none" />
              : <Link href={`/bienvenida?${editar}paso=${f.paso}`} className="flex-none text-[13px] font-semibold">Completar</Link>}
          </li>
        ))}
      </ul>

      {talles && <div className="gr-card flex justify-center p-4"><TallesIlustrados talles={talles} /></div>}

      <div className="flex flex-col gap-2.5">
        {desde === 'perfil'
          ? <Link href="/perfil" className="gr-btn-primary w-full">Volver a Perfil</Link>
          : <Link href={activos ? '/mi-lista' : '/agregar'} className="gr-btn-primary w-full">{activos ? 'Ir a mi lista' : 'Agregar mi primer deseo'}</Link>}
        <Link href={`/l/${lista.shareToken}/perfil`} className="gr-btn w-full">Ver cómo me ven</Link>
      </div>
    </main>
  )
}
