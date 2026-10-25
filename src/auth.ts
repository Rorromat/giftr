import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { cookies } from 'next/headers'
import { db } from '@/db'
import { upsertUserFromGoogle } from '@/lib/users'
import { anotarCuenta } from '@/lib/cookie-invitado'
import { asegurarUsuario, reclamarSolicitudesPorMail } from '@/lib/amigos'

declare module '@auth/core/types' {
  interface Session {
    userId?: string
  }
}

/**
 * Anota que esta cuenta tuvo sesión en este navegador: si después queda la cookie de un invitado (cerró sesión o se le
 * venció), ese invitado no ve la capa oculta de sus listas (ver accesoALista). Corre dentro del route handler de
 * /api/auth/callback, donde se pueden escribir cookies. Nunca impide entrar.
 */
async function anotarCuentaEnEsteNavegador(userId: string) {
  try {
    anotarCuenta(await cookies(), userId)
  } catch (e) {
    console.error('No se pudo anotar la cuenta en el navegador:', e)
  }
}

/**
 * Al entrar: su @usuario (si no tenía, uno sacado del nombre) y las solicitudes de amistad que esperaban a su mail (Google
 * ya verificó que es suyo). Nunca impide entrar.
 */
async function prepararAmigos(userId: string, email: string) {
  try {
    await asegurarUsuario(db, userId)
    await reclamarSolicitudesPorMail(db, userId, email)
  } catch (e) {
    console.error('No se pudieron preparar los amigos al entrar:', e)
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // select_account: después de "Cerrar sesión" en un dispositivo compartido, Google deja elegir otra cuenta
  // en vez de volver a entrar con la misma sin preguntar.
  providers: [Google({ authorization: { params: { prompt: 'select_account' } } })],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile }) {
      // con account: es el momento de entrar (no una sesión que ya existía)
      if (account && profile?.sub && profile.email) {
        const user = await upsertUserFromGoogle(db, {
          googleId: profile.sub,
          email: profile.email,
          nombre: profile.name ?? profile.email,
          avatarUrl: (profile as { picture?: string }).picture ?? null,
        })
        token.userId = user.id
        await anotarCuentaEnEsteNavegador(user.id)
        await prepararAmigos(user.id, profile.email)
        // Si en este navegador había un invitado, no se une acá: en un dispositivo compartido puede ser otra persona.
        // Se le pregunta después, ya adentro ("¿Sos vos?", en PreguntaInvitado).
      }
      return token
    },
    async session({ session, token }) {
      session.userId = token.userId as string
      return session
    },
  },
})
