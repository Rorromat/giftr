import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { getOwnList } from '@/lib/lists'
import { misGustos } from '@/lib/bienvenida'
import { MESES, miCumple } from '@/lib/events'
import { yo } from '@/lib/perfil'
import { bloquesDeGustos, type PasoGustos } from '@/lib/gustos'
import { TallesIlustrados } from '@/components/TallesIlustrados'
import { AvatarSticker, Icon, Starburst, type IconName, LogoSticker } from '@/components/ui'

type Fila = { paso: PasoGustos; icono: IconName; titulo: string; valor: string | null }

/** "¡Todo listo!": el final de la bienvenida, con todo lo que cargó y lo que le falta (con link a ese paso). */
export default async function Listo({ searchParams }: { searchParams: Promise<{ desde?: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const [{ desde }, g, cumple, { nombre: suNombre, foto }, lista] = await Promise.all([
    searchParams, misGustos(db, session.userId), miCumple(db, session.userId), yo(db, session.userId), getOwnList(db, session.userId),
  ])
  if (!lista) redirect('/')
  const nombre = suNombre ?? session.user?.name ?? ''
  const talles = g && Object.values(g.talles).some(Boolean) ? g.talles : null

  const filas: Fila[] = [
    { paso: 'cumple', icono: 'cake', titulo: 'Tu cumple', valor: cumple && `${cumple.dia} de ${MESES[cumple.mes - 1]}` },
    ...bloquesDeGustos(g).map((b) => ({
      paso: b.paso, icono: b.icono, titulo: b.titulo,
      valor: b.partes.flatMap((p) => (p.clave === 'talles' ? (p.items.length ? ['talles cargados'] : []) : p.items)).join(', ') || null,
    })),
  ]
  const completas = filas.filter((f) => f.valor).length
  // Completar uno edita solo ese paso y vuelve acá (antes seguía por todos los que venían después). desde=perfil: los
  // que llegaron desde Perfil (la bienvenida entera, antes de Tus gustos) vuelven a Perfil.
  const completar = (paso: PasoGustos) => `/perfil/gustos/${paso}?volver=${desde === 'perfil' ? 'listo-perfil' : 'listo'}`
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
        {!foto && <Link href={completar('cumple')} className="text-sm font-semibold underline underline-offset-4">Subir foto</Link>}
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
              : <Link href={completar(f.paso)} className="flex-none text-[13px] font-semibold">Completar</Link>}
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
