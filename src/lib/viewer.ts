import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { db } from '@/db'
import { GUEST_COOKIE } from '@/lib/cookie-invitado'
import { viewerDeCookie } from '@/lib/guest'
import type { Viewer } from '@/lib/types'

export async function getViewer(): Promise<Viewer> {
  const session = await auth()
  if (session?.userId) return { userId: session.userId }
  return viewerDeCookie(db, (await cookies()).get(GUEST_COOKIE)?.value)
}
