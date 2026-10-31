import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { misAmigos, personas } from '@/lib/amigos'
import { hoyLocal } from '@/lib/events'
import { duenoDelLink } from '@/lib/sorpresas'
import { ElegirParaQuien, FormSorpresa, type ParaDelForm } from '@/components/Sorpresas'
import { PageHeader } from '@/components/ui'

type Valor = string | string[] | undefined
/** Lo que llega repetido (?amigo=a&amigo=b) no se toma. */
const uno = (v: Valor) => (typeof v === 'string' ? v : undefined)

/**
 * Armar una sorpresa: un regalo que no está en la lista de nadie, para dividir entre varios. Para quién llega elegido desde
 * su lista (?para=<link de su lista, de una persona o en común>) o se elige acá: un amigo (?amigo=<id>) o alguien sin
 * GiftR (?sin=1).
 */
export default async function NuevaSorpresa({ searchParams }: {
  searchParams: Promise<{ para?: Valor; amigo?: Valor; sin?: Valor; error?: Valor }>
}) {
  const [session, q] = await Promise.all([auth(), searchParams])
  if (!session?.userId) redirect('/')
  const yo = session.userId
  const amigos = (await personas(db, [...await misAmigos(db, yo)])).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const [token, amigo] = [uno(q.para), uno(q.amigo)]
  const dueno = token ? await duenoDelLink(db, token, yo) : null
  const elegido = amigo ? amigos.find((a) => a.id === amigo) : undefined
  const para: ParaDelForm | null = dueno && token ? { tipo: 'lista', token, nombre: dueno.nombre, enComun: dueno.enComun }
    : elegido ? { tipo: 'amigo', id: elegido.id, nombre: elegido.nombre }
      : uno(q.sin) === '1' ? { tipo: 'sin' } : null
  // al que la recibe (o a los que arman la lista en común) no se le propone: es para él
  const excluir = dueno?.excluir ?? (elegido ? [elegido.id] : [])
  const titulo = para && para.tipo !== 'sin' ? `Sorpresa para ${dueno?.enComun ? para.nombre : para.nombre.split(' ')[0]}` : 'Una sorpresa'
  const volver = para?.tipo === 'lista' ? `/l/${para.token}` : para ? '/sorpresa/nueva' : '/gente'

  return (
    <main className="gr-hoja flex flex-col gap-1 pt-2 pb-8">
      <PageHeader title={titulo} back={volver} backLabel="Volver" />
      {para ? (
        <FormSorpresa para={para} amigos={amigos.filter((a) => !excluir.includes(a.id))} hoy={hoyLocal().toISOString().slice(0, 10)}
                      error={uno(q.error) === '1'} />
      ) : (
        <div className="mt-1 flex flex-col gap-4">
          <p className="text-[15px] leading-snug text-gr-muted">
            Un regalo que no está en su lista, para dividirlo con amigos. El que lo recibe no lo ve.
          </p>
          <h2 className="gr-heading">¿Para quién?</h2>
          <ElegirParaQuien amigos={amigos} />
        </div>
      )}
    </main>
  )
}
