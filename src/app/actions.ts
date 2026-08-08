'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { items, lists } from '@/db/schema'
import { getViewer, GUEST_COOKIE } from '@/lib/viewer'
import { auth } from '@/auth'
import { createItem, archiveItem, updateItem, type NewItemData } from '@/lib/items'
import { markBought, releaseClaim, reserveItem } from '@/lib/claims'
import { addComment } from '@/lib/comments'
import { createGuest } from '@/lib/guest'
import { markNotificationsRead } from '@/lib/notifications'
import type { Viewer } from '@/lib/types'

const str = (fd: FormData, k: string) => {
  const v = fd.get(k)
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

const httpUrl = (v?: string) => (v && /^https?:\/\//i.test(v) ? v : undefined)

async function itemPerteneceAToken(itemId: string, token: string) {
  const [row] = await db.select({ id: items.id }).from(items)
    .innerJoin(lists, eq(items.listId, lists.id))
    .where(and(eq(items.id, itemId), eq(lists.shareToken, token)))
  return !!row
}

export async function addItemAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const tipo = str(formData, 'tipo') === 'idea' ? 'idea' : 'exacto'
  const titulo = str(formData, 'titulo')
  if (!titulo) redirect('/agregar')
  const p = str(formData, 'prioridad')
  const cant = Math.trunc(Number(str(formData, 'cantidad') ?? '1'))
  const data: NewItemData = {
    tipo, titulo,
    notas: str(formData, 'notas'),
    precio: str(formData, 'precio'),
    rangoPrecio: str(formData, 'rangoPrecio'),
    categoria: str(formData, 'categoria'),
    prioridad: p === 'mucho' || p === 'suelta' ? p : 'gustaria',
    cantidad: Number.isFinite(cant) && cant >= 1 ? cant : 1,
    repetible: formData.get('repetible') === 'on',
    linkTienda: httpUrl(str(formData, 'linkTienda')),
    fotoUrl: httpUrl(str(formData, 'fotoUrl')),
  }
  await createItem(db, session.userId, data)
  revalidatePath('/mi-lista')
  redirect('/mi-lista')
}

export async function archiveItemAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const estado = str(formData, 'estado') === 'no_lo_quiero' ? 'no_lo_quiero' : 'lo_tengo'
  await archiveItem(db, str(formData, 'itemId')!, session.userId, estado)
  revalidatePath('/mi-lista')
}

export async function updatePriorityAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const p = str(formData, 'prioridad')
  if (p !== 'mucho' && p !== 'gustaria' && p !== 'suelta') return
  await updateItem(db, str(formData, 'itemId')!, session.userId, { prioridad: p })
  revalidatePath('/mi-lista')
}

async function viewerIdentificandoGuest(formData: FormData): Promise<Viewer> {
  let viewer = await getViewer()
  const nombre = str(formData, 'nombre')
  if (!viewer.userId && !viewer.guestId && nombre) {
    const guest = await createGuest(db, nombre, str(formData, 'email'))
    ;(await cookies()).set(GUEST_COOKIE, guest.id, { httpOnly: true, maxAge: 31536000, path: '/' })
    viewer = { guestId: guest.id }
  }
  return viewer
}

export async function reserveAction(formData: FormData) {
  const token = str(formData, 'token')!
  const itemId = str(formData, 'itemId')!
  if (!(await itemPerteneceAToken(itemId, token))) return
  const viewer = await viewerIdentificandoGuest(formData)
  await reserveItem(db, itemId, viewer)
  revalidatePath(`/l/${token}`)
  revalidatePath(`/l/${token}/item/${itemId}`)
}

export async function boughtAction(formData: FormData) {
  const viewer = await getViewer()
  const token = str(formData, 'token')!
  await markBought(db, str(formData, 'claimId')!, viewer, str(formData, 'nota'))
  revalidatePath(`/l/${token}`)
  revalidatePath(`/l/${token}/item/${str(formData, 'itemId')}`)
}

export async function releaseAction(formData: FormData) {
  const viewer = await getViewer()
  const token = str(formData, 'token')!
  await releaseClaim(db, str(formData, 'claimId')!, viewer)
  revalidatePath(`/l/${token}`)
  revalidatePath(`/l/${token}/item/${str(formData, 'itemId')}`)
}

export async function commentAction(formData: FormData) {
  const viewer = await getViewer()
  const token = str(formData, 'token')!
  const itemId = str(formData, 'itemId')!
  if (!(await itemPerteneceAToken(itemId, token))) return
  await addComment(db, itemId, viewer, str(formData, 'texto') ?? '')
  revalidatePath(`/l/${token}/item/${itemId}`)
}

export async function markNotifsReadAction() {
  await markNotificationsRead(db, await getViewer())
  revalidatePath('/', 'layout')
}
