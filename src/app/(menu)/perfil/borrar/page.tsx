import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { borrarCuentaAction } from '@/app/actions'
import { CUENTA_ELIMINADA, loQueCambiaAlBorrar } from '@/lib/cuenta'
import { juntarNombres } from '@/lib/groups'
import { existeUsuario } from '@/lib/users'
import { BotonEnviar } from '@/components/BotonEnviar'
import { PageHeader, Seccion } from '@/components/ui'

export const metadata: Metadata = { title: 'Borrar mi cuenta' }

const entreComillas = (nombres: string[]) => juntarNombres(nombres.map((n) => `“${n}”`))

/**
 * El paso antes de borrar la cuenta: qué pasa exactamente (ver borrarCuenta), con lo que le toca a esta persona (los
 * regalos grupales que organiza, sus cuentas, sus amigos invisibles, sus listas en común), y la confirmación: escribir
 * BORRAR. De lo que otros reservaron en su lista no dice nada que dependa de si lo hicieron: las mismas líneas para todos.
 */
export default async function BorrarCuenta({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const [{ aviso }, session] = await Promise.all([searchParams, auth()])
  if (!session?.userId || !(await existeUsuario(db, session.userId))) redirect('/')
  const c = await loQueCambiaAlBorrar(db, session.userId)

  return (
    <Seccion className="flex flex-col gap-5 pb-48 pt-2">
      <PageHeader title="Borrar mi cuenta" back="/perfil" backLabel="Volver a tu perfil" />

      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl leading-tight font-semibold">Esto no se puede deshacer.</h2>
        <p className="text-[15px] leading-snug text-gr-muted">Leelo antes: te contamos qué se borra y qué queda para los demás.</p>
      </div>

      <section className="flex flex-col gap-2.5">
        <h2 className="gr-heading">Lo que se borra</h2>
        <ul className="gr-card flex list-disc flex-col gap-2.5 py-4 pl-9 pr-4 text-[15px] leading-snug">
          <li>Tu lista y todos tus deseos, con sus fotos.</li>
          <li>Tu perfil: tu nombre, tu mail, tu foto, tu cumple, tus gustos y talles, tu @usuario y tu alias.</li>
          <li>Tus amigos, tus solicitudes y las listas que seguías. Para ellos desaparecés de su gente.</li>
          <li>Tus avisos, y los dispositivos donde los habías activado.</li>
          <li>Lo que reservaste sin comprar en listas de otros: se libera, así lo puede regalar otra persona.</li>
          {c.regalosAbiertos > 0 && (
            <li>
              {c.regalosAbiertos === 1 ? 'El regalo grupal que organizás y todavía no compraste: se cancela' : `Los ${c.regalosAbiertos} regalos grupales que organizás y todavía no compraste: se cancelan`}, y
              a los que se sumaron les llega el aviso.
            </li>
          )}
          {c.juegosSinSortear.length > 0 && (
            <li>
              {c.juegosSinSortear.length === 1 ? 'El amigo invisible' : 'Los amigos invisibles'} {entreComillas(c.juegosSinSortear)}, que organizás y todavía no
              sorteaste: se {c.juegosSinSortear.length === 1 ? 'cancela' : 'cancelan'} y les avisamos a los que estaban.
            </li>
          )}
          {c.listasSolo.length > 0 && (
            <li>
              {c.listasSolo.length === 1 ? 'La lista en común' : 'Las listas en común'} {entreComillas(c.listasSolo)}, que armás vos solo: se{' '}
              {c.listasSolo.length === 1 ? 'borra' : 'borran'} con sus deseos.
            </li>
          )}
        </ul>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="gr-heading">Lo que queda, sin tu nombre</h2>
        <ul className="gr-card flex list-disc flex-col gap-2.5 py-4 pl-9 pr-4 text-[15px] leading-snug">
          <li>
            Lo que ya marcaste como comprado en listas de otros sigue figurando comprado, para que nadie lo compre de nuevo.
            En vez de tu nombre dice “{CUENTA_ELIMINADA}”.
          </li>
          {c.enCuentas && (
            <li>
              Tus cuentas de regalos grupales ya comprados no se borran, porque también son de los demás: lo que debés o te
              deben queda a nombre de “{CUENTA_ELIMINADA}”, y ya no vas a poder verlo ni saldarlo desde acá. Si podés,{' '}
              <Link href="/cuentas" className="font-semibold underline underline-offset-2">arreglá tus cuentas</Link> antes.
            </li>
          )}
          {c.juegosSorteadosQueOrganiza.length > 0 && (
            <li>
              {c.juegosSorteadosQueOrganiza.length === 1 ? 'El amigo invisible' : 'Los amigos invisibles'} {entreComillas(c.juegosSorteadosQueOrganiza)} ya{' '}
              {c.juegosSorteadosQueOrganiza.length === 1 ? 'está sorteado: sigue' : 'están sorteados: siguen'} como está, y los demás conservan a quién les
              tocó. En tu lugar queda “{CUENTA_ELIMINADA}” y nadie más lo va a poder organizar.
            </li>
          )}
          {c.juegaEnOtros && (
            <li>De los amigos invisibles en los que jugás te bajás: a quien le tocabas le toca otra persona, o se sortea de nuevo.</li>
          )}
          {c.listasConOtros.length > 0 && (
            <li>
              Salís de {c.listasConOtros.length === 1 ? 'la lista en común' : 'las listas en común'} {entreComillas(c.listasConOtros)}: la lista y sus deseos
              siguen para los que la arman con vos.
            </li>
          )}
          {/* igual para todos, haya o no quien le regale: no cuenta nada de la sorpresa */}
          <li>
            A quien tuviera algo reservado en tu lista le avisamos que la lista ya no está. Y si varias personas ya compraron
            juntas algo para vos, sus cuentas entre ellas siguen: de ese deseo queda solo el nombre.
          </li>
        </ul>
      </section>

      <p className="text-[15px] leading-snug">
        Si después querés volver, entrás con Google y empezás de cero: es una cuenta nueva. Antes de borrar podés{' '}
        <a href="/api/perfil/datos" download className="font-semibold underline underline-offset-2">descargar tus datos</a>.
      </p>

      <form id="confirmar" action={borrarCuentaAction} className="gr-card flex scroll-mt-6 flex-col gap-3 p-4">
        <label htmlFor="confirmar-campo" className="text-base font-semibold">Para confirmar, escribí BORRAR</label>
        <input id="confirmar-campo" name="confirmar" required autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
               placeholder="BORRAR" aria-describedby={aviso ? 'confirmar-aviso' : undefined} className="gr-input" />
        {aviso === 'palabra' && <p id="confirmar-aviso" role="alert" className="text-[13px] font-semibold text-red-700">No se borró nada: escribí la palabra BORRAR para confirmar.</p>}
        {aviso === 'error' && <p id="confirmar-aviso" role="alert" className="text-[13px] font-semibold text-red-700">No pudimos borrar tu cuenta y no se borró nada. Probá de nuevo en un rato.</p>}
        <BotonEnviar pendiente="Borrando…" className="gr-btn h-12 w-full border-red-600 bg-red-600 text-white">Borrar mi cuenta para siempre</BotonEnviar>
        <Link href="/perfil" className="gr-link self-center">Mejor no</Link>
      </form>
    </Seccion>
  )
}
