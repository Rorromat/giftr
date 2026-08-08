import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { getItemForViewer } from '@/lib/lists'
import { getViewer } from '@/lib/viewer'
import { boughtAction, commentAction, releaseAction } from '@/app/actions'
import { GuestGate } from '@/components/GuestGate'

export default async function DetalleItem({ params }: { params: Promise<{ token: string; itemId: string }> }) {
  const { token, itemId } = await params
  const viewer = await getViewer()
  const detalle = await getItemForViewer(db, token, itemId, viewer)
  if (!detalle) notFound()
  if (detalle.role === 'owner') redirect('/mi-lista')

  const { item, comments, ownerNombre } = detalle
  const identified = !!viewer.userId || !!viewer.guestId
  const miClaim = item.claims.find((c) => c.esMia && c.estado === 'reservado')

  return (
    <main className="pt-6">
      <Link href={`/l/${token}`} className="text-sm text-stone-400">← Volver a la lista</Link>
      {item.fotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- PoC: remote host images, no next/image config
        <img src={item.fotoUrl} alt="" className="mt-4 w-full rounded-2xl object-cover" />
      )}
      <h1 className="mt-4 text-2xl font-bold">{item.titulo}</h1>
      <p className="text-lg text-stone-600">{item.precio ?? item.rangoPrecio ?? ''}</p>
      {item.notas && <p className="mt-2 rounded-xl bg-orange-50 p-3 text-sm">📝 {ownerNombre} dice: {item.notas}</p>}
      {item.linkTienda && <a href={item.linkTienda} target="_blank" className="mt-2 block text-sm text-[#E2725B] underline">Ver en la tienda ↗</a>}

      <section className="mt-4 space-y-2">
        {item.claims.map((c) => (
          <p key={c.id} className="text-sm text-stone-600">
            {c.estado === 'comprado' ? '✓' : '🔒'} {c.esMia ? 'Vos' : c.claimerNombre} lo {c.estado === 'comprado' ? 'compró' : 'reservó'}
            {c.notaQueCompre && <span className="text-stone-400"> — compró: {c.notaQueCompre}</span>}
          </p>
        ))}

        {item.disponible && !miClaim && <GuestGate token={token} itemId={item.id} identified={identified} />}

        {miClaim && (
          <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
            <form action={boughtAction} className="flex gap-2">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="claimId" value={miClaim.id} />
              <input name="nota" placeholder="¿Qué compraste? (opcional)" className="flex-1 rounded-xl border border-stone-300 p-2 text-sm" />
              <button className="rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white">Ya lo compré</button>
            </form>
            <form action={releaseAction}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="claimId" value={miClaim.id} />
              <button className="text-sm text-stone-400 underline">Liberar reserva</button>
            </form>
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">🤫 Esto no lo ve {ownerNombre}</h2>
        <ul className="mt-2 space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl bg-white p-3 text-sm shadow-sm">
              <span className="font-medium">{c.autorNombre}:</span> {c.texto}
            </li>
          ))}
        </ul>
        {identified ? (
          <form action={commentAction} className="mt-3 flex gap-2">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="itemId" value={item.id} />
            <input name="texto" required placeholder="Coordiná con los demás…" className="flex-1 rounded-xl border border-stone-300 p-2 text-sm" />
            <button className="rounded-xl bg-stone-800 px-3 py-2 text-sm text-white">Enviar</button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-stone-400">Reservá algo para participar de la coordinación.</p>
        )}
      </section>
    </main>
  )
}
