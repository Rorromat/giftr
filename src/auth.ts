import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { cookies } from 'next/headers'
import { db } from '@/db'
import { upsertUserFromGoogle } from '@/lib/users'
import { GUEST_COOKIE, leerInvitado } from '@/lib/cookie-invitado'
import { unirInvitadoACuenta } from '@/lib/guest'

declare module '@auth/core/types' {
  interface Session {
    userId?: string
  }
}

/**
 * Si en este navegador era invitado, ese invitado se une a la cuenta y se borra su cookie.
 * Corre dentro del route handler de /api/auth/callback, donde se pueden leer y borrar cookies.
 * Nunca impide entrar: si algo falla, el invitado queda como estaba.
 */
async function unirInvitadoDeEsteNavegador(userId: string) {
  try {
    const jar = await cookies()
    const valor = jar.get(GUEST_COOKIE)?.value
    if (!valor) return
    const guestId = leerInvitado(valor)
    if (guestId) await unirInvitadoACuenta(db, guestId, userId)
    jar.delete(GUEST_COOKIE)
  } catch (e) {
    console.error('No se pudo unir el invitado a la cuenta:', e)
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
        await unirInvitadoDeEsteNavegador(user.id)
      }
      return token
    },
    async session({ session, token }) {
      session.userId = token.userId as string
      return session
    },
  },
})
