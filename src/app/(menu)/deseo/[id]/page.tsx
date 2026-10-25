import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { deseoParaEditar } from '@/lib/items'
import { textoDueno } from '@/lib/compartir'
import { ARCHIVAR, ConfirmarSacar } from '@/components/OwnerItemsGrid'
import { Icon, ItemPhoto, PriorityTag, Seccion, PageHeader } from '@/components/ui'

// Un deseo propio (o de un grupo propio), como lo abre quien regala pero sin nada de la coordinación: ni reservas, ni
// regalos, ni comentarios (la regla de la sorpresa). Desde acá se edita o se saca de la lista.
export default async function Deseo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.userId) redirect('/')
  const editable = await deseoParaEditar(db, id, session.userId)
  if (!editable) notFound()
  const { deseo, grupo, shareToken } = editable
  const lista = grupo ? `/grupos/${grupo.id}` : '/mi-lista'
  const precio = deseo.precio ?? deseo.rangoPrecio
  const cuantos = deseo.repetible ? 'Se puede repetir: varios pueden regalar algo así.'
    : deseo.cantidad > 1 ? `Cantidad: ${deseo.cantidad}.` : null

  return (
    <Seccion className="flex flex-col gap-4 pb-36 pt-2">
      <PageHeader title={grupo?.nombre ?? 'Mi lista'} titulo="p" back={lista} backLabel={`Volver a ${grupo?.nombre ?? 'Mi lista'}`} />

      <article className="gr-card">
        <div className="relative">
          <ItemPhoto src={deseo.fotoUrl} titulo={deseo.titulo} height={260} />
        </div>
        <div className="flex flex-col gap-3 p-4">
          {deseo.categoria && <p className="gr-label">{deseo.categoria}</p>}
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl leading-tight font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">{deseo.titulo}</h1>
            <div className="flex items-center gap-2">
              {precio && <p className="text-lg font-semibold">{precio}</p>}
              <PriorityTag prioridad={deseo.prioridad} className="h-6" />
            </div>
          </div>
          {cuantos && <p className="text-sm text-gr-muted">{cuantos}</p>}
          {deseo.notas && (
            <p className="rounded-2xl bg-gr-soft px-3.5 py-3 text-sm leading-snug [overflow-wrap:anywhere]">
              <span className="font-semibold">Nota:</span> {deseo.notas}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {deseo.linkTienda && (
              <a href={deseo.linkTienda} target="_blank" className="gr-btn gr-btn--sm">
                Ver en la tienda <Icon name="external" size={16} strokeWidth={2} />
              </a>
            )}
            {/* El link del deseo es el de quien regala: WhatsApp muestra la foto y el precio */}
            <a target="_blank" className="gr-btn gr-btn--sm gap-2"
               href={`https://wa.me/?text=${encodeURIComponent(textoDueno(deseo, `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${shareToken}/item/${deseo.id}`))}`}>
              <Icon name="chat" size={16} strokeWidth={2} />Mandarlo por WhatsApp
            </a>
          </div>
        </div>
      </article>

      <Link href={`/editar/${deseo.id}`} className="gr-btn-primary w-full">Editar</Link>

      {/* Sacarlo pide confirmar, como en la lista, y después vuelve a la lista */}
      <div className="gr-card gr-rows">
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
