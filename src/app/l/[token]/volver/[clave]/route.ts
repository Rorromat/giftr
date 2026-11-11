import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/db'
import { anotarCuenta, CUENTAS_COOKIE, firmarInvitado, GUEST_COOKIE, OPCIONES_COOKIE_INVITADO, renovarCuentas } from '@/lib/cookie-invitado'
import { invitadoQueVuelve, viewerDeCookie } from '@/lib/guest'
import { existeUsuario } from '@/lib/users'

// "Guardate este link para volver a tu reserva desde otro teléfono" (ver LinkParaVolver): la abuela reservó el Termo desde
// el navegador de WhatsApp y después abre la lista en Chrome, donde no tiene su cookie. El link se la vuelve a poner y la
// deja en la lista, como estaba.
// Es un GET que pone una cookie, así que no hace nada más: no escribe en la base (lo abre también la vista previa de
// WhatsApp) y qué se ve después lo decide la lista como siempre (accesoALista). En particular:
// - Nunca pisa a otro invitado que ya esté en este navegador: su cookie es lo único que lo identifica, y si no, mandarle a
//   alguien "tu" link lo dejaba reservando a tu nombre y sin poder manejar lo suyo. Se le avisa y elige él (ver la página).
// - En un navegador donde tuvo sesión alguien de esta lista, la cookie queda pero la lista no muestra nada ("otra_cuenta"):
//   el link no le sirve a la dueña para mirar. Con sesión se anota esa cuenta acá, por si era de antes de que se anotaran.
// - Con sesión de Google, la lista pregunta "¿Sos vos?" (PreguntaInvitado) y con "Sí, soy yo" la reserva pasa a la cuenta.
export async function GET(_: Request, { params }: { params: Promise<{ token: string; clave: string }> }) {
  const { token, clave } = await params
  const vuelve = await invitadoQueVuelve(db, token, clave)
  if (!vuelve) redirect(`/l/${encodeURIComponent(token)}/volver?motivo=no`)

  const [jar, session] = await Promise.all([cookies(), auth()])
  const { guestId: yaAnotado } = await viewerDeCookie(db, jar.get(GUEST_COOKIE)?.value, jar.get(CUENTAS_COOKIE)?.value)
  if (yaAnotado && yaAnotado !== vuelve.guestId) redirect(`/l/${token}/volver?motivo=otro&clave=${clave}`)

  if (session?.userId && await existeUsuario(db, session.userId)) anotarCuenta(jar, session.userId)
  jar.set(GUEST_COOKIE, firmarInvitado(vuelve.guestId), OPCIONES_COOKIE_INVITADO)
  // como al anotarse: las cuentas anotadas no vencen antes que esta cookie (ver viewerIdentificandoGuest)
  renovarCuentas(jar)
  redirect(`/l/${token}`)
}
