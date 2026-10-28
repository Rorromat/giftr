import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { commentAction } from '@/app/actions'
import { getViewer } from '@/lib/viewer'
import { sorpresaParaViewer } from '@/lib/sorpresas'
import { amigosParaDividir, invitadosDeRegalo } from '@/lib/invitaciones'
import { fechaLarga } from '@/lib/events'
import { enDolares, parseDolares, parsePesos } from '@/lib/pesos'
import { LARGO } from '@/lib/limites'
import { BotonEnviar } from '@/components/BotonEnviar'
import { InvitadosDelRegalo } from '@/components/Dividir'
import { FotoAmpliable } from '@/components/FotoAmpliable'
import { VideoDeseo } from '@/components/VideoDeseo'
import { EntrarConGoogle } from '@/components/Identidad'
import { RegaloGrupal } from '@/components/RegaloGrupal'
import { EtiquetaSorpresa } from '@/components/Sorpresas'
import { Icon, ItemPhoto, LogoSticker, PageHeader } from '@/components/ui'

// El link de una sorpresa no dice qué es ni para quién: puede terminar en un chat donde está quien la recibe.
export const metadata: Metadata = {
  title: 'Una sorpresa',
  description: 'Le están armando un regalo a alguien en GiftR. Entrá con tu cuenta para verlo.',
  robots: { index: false },
}

const primerNombre = (n: string) => n.split(' ')[0]

/**
 * Una sorpresa (ver sorpresas.ts): qué le regalan, el regalo grupal para sumarse o dividirlo, y el hilo para coordinar.
 * Solo con sesión, y nunca para quien la recibe (para él, el link no es nada: 404).
 */
