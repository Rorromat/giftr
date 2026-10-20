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
import { crearGrupo, salirDeGrupo, unirseAGrupo } from '@/lib/groups'
import { guardarCumple, guardarFechaGrupo } from '@/lib/events'
import { guardarGustos } from '@/lib/bienvenida'
import { gustosDesdeForm } from '@/lib/gustos'
import { cancelarRegalo, comprarRegalo, iniciarRegaloGrupal, marcarPagado, parsePesos, salirDeRegalo, saldarCon, sumarseARegalo } from '@/lib/regalos'
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
  // Sin listaId va a la lista personal; con listaId, a un grupo del que es dueño.
  const listaId = str(formData, 'listaId')
  const creado = await createItem(db, session.userId, data, listaId)
  revalidatePath('/mi-lista')
  revalidatePath('/grupos', 'layout')
  redirect(listaId && creado ? `/grupos/${listaId}` : '/mi-lista')
}

export async function archiveItemAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const estado = str(formData, 'estado') === 'no_lo_quiero' ? 'no_lo_quiero' : 'lo_tengo'
  await archiveItem(db, str(formData, 'itemId')!, session.userId, estado)
  revalidatePath('/mi-lista')
  revalidatePath('/grupos', 'layout')
}

export async function updatePriorityAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const p = str(formData, 'prioridad')
  if (p !== 'mucho' && p !== 'gustaria' && p !== 'suelta') return
  await updateItem(db, str(formData, 'itemId')!, session.userId, { prioridad: p })
  revalidatePath('/mi-lista')
  revalidatePath('/grupos', 'layout')
}

export async function createGroupAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const nombre = str(formData, 'nombre')
  if (!nombre) redirect('/grupos/nuevo')
  const id = await crearGrupo(db, session.userId, { nombre: nombre.slice(0, 60), descripcion: str(formData, 'descripcion')?.slice(0, 120) })
  const fecha = str(formData, 'fecha')
  if (fecha) await guardarFechaGrupo(db, id, session.userId, fecha, formData.get('anual') === 'on')
  revalidatePath('/grupos')
  revalidatePath('/eventos')
  redirect(`/grupos/${id}`)
}

export async function setGroupDateAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  const id = str(formData, 'grupoId') ?? ''
  const fecha = formData.get('quitar') ? null : str(formData, 'fecha') ?? null
  await guardarFechaGrupo(db, id, session.userId, fecha, formData.get('anual') === 'on')
  revalidatePath(`/grupos/${id}`)
  revalidatePath('/grupos')
  revalidatePath('/eventos')
}

const numero = (fd: FormData, k: string) => { const v = Number(str(fd, k)); return Number.isInteger(v) && v > 0 ? v : null }

export async function saveBirthdayAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  await guardarCumple(db, session.userId, numero(formData, 'dia'), numero(formData, 'mes'))
  revalidatePath('/perfil')
  revalidatePath('/eventos')
}

/** Bienvenida (o editar gustos desde Perfil): guarda lo elegido, aunque se corte a mitad de camino. */
export async function saveGustosAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  await guardarGustos(db, session.userId, gustosDesdeForm(formData))
  if (formData.has('dia')) await guardarCumple(db, session.userId, numero(formData, 'dia'), numero(formData, 'mes'))
  revalidatePath('/perfil')
  revalidatePath('/eventos')
  revalidatePath('/mi-lista')
  const desdePerfil = str(formData, 'volver') === 'perfil'
  if (formData.has('corte')) redirect(desdePerfil ? '/perfil' : '/mi-lista')
  redirect(desdePerfil ? '/bienvenida/listo?desde=perfil' : '/bienvenida/listo')
}

export async function joinGroupAction(formData: FormData) {
  const invite = str(formData, 'invite') ?? ''
  const session = await auth()
  if (!session?.userId) redirect(`/grupos/unirme/${invite}`)
  const id = await unirseAGrupo(db, invite, session.userId)
  if (!id) redirect('/grupos')
  revalidatePath('/grupos', 'layout')
  redirect(`/grupos/${id}`)
}

export async function leaveGroupAction(formData: FormData) {
  const session = await auth()
  if (!session?.userId) redirect('/')
  await salirDeGrupo(db, str(formData, 'grupoId') ?? '', session.userId)
  revalidatePath('/grupos', 'layout')
  redirect('/grupos')
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

// ---------- Regalo grupal y cuentas (solo con cuenta de Google: las deudas tienen que tener dueño) ----------

async function usuarioRegalador() {
  const session = await auth()
  if (!session?.userId) redirect('/')
  return session.userId
}

function revalidarRegalo(fd: FormData) {
  const token = str(fd, 'token')
  const itemId = str(fd, 'itemId')
  if (token) revalidatePath(`/l/${token}`)
  if (token && itemId) revalidatePath(`/l/${token}/item/${itemId}`)
  revalidatePath('/cuentas')
  revalidatePath('/perfil')
  revalidatePath('/eventos')
}

export async function startGroupGiftAction(formData: FormData) {
  const userId = await usuarioRegalador()
  const token = str(formData, 'token') ?? ''
  const itemId = str(formData, 'itemId') ?? ''
  if (!(await itemPerteneceAToken(itemId, token))) return
  await iniciarRegaloGrupal(db, itemId, userId)
  revalidarRegalo(formData)
}

export async function joinGroupGiftAction(formData: FormData) {
  await sumarseARegalo(db, str(formData, 'giftId') ?? '', await usuarioRegalador())
  revalidarRegalo(formData)
}

export async function leaveGroupGiftAction(formData: FormData) {
  await salirDeRegalo(db, str(formData, 'giftId') ?? '', await usuarioRegalador())
  revalidarRegalo(formData)
}

export async function cancelGroupGiftAction(formData: FormData) {
  await cancelarRegalo(db, str(formData, 'giftId') ?? '', await usuarioRegalador())
  revalidarRegalo(formData)
}

/** "0" es una parte válida (alguien que no pone); cualquier otra cosa se lee como pesos. */
const parte = (v: string) => (/^\D*0+\D*$/.test(v) ? 0 : parsePesos(v) ?? Number.NaN)

export async function buyGroupGiftAction(formData: FormData) {
  const userId = await usuarioRegalador()
  const volver = `/l/${str(formData, 'token')}/item/${str(formData, 'itemId')}`
  let partes: Record<string, number> | undefined
  if (str(formData, 'modo') === 'manual') {
    partes = {}
    for (const [k, v] of formData.entries()) {
      if (k.startsWith('parte:') && typeof v === 'string') partes[k.slice(6)] = parte(v)
    }
  }
  const r = await comprarRegalo(db, str(formData, 'giftId') ?? '', userId, {
    total: parsePesos(str(formData, 'total')) ?? 0, partes, nota: str(formData, 'nota'),
  })
  revalidarRegalo(formData)
  redirect(r.ok ? volver : `${volver}?error=${r.reason}`)
}

export async function markPaidAction(formData: FormData) {
  const userId = await usuarioRegalador()
  await marcarPagado(db, str(formData, 'giftId') ?? '', str(formData, 'deudorId') ?? '', userId, str(formData, 'pagado') !== '0')
  revalidarRegalo(formData)
}

export async function settleUpAction(formData: FormData) {
  await saldarCon(db, await usuarioRegalador(), str(formData, 'otroId') ?? '')
  revalidarRegalo(formData)
}
