import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { db } from '@/db'
import { CUENTAS_COOKIE, GUEST_COOKIE, NO_SOY_COOKIE } from '@/lib/cookie-invitado'
import { invitadoParaUnir, nombreDelInvitado, viewerDeCookie } from '@/lib/guest'
import type { Viewer } from '@/lib/types'
import { existeUsuario } from '@/lib/users'

export async function getViewer(): Promise<Viewer> {
  const session = await auth()
  // La sesión de un usuario que ya no está en la base (restauraron la base o cambiaron de branch) es como no tener
  // sesión, igual que la cookie de un invitado que no existe: seguir la lista o reservar fallarían por la FK, y si
  // ahora es otra cuenta, vería su propia lista como regaladora. Las pantallas del menú leen la sesión directo: ahí "/"
  // la manda a entrar de nuevo (ver asegurarListaPropia), y unirse o crear un grupo con esa sesión fallaría, pero hace
  // falta además el link: no vale una consulta más en cada auth().
  if (session?.userId && await existeUsuario(db, session.userId)) return { userId: session.userId }
  const jar = await cookies()
  return viewerDeCookie(db, jar.get(GUEST_COOKIE)?.value, jar.get(CUENTAS_COOKIE)?.value)
}

/** Con sesión, el nombre del invitado de este navegador por el que hay que preguntarle ("¿Sos vos?"), si hay. */
export async function invitadoParaPreguntar(userId: string): Promise<string | null> {
  const jar = await cookies()
  const g = await invitadoParaUnir(db, userId, jar.get(GUEST_COOKIE)?.value, jar.get(NO_SOY_COOKIE)?.value)
  return g?.nombre ?? null
}

/** En Perfil: el invitado anotado en este navegador, para unirlo aunque se haya contestado "No soy yo" por error. */
export async function invitadoDeEsteNavegador(): Promise<string | null> {
  return nombreDelInvitado(db, (await cookies()).get(GUEST_COOKIE)?.value)
}
