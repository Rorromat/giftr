import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { pedirAmistadAction } from '@/app/actions'
import { asegurarUsuario, buscarPorUsuario, miAmigoToken, normalizarEmail, normalizarUsuario, relacionCon } from '@/lib/amigos'
import { AvisoAmigo, InvitarAmigos, PersonaFila } from '@/components/Amigos'
import { BotonEnviar } from '@/components/BotonEnviar'
import { Icon, PageHeader, Seccion } from '@/components/ui'

/**
 * Agregar un amigo: se busca por su @usuario (se ve quién es antes de mandarle la solicitud) o se escribe su mail (no
 * se dice si tiene cuenta: le llega ahora o cuando entre con ese mail). Abajo, el link de amigo para mandar por WhatsApp.
 */
export default async function AgregarAmigo({ searchParams }: { searchParams: Promise<{ q?: string; amigo?: string }> }) {
  const { q: escrito = '', amigo } = await searchParams
  const session = await auth()
  if (!session?.userId) redirect('/')
  const yo = session.userId
  const q = typeof escrito === 'string' ? escrito.trim().slice(0, 254) : ''
  const email = normalizarEmail(q)
  const usuario = email ? null : normalizarUsuario(q)
  const [encontrado, miUsuario, token] = await Promise.all([
    usuario ? buscarPorUsuario(db, usuario) : null, asegurarUsuario(db, yo), miAmigoToken(db, yo),
  ])
  const relacion = encontrado ? await relacionCon(db, yo, encontrado.id) : null
  const volver = `/gente/agregar?q=${encodeURIComponent(q)}`

  return (
    <Seccion className="flex flex-col gap-5 pb-36 pt-2">
      <PageHeader title="Agregar amigo" back="/gente" backLabel="Volver a tu gente" />

      <form action="/gente/agregar" className="flex flex-col gap-2">
        <label htmlFor="quien" className="text-sm font-semibold">Su @usuario o su mail</label>
        <div className="flex gap-2">
          <input id="quien" name="q" defaultValue={q} required maxLength={254} autoComplete="off" autoCapitalize="none"
                 spellCheck={false} placeholder="@usuario o nombre@mail.com" className="gr-input min-w-0 flex-1" />
          <button className="gr-btn-primary gr-btn--sm flex-none">Buscar</button>
        </div>
        <p className="text-[13px] text-gr-muted">Si acepta, se ven las listas y los cumples.</p>
      </form>

      <AvisoAmigo amigo={amigo} />

      {q && !amigo && (
        email ? (
          <section className="gr-card flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="gr-row__icon"><Icon name="chat" size={20} /></span>
              <p className="min-w-0 flex-1 text-base font-semibold [overflow-wrap:anywhere]">{email}</p>
            </div>
            <p className="text-[13px] leading-snug text-gr-muted">Si ya usa GiftR con ese mail, le llega ahora. Si no, la ve cuando entre.</p>
            <form action={pedirAmistadAction}>
              <input type="hidden" name="quien" value={email} />
              <input type="hidden" name="volver" value={volver} />
              <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">Mandar solicitud</BotonEnviar>
            </form>
          </section>
        ) : encontrado && relacion ? (
          <section className="gr-card flex flex-col gap-3 p-4">
            <PersonaFila p={encontrado} size={56} />
            {relacion === 'yo' ? <p className="text-sm font-medium">Ese sos vos 🙂</p>
              : relacion === 'amigos' ? <p className="flex items-center gap-2 text-sm font-semibold"><Icon name="check" size={18} strokeWidth={2.6} />Ya son amigos</p>
              : relacion === 'enviada' ? <p className="flex items-center gap-2 text-sm font-medium"><Icon name="clock" size={18} />Ya le mandaste una solicitud</p>
              : (
                <form action={pedirAmistadAction}>
                  <input type="hidden" name="para" value={encontrado.id} />
                  <input type="hidden" name="volver" value={volver} />
                  <BotonEnviar className="gr-btn-primary gr-btn--sm w-full">{relacion === 'recibida' ? 'Aceptar su solicitud' : 'Mandar solicitud'}</BotonEnviar>
                </form>
              )}
          </section>
        ) : (
          <p className="gr-empty px-4 py-5 text-center text-sm">
            {usuario ? <>No hay nadie con <span className="font-semibold">@{usuario}</span>. Fijate cómo lo escribió, o mandale tu link de amigo.</>
              : 'Escribí su @usuario (letras, números, punto o guión bajo) o su mail.'}
          </p>
        )
      )}

      {miUsuario && (
        <p className="text-center text-[13px] text-gr-muted">
          Tu usuario es <span className="font-semibold text-gr-ink">@{miUsuario}</span> · <Link href="/perfil#usuario" className="font-semibold underline underline-offset-4">Cambiarlo</Link>
        </p>
      )}
      {token && <InvitarAmigos link={`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/amigo/${token}`} usuario={null} />}
    </Seccion>
  )
}
