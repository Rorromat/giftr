import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { addItemAction } from '@/app/actions'
import { nombresDeMisGrupos } from '@/lib/groups'
import { compartidoAutomatico, ID_COMPARTIDO, loCompartido, rutaAgregar, VUELTA_MAX } from '@/lib/recibir-compartido'
import { DeseoForm } from '@/components/DeseoForm'
import { BackLink } from '@/components/ui'

type Valor = string | string[] | undefined
/** Lo que llega repetido (?link=a&link=b) no se toma. */
const uno = (v: Valor) => (typeof v === 'string' ? v : undefined)

export default async function Agregar({ searchParams }: {
  searchParams: Promise<{ lista?: Valor; compartido?: Valor; link?: Valor; texto?: Valor; foto?: Valor; auto?: Valor }>
}) {
  const [session, q, pedido] = await Promise.all([auth(), searchParams, headers()])
  // Lo compartido desde otra app (ver src/app/compartir/route.ts y public/sw.js): el id de lo que guardó el service worker,
  // o el link o el texto en la URL, que cualquiera puede armar y se vuelve a revisar acá.
  const id = uno(q.compartido)
  const buzon = id && ID_COMPARTIDO.test(id) ? id : undefined
  const enUrl = buzon ? null : loCompartido({ url: uno(q.link), text: uno(q.texto) })
  const sinFoto = uno(q.foto) === 'no'
  const automatico = compartidoAutomatico({ sitio: pedido.get('sec-fetch-site'), buzon, auto: uno(q.auto) })
  const hayCompartido = !!buzon || !!enUrl || sinFoto
  if (!session?.userId) {
    if (!hayCompartido) redirect('/')
    // entra con Google y vuelve con lo compartido (si la vuelta no entra en la cookie de Auth.js, vuelve sin eso)
    const vuelta = rutaAgregar({ buzon, auto: automatico, compartido: enUrl, sinFoto })
    redirect(vuelta.length <= VUELTA_MAX ? `/?volver=${encodeURIComponent(vuelta)}` : '/')
  }
  // Con grupos se elige la lista; ?lista=<id> llega preseleccionada desde la pantalla del grupo.
  const grupos = await nombresDeMisGrupos(db, session.userId)
  const lista = uno(q.lista)
  const desdeGrupo = grupos.find((g) => g.id === lista)

  return (
    <main className="gr-hoja pb-8 pt-[52px]">
      <div className="flex items-center gap-3.5">
        <BackLink href={desdeGrupo ? `/grupos/${desdeGrupo.id}` : '/mi-lista'} label={`Volver a ${desdeGrupo?.nombre ?? 'Mi lista'}`} />
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-[30px] leading-none font-extrabold tracking-[-0.04em]">Agregar deseo</h1>
          <p className="text-sm font-medium">Menos de 30 segundos, prometido.</p>
        </div>
      </div>

      <DeseoForm action={addItemAction} grupos={grupos} grupoElegido={desdeGrupo?.id} boton="Agregar a mi lista"
                 compartido={hayCompartido ? { buzon, link: enUrl?.link, titulo: enUrl?.titulo, notas: enUrl?.notas, automatico, sinFoto } : undefined} />
    </main>
  )
}
