import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { deseoParaEditar } from '@/lib/items'
import { dePartede } from '@/lib/post-evento'
import { DeParteDe } from '@/components/PostEvento'
import { textoDueno } from '@/lib/compartir'
import { ARCHIVAR, ARCHIVAR_APORTE, ConfirmarSacar } from '@/components/OwnerItemsGrid'
import { Icon, PageHeader, Seccion } from '@/components/ui'
import { CopiarAlias } from '@/components/CopiarAlias'
import { tipoDeAlias } from '@/lib/alias-pago'
import { pesos } from '@/lib/pesos'
import { BarraDeLaFicha, BotonTienda, FichasDeseo, FotoDeLaFicha, NombreDeLaFicha, NotaDeseo } from '@/components/FichaDeseo'
import { sitioDeLaTienda } from '@/lib/links'
import { VideoDeseo } from '@/components/VideoDeseo'
import { antiguedadDelPrecio } from '@/lib/presupuesto'

// Un deseo propio (o de un grupo propio), como lo abre quien regala pero sin nada de la coordinación: ni reservas, ni
// regalos, ni comentarios (la regla de la sorpresa). La ficha (ver FichaDeseo): la foto a sangre con compartir por WhatsApp
// arriba, y en la barra de abajo la tienda y Editar, la acción principal. Al final, sacarlo de la lista.
// Lo único de quien regala que puede aparecer: "De parte de…", si alguien eligió contarle que se lo regaló (ver revelarRegalo).
export default async function Deseo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.userId) redirect('/')
  const editable = await deseoParaEditar(db, id, session.userId)
  if (!editable) notFound()
  const { deseo, grupo, shareToken } = editable
  const deParte = grupo ? [] : await dePartede(db, deseo.id, session.userId)
  const lista = grupo ? `/grupos/${grupo.id}` : '/mi-lista'
  const precio = deseo.precio ?? deseo.rangoPrecio
  // un precio de hace más de dos meses: se lo decimos al dueño, que es el único que lo puede poner al día
  const precioDe = precio ? antiguedadDelPrecio(deseo.precioAt) : null
  const tienda = deseo.linkTienda && sitioDeLaTienda(deseo.linkTienda)
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(textoDueno(deseo, `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/l/${shareToken}/item/${deseo.id}`))}`
  // Sacarlo pide confirmar, como en la lista, y después vuelve a la lista
  const sacar = (opciones: readonly (readonly ['lo_tengo' | 'no_lo_quiero', string])[]) => (
    <div className="gr-card gr-rows">
      {opciones.map(([estado, texto]) => (
        <details key={estado} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
            {texto}
            <Icon name="chevron" size={18} className="text-gr-muted transition-transform group-open:rotate-90" />
          </summary>
          <ConfirmarSacar itemId={deseo.id} estado={estado} volver={lista} />
        </details>
      ))}
    </div>
  )

  // Un aporte en plata propio: para qué es, la meta y el alias, tal como lo ve cualquiera con el link (y se lo recuerda).
  // De quién aportó, cuánto o cuántos, nada: ni un número, ni un "ya aportaron". Esa plata la ve en su cuenta.
  if (deseo.tipo === 'aporte' && deseo.aporteAlias) {
    const tipo = tipoDeAlias(deseo.aporteAlias)
    return (
      <Seccion className="flex flex-col gap-5 pb-36 pt-2">
        <PageHeader title="Aporte en plata" titulo="p" back={lista} backLabel={`Volver a ${grupo?.nombre ?? 'Mi lista'}`}
                    action={<a target="_blank" aria-label="Mandarlo por WhatsApp" className="gr-icon-btn" href={whatsapp}><Icon name="compartir" size={20} strokeWidth={2.2} /></a>} />
        <article className="flex flex-col gap-5">
          <div className="gr-card flex flex-col items-start gap-2.5 p-5">
            <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-gr-soft text-gr-acento-texto">
              <Icon name="wallet" size={24} strokeWidth={2.2} />
            </span>
            <h1 className="gr-title text-[30px] [overflow-wrap:anywhere]">{deseo.titulo}</h1>
            <p className="text-[15px] text-gr-muted [overflow-wrap:anywhere]">{grupo?.nombre ?? 'Mi lista'}</p>
            {deseo.aporteMeta && <p className="text-[17px] font-bold tabular-nums">Meta: {pesos(deseo.aporteMeta)}</p>}
          </div>
          {deseo.notas && <NotaDeseo notas={deseo.notas} quien={grupo ? 'La nota' : 'Tu nota'} />}
          <section aria-label="A dónde transfieren" className="flex flex-col gap-1.5">
            <p className="gr-label">Transfieren a este {tipo}</p>
            <div className="flex items-center gap-2 rounded-gr-md bg-gr-soft py-1.5 pl-3.5 pr-1.5">
              <p className="min-w-0 flex-1 text-[15px] font-semibold [overflow-wrap:anywhere]">{deseo.aporteAlias}</p>
              <CopiarAlias alias={deseo.aporteAlias} texto={`Copiar ${tipo}`} />
            </div>
            <p className="flex items-start gap-2 text-[13px] leading-snug font-medium">
              <Icon name="eye" size={16} className="mt-px flex-none" />
              Lo ve cualquiera que tenga el link de la lista.
            </p>
          </section>
          <p className="flex items-start gap-2 rounded-gr-md bg-gr-soft px-3.5 py-3 text-sm leading-snug font-medium">
            <Icon name="lock" size={17} className="mt-px flex-none" />
            Acá no vas a ver quién aportó ni cuánto: es una sorpresa. La plata la ves en tu cuenta.
          </p>
        </article>
        <BarraDeLaFicha><Link href={`/editar/${deseo.id}`} className="gr-btn-primary">Editar</Link></BarraDeLaFicha>
        {sacar(ARCHIVAR_APORTE)}
      </Seccion>
    )
  }

  return (
    <Seccion className="gr-ficha flex flex-col gap-5 pb-36">
      {/* como lo ve quien regala (ver /l/[token]/item), con sus palabras: "Lo quiero mucho", "Tu nota" */}
      <article className="flex flex-col gap-5">
        <FotoDeLaFicha foto={deseo.fotoUrl} titulo={deseo.titulo} volver={lista} volverLabel={`Volver a ${grupo?.nombre ?? 'Mi lista'}`}
                       acciones={
                         // El link del deseo es el de quien regala: WhatsApp muestra la foto y el precio
                         <a target="_blank" aria-label="Mandarlo por WhatsApp" className="gr-icon-btn gr-vidrio-oscuro" href={whatsapp}>
                           <Icon name="compartir" size={20} strokeWidth={2.2} />
                         </a>
                       } />
        <NombreDeLaFicha titulo={deseo.titulo} categoria={deseo.categoria} lista={grupo?.nombre ?? 'Mi lista'} precio={precio} />
        {precioDe && (
          <p className="-mt-3 text-[13px] leading-snug text-gr-muted">
            Precio de {precioDe}.{' '}
            <Link href={`/editar/${deseo.id}`} className="gr-toque font-semibold text-gr-ink underline underline-offset-4 [overflow-wrap:anywhere]">
              ¿Sigue costando {precio}?
            </Link>
          </p>
        )}
        <FichasDeseo deseo={deseo} voz="propia" />
        {deseo.notas && <NotaDeseo notas={deseo.notas} quien={grupo ? 'La nota' : 'Tu nota'} />}
        {deseo.videoUrl && <VideoDeseo url={deseo.videoUrl} titulo={deseo.titulo} />}
      </article>

      {deParte.length > 0 && (
        <section aria-label="Te lo regalaron" className="flex flex-col gap-2">
          {deParte.map((d) => <DeParteDe key={`${d.tipo}-${d.id}-${d.de}`} d={d} />)}
          <p className="px-1 text-[13px] leading-snug text-gr-muted">Te contaron que te lo regalaron. Para sacarlo de tu lista, marcalo en Recibidos, abajo en Mi lista.</p>
        </section>
      )}

      <BarraDeLaFicha secundaria={deseo.linkTienda && <BotonTienda link={deseo.linkTienda} tienda={tienda} />}>
        <Link href={`/editar/${deseo.id}`} className="gr-btn-primary">Editar</Link>
      </BarraDeLaFicha>

      {sacar(ARCHIVAR)}
    </Seccion>
  )
}
