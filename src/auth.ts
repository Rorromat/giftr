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
  providers: [Google],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile?.sub && profile.email) {
        const user = await upsertUserFromGoogle(db, {
          googleId: profile.sub,
          email: profile.email,
          nombre: profile.name ?? profile.email,
          avatarUrl: (profile as { picture?: string }).picture ?? null,
        })
        token.userId = user.id
      }
      return token
    },
    async session({ session, token }) {
      session.userId = token.userId as string
      return session
    },
  },
})
