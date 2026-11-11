import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { addItemAction } from '@/app/actions'
import { nombresDeMisGrupos } from '@/lib/groups'
import { yaAnotoUnDeseo } from '@/lib/bienvenida'
import { compartidoAutomatico, ID_COMPARTIDO, loCompartido, rutaAgregar, VUELTA_MAX } from '@/lib/recibir-compartido'
import { DeseoForm } from '@/components/DeseoForm'
import { PageHeader } from '@/components/ui'

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
  const [grupos, yaAnoto] = await Promise.all([nombresDeMisGrupos(db, session.userId), yaAnotoUnDeseo(db, session.userId)])
  const lista = uno(q.lista)
  const desdeGrupo = grupos.find((g) => g.id === lista)
  // El primero de su lista (acá llega derecho desde la bienvenida): se lo invita, y se le dice qué sigue. Si ya trae algo
  // compartido desde una tienda, no hace falta: el formulario llega con eso puesto.
  const primero = !yaAnoto && !desdeGrupo && !hayCompartido

  return (
    <main className="gr-hoja flex flex-col gap-1 pt-2">
      <PageHeader title={primero ? 'Tu primer deseo' : 'Nuevo deseo'} back={desdeGrupo ? `/grupos/${desdeGrupo.id}` : '/mi-lista'}
                  backLabel={`Volver a ${desdeGrupo?.nombre ?? 'Mi lista'}`} />
      {primero && (
        <div className="flex flex-col gap-1 px-1 pb-1 text-center">
          <p className="text-[22px] leading-tight font-semibold tracking-[-0.02em]">Empecemos por lo primero que se te ocurra</p>
          <p className="text-sm leading-snug text-gr-muted">Pegá el link de una tienda o escribilo. Después le mandás la lista a tu gente.</p>
        </div>
      )}

      <DeseoForm action={addItemAction} grupos={grupos} grupoElegido={desdeGrupo?.id} boton="Agregar a mi lista"
                 compartido={hayCompartido ? { buzon, link: enUrl?.link, titulo: enUrl?.titulo, notas: enUrl?.notas, automatico, sinFoto } : undefined} />
    </main>
  )
}
