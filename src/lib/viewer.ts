import { cookies } from 'next/headers'
import { auth } from '@/auth'
import type { Viewer } from '@/lib/types'

export const GUEST_COOKIE = 'wishy_guest'

export async function getViewer(): Promise<Viewer> {
  const session = await auth()
  if (session?.userId) return { userId: session.userId }
  const guestId = (await cookies()).get(GUEST_COOKIE)?.value
  return guestId ? { guestId } : {}
}