export default async function Sorpresa({ params, searchParams }: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ regalo?: string }>
}) {
  const [{ token }, { regalo: deRegalo }] = await Promise.all([params, searchParams])
  const viewer = await getViewer()
  const s = await sorpresaParaViewer(db, token, viewer)
  if (!s) notFound()

  if (s.estado === 'sin_sesion') {
    return (
      <main className="flex flex-col gap-4 pb-12 pt-2">
        <header className="flex min-h-14 items-center justify-center"><LogoSticker /></header>
        <section className="gr-card flex flex-col gap-3 p-4">
          <p aria-hidden className="text-4xl">🤫</p>
          <h1 className="text-xl leading-tight font-semibold">Es una sorpresa</h1>
          <p className="text-sm leading-snug">
            Le están armando un regalo a alguien. Para verlo y sumarte, entrá con tu cuenta: así nos aseguramos de que no
            sea para vos.
          </p>
          <EntrarConGoogle volver={`/sorpresa/${token}`} />
        </section>
      </main>
    )
  }

  // el nombre de alguien sin GiftR va como lo escribieron ("la abuela Marta")
  const quien = s.para.userId ? primerNombre(s.para.nombre) : s.para.nombre
  const volver = s.para.token ? { href: `/l/${s.para.token}`, label: `Volver a la lista de ${quien}` } : { href: '/regalos', label: 'Volver a Regalos' }

  if (s.estado === 'cancelada') {
    return (
      <main className="flex flex-col gap-4 pb-36 pt-2">
        <PageHeader title={`Sorpresa para ${quien}`} back={volver.href} backLabel={volver.label} />
        <p className="gr-empty py-8 text-center">Esta sorpresa se canceló: quien la armó la dio de baja.</p>
      </main>
    )
  }

  const { item, regalos, comments } = s
  const yo = viewer.userId!
  // a quiénes se lo propuso el que la organiza y qué contestaron, y proponérsela a más (también ya comprada: el que se suma
  // después entra y se vuelve a dividir)
  const mio = regalos.find((r) => r.soyEncargado)
  const organizo = mio?.estado === 'abierto' ? mio : undefined
  const [amigos, invitados] = mio
    ? await Promise.all([amigosParaDividir(db, yo, item.id), invitadosDeRegalo(db, mio.id)])
    : [[], []]
  const yaEstan = new Set([...(mio?.miembros.map((m) => m.userId) ?? []), ...invitados.map((i) => i.persona.id)])
  const precio = item.precio ?? item.rangoPrecio
  const enUnRegalo = regalos.some((r) => r.soyParte)
  const cuando = s.fecha && `${s.para.userId ? 'Su cumple' : 'Es'} ${s.fecha.dias === 0 ? 'hoy' : s.fecha.dias === 1 ? 'mañana' : `en ${s.fecha.dias} días`} · ${fechaLarga(s.fecha.fecha)}`

  return (
    <main className="flex flex-col gap-4 pb-36 pt-2">
      <PageHeader title={`Sorpresa para ${quien}`} back={volver.href} backLabel={volver.label} />

      <section className="flex flex-col gap-1.5 rounded-[18px] bg-gr-brand px-4 py-3 text-sm font-medium text-gr-on-brand">
        <p className="flex items-start gap-2.5">
          <span aria-hidden>🤫</span>
          {s.para.userId ? `${quien} no la ve: solo los que le regalan.` : 'No usa GiftR: la ven los que la arman.'}
        </p>
        {cuando && <p className="flex items-center gap-2 text-gr-on-brand/80"><Icon name="cake" size={16} className="flex-none" />{cuando}</p>}
      </section>

      <article className="gr-card">
        <div className="relative">
          <FotoAmpliable src={item.fotoUrl} titulo={item.titulo}>
            <ItemPhoto src={item.fotoUrl} titulo={item.titulo} height={260} />
          </FotoAmpliable>
          <EtiquetaSorpresa className="pointer-events-none absolute left-3 top-3" />
        </div>
        <div className="flex flex-col gap-3 p-3.5">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl leading-tight font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">{item.titulo}</h1>
            {precio && <p className="text-lg font-semibold">{precio}</p>}
            <p className="text-[13px] text-gr-muted">La propuso {s.creador}</p>
          </div>
          {item.notas && (
            <p className="rounded-2xl bg-gr-soft px-3 py-2.5 text-sm leading-snug [overflow-wrap:anywhere]">
              <span className="font-semibold">{primerNombre(s.creador)} dice:</span> {item.notas}
            </p>
          )}
          {item.videoUrl && <VideoDeseo url={item.videoUrl} titulo={item.titulo} />}
          {(item.linkTienda || s.esCreador) && (
            <div className="flex flex-wrap gap-2">
              {item.linkTienda && (
                <a href={item.linkTienda} target="_blank" className="gr-btn text-sm">
                  Ver en la tienda <Icon name="external" size={16} strokeWidth={2} />
                </a>
              )}
              {/* la armó el que mira: la puede cambiar (a los que están les avisa) */}
              {s.esCreador && <Link href={`/sorpresa/${token}/editar`} className="gr-btn text-sm">Editar</Link>}
            </div>
          )}
        </div>
      </article>

      {deRegalo === 'sumado' && enUnRegalo && (
        <p role="status" className="flex items-start gap-2.5 rounded-[18px] bg-gr-accent px-4 py-3 text-sm font-medium">
          <Icon name="check" size={18} strokeWidth={2.6} className="mt-px flex-none" />
          {regalos.some((r) => r.soyParte && r.estado === 'comprado')
            ? '¡Listo, te sumaste! Ya estaba comprada: abajo ves cuánto te toca.'
            : '¡Listo, te sumaste! Se divide en partes iguales entre los que estén.'}
        </p>
      )}

      <div id="regalo" className="flex scroll-mt-6 flex-col gap-2.5">
        {regalos.map((r) => (
          <RegaloGrupal key={r.id} regalo={r} token={token} itemId={item.id} titulo={item.titulo} ownerNombre={quien} sorpresa
                        precio={enDolares(precio) ? parseDolares(precio) : parsePesos(precio)} monedaPrecio={enDolares(precio) ? 'USD' : 'ARS'}
                        logueado nota={s.nota}
                        invitar={r.id === mio?.id && (
                          <InvitadosDelRegalo token={token} itemId={item.id} giftId={r.id} invitados={invitados}
                                              paraInvitar={amigos.filter((a) => !yaEstan.has(a.id))} />
                        )}
                        sinContestar={r.id === organizo?.id ? invitados.filter((i) => i.estado === 'esperando').map((i) => i.persona.nombre) : []} />
        ))}
      </div>

      <section className="mt-2 flex flex-col gap-3">
        <h2 className="flex items-center gap-2 self-start rounded-full bg-gr-brand px-3.5 py-2 text-sm font-semibold text-gr-bg">
          <Icon name="lock" size={16} strokeWidth={2} className="text-gr-accent" />
          {s.para.userId ? `Esto no lo ve ${quien}` : 'Para coordinar entre ustedes'}
        </h2>
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-2xl border border-gr-line bg-gr-surface px-3 py-2.5 text-sm [overflow-wrap:anywhere]">
              <span className="font-semibold">{c.autorNombre}:</span> {c.texto}
            </li>
          ))}
        </ul>
        <form action={commentAction} className="flex gap-2">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="itemId" value={item.id} />
          <input name="texto" required maxLength={LARGO.comentario} placeholder="Coordiná con los demás…" className="gr-input min-w-0 flex-1 shadow-none" />
          <BotonEnviar className="gr-btn bg-gr-brand text-gr-accent min-h-[50px] px-4 text-[15px]">Enviar</BotonEnviar>
        </form>
      </section>

      {s.para.token && (
        <Link href={`/l/${s.para.token}`} className="self-center text-sm font-semibold underline underline-offset-4">
          Ver la lista de {quien}
        </Link>
      )}
    </main>
  )
}
