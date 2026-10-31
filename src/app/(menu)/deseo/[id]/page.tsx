import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { deseoParaEditar } from '@/lib/items'
import { textoDueno } from '@/lib/compartir'
import { ARCHIVAR, ConfirmarSacar } from '@/components/OwnerItemsGrid'
import { Icon, Seccion } from '@/components/ui'
import { BarraDeLaFicha, BotonTienda, FichasDeseo, FotoDeLaFicha, NombreDeLaFicha, NotaDeseo } from '@/components/FichaDeseo'
import { sitioDeLaTienda } from '@/lib/links'
import { VideoDeseo } from '@/components/VideoDeseo'

// Un deseo propio (o de un grupo propio), como lo abre quien regala pero sin nada de la coordinación: ni reservas, ni
// regalos, ni comentarios (la regla de la sorpresa). La ficha (ver FichaDeseo): la foto a sangre con compartir por WhatsApp
// arriba, y en la barra de abajo la tienda y Editar, la acción principal. Al final, sacarlo de la lista.
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
    <Seccion className="flex flex-col gap-5 pb-36">
      {/* como lo ve quien regala (ver /l/[token]/item), con sus palabras: "Lo quiero mucho", "Tu nota" */}
      <article className="flex flex-col gap-5">
        <FotoDeLaFicha foto={deseo.fotoUrl} titulo={deseo.titulo} volver={lista} volverLabel={`Volver a ${grupo?.nombre ?? 'Mi lista'}`}
                       acciones={
                         // El link del deseo es el de quien regala: WhatsApp muestra la foto y el precio
                         <a target="_blank" aria-label="Mandarlo por WhatsApp" className="gr-icon-btn gr-vidrio-oscuro"
                            href={`https://wa.me/?text=${encodeURIComponent(textoDueno(deseo, `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${shareToken}/item/${deseo.id}`))}`}>
                           <Icon name="compartir" size={20} strokeWidth={2.2} />
                         </a>
                       } />
        <NombreDeLaFicha titulo={deseo.titulo} categoria={deseo.categoria} lista={grupo?.nombre ?? 'Mi lista'} precio={precio} />
        <FichasDeseo deseo={deseo} voz="propia" />
        {deseo.notas && <NotaDeseo notas={deseo.notas} quien={grupo ? 'La nota' : 'Tu nota'} />}
        {deseo.videoUrl && <VideoDeseo url={deseo.videoUrl} titulo={deseo.titulo} />}
      </article>

      <BarraDeLaFicha secundaria={deseo.linkTienda && <BotonTienda link={deseo.linkTienda} tienda={tienda} />}>
        <Link href={`/editar/${deseo.id}`} className="gr-btn-primary">Editar</Link>
      </BarraDeLaFicha>

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
