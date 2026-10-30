import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { deseoParaEditar } from '@/lib/items'
import { textoDueno } from '@/lib/compartir'
import { ARCHIVAR, ConfirmarSacar } from '@/components/OwnerItemsGrid'
import { Arte, Icon, Seccion, PageHeader } from '@/components/ui'
import { colorDeDeseo } from '@/lib/tapas'
import { CategoriaDeseo, FichasDeseo, NotaDeseo } from '@/components/FichaDeseo'
import { sitioDeLaTienda } from '@/lib/links'
import { FotoAmpliable } from '@/components/FotoAmpliable'
import { VideoDeseo } from '@/components/VideoDeseo'

// Un deseo propio (o de un grupo propio), como lo abre quien regala pero sin nada de la coordinación: ni reservas, ni
// regalos, ni comentarios (la regla de la sorpresa). Desde acá se edita o se saca de la lista. Toda la pantalla se tiñe
// con el color del deseo, y no va la barra de abajo: una sola acción principal.
export default async function Deseo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.userId) redirect('/')
  const editable = await deseoParaEditar(db, id, session.userId)
  if (!editable) notFound()
  const { deseo, grupo, shareToken } = editable
  const lista = grupo ? `/grupos/${grupo.id}` : '/mi-lista'
  const precio = deseo.precio ?? deseo.rangoPrecio
  const tienda = deseo.linkTienda && sitioDeLaTienda(deseo.linkTienda)

  return (
    <Seccion className="flex flex-col gap-[18px] pb-16 pt-2">
      <div aria-hidden className="gr-tenido" style={{ '--c': colorDeDeseo(deseo.id) } as React.CSSProperties} />
      <PageHeader title={grupo?.nombre ?? 'Mi lista'} titulo="p" back={lista} backLabel={`Volver a ${grupo?.nombre ?? 'Mi lista'}`} />

      <article className="flex flex-col gap-[18px]">
        <FotoAmpliable src={deseo.fotoUrl} titulo={deseo.titulo} className="mx-auto w-[236px] max-w-full">
          <Arte id={deseo.id} src={deseo.fotoUrl} titulo={deseo.titulo} className="gr-gran-arte" />
        </FotoAmpliable>
        {/* como lo ve quien regala (ver /l/[token]/item), con sus palabras: "Lo quiero mucho", "Tu nota" */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {deseo.categoria && <CategoriaDeseo categoria={deseo.categoria} />}
            <h1 className="gr-title text-[32px] [overflow-wrap:anywhere]">{deseo.titulo}</h1>
            {precio && <p className="text-2xl font-extrabold tracking-[-0.03em] tabular-nums">{precio}</p>}
          </div>
          <FichasDeseo deseo={deseo} voz="propia" />
          {deseo.notas && <NotaDeseo notas={deseo.notas} quien={grupo ? 'La nota' : 'Tu nota'} />}
          {deseo.videoUrl && <VideoDeseo url={deseo.videoUrl} titulo={deseo.titulo} />}
          <div className="flex flex-wrap gap-2">
            {deseo.linkTienda && (
              <a href={deseo.linkTienda} target="_blank" className="gr-btn gr-btn--sm w-full min-w-0">
                <span className="truncate">Ver en {tienda || 'la tienda'}</span>
                <Icon name="external" size={16} strokeWidth={2} className="flex-none" />
              </a>
            )}
            {/* El link del deseo es el de quien regala: WhatsApp muestra la foto y el precio */}
            <a target="_blank" className="gr-btn gr-btn--sm flex-1 gap-2"
               href={`https://wa.me/?text=${encodeURIComponent(textoDueno(deseo, `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${shareToken}/item/${deseo.id}`))}`}>
              <Icon name="chat" size={16} strokeWidth={2} />Mandarlo por WhatsApp
            </a>
          </div>
        </div>
      </article>

      <Link href={`/editar/${deseo.id}`} className="gr-btn-primary w-full">Editar</Link>

      {/* Sacarlo pide confirmar, como en la lista, y después vuelve a la lista */}
      <div className="gr-card gr-rows bg-gr-surface/70">
        {ARCHIVAR.map(([estado, texto]) => (
          <details key={estado} className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
              {texto}
              <Icon name="chevron" size={18} className="text-gr-muted transition-transform group-open:rotate-90" />
            </summary>
            <ConfirmarSacar itemId={deseo.id} estado={estado} volver={lista} />
          </details>
        ))}
      </div>
    </Seccion>
  )
}
