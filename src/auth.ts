import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { db } from '@/db'
import { upsertUserFromGoogle } from '@/lib/users'

declare module '@auth/core/types' {
  interface Session {
    userId?: string
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
